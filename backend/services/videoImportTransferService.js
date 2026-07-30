import fs from "fs";
import path from "path";
import { randomUUID, createHash } from "crypto";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import { Prisma } from "@prisma/client";

import { ETAT, GRADE } from "../constants.js";
import { createLog } from "../controllers/logController.js";
import {
  isContentPreviewActive,
  isPreviewLiveActive,
} from "../controllers/appSettingController.js";
import { generateVideoPreviewFramesFromMaster } from "./video/videoPreviewService.js";
import { generateVideoPreviewLiveFromMaster } from "./video/videoPreviewLiveService.js";
import { VIDEO_ROOT } from "./video/videoPaths.js";
import { prisma } from "./db.js";
import {
  assertPrimaryTransferConfiguration,
  VIDEO_TRANSFER_BLOCK_MARKER,
  VIDEO_TRANSFER_BLOCKED_ROOT,
  VIDEO_TRANSFER_PROTOCOL_VERSION,
  VIDEO_TRANSFER_STAGING_ROOT,
} from "./videoTransferConfig.js";
import { VideoTransferError } from "./videoTransferError.js";
import {
  TRANSFER_FILE_STATUS,
  TRANSFER_STATUS,
  TRANSFER_STEP_STATUS,
  getTransferById,
  refreshTransferFileTotals,
  setTransferState,
  transferWithDetails,
  updateTransferStep,
} from "./videoTransferPersistence.js";
import {
  assertNoSymlink,
  hashFile,
  resolveTransferPath,
  sha256String,
  stableStringify,
  validateVideoTransferManifest,
  verifyHlsReferences,
} from "./videoTransferSecurity.js";

const IMPORT_STEP = Object.freeze({
  DATABASE: "database",
  TRANSFER: "transfer",
  VERIFY: "verify",
  FINALIZE: "finalize",
});
const TRANSFER_LOG_DEDUPE_MS = 24 * 60 * 60 * 1000;

const importTransferLocks = new Map();
const activeImportUploads = new Map();
const activeImportUploadWaiters = new Map();
const activeImportStreams = new Map();

const withImportTransferLock = async (lockKey, work) => {
  const previous = importTransferLocks.get(lockKey) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  importTransferLocks.set(lockKey, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (importTransferLocks.get(lockKey) === queued) {
      importTransferLocks.delete(lockKey);
    }
  }
};

const asLogRequest = (request) =>
  request || { headers: {}, socket: {}, ip: null };

const trackImportUpload = async (transferId, work) => {
  activeImportUploads.set(
    transferId,
    (activeImportUploads.get(transferId) || 0) + 1
  );
  try {
    return await work();
  } finally {
    const remaining = (activeImportUploads.get(transferId) || 1) - 1;
    if (remaining > 0) {
      activeImportUploads.set(transferId, remaining);
    } else {
      activeImportUploads.delete(transferId);
      const waiters = activeImportUploadWaiters.get(transferId) || [];
      activeImportUploadWaiters.delete(transferId);
      for (const resolve of waiters) resolve();
    }
  }
};

const waitForActiveImportUploads = async (transferId) => {
  while ((activeImportUploads.get(transferId) || 0) > 0) {
    await new Promise((resolve) => {
      const waiters = activeImportUploadWaiters.get(transferId) || [];
      waiters.push(resolve);
      activeImportUploadWaiters.set(transferId, waiters);
    });
  }
};

const trackImportStream = async (transferId, stream, work) => {
  if (!stream || typeof stream.destroy !== "function") return work();
  const streams = activeImportStreams.get(transferId) || new Set();
  streams.add(stream);
  activeImportStreams.set(transferId, streams);
  try {
    return await work();
  } finally {
    streams.delete(stream);
    if (streams.size === 0) activeImportStreams.delete(transferId);
  }
};

const abortActiveImportUploads = (transferId) => {
  const streams = activeImportStreams.get(transferId);
  if (!streams) return;
  for (const stream of streams) {
    stream.destroy();
  }
};

const asPositiveInt = (value, fieldName) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new VideoTransferError(`${fieldName} invalide.`, {
      statusCode: 400,
      code: "INVALID_TRANSFER_INPUT",
    });
  }
  return number;
};

const normalizeNullablePositiveInt = (value, fieldName) => {
  if (value === undefined || value === null || value === "") return null;
  return asPositiveInt(value, fieldName);
};

const toStoragePath = (...segments) =>
  path.posix.join(...segments.map((segment) => String(segment)));

const getImportRoot = (transferId) =>
  path.join(VIDEO_TRANSFER_STAGING_ROOT, transferId);

const getImportFilesRoot = (transferId) =>
  path.join(getImportRoot(transferId), "files");

const ensurePrivateDirectory = async (directory) => {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
};

const getBlockReservationPath = (destinationVideoId) =>
  path.join(VIDEO_TRANSFER_BLOCKED_ROOT, String(destinationVideoId));

const createBlockReservation = async ({
  destinationVideoId,
  transferId,
}) => {
  await ensurePrivateDirectory(VIDEO_TRANSFER_BLOCKED_ROOT);
  await fs.promises.writeFile(
    getBlockReservationPath(destinationVideoId),
    transferId,
    { encoding: "utf8", mode: 0o600 }
  );
};

const removeBlockReservation = (destinationVideoId) =>
  destinationVideoId
    ? fs.promises.rm(getBlockReservationPath(destinationVideoId), {
      force: true,
    })
    : Promise.resolve();

const serializeFile = (file) => ({
  fileId: file.VideoTransferFileID,
  relativePath: file.RelativePath,
  size: file.Size.toString(),
  sha256: file.Sha256,
  status: file.Status,
  bytesReceived: file.BytesReceived.toString(),
});

const ensureImportOwner = (transfer, sourceInstanceId) => {
  if (!transfer || transfer.Direction !== "IMPORT") {
    throw new VideoTransferError("Transfert introuvable.", {
      statusCode: 404,
      code: "TRANSFER_NOT_FOUND",
    });
  }
  if (transfer.SourceInstanceID !== sourceInstanceId) {
    throw new VideoTransferError("Ce transfert appartient à une autre instance.", {
      statusCode: 403,
      code: "TRANSFER_SOURCE_MISMATCH",
    });
  }
  return transfer;
};

const findImportActor = async (database, nickname) => {
  const normalizedNickname = String(nickname || "").trim();
  if (normalizedNickname) {
    const matching = await database.utilisateur.findFirst({
      where: {
        Surnom: normalizedNickname,
        GradeID: GRADE.SUPER_ADMIN,
        EtatID: ETAT.ACTIVE,
      },
      select: { UtilisateurID: true, Surnom: true },
    });
    if (matching) return matching;
  }

  const fallback = await database.utilisateur.findFirst({
    where: {
      GradeID: GRADE.SUPER_ADMIN,
      EtatID: ETAT.ACTIVE,
    },
    orderBy: { UtilisateurID: "asc" },
    select: { UtilisateurID: true, Surnom: true },
  });
  if (!fallback) {
    throw new VideoTransferError(
      "Aucun super administrateur actif n'est disponible sur le serveur principal.",
      { statusCode: 409, code: "IMPORT_ACTOR_NOT_FOUND" }
    );
  }
  return fallback;
};

const validateDestinationReferences = async ({
  database,
  destinationSeasonId,
  destinationGenreIds,
}) => {
  if (destinationSeasonId) {
    const season = await database.saison.findFirst({
      where: {
        SaisonID: destinationSeasonId,
        Series: { EtatID: ETAT.ACTIVE },
      },
      select: { SaisonID: true },
    });
    if (!season) {
      throw new VideoTransferError("La saison principale sélectionnée est introuvable.", {
        statusCode: 409,
        code: "DESTINATION_SEASON_NOT_FOUND",
      });
    }
  }

  const genreIds = Array.from(
    new Set(
      destinationGenreIds.map((genreId) =>
        asPositiveInt(genreId, "GenreID")
      )
    )
  );
  const genres = genreIds.length
    ? await database.genre.findMany({
        where: { GenreID: { in: genreIds } },
        select: { GenreID: true },
      })
    : [];
  if (genres.length !== genreIds.length) {
    throw new VideoTransferError(
      "Un ou plusieurs genres sélectionnés n'existent pas sur le serveur principal.",
      { statusCode: 409, code: "DESTINATION_GENRE_NOT_FOUND" }
    );
  }

  return genreIds;
};

const createBlockedDestination = async ({
  database,
  manifest,
  destinationSeasonId,
  destinationGenreIds,
  actor,
}) => {
  const metadata = manifest.metadata;
  const video = await database.video.create({
    data: {
      Titre: metadata.title,
      Resumer: metadata.summary || null,
      CheminAcces: toStoragePath(
        "uploads",
        "video",
        "pending",
        "hls",
        "master.m3u8"
      ),
      CheminImage: null,
      EtatID: ETAT.BLOCKED,
      SaisonID: destinationSeasonId,
      UtilisateurID: actor.UtilisateurID,
      Premium: Boolean(metadata.premium),
    },
  });

  const base = ["uploads", "video", video.VideoID];
  const imagePath = metadata.posterPath
    ? toStoragePath(...base, metadata.posterPath)
    : null;
  const masterPath = toStoragePath(...base, "hls", "master.m3u8");

  await database.video.update({
    where: { VideoID: video.VideoID },
    data: {
      CheminAcces: masterPath,
      CheminImage: imagePath,
    },
  });

  if (destinationGenreIds.length) {
    await database.videoGenre.createMany({
      data: destinationGenreIds.map((GenreID) => ({
        VideoID: video.VideoID,
        GenreID,
      })),
    });
  }

  if (metadata.subtitles.length) {
    await database.videoSubtitle.createMany({
      data: metadata.subtitles.map((subtitle) => ({
        VideoID: video.VideoID,
        Label: subtitle.label,
        CheminSubtitle: toStoragePath(...base, subtitle.path),
      })),
    });
  }

  if (metadata.audioTracks.length) {
    await database.videoAudioTrack.createMany({
      data: metadata.audioTracks.map((track) => ({
        VideoID: video.VideoID,
        Label: track.label,
        Language: track.language || null,
        CheminPlaylist: toStoragePath(...base, track.path),
        IsDefault: Boolean(track.isDefault),
        Ordre: track.order,
      })),
    });
  }

  return video.VideoID;
};

const removeBlockedDestination = async (database, destinationVideoId) => {
  if (!destinationVideoId) return;
  const video = await database.video.findUnique({
    where: { VideoID: destinationVideoId },
    select: { VideoID: true, EtatID: true },
  });
  if (!video || video.EtatID !== ETAT.BLOCKED) return;

  await database.videoGenre.deleteMany({ where: { VideoID: destinationVideoId } });
  await database.videoSubtitle.deleteMany({ where: { VideoID: destinationVideoId } });
  await database.videoAudioTrack.deleteMany({ where: { VideoID: destinationVideoId } });
  await database.videoPersonne.deleteMany({ where: { VideoID: destinationVideoId } });
  await database.video.delete({ where: { VideoID: destinationVideoId } });
};

export async function getPrimaryCapabilities() {
  const config = assertPrimaryTransferConfiguration();
  await prisma.$queryRaw`SELECT 1`;
  await ensurePrivateDirectory(VIDEO_TRANSFER_STAGING_ROOT);
  await fs.promises.access(
    VIDEO_TRANSFER_STAGING_ROOT,
    fs.constants.R_OK | fs.constants.W_OK
  );

  return {
    ready: true,
    role: "primary",
    instanceId: config.instanceId,
    protocolVersion: VIDEO_TRANSFER_PROTOCOL_VERSION,
  };
}

export const getPrimaryGenres = () =>
  prisma.genre.findMany({
    orderBy: { Nom: "asc" },
    select: { GenreID: true, Nom: true },
  });

export async function getPrimarySeries() {
  const rows = await prisma.series.findMany({
    where: { EtatID: ETAT.ACTIVE },
    orderBy: { Titre: "asc" },
    select: {
      SeriesID: true,
      Titre: true,
      Premium: true,
      CheminImage: true,
      _count: { select: { Saisons: true } },
    },
  });
  return rows.map((series) => ({
    SeriesID: series.SeriesID,
    Titre: series.Titre,
    Premium: series.Premium,
    CheminImage: series.CheminImage,
    Saisons: series._count.Saisons,
    hasSeasons: series._count.Saisons > 0,
  }));
}

export async function getPrimarySeriesSeasons(seriesId) {
  const parsedSeriesId = asPositiveInt(seriesId, "SeriesID");
  const series = await prisma.series.findFirst({
    where: { SeriesID: parsedSeriesId, EtatID: ETAT.ACTIVE },
    select: { SeriesID: true },
  });
  if (!series) {
    throw new VideoTransferError("Série principale introuvable.", {
      statusCode: 404,
      code: "SERIES_NOT_FOUND",
    });
  }

  return prisma.saison.findMany({
    where: { SeriesID: parsedSeriesId },
    orderBy: { Numero: "asc" },
    select: { SaisonID: true, Numero: true },
  });
}

export async function createImportSession({
  payload,
  sourceInstanceId,
  request,
}) {
  assertPrimaryTransferConfiguration();
  const normalizedManifest = validateVideoTransferManifest(payload?.manifest);
  const manifestHash = String(payload?.manifestHash || "").toLowerCase();
  const computedManifestHash = sha256String(stableStringify(normalizedManifest));
  if (manifestHash !== computedManifestHash) {
    throw new VideoTransferError("Le hash du manifeste ne correspond pas.", {
      statusCode: 400,
      code: "MANIFEST_HASH_MISMATCH",
    });
  }
  if (normalizedManifest.source.instanceId !== sourceInstanceId) {
    throw new VideoTransferError("L'instance source du manifeste est invalide.", {
      statusCode: 403,
      code: "MANIFEST_SOURCE_MISMATCH",
    });
  }

  const sourceVideoId = asPositiveInt(
    normalizedManifest.source.videoId,
    "SourceVideoID"
  );
  const destinationSeasonId = normalizeNullablePositiveInt(
    normalizedManifest.destinationSeasonId,
    "DestinationSeasonID"
  );
  const destinationGenreIds = normalizedManifest.metadata.destinationGenreIds;
  const sourceLockKey = `source:${sourceInstanceId}:${sourceVideoId}`;

  return withImportTransferLock(sourceLockKey, async () => {
    const existing = await prisma.videoTransfer.findUnique({
      where: {
        Direction_SourceInstanceID_SourceVideoID: {
          Direction: "IMPORT",
          SourceInstanceID: sourceInstanceId,
          SourceVideoID: sourceVideoId,
        },
      },
      include: transferWithDetails,
    });
    if (existing && existing.Status !== TRANSFER_STATUS.CANCELLED) {
      if (existing.ManifestHash !== manifestHash) {
        throw new VideoTransferError(
          "Cette vidéo source possède déjà une session avec une autre destination, sélection de genres ou version de fichiers.",
          { statusCode: 409, code: "TRANSFER_IDEMPOTENCY_CONFLICT" }
        );
      }
      ensureImportOwner(existing, sourceInstanceId);
      if (
        ![
          TRANSFER_STATUS.COMPLETED,
        ].includes(existing.Status)
      ) {
        if (existing.DestinationVideoID) {
          await createBlockReservation({
            destinationVideoId: existing.DestinationVideoID,
            transferId: existing.VideoTransferID,
          });
        }
        if (existing.Status !== TRANSFER_STATUS.FINALIZING) {
          await ensurePrivateDirectory(VIDEO_TRANSFER_STAGING_ROOT);
          await ensurePrivateDirectory(getImportRoot(existing.VideoTransferID));
          await ensurePrivateDirectory(
            getImportFilesRoot(existing.VideoTransferID)
          );
        }
      }
      return {
        created: false,
        transfer: existing,
        files: existing.Files.map(serializeFile),
      };
    }

    const createOrRestart = async () => {
      const transferId = existing?.VideoTransferID || randomUUID();
      const actor = await findImportActor(
        prisma,
        normalizedManifest.initiatedByNickname
      );
      const genreIds = await validateDestinationReferences({
        database: prisma,
        destinationSeasonId,
        destinationGenreIds,
      });

    if (existing?.DestinationVideoID) {
      const previousDestination = await prisma.video.findUnique({
        where: { VideoID: existing.DestinationVideoID },
        select: { EtatID: true },
      });
      if (previousDestination?.EtatID === ETAT.ACTIVE) {
        throw new VideoTransferError(
          "La session annulée référence une vidéo déjà active ; elle ne peut pas être réinitialisée.",
          { statusCode: 409, code: "CANCELLED_TRANSFER_DESTINATION_ACTIVE" }
        );
      }
      await removeBlockReservation(existing.DestinationVideoID);
      await fs.promises.rm(
        path.join(VIDEO_ROOT, String(existing.DestinationVideoID)),
        { recursive: true, force: true }
      );
    }
    await fs.promises.rm(getImportRoot(transferId), {
      recursive: true,
      force: true,
    });

    await ensurePrivateDirectory(VIDEO_TRANSFER_BLOCKED_ROOT);
    let reservedDestinationVideoId = null;
    let created;
    try {
      created = await prisma.$transaction(async (transaction) => {
      if (existing) {
        await removeBlockedDestination(
          transaction,
          existing.DestinationVideoID
        );
        await transaction.videoTransferStep.deleteMany({
          where: { VideoTransferID: transferId },
        });
        await transaction.videoTransferFile.deleteMany({
          where: { VideoTransferID: transferId },
        });
      }

      const destinationVideoId = await createBlockedDestination({
        database: transaction,
        manifest: normalizedManifest,
        destinationSeasonId,
        destinationGenreIds: genreIds,
        actor,
      });
      reservedDestinationVideoId = destinationVideoId;
      await createBlockReservation({
        destinationVideoId,
        transferId,
      });
      const transferData = {
        SourceInstanceID: sourceInstanceId,
        SourceVideoID: sourceVideoId,
        DestinationVideoID: destinationVideoId,
        DestinationSeasonID: destinationSeasonId,
        InitiatedByUserID: actor.UtilisateurID,
        InitiatedByNickname: normalizedManifest.initiatedByNickname || null,
        RemoteTransferID: normalizedManifest.exportTransferId,
        ManifestHash: manifestHash,
        Manifest: normalizedManifest,
        Receipt: Prisma.DbNull,
        Warnings: [],
        Status: TRANSFER_STATUS.READY,
        CurrentStep: IMPORT_STEP.TRANSFER,
        Progress: 10,
        TotalFiles: normalizedManifest.files.length,
        TransferredFiles: 0,
        TotalBytes: BigInt(normalizedManifest.totalBytes),
        TransferredBytes: 0n,
        CancelRequested: false,
        ResumeCount: 0,
        ErrorMessage: null,
        StartedAt: new Date(),
        CompletedAt: null,
      };

      if (existing) {
        await transaction.videoTransfer.update({
          where: { VideoTransferID: transferId },
          data: transferData,
        });
      } else {
        await transaction.videoTransfer.create({
          data: {
            VideoTransferID: transferId,
            Direction: "IMPORT",
            ...transferData,
          },
        });
      }
      await transaction.videoTransferFile.createMany({
        data: normalizedManifest.files.map((file) => ({
          VideoTransferFileID: randomUUID(),
          VideoTransferID: transferId,
          RelativePath: file.relativePath,
          Size: BigInt(file.size),
          Sha256: file.sha256,
          Status: TRANSFER_FILE_STATUS.PENDING,
        })),
      });
      return transaction.videoTransfer.findUnique({
        where: { VideoTransferID: transferId },
        include: transferWithDetails,
      });
      });
    } catch (error) {
      if (reservedDestinationVideoId) {
        let destinationStillExists = true;
        try {
          destinationStillExists = Boolean(
            await prisma.video.findUnique({
              where: { VideoID: reservedDestinationVideoId },
              select: { VideoID: true },
            })
          );
        } catch {
          // Commit inconnu : conserver le sidecar est le comportement fail-closed.
        }
        if (!destinationStillExists) {
          await removeBlockReservation(reservedDestinationVideoId).catch(
            () => {}
          );
        }
      }
      throw error;
    }

    await ensurePrivateDirectory(VIDEO_TRANSFER_STAGING_ROOT);
    await ensurePrivateDirectory(getImportRoot(transferId));
    await ensurePrivateDirectory(getImportFilesRoot(transferId));
    await updateTransferStep({
      transferId,
      stepKey: IMPORT_STEP.DATABASE,
      label: "Création des données principales",
      statusLabel: existing
        ? "Session annulée réinitialisée et vidéo bloquée recréée"
        : "Vidéo réservée en état bloqué",
      progress: 100,
      status: TRANSFER_STEP_STATUS.COMPLETED,
    });
    await updateTransferStep({
      transferId,
      stepKey: IMPORT_STEP.TRANSFER,
      label: "Transfert des fichiers",
      statusLabel: "En attente des fichiers",
      progress: 0,
      status: TRANSFER_STEP_STATUS.PENDING,
    });
    await createLog({
      request: asLogRequest(request),
      UtilisateurID: actor.UtilisateurID,
      ActionNom: "video_import_started",
      Champ: "video_transfer",
      NouvelleValeur: transferId,
      Meta: {
        transferId,
        sourceInstanceId,
        sourceVideoId,
        destinationVideoId: created.DestinationVideoID,
        restartedAfterCancellation: Boolean(existing),
      },
      DedupeMs: TRANSFER_LOG_DEDUPE_MS,
    });
    await createLog({
      request: asLogRequest(request),
      UtilisateurID: actor.UtilisateurID,
      ActionNom: "video_import_database_created",
      Champ: "video_transfer",
      NouvelleValeur: transferId,
      Meta: { transferId, destinationVideoId: created.DestinationVideoID },
      DedupeMs: TRANSFER_LOG_DEDUPE_MS,
    });

      const transfer = await getTransferById(transferId);
      return {
        created: true,
        restarted: Boolean(existing),
        transfer,
        files: transfer.Files.map(serializeFile),
      };
    };

    return existing
      ? withImportTransferLock(existing.VideoTransferID, createOrRestart)
      : createOrRestart();
  });
}

export async function getImportSession({ transferId, sourceInstanceId }) {
  const transfer = await getTransferById(transferId);
  if (!transfer) return null;
  return ensureImportOwner(transfer, sourceInstanceId);
}

async function receiveImportFileUnlocked({
  transferId,
  fileId,
  sourceInstanceId,
  stream,
  declaredBodyDigest,
  declaredContentLength,
  request,
}) {
  const transfer = ensureImportOwner(
    await getTransferById(transferId),
    sourceInstanceId
  );
  if (
    transfer.CancelRequested
    || [
      TRANSFER_STATUS.VERIFYING,
      TRANSFER_STATUS.VERIFIED,
      TRANSFER_STATUS.FINALIZING,
      TRANSFER_STATUS.CANCEL_REQUESTED,
      TRANSFER_STATUS.CANCELLED,
      TRANSFER_STATUS.COMPLETED,
    ].includes(transfer.Status)
  ) {
    stream?.resume?.();
    throw new VideoTransferError("Ce transfert n'accepte plus de fichier.", {
      statusCode: 409,
      code: "TRANSFER_NOT_WRITABLE",
    });
  }

  const file = transfer.Files.find(
    (candidate) => candidate.VideoTransferFileID === fileId
  );
  if (!file) {
    stream?.resume?.();
    throw new VideoTransferError("Fichier de transfert introuvable.", {
      statusCode: 404,
      code: "TRANSFER_FILE_NOT_FOUND",
    });
  }
  if (!stream || typeof stream.pipe !== "function") {
    throw new VideoTransferError("Le corps binaire du fichier est requis.", {
      statusCode: 400,
      code: "BINARY_BODY_REQUIRED",
    });
  }
  if (
    !Number.isSafeInteger(declaredContentLength)
    || declaredContentLength < 0
    || BigInt(declaredContentLength) !== BigInt(file.Size)
  ) {
    stream.resume();
    throw new VideoTransferError(
      "Content-Length doit correspondre exactement à la taille du fichier annoncée.",
      { statusCode: 400, code: "TRANSFER_FILE_CONTENT_LENGTH_MISMATCH" }
    );
  }
  if (String(declaredBodyDigest || "").toLowerCase() !== file.Sha256) {
    stream.resume();
    throw new VideoTransferError(
      "L'empreinte signée ne correspond pas au fichier attendu.",
      { statusCode: 400, code: "TRANSFER_FILE_SIGNED_DIGEST_MISMATCH" }
    );
  }
  if (file.Status === TRANSFER_FILE_STATUS.VERIFIED) {
    stream.resume();
    return { skipped: true, file: serializeFile(file) };
  }

  const filesRoot = getImportFilesRoot(transferId);
  await ensurePrivateDirectory(VIDEO_TRANSFER_STAGING_ROOT);
  await ensurePrivateDirectory(getImportRoot(transferId));
  await ensurePrivateDirectory(filesRoot);
  const targetPath = await resolveTransferPath(filesRoot, file.RelativePath, {
    allowMissingLeaf: true,
  });
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await resolveTransferPath(filesRoot, file.RelativePath, {
    allowMissingLeaf: true,
  });
  const partPath = `${targetPath}.part`;
  const partRelativePath = `${file.RelativePath}.part`;
  await resolveTransferPath(filesRoot, partRelativePath, {
    allowMissingLeaf: true,
  });
  await fs.promises.rm(partPath, { force: true });

  const writable = await prisma.videoTransfer.updateMany({
    where: {
      VideoTransferID: transferId,
      CancelRequested: false,
      Status: {
        notIn: [
          TRANSFER_STATUS.VERIFYING,
          TRANSFER_STATUS.VERIFIED,
          TRANSFER_STATUS.FINALIZING,
          TRANSFER_STATUS.COMPLETED,
          TRANSFER_STATUS.CANCEL_REQUESTED,
          TRANSFER_STATUS.CANCELLED,
        ],
      },
    },
    data: {
      Status: TRANSFER_STATUS.TRANSFERRING,
      CurrentStep: IMPORT_STEP.TRANSFER,
      ErrorMessage: null,
    },
  });
  if (writable.count !== 1) {
    stream.resume();
    throw new VideoTransferError("Ce transfert n'accepte plus de fichier.", {
      statusCode: 409,
      code: "TRANSFER_NOT_WRITABLE",
    });
  }
  await prisma.videoTransferFile.update({
    where: { VideoTransferFileID: file.VideoTransferFileID },
    data: { Status: TRANSFER_FILE_STATUS.UPLOADING, BytesReceived: 0n },
  });

  const hash = createHash("sha256");
  let received = 0n;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      received += BigInt(chunk.length);
      if (received > BigInt(file.Size)) {
        callback(
          new VideoTransferError("Le fichier reçu dépasse la taille annoncée.", {
            statusCode: 413,
            code: "TRANSFER_FILE_TOO_LARGE",
          })
        );
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });

  try {
    await pipeline(
      stream,
      meter,
      fs.createWriteStream(partPath, { flags: "wx", mode: 0o600 })
    );
    const actualDigest = hash.digest("hex");
    if (
      received !== BigInt(file.Size)
      || actualDigest !== file.Sha256
      || actualDigest !== String(declaredBodyDigest || "").toLowerCase()
    ) {
      throw new VideoTransferError(
        "La taille ou l'empreinte du fichier reçu ne correspond pas au manifeste signé.",
        { statusCode: 422, code: "TRANSFER_FILE_DIGEST_MISMATCH" }
      );
    }

    const transferState = await prisma.videoTransfer.findUnique({
      where: { VideoTransferID: transferId },
      select: { CancelRequested: true, Status: true },
    });
    if (
      !transferState
      || transferState.CancelRequested
      || [
        TRANSFER_STATUS.CANCEL_REQUESTED,
        TRANSFER_STATUS.CANCELLED,
      ].includes(transferState.Status)
    ) {
      throw new VideoTransferError("Le transfert a été annulé.", {
        statusCode: 409,
        code: "TRANSFER_CANCELLED",
      });
    }
    await fs.promises.rename(partPath, targetPath);
    const updatedFile = await prisma.videoTransferFile.update({
      where: { VideoTransferFileID: file.VideoTransferFileID },
      data: {
        Status: TRANSFER_FILE_STATUS.VERIFIED,
        BytesReceived: received,
      },
    });
    const totals = await refreshTransferFileTotals(transferId);
    const transferProgress =
      totals.TotalBytes > 0n
        ? 10 + Number((totals.TransferredBytes * 70n) / totals.TotalBytes)
        : 80;
    await setTransferState(transferId, { progress: transferProgress });
    await updateTransferStep({
      transferId,
      stepKey: IMPORT_STEP.TRANSFER,
      label: "Transfert des fichiers",
      statusLabel: `${totals.TransferredFiles}/${totals.TotalFiles} fichiers vérifiés`,
      progress:
        totals.TotalBytes > 0n
          ? Number((totals.TransferredBytes * 100n) / totals.TotalBytes)
          : 100,
      status:
        totals.TransferredFiles === totals.TotalFiles
          ? TRANSFER_STEP_STATUS.COMPLETED
          : TRANSFER_STEP_STATUS.RUNNING,
    });
    if (transfer.TransferredFiles === 0) {
      await createLog({
        request: asLogRequest(request),
        UtilisateurID: transfer.InitiatedByUserID,
        ActionNom: "video_transfer_in_progress",
        Champ: "video_transfer",
        NouvelleValeur: transferId,
        Meta: {
          transferId,
          sourceInstanceId,
          sourceVideoId: transfer.SourceVideoID,
          destinationVideoId: transfer.DestinationVideoID,
        },
        DedupeMs: TRANSFER_LOG_DEDUPE_MS,
      });
    }
    return { skipped: false, file: serializeFile(updatedFile) };
  } catch (error) {
    await fs.promises.rm(partPath, { force: true }).catch(() => {});
    await prisma.videoTransferFile.update({
      where: { VideoTransferFileID: file.VideoTransferFileID },
      data: {
        Status: TRANSFER_FILE_STATUS.FAILED,
        BytesReceived: received,
      },
    });
    await prisma.videoTransfer.updateMany({
      where: {
        VideoTransferID: transferId,
        CancelRequested: false,
        Status: {
          notIn: [
            TRANSFER_STATUS.CANCEL_REQUESTED,
            TRANSFER_STATUS.CANCELLED,
            TRANSFER_STATUS.FINALIZING,
            TRANSFER_STATUS.COMPLETED,
          ],
        },
      },
      data: {
        Status: TRANSFER_STATUS.FAILED,
        CurrentStep: IMPORT_STEP.TRANSFER,
        ErrorMessage: error.message,
      },
    }).catch(() => {});
    await updateTransferStep({
      transferId,
      stepKey: IMPORT_STEP.TRANSFER,
      label: "Transfert des fichiers",
      statusLabel: "Réception interrompue",
      progress: 0,
      status: TRANSFER_STEP_STATUS.FAILED,
      errorMessage: error.message,
    }).catch(() => {});
    await createLog({
      request: asLogRequest(request),
      UtilisateurID: transfer.InitiatedByUserID,
      ActionNom: "video_transfer_failed",
      Champ: "video_transfer",
      NouvelleValeur: transferId,
      Meta: {
        transferId,
        sourceInstanceId,
        sourceVideoId: transfer.SourceVideoID,
        destinationVideoId: transfer.DestinationVideoID,
        phase: IMPORT_STEP.TRANSFER,
        file: file.RelativePath,
        error: error.message,
      },
      DedupeMs: TRANSFER_LOG_DEDUPE_MS,
    });
    throw error;
  }
}

export const receiveImportFile = (options) =>
  trackImportStream(options.transferId, options.stream, () =>
    trackImportUpload(options.transferId, () =>
      withImportTransferLock(
        `file:${options.transferId}:${options.fileId}`,
        () => receiveImportFileUnlocked(options)
      )
    )
  );

async function verifyImportSessionUnlocked({
  transferId,
  sourceInstanceId,
  request,
}) {
  const transfer = ensureImportOwner(
    await getTransferById(transferId),
    sourceInstanceId
  );
  if (
    [
      TRANSFER_STATUS.VERIFIED,
      TRANSFER_STATUS.FINALIZING,
      TRANSFER_STATUS.COMPLETED,
    ].includes(transfer.Status)
  ) {
    return transfer;
  }
  if (transfer.CancelRequested || transfer.Status === TRANSFER_STATUS.CANCELLED) {
    throw new VideoTransferError("Ce transfert a été annulé.", {
      statusCode: 409,
      code: "TRANSFER_CANCELLED",
    });
  }
  if (transfer.Status !== TRANSFER_STATUS.VERIFYING) {
    throw new VideoTransferError(
      "La session n'a pas réservé la phase de vérification.",
      { statusCode: 409, code: "TRANSFER_VERIFY_CONFLICT" }
    );
  }
  if (
    transfer.Files.length !== transfer.TotalFiles
    || transfer.Files.some(
      (file) => file.Status !== TRANSFER_FILE_STATUS.VERIFIED
    )
  ) {
    const error = new VideoTransferError(
      "Tous les fichiers n'ont pas encore été reçus.",
      {
      statusCode: 409,
      code: "TRANSFER_FILES_INCOMPLETE",
      }
    );
    const failed = await prisma.videoTransfer.updateMany({
      where: {
        VideoTransferID: transferId,
        Direction: "IMPORT",
        SourceInstanceID: sourceInstanceId,
        Status: TRANSFER_STATUS.VERIFYING,
        CancelRequested: false,
      },
      data: {
        Status: TRANSFER_STATUS.FAILED,
        ErrorMessage: error.message,
      },
    });
    if (failed.count !== 1) {
      throw new VideoTransferError(
        "La session a changé d'état pendant sa vérification.",
        { statusCode: 409, code: "TRANSFER_VERIFY_CONFLICT" }
      );
    }
    throw error;
  }
  const settledTotals = await refreshTransferFileTotals(transferId);
  await updateTransferStep({
    transferId,
    stepKey: IMPORT_STEP.TRANSFER,
    label: "Transfert des fichiers",
    statusLabel: `${settledTotals.TransferredFiles}/${settledTotals.TotalFiles} fichiers vérifiés`,
    progress: 100,
    status: TRANSFER_STEP_STATUS.COMPLETED,
  });

  await updateTransferStep({
    transferId,
    stepKey: IMPORT_STEP.VERIFY,
    label: "Vérification de réception",
    statusLabel: "Calcul des empreintes sur le serveur principal",
    progress: 5,
    status: TRANSFER_STEP_STATUS.RUNNING,
  });

  const filesRoot = getImportFilesRoot(transferId);
  let currentFile = null;
  try {
    for (const [index, file] of transfer.Files.entries()) {
      currentFile = file;
      await assertNoSymlink(filesRoot, file.RelativePath);
      const absolutePath = await resolveTransferPath(filesRoot, file.RelativePath);
      const stat = await fs.promises.stat(absolutePath);
      if (
        BigInt(stat.size) !== BigInt(file.Size)
        || (await hashFile(absolutePath)) !== file.Sha256
      ) {
        throw new VideoTransferError(
          `Le fichier ${file.RelativePath} a échoué à la seconde vérification.`,
          { statusCode: 422, code: "TRANSFER_RECEIPT_VERIFICATION_FAILED" }
        );
      }
      await updateTransferStep({
        transferId,
        stepKey: IMPORT_STEP.VERIFY,
        label: "Vérification de réception",
        statusLabel: `${index + 1}/${transfer.Files.length} fichiers revérifiés`,
        progress: Math.round(((index + 1) / transfer.Files.length) * 90),
        status: TRANSFER_STEP_STATUS.RUNNING,
      });
    }
    currentFile = null;
    await verifyHlsReferences({
      root: filesRoot,
      manifest: transfer.Manifest,
    });
  } catch (error) {
    const failed = await prisma.videoTransfer.updateMany({
      where: {
        VideoTransferID: transferId,
        Direction: "IMPORT",
        SourceInstanceID: sourceInstanceId,
        Status: TRANSFER_STATUS.VERIFYING,
        CancelRequested: false,
      },
      data: {
        Status: TRANSFER_STATUS.FAILED,
        CurrentStep: IMPORT_STEP.VERIFY,
        ErrorMessage: error.message,
      },
    }).catch(() => ({ count: 0 }));
    if (failed.count === 1) {
      if (currentFile) {
        await prisma.videoTransferFile.update({
          where: { VideoTransferFileID: currentFile.VideoTransferFileID },
          data: {
            Status: TRANSFER_FILE_STATUS.FAILED,
            BytesReceived: 0n,
          },
        }).catch(() => {});
      } else {
        await prisma.videoTransferFile.updateMany({
          where: { VideoTransferID: transferId },
          data: {
            Status: TRANSFER_FILE_STATUS.FAILED,
            BytesReceived: 0n,
          },
        }).catch(() => {});
      }
      await refreshTransferFileTotals(transferId).catch(() => {});
      await updateTransferStep({
        transferId,
        stepKey: IMPORT_STEP.VERIFY,
        label: "Vérification de réception",
        statusLabel: "La vérification d'intégrité a échoué",
        progress: 0,
        status: TRANSFER_STEP_STATUS.FAILED,
        errorMessage: error.message,
      }).catch(() => {});
      await createLog({
        request: asLogRequest(request),
        UtilisateurID: transfer.InitiatedByUserID,
        ActionNom: "video_transfer_failed",
        Champ: "video_transfer",
        NouvelleValeur: transferId,
        Meta: {
          transferId,
          sourceInstanceId,
          sourceVideoId: transfer.SourceVideoID,
          destinationVideoId: transfer.DestinationVideoID,
          phase: IMPORT_STEP.VERIFY,
          error: error.message,
        },
        DedupeMs: TRANSFER_LOG_DEDUPE_MS,
      });
    }
    throw error;
  }

  const receipt = {
    manifestHash: transfer.ManifestHash,
    totalFiles: transfer.TotalFiles,
    totalBytes: transfer.TotalBytes.toString(),
    verifiedAt: new Date().toISOString(),
  };
  const verified = await prisma.videoTransfer.updateMany({
    where: {
      VideoTransferID: transferId,
      Direction: "IMPORT",
      SourceInstanceID: sourceInstanceId,
      Status: TRANSFER_STATUS.VERIFYING,
      CancelRequested: false,
    },
    data: {
      Status: TRANSFER_STATUS.VERIFIED,
      CurrentStep: IMPORT_STEP.VERIFY,
      Progress: 90,
      Receipt: receipt,
      ErrorMessage: null,
    },
  });
  if (verified.count !== 1) {
    throw new VideoTransferError(
      "La session a changé d'état pendant sa vérification.",
      { statusCode: 409, code: "TRANSFER_VERIFY_CONFLICT" }
    );
  }
  await updateTransferStep({
    transferId,
    stepKey: IMPORT_STEP.VERIFY,
    label: "Vérification de réception",
    statusLabel: "Tous les fichiers et les références HLS sont valides",
    progress: 100,
    status: TRANSFER_STEP_STATUS.COMPLETED,
  });
  return getTransferById(transferId);
}

export const verifyImportSession = (options) =>
  withImportTransferLock(options.transferId, async () => {
    const transfer = ensureImportOwner(
      await getTransferById(options.transferId),
      options.sourceInstanceId
    );
    if (
      [
        TRANSFER_STATUS.VERIFIED,
        TRANSFER_STATUS.FINALIZING,
        TRANSFER_STATUS.COMPLETED,
      ].includes(transfer.Status)
    ) {
      return transfer;
    }
    if (
      transfer.CancelRequested
      || [
        TRANSFER_STATUS.CANCEL_REQUESTED,
        TRANSFER_STATUS.CANCELLED,
      ].includes(transfer.Status)
    ) {
      throw new VideoTransferError("Ce transfert a été annulé.", {
        statusCode: 409,
        code: "TRANSFER_CANCELLED",
      });
    }
    const claimed = await prisma.videoTransfer.updateMany({
      where: {
        VideoTransferID: options.transferId,
        Direction: "IMPORT",
        SourceInstanceID: options.sourceInstanceId,
        Status: {
          in: [
            TRANSFER_STATUS.READY,
            TRANSFER_STATUS.TRANSFERRING,
            TRANSFER_STATUS.FAILED,
          ],
        },
        CancelRequested: false,
      },
      data: {
        Status: TRANSFER_STATUS.VERIFYING,
        CurrentStep: IMPORT_STEP.VERIFY,
        Progress: 82,
        ErrorMessage: null,
      },
    });
    if (claimed.count !== 1) {
      const current = ensureImportOwner(
        await getTransferById(options.transferId),
        options.sourceInstanceId
      );
      if (
        [
          TRANSFER_STATUS.VERIFIED,
          TRANSFER_STATUS.FINALIZING,
          TRANSFER_STATUS.COMPLETED,
        ].includes(current.Status)
      ) {
        return current;
      }
      throw new VideoTransferError(
        "La session a changé d'état avant sa vérification.",
        { statusCode: 409, code: "TRANSFER_VERIFY_CONFLICT" }
      );
    }
    await waitForActiveImportUploads(options.transferId);
    return verifyImportSessionUnlocked(options);
  });

const generateDestinationPreviews = async ({ destinationVideoId, masterPath }) => {
  const warnings = [];
  try {
    if (await isContentPreviewActive()) {
      await generateVideoPreviewFramesFromMaster({
        videoId: destinationVideoId,
        masterPlaylistPath: masterPath,
      });
    }
  } catch (error) {
    warnings.push(`Prévisualisation classique non générée : ${error.message}`);
  }
  try {
    if (await isPreviewLiveActive()) {
      await generateVideoPreviewLiveFromMaster({
        videoId: destinationVideoId,
        masterPlaylistPath: masterPath,
      });
    }
  } catch (error) {
    warnings.push(`Preview Live non générée : ${error.message}`);
  }
  return warnings;
};

const pathExists = async (absolutePath) => {
  try {
    await fs.promises.lstat(absolutePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
};

const verifyPublishedTransferFiles = async ({ transfer, destinationDir }) => {
  for (const file of transfer.Files) {
    await assertNoSymlink(destinationDir, file.RelativePath, {
      allowMissingLeaf: false,
    });
    const target = await resolveTransferPath(
      destinationDir,
      file.RelativePath
    );
    const stat = await fs.promises.stat(target);
    if (
      !stat.isFile()
      || BigInt(stat.size) !== BigInt(file.Size)
      || (await hashFile(target)) !== file.Sha256
    ) {
      throw new VideoTransferError(
        "Le dossier destination existant ne correspond pas à cette session vérifiée.",
        { statusCode: 409, code: "DESTINATION_DIRECTORY_MISMATCH" }
      );
    }
  }
  await verifyHlsReferences({
    root: destinationDir,
    manifest: transfer.Manifest,
  });
};

async function finalizeImportSessionUnlocked({
  transferId,
  sourceInstanceId,
  request,
}) {
  let transfer = ensureImportOwner(
    await getTransferById(transferId),
    sourceInstanceId
  );
  if (transfer.Status === TRANSFER_STATUS.COMPLETED) return transfer;
  if (
    transfer.CancelRequested
    || [
      TRANSFER_STATUS.CANCEL_REQUESTED,
      TRANSFER_STATUS.CANCELLED,
    ].includes(transfer.Status)
  ) {
    throw new VideoTransferError("Ce transfert a été annulé.", {
      statusCode: 409,
      code: "TRANSFER_CANCELLED",
    });
  }

  const alreadyFinalizing = transfer.Status === TRANSFER_STATUS.FINALIZING;
  if (!alreadyFinalizing) {
    if (transfer.Status !== TRANSFER_STATUS.VERIFIED) {
      throw new VideoTransferError(
        "La session doit être vérifiée avant sa publication.",
        { statusCode: 409, code: "TRANSFER_NOT_VERIFIED" }
      );
    }
    const claimed = await prisma.videoTransfer.updateMany({
      where: {
        VideoTransferID: transferId,
        Direction: "IMPORT",
        SourceInstanceID: sourceInstanceId,
        Status: TRANSFER_STATUS.VERIFIED,
        CancelRequested: false,
      },
      data: {
        Status: TRANSFER_STATUS.FINALIZING,
        CurrentStep: IMPORT_STEP.FINALIZE,
        Progress: 92,
      },
    });
    if (claimed.count !== 1) {
      const current = ensureImportOwner(
        await getTransferById(transferId),
        sourceInstanceId
      );
      if (current.Status === TRANSFER_STATUS.COMPLETED) return current;
      throw new VideoTransferError(
        "La session a changé d'état avant sa publication.",
        { statusCode: 409, code: "TRANSFER_FINALIZE_CONFLICT" }
      );
    }
    transfer = ensureImportOwner(
      await getTransferById(transferId),
      sourceInstanceId
    );
  }
  await createBlockReservation({
    destinationVideoId: transfer.DestinationVideoID,
    transferId,
  });

  await updateTransferStep({
    transferId,
    stepKey: IMPORT_STEP.FINALIZE,
    label: "Publication de la vidéo",
    statusLabel: "Déplacement atomique vers le stockage public",
    progress: 10,
    status: TRANSFER_STEP_STATUS.RUNNING,
  });

  const sourceDir = getImportFilesRoot(transferId);
  const destinationDir = path.join(
    VIDEO_ROOT,
    String(transfer.DestinationVideoID)
  );
  const sourceExists = await pathExists(sourceDir);
  const destinationExists = await pathExists(destinationDir);

  if (sourceExists && destinationExists) {
    throw new VideoTransferError(
      "Le dossier vidéo de destination existe déjà ; aucun écrasement n'est autorisé.",
      { statusCode: 409, code: "DESTINATION_DIRECTORY_EXISTS" }
    );
  }
  if (!sourceExists && !destinationExists) {
    throw new VideoTransferError("Les fichiers vérifiés sont introuvables.", {
      statusCode: 409,
      code: "VERIFIED_FILES_MISSING",
    });
  }
  const publishDirectory = sourceExists ? sourceDir : destinationDir;
  const publishDirectoryStat = await fs.promises.lstat(publishDirectory);
  if (
    publishDirectoryStat.isSymbolicLink()
    || !publishDirectoryStat.isDirectory()
  ) {
    throw new VideoTransferError(
      "Le dossier à publier n'est pas un dossier de transfert sûr.",
      { statusCode: 409, code: "INVALID_PUBLISH_DIRECTORY" }
    );
  }

  let movedNow = false;
  if (sourceExists) {
    await fs.promises.writeFile(
      path.join(sourceDir, VIDEO_TRANSFER_BLOCK_MARKER),
      transferId,
      { encoding: "utf8", mode: 0o600 }
    );
    await fs.promises.mkdir(VIDEO_ROOT, { recursive: true });
    await fs.promises.rename(sourceDir, destinationDir);
    movedNow = true;
  } else {
    await fs.promises.writeFile(
      path.join(destinationDir, VIDEO_TRANSFER_BLOCK_MARKER),
      transferId,
      { encoding: "utf8", mode: 0o600 }
    );
    // Reprise après crash : ne jamais retenter la vérification dans le staging
    // qui a déjà été déplacé.
    await verifyPublishedTransferFiles({ transfer, destinationDir });
  }

  try {
    await prisma.$transaction(async (transaction) => {
      const currentTransfer = await transaction.videoTransfer.findUnique({
        where: { VideoTransferID: transferId },
        select: { Status: true, CancelRequested: true },
      });
      if (
        !currentTransfer
        || currentTransfer.Status !== TRANSFER_STATUS.FINALIZING
        || currentTransfer.CancelRequested
      ) {
        throw new VideoTransferError(
          "La session n'est plus publiable.",
          { statusCode: 409, code: "TRANSFER_FINALIZE_CONFLICT" }
        );
      }
      const destinationVideo = await transaction.video.findUnique({
        where: { VideoID: transfer.DestinationVideoID },
        select: { EtatID: true },
      });
      if (
        !destinationVideo
        || ![ETAT.BLOCKED, ETAT.ACTIVE].includes(destinationVideo.EtatID)
      ) {
        throw new VideoTransferError(
          "La vidéo bloquée de destination est introuvable.",
          { statusCode: 409, code: "DESTINATION_VIDEO_INVALID" }
        );
      }
      if (destinationVideo.EtatID === ETAT.BLOCKED) {
        await transaction.video.update({
          where: { VideoID: transfer.DestinationVideoID },
          data: { EtatID: ETAT.ACTIVE },
        });
      }
      await transaction.videoTransfer.update({
        where: { VideoTransferID: transferId },
        data: {
          CurrentStep: IMPORT_STEP.FINALIZE,
          Progress: 96,
          ErrorMessage: null,
        },
      });
    });
  } catch (error) {
    let destinationState = null;
    try {
      destinationState = await prisma.video.findUnique({
        where: { VideoID: transfer.DestinationVideoID },
        select: { EtatID: true },
      });
    } catch {
      // État de commit inconnu : conserver les fichiers publiés avec leur
      // marqueur privé est toujours plus sûr que risquer une vidéo ACTIVE vide.
    }
    if (destinationState?.EtatID === ETAT.ACTIVE) {
      // Le commit a pu réussir côté MySQL avant une perte d'ACK. La reprise
      // continue sans déplacer les fichiers hors de leur destination.
    } else if (movedNow && destinationState?.EtatID === ETAT.BLOCKED) {
      await ensurePrivateDirectory(VIDEO_TRANSFER_STAGING_ROOT);
      await ensurePrivateDirectory(getImportRoot(transferId));
      await fs.promises.rename(destinationDir, sourceDir).catch(() => {});
      throw error;
    } else {
      // Commit non confirmé : laisser FINALIZING + marker pour une reprise
      // sûre au lieu de créer une incohérence DB/fichiers.
      throw error;
    }
  }

  await fs.promises.rm(
    path.join(destinationDir, VIDEO_TRANSFER_BLOCK_MARKER),
    { force: true }
  );
  await removeBlockReservation(transfer.DestinationVideoID);
  const masterPath = path.join(destinationDir, "hls", "master.m3u8");
  const warnings = await generateDestinationPreviews({
    destinationVideoId: transfer.DestinationVideoID,
    masterPath,
  });
  await createLog({
    request: asLogRequest(request),
    UtilisateurID: transfer.InitiatedByUserID,
    ActionNom: "video_transfer_completed",
    VideoID: transfer.DestinationVideoID,
    SaisonID: transfer.DestinationSeasonID,
    Champ: "video_transfer",
    NouvelleValeur: transferId,
    Meta: {
      transferId,
      sourceInstanceId,
      sourceVideoId: transfer.SourceVideoID,
      warnings,
    },
    DedupeMs: TRANSFER_LOG_DEDUPE_MS,
  });
  const completed = await prisma.videoTransfer.updateMany({
    where: {
      VideoTransferID: transferId,
      Direction: "IMPORT",
      SourceInstanceID: sourceInstanceId,
      Status: TRANSFER_STATUS.FINALIZING,
      CancelRequested: false,
    },
    data: {
      Status: TRANSFER_STATUS.COMPLETED,
      CurrentStep: IMPORT_STEP.FINALIZE,
      Progress: 100,
      Warnings: warnings,
      CompletedAt: new Date(),
      ErrorMessage: null,
    },
  });
  if (completed.count !== 1) {
    throw new VideoTransferError(
      "La publication est prête mais son accusé final n'a pas pu être enregistré.",
      { statusCode: 409, code: "TRANSFER_COMPLETION_CONFLICT" }
    );
  }
  await updateTransferStep({
    transferId,
    stepKey: IMPORT_STEP.FINALIZE,
    label: "Publication de la vidéo",
    statusLabel:
      warnings.length > 0
        ? "Vidéo publiée avec avertissement de prévisualisation"
        : "Vidéo publiée et activée",
    progress: 100,
    status: TRANSFER_STEP_STATUS.COMPLETED,
  }).catch((error) => {
    console.error("[video-transfer-final-step]", transferId, error);
  });
  return getTransferById(transferId);
}

export const finalizeImportSession = (options) =>
  withImportTransferLock(options.transferId, async () => {
    try {
      await waitForActiveImportUploads(options.transferId);
      return await finalizeImportSessionUnlocked(options);
    } catch (error) {
      const transfer = await getTransferById(options.transferId);
      if (transfer && transfer.Status !== TRANSFER_STATUS.COMPLETED) {
        await prisma.videoTransfer.update({
          where: { VideoTransferID: options.transferId },
          data: { ErrorMessage: error.message },
        }).catch(() => {});
        await createLog({
          request: asLogRequest(options.request),
          UtilisateurID: transfer.InitiatedByUserID,
          ActionNom: "video_transfer_failed",
          Champ: "video_transfer",
          NouvelleValeur: options.transferId,
          Meta: {
            transferId: options.transferId,
            sourceInstanceId: options.sourceInstanceId,
            sourceVideoId: transfer.SourceVideoID,
            destinationVideoId: transfer.DestinationVideoID,
            phase: IMPORT_STEP.FINALIZE,
            error: error.message,
          },
          DedupeMs: TRANSFER_LOG_DEDUPE_MS,
        });
      }
      throw error;
    }
  });

async function cancelImportSessionUnlocked({
  transferId,
  sourceInstanceId,
  request,
  expectedUpdatedBefore,
}) {
  const transfer = ensureImportOwner(
    await getTransferById(transferId),
    sourceInstanceId
  );
  if (
    [
      TRANSFER_STATUS.FINALIZING,
      TRANSFER_STATUS.COMPLETED,
    ].includes(transfer.Status)
  ) {
    throw new VideoTransferError(
      "Un transfert en cours de publication ou terminé ne peut plus être annulé.",
      { statusCode: 409, code: "TRANSFER_ALREADY_FINALIZING" }
    );
  }
  if (transfer.Status === TRANSFER_STATUS.CANCELLED) return transfer;

  const claimed = await prisma.videoTransfer.updateMany({
    where: {
      VideoTransferID: transferId,
      Direction: "IMPORT",
      SourceInstanceID: sourceInstanceId,
      Status: {
        notIn: [
          TRANSFER_STATUS.FINALIZING,
          TRANSFER_STATUS.COMPLETED,
          TRANSFER_STATUS.CANCELLED,
        ],
      },
      ...(
        expectedUpdatedBefore
          ? { UpdatedAt: { lt: expectedUpdatedBefore } }
          : {}
      ),
    },
    data: {
      Status: TRANSFER_STATUS.CANCEL_REQUESTED,
      CancelRequested: true,
    },
  });
  if (claimed.count !== 1) {
    const current = ensureImportOwner(
      await getTransferById(transferId),
      sourceInstanceId
    );
    if (expectedUpdatedBefore) {
      // Le cleanup travaille sur un snapshot ancien. Tout changement d'état
      // ou rafraîchissement d'UpdatedAt invalide sa décision de suppression.
      return current;
    }
    if (current.Status === TRANSFER_STATUS.CANCELLED) return current;
    throw new VideoTransferError(
      "La session est déjà en cours de publication ou terminée.",
      { statusCode: 409, code: "TRANSFER_CANCEL_CONFLICT" }
    );
  }
  abortActiveImportUploads(transferId);
  await waitForActiveImportUploads(transferId);
  const destinationVideo = transfer.DestinationVideoID
    ? await prisma.video.findUnique({
      where: { VideoID: transfer.DestinationVideoID },
      select: { EtatID: true },
    })
    : null;
  if (destinationVideo?.EtatID === ETAT.ACTIVE) {
    await prisma.videoTransfer.update({
      where: { VideoTransferID: transferId },
      data: {
        Status: TRANSFER_STATUS.FINALIZING,
        CancelRequested: false,
      },
    });
    throw new VideoTransferError(
      "La vidéo de destination est déjà active ; ses fichiers ne seront pas supprimés.",
      { statusCode: 409, code: "ACTIVE_DESTINATION_NOT_CANCELLABLE" }
    );
  }
  await fs.promises.rm(getImportRoot(transferId), {
    recursive: true,
    force: true,
  });
  const destinationDir = transfer.DestinationVideoID
    ? path.join(VIDEO_ROOT, String(transfer.DestinationVideoID))
    : null;
  if (destinationDir && (!destinationVideo || destinationVideo.EtatID === ETAT.BLOCKED)) {
    await fs.promises.rm(destinationDir, { recursive: true, force: true });
  }

  await prisma.$transaction(async (transaction) => {
    const currentDestination = transfer.DestinationVideoID
      ? await transaction.video.findUnique({
        where: { VideoID: transfer.DestinationVideoID },
        select: { EtatID: true },
      })
      : null;
    if (currentDestination?.EtatID === ETAT.ACTIVE) {
      throw new VideoTransferError(
        "La vidéo de destination a été activée pendant l'annulation.",
        { statusCode: 409, code: "ACTIVE_DESTINATION_NOT_CANCELLABLE" }
      );
    }
    await removeBlockedDestination(transaction, transfer.DestinationVideoID);
    await transaction.videoTransferFile.updateMany({
      where: { VideoTransferID: transferId },
      data: {
        Status: TRANSFER_FILE_STATUS.PENDING,
        BytesReceived: 0n,
      },
    });
    await transaction.videoTransfer.update({
      where: { VideoTransferID: transferId },
      data: {
        Status: TRANSFER_STATUS.CANCELLED,
        CurrentStep: "cancelled",
        CancelRequested: true,
        TransferredFiles: 0,
        TransferredBytes: 0n,
        CompletedAt: new Date(),
      },
    });
  });
  await removeBlockReservation(transfer.DestinationVideoID);
  await updateTransferStep({
    transferId,
    stepKey: "cancelled",
    label: "Annulation",
    statusLabel: "Fichiers temporaires et données bloquées supprimés",
    progress: 100,
    status: TRANSFER_STEP_STATUS.CANCELLED,
  });
  await createLog({
    request: asLogRequest(request),
    UtilisateurID: transfer.InitiatedByUserID,
    ActionNom: "video_transfer_cancelled",
    Champ: "video_transfer",
    NouvelleValeur: transferId,
    Meta: {
      transferId,
      destinationVideoId: transfer.DestinationVideoID,
      sourceInstanceId,
      sourceVideoId: transfer.SourceVideoID,
    },
    DedupeMs: TRANSFER_LOG_DEDUPE_MS,
  });
  return getTransferById(transferId);
}

export const cancelImportSession = (options) =>
  withImportTransferLock(options.transferId, () =>
    cancelImportSessionUnlocked(options)
  );

export async function restoreVideoTransferBlockReservations() {
  assertPrimaryTransferConfiguration();
  await ensurePrivateDirectory(VIDEO_TRANSFER_BLOCKED_ROOT);
  const transfers = await prisma.videoTransfer.findMany({
    where: {
      Direction: "IMPORT",
      DestinationVideoID: { not: null },
    },
    select: {
      VideoTransferID: true,
      DestinationVideoID: true,
      Status: true,
    },
  });
  const destinationIds = Array.from(
    new Set(transfers.map((transfer) => transfer.DestinationVideoID))
  );
  const videos = destinationIds.length
    ? await prisma.video.findMany({
      where: { VideoID: { in: destinationIds } },
      select: { VideoID: true, EtatID: true },
    })
    : [];
  const statesByVideoId = new Map(
    videos.map((video) => [video.VideoID, video.EtatID])
  );
  const expected = new Map();
  for (const transfer of transfers) {
    const nonTerminal = ![
      TRANSFER_STATUS.COMPLETED,
      TRANSFER_STATUS.CANCELLED,
    ].includes(transfer.Status);
    if (
      nonTerminal
      || statesByVideoId.get(transfer.DestinationVideoID) === ETAT.BLOCKED
    ) {
      expected.set(
        String(transfer.DestinationVideoID),
        transfer.VideoTransferID
      );
    }
  }

  for (const [destinationVideoId, transferId] of expected) {
    await createBlockReservation({
      destinationVideoId,
      transferId,
    });
  }
  const existingReservations = await fs.promises.readdir(
    VIDEO_TRANSFER_BLOCKED_ROOT
  );
  let removed = 0;
  for (const filename of existingReservations) {
    if (!/^[1-9][0-9]*$/.test(filename) || expected.has(filename)) continue;
    await fs.promises.rm(path.join(VIDEO_TRANSFER_BLOCKED_ROOT, filename), {
      force: true,
    });
    removed += 1;
  }
  return { restored: expected.size, removed };
}

export async function recoverInterruptedImports() {
  const config = assertPrimaryTransferConfiguration();
  const transfers = await prisma.videoTransfer.findMany({
    where: {
      Direction: "IMPORT",
      Status: {
        in: [
          TRANSFER_STATUS.FINALIZING,
          TRANSFER_STATUS.CANCEL_REQUESTED,
          TRANSFER_STATUS.VERIFYING,
        ],
      },
    },
    select: {
      VideoTransferID: true,
      SourceInstanceID: true,
      Status: true,
    },
  });
  const result = { recovered: 0, failed: 0 };
  for (const transfer of transfers) {
    try {
      if (transfer.Status === TRANSFER_STATUS.FINALIZING) {
        await finalizeImportSession({
          transferId: transfer.VideoTransferID,
          sourceInstanceId: transfer.SourceInstanceID,
          request: asLogRequest(),
        });
      } else if (transfer.Status === TRANSFER_STATUS.CANCEL_REQUESTED) {
        await cancelImportSession({
          transferId: transfer.VideoTransferID,
          sourceInstanceId: transfer.SourceInstanceID,
          request: asLogRequest(),
        });
      } else {
        await prisma.videoTransfer.updateMany({
          where: {
            VideoTransferID: transfer.VideoTransferID,
            Direction: "IMPORT",
            SourceInstanceID: transfer.SourceInstanceID,
            Status: TRANSFER_STATUS.VERIFYING,
            CancelRequested: false,
          },
          data: {
            Status: TRANSFER_STATUS.FAILED,
            ErrorMessage:
              "Le serveur principal a redémarré pendant la vérification ; la session peut être reprise.",
          },
        });
      }
      result.recovered += 1;
    } catch (error) {
      result.failed += 1;
      console.error(
        `[video-transfer-recovery:${config.instanceId}]`,
        transfer.VideoTransferID,
        error
      );
    }
  }
  return result;
}

export async function cleanupExpiredVideoTransferStaging() {
  const config = assertPrimaryTransferConfiguration();
  const cutoff = new Date(
    Date.now() - config.sessionTtlHours * 60 * 60 * 1000
  );
  const expired = await prisma.videoTransfer.findMany({
    where: {
      Direction: "IMPORT",
      UpdatedAt: { lt: cutoff },
      Status: {
        in: [
          TRANSFER_STATUS.READY,
          TRANSFER_STATUS.TRANSFERRING,
          TRANSFER_STATUS.VERIFYING,
          TRANSFER_STATUS.VERIFIED,
          TRANSFER_STATUS.FAILED,
          TRANSFER_STATUS.CANCEL_REQUESTED,
        ],
      },
    },
    select: {
      VideoTransferID: true,
      SourceInstanceID: true,
    },
  });
  let cancelled = 0;
  let skipped = 0;
  for (const transfer of expired) {
    try {
      const result = await cancelImportSession({
        transferId: transfer.VideoTransferID,
        sourceInstanceId: transfer.SourceInstanceID,
        request: asLogRequest(),
        expectedUpdatedBefore: cutoff,
      });
      if (result.Status === TRANSFER_STATUS.CANCELLED) {
        cancelled += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      console.error(
        "[video-transfer-cleanup]",
        transfer.VideoTransferID,
        error
      );
    }
  }

  const terminal = await prisma.videoTransfer.findMany({
    where: {
      Direction: "IMPORT",
      UpdatedAt: { lt: cutoff },
      Status: {
        in: [
          TRANSFER_STATUS.COMPLETED,
          TRANSFER_STATUS.CANCELLED,
        ],
      },
    },
    select: { VideoTransferID: true },
  });
  let stagingRemoved = 0;
  for (const transfer of terminal) {
    await withImportTransferLock(transfer.VideoTransferID, async () => {
      const current = await prisma.videoTransfer.findUnique({
        where: { VideoTransferID: transfer.VideoTransferID },
        select: { Status: true, UpdatedAt: true },
      });
      if (
        !current
        || ![
          TRANSFER_STATUS.COMPLETED,
          TRANSFER_STATUS.CANCELLED,
        ].includes(current.Status)
        || current.UpdatedAt >= cutoff
      ) {
        return;
      }
      await fs.promises.rm(getImportRoot(transfer.VideoTransferID), {
        recursive: true,
        force: true,
      });
      stagingRemoved += 1;
    });
  }
  return { cancelled, skipped, stagingRemoved };
}
