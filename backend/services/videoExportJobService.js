import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";

import { ETAT } from "../constants.js";
import { createLog } from "../controllers/logController.js";
import { VIDEO_ROOT } from "./video/videoPaths.js";
import { prisma } from "./db.js";
import {
  VIDEO_TRANSFER_PROTOCOL_VERSION,
  assertCloneTransferConfiguration,
} from "./videoTransferConfig.js";
import { VideoTransferError } from "./videoTransferError.js";
import {
  RECOVERABLE_EXPORT_STATUSES,
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
  cancelPrimaryImportSession,
  createPrimaryImportSession,
  fetchPrimaryCapabilities,
  fetchPrimaryGenres,
  fetchPrimarySeries,
  fetchPrimarySeriesSeasons,
  finalizePrimaryImportSession,
  getPrimaryImportSession,
  uploadPrimaryImportFile,
  verifyPrimaryImportSession,
} from "./videoTransferRemoteClient.js";
import {
  hashFile,
  normalizeVideoTransferRelativePath,
  sha256String,
  stableStringify,
  validateVideoTransferManifest,
} from "./videoTransferSecurity.js";

const EXPORT_STEP = Object.freeze({
  PREFLIGHT: "preflight",
  MANIFEST: "manifest",
  DATABASE: "database",
  TRANSFER: "transfer",
  VERIFY: "verify",
  FINALIZE: "finalize",
});
const TRANSFER_LOG_DEDUPE_MS = 24 * 60 * 60 * 1000;

const runningExportJobs = new Map();
const exportAbortControllers = new Map();

const asLogRequest = (request) =>
  request || { headers: {}, socket: {}, ip: null };

const validatePrimaryCapabilities = (capabilities, config) => {
  if (
    !capabilities?.ready
    || capabilities.role !== "primary"
    || Number(capabilities.protocolVersion) !== VIDEO_TRANSFER_PROTOCOL_VERSION
    || !capabilities.instanceId
  ) {
    throw new VideoTransferError(
      "Le serveur distant n'est pas un serveur principal SAMI compatible.",
      { statusCode: 503, code: "PRIMARY_CAPABILITIES_INVALID" }
    );
  }
  if (capabilities.instanceId === config.instanceId) {
    throw new VideoTransferError(
      "Le clone et le serveur principal doivent avoir des identifiants d'instance différents.",
      { statusCode: 409, code: "TRANSFER_INSTANCE_LOOP" }
    );
  }
  return capabilities;
};

const jobRequest = (transfer) => {
  const request = transfer?.Manifest?.request;
  if (request && typeof request === "object" && !Array.isArray(request)) {
    return {
      destinationSeasonId:
        request.destinationSeasonId === null
          ? null
          : Number(request.destinationSeasonId),
      genreIds: Array.isArray(request.genreIds)
        ? request.genreIds.map(Number).sort((left, right) => left - right)
        : [],
    };
  }
  return {
    destinationSeasonId: transfer?.DestinationSeasonID ?? null,
    genreIds: Array.isArray(transfer?.Manifest?.metadata?.destinationGenreIds)
      ? transfer.Manifest.metadata.destinationGenreIds
        .map(Number)
        .sort((left, right) => left - right)
      : [],
  };
};

const normalizedJobRequest = ({ destinationSeasonId, genreIds }) => ({
  destinationSeasonId:
    destinationSeasonId === null || destinationSeasonId === undefined
      ? null
      : Number(destinationSeasonId),
  genreIds: Array.from(new Set(genreIds.map(Number)))
    .sort((left, right) => left - right),
});

const sameJobRequest = (left, right) =>
  stableStringify(normalizedJobRequest(left))
  === stableStringify(normalizedJobRequest(right));

const findSourceVideo = async (videoId) => {
  const video = await prisma.video.findFirst({
    where: { VideoID: Number(videoId), EtatID: ETAT.ACTIVE },
    include: {
      VideoGenres: {
        include: { Genre: true },
        orderBy: { GenreID: "asc" },
      },
      VideoSubtitles: { orderBy: { VideoSubtitleID: "asc" } },
      VideoAudioTracks: { orderBy: { Ordre: "asc" } },
    },
  });
  if (!video) {
    throw new VideoTransferError(
      "La vidéo source active est introuvable sur ce clone.",
      { statusCode: 404, code: "SOURCE_VIDEO_NOT_FOUND" }
    );
  }
  return video;
};

const normalizeStoredVideoPath = (storedPath, videoId, fieldName) => {
  if (!storedPath) return null;
  const normalized = String(storedPath)
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
  const prefix = `uploads/video/${videoId}/`;
  if (!normalized.startsWith(prefix)) {
    throw new VideoTransferError(
      `${fieldName} n'utilise pas le stockage vidéo moderne attendu.`,
      { statusCode: 409, code: "LEGACY_VIDEO_STORAGE_UNSUPPORTED" }
    );
  }
  try {
    return normalizeVideoTransferRelativePath(normalized.slice(prefix.length));
  } catch (error) {
    throw new VideoTransferError(
      `${fieldName} contient un chemin de stockage non exportable.`,
      {
        statusCode: 409,
        code: "INVALID_SOURCE_VIDEO_PATH",
        cause: error,
      }
    );
  }
};

const walkTransferDirectory = async (root, directoryName, output) => {
  const directory = path.join(root, directoryName);
  let directoryStat;
  try {
    directoryStat = await fs.promises.lstat(directory);
  } catch (error) {
    if (error?.code === "ENOENT" && directoryName !== "hls") return;
    throw error;
  }
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new VideoTransferError(
      `Le dossier ${directoryName} de la vidéo source est invalide.`,
      { statusCode: 409, code: "INVALID_SOURCE_VIDEO_DIRECTORY" }
    );
  }

  const visit = async (absoluteDirectory, relativeDirectory) => {
    const entries = await fs.promises.readdir(absoluteDirectory, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const absolutePath = path.join(absoluteDirectory, entry.name);
      const stat = await fs.promises.lstat(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new VideoTransferError(
          `Le lien symbolique ${relativePath} ne peut pas être exporté.`,
          { statusCode: 409, code: "SOURCE_VIDEO_SYMLINK_FORBIDDEN" }
        );
      }
      if (stat.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (stat.isFile()) {
        output.push({
          absolutePath,
          relativePath: normalizeVideoTransferRelativePath(relativePath),
          size: stat.size,
        });
      } else {
        throw new VideoTransferError(
          `Le fichier spécial ${relativePath} ne peut pas être exporté.`,
          { statusCode: 409, code: "INVALID_SOURCE_VIDEO_FILE_TYPE" }
        );
      }
    }
  };
  await visit(directory, directoryName);
};

const mapWithConcurrency = async (items, concurrency, mapper) => {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(items.length, 1)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await mapper(items[index], index);
      }
    }
  );
  await Promise.all(workers);
  return results;
};

const buildExportManifest = async ({
  transfer,
  video,
  destinationSeasonId,
  genreIds,
  concurrency,
}) => {
  const sourceRoot = path.join(VIDEO_ROOT, String(video.VideoID));
  let rootStat;
  try {
    rootStat = await fs.promises.lstat(sourceRoot);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new VideoTransferError(
        "Le dossier de la vidéo source est introuvable.",
        { statusCode: 409, code: "SOURCE_VIDEO_FILES_MISSING" }
      );
    }
    throw error;
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new VideoTransferError(
      "Le dossier de la vidéo source est invalide.",
      { statusCode: 409, code: "INVALID_SOURCE_VIDEO_DIRECTORY" }
    );
  }

  const masterPlaylistPath = normalizeStoredVideoPath(
    video.CheminAcces,
    video.VideoID,
    "CheminAcces"
  );
  if (masterPlaylistPath !== "hls/master.m3u8") {
    throw new VideoTransferError(
      "La vidéo source ne référence pas hls/master.m3u8.",
      { statusCode: 409, code: "SOURCE_MASTER_PLAYLIST_UNSUPPORTED" }
    );
  }

  const posterPath = normalizeStoredVideoPath(
    video.CheminImage,
    video.VideoID,
    "CheminImage"
  );
  const subtitles = video.VideoSubtitles.map((subtitle) => ({
    label: subtitle.Label,
    language: subtitle.Language || null,
    type: subtitle.Type || "FULL",
    origin: subtitle.Origin || "IMPORTED",
    path: normalizeStoredVideoPath(
      subtitle.CheminSubtitle,
      video.VideoID,
      "CheminSubtitle"
    ),
  }));
  const audioTracks = video.VideoAudioTracks.map((track) => ({
    label: track.Label,
    language: track.Language || null,
    path: normalizeStoredVideoPath(
      track.CheminPlaylist,
      video.VideoID,
      "CheminPlaylist"
    ),
    isDefault: Boolean(track.IsDefault),
    order: track.Ordre,
  }));

  const discovered = [];
  for (const directoryName of ["hls", "affiche", "sousTitre"]) {
    await walkTransferDirectory(sourceRoot, directoryName, discovered);
  }
  discovered.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
  const files = await mapWithConcurrency(
    discovered,
    concurrency,
    async (file) => ({
      relativePath: file.relativePath,
      size: String(file.size),
      sha256: await hashFile(file.absolutePath),
    })
  );

  return validateVideoTransferManifest({
    version: 1,
    exportTransferId: transfer.VideoTransferID,
    source: {
      instanceId: transfer.SourceInstanceID,
      videoId: video.VideoID,
    },
    destinationSeasonId,
    initiatedByNickname: transfer.InitiatedByNickname,
    metadata: {
      title: video.Titre,
      summary: video.Resumer || null,
      premium: Boolean(video.Premium),
      masterPlaylistPath,
      posterPath,
      destinationGenreIds: genreIds,
      subtitles,
      audioTracks,
    },
    files,
  });
};

const ensureNotCancelled = async (transferId, signal) => {
  if (signal?.aborted) {
    throw new VideoTransferError("Le transfert a été annulé.", {
      statusCode: 409,
      code: "TRANSFER_CANCELLED",
    });
  }
  const transfer = await prisma.videoTransfer.findUnique({
    where: { VideoTransferID: transferId },
    select: { CancelRequested: true, Status: true },
  });
  if (
    !transfer
    || transfer.CancelRequested
    || [
      TRANSFER_STATUS.CANCEL_REQUESTED,
      TRANSFER_STATUS.CANCELLED,
    ].includes(transfer.Status)
  ) {
    throw new VideoTransferError("Le transfert a été annulé.", {
      statusCode: 409,
      code: "TRANSFER_CANCELLED",
    });
  }
};

const transitionActiveExport = async (
  transferId,
  data,
  { allowFinalizing = false } = {}
) => {
  const updated = await prisma.videoTransfer.updateMany({
    where: {
      VideoTransferID: transferId,
      Direction: "EXPORT",
      CancelRequested: false,
      Status: {
        notIn: [
          TRANSFER_STATUS.COMPLETED,
          TRANSFER_STATUS.CANCEL_REQUESTED,
          TRANSFER_STATUS.CANCELLED,
          ...(!allowFinalizing ? [TRANSFER_STATUS.FINALIZING] : []),
        ],
      },
    },
    data,
  });
  if (updated.count !== 1) {
    throw new VideoTransferError("Le transfert a été annulé.", {
      statusCode: 409,
      code: "TRANSFER_CANCELLED",
    });
  }
};

const markExportFailed = async (transferId, error) => {
  const current = await getTransferById(transferId);
  if (
    !current
    || current.CancelRequested
    || [
      TRANSFER_STATUS.CANCEL_REQUESTED,
      TRANSFER_STATUS.CANCELLED,
      TRANSFER_STATUS.COMPLETED,
    ].includes(current.Status)
  ) {
    return;
  }
  await setTransferState(transferId, {
    status: TRANSFER_STATUS.FAILED,
    errorMessage: error.message,
    cancelRequested: false,
  });
  if (current.CurrentStep) {
    await updateTransferStep({
      transferId,
      stepKey: current.CurrentStep,
      label:
        current.Steps.find((step) => step.StepKey === current.CurrentStep)?.Label
        || "Export vers le serveur principal",
      statusLabel: "L'export a échoué",
      progress: current.Progress,
      status: TRANSFER_STEP_STATUS.FAILED,
      errorMessage: error.message,
    }).catch(() => {});
  }
  await createLog({
    request: asLogRequest(),
    UtilisateurID: current.InitiatedByUserID,
    ActionNom: "video_transfer_failed",
    VideoID: current.SourceVideoID,
    Champ: "video_transfer",
    NouvelleValeur: transferId,
    Meta: {
      transferId,
      sourceVideoId: current.SourceVideoID,
      remoteTransferId: current.RemoteTransferID,
      error: error.message,
    },
    DedupeMs: TRANSFER_LOG_DEDUPE_MS,
  });
};

const completeLocalExport = async ({
  transferId,
  remoteTransferId,
  remoteTransfer,
  fallbackDestinationVideoId = null,
}) => {
  if (remoteTransfer?.status !== TRANSFER_STATUS.COMPLETED) {
    throw new VideoTransferError(
      "Le serveur principal n'a pas confirmé l'état final de la publication.",
      { statusCode: 502, code: "REMOTE_COMPLETION_NOT_CONFIRMED" }
    );
  }
  const localCompleted = await prisma.videoTransfer.updateMany({
    where: {
      VideoTransferID: transferId,
      Status: TRANSFER_STATUS.FINALIZING,
      CancelRequested: false,
    },
    data: {
      Status: TRANSFER_STATUS.COMPLETED,
      CurrentStep: EXPORT_STEP.FINALIZE,
      Progress: 100,
      DestinationVideoID:
        remoteTransfer?.destinationVideoId
        || fallbackDestinationVideoId
        || null,
      Receipt: remoteTransfer?.receipt || Prisma.DbNull,
      Warnings: remoteTransfer?.warnings || [],
      ErrorMessage: null,
      CompletedAt: new Date(),
    },
  });
  if (localCompleted.count !== 1) {
    const current = await getTransferById(transferId);
    if (current?.Status === TRANSFER_STATUS.COMPLETED) return current;
    throw new VideoTransferError(
      "Le serveur principal a publié la vidéo, mais l'accusé local reste à reprendre.",
      { statusCode: 409, code: "LOCAL_COMPLETION_CONFLICT" }
    );
  }

  await updateTransferStep({
    transferId,
    stepKey: EXPORT_STEP.FINALIZE,
    label: "Publication sur le serveur principal",
    statusLabel:
      remoteTransfer?.warnings?.length
        ? "Vidéo publiée avec avertissements"
        : "Vidéo publiée et activée",
    progress: 100,
    status: TRANSFER_STEP_STATUS.COMPLETED,
  }).catch((error) => {
    console.error("[video-export-final-step]", transferId, error);
  });
  const completed = await getTransferById(transferId);
  await createLog({
    request: asLogRequest(),
    UtilisateurID: completed.InitiatedByUserID,
    ActionNom: "video_transfer_completed",
    VideoID: completed.SourceVideoID,
    Champ: "video_transfer",
    NouvelleValeur: transferId,
    Meta: {
      transferId,
      remoteTransferId,
      destinationVideoId: completed.DestinationVideoID,
      warnings: completed.Warnings || [],
    },
    DedupeMs: TRANSFER_LOG_DEDUPE_MS,
  });
  return completed;
};

const runExportJob = async (transferId) => {
  const abortController = new AbortController();
  exportAbortControllers.set(transferId, abortController);
  const { signal } = abortController;
  let transfer = await getTransferById(transferId);
  if (!transfer) return;
  const recoveringFinalization =
    transfer.Status === TRANSFER_STATUS.FINALIZING;
  let remoteFinalized = false;
  let remoteFinalizationAttempted = false;

  try {
    const config = assertCloneTransferConfiguration();
    if (!recoveringFinalization) {
      await transitionActiveExport(transferId, {
        Status: TRANSFER_STATUS.PREPARING,
        CurrentStep: EXPORT_STEP.PREFLIGHT,
        Progress: 2,
        ErrorMessage: null,
      });
    }
    validatePrimaryCapabilities(
      await fetchPrimaryCapabilities(),
      config
    );
    await updateTransferStep({
      transferId,
      stepKey: EXPORT_STEP.PREFLIGHT,
      label: "Vérification du serveur principal",
      statusLabel: "Serveur principal disponible et compatible",
      progress: 100,
      status: TRANSFER_STEP_STATUS.COMPLETED,
    });
    await ensureNotCancelled(transferId, signal);

    if (recoveringFinalization) {
      if (!transfer.RemoteTransferID) {
        throw new VideoTransferError(
          "La session distante à réconcilier est absente.",
          { statusCode: 409, code: "REMOTE_TRANSFER_ID_MISSING" }
        );
      }
      const remoteSnapshot = await getPrimaryImportSession({
        transferId: transfer.RemoteTransferID,
        signal,
      });
      let remoteTransfer = remoteSnapshot?.transfer;
      if (
        !remoteTransfer
        || ![
          TRANSFER_STATUS.VERIFIED,
          TRANSFER_STATUS.FINALIZING,
          TRANSFER_STATUS.COMPLETED,
        ].includes(remoteTransfer.status)
      ) {
        throw new VideoTransferError(
          "L'état de la session distante ne permet pas de confirmer la publication.",
          { statusCode: 409, code: "REMOTE_FINALIZATION_STATE_INVALID" }
        );
      }
      await updateTransferStep({
        transferId,
        stepKey: EXPORT_STEP.FINALIZE,
        label: "Publication sur le serveur principal",
        statusLabel: "Réconciliation de la publication distante",
        progress: 50,
        status: TRANSFER_STEP_STATUS.RUNNING,
      });
      if (remoteTransfer.status !== TRANSFER_STATUS.COMPLETED) {
        remoteFinalizationAttempted = true;
        remoteTransfer = (
          await finalizePrimaryImportSession({
            transferId: transfer.RemoteTransferID,
            signal,
          })
        )?.transfer;
      }
      remoteFinalized = true;
      await completeLocalExport({
        transferId,
        remoteTransferId: transfer.RemoteTransferID,
        remoteTransfer,
        fallbackDestinationVideoId: transfer.DestinationVideoID,
      });
      return;
    }

    const requested = jobRequest(transfer);
    const availableGenres = await fetchPrimaryGenres();
    const availableGenreIds = new Set(
      availableGenres.map((genre) => Number(genre.GenreID ?? genre.id))
    );
    if (requested.genreIds.some((genreId) => !availableGenreIds.has(genreId))) {
      throw new VideoTransferError(
        "Un genre sélectionné n'existe plus sur le serveur principal.",
        { statusCode: 409, code: "DESTINATION_GENRE_NOT_FOUND" }
      );
    }

    const video = await findSourceVideo(transfer.SourceVideoID);
    if (!recoveringFinalization) {
      await transitionActiveExport(transferId, {
        Status: TRANSFER_STATUS.PREPARING,
        CurrentStep: EXPORT_STEP.MANIFEST,
        Progress: 5,
      });
    }
    await updateTransferStep({
      transferId,
      stepKey: EXPORT_STEP.MANIFEST,
      label: "Préparation des fichiers",
      statusLabel: "Inventaire et calcul des empreintes",
      progress: 5,
      status: TRANSFER_STEP_STATUS.RUNNING,
    });

    let manifest;
    if (transfer.ManifestHash && transfer.Manifest?.version === 1) {
      manifest = validateVideoTransferManifest(transfer.Manifest);
    } else {
      manifest = await buildExportManifest({
        transfer,
        video,
        destinationSeasonId: requested.destinationSeasonId,
        genreIds: requested.genreIds,
        concurrency: config.concurrency,
      });
    }
    const manifestHash = sha256String(stableStringify(manifest));

    await prisma.$transaction(async (transaction) => {
      const current = await transaction.videoTransfer.findUnique({
        where: { VideoTransferID: transferId },
        select: { CancelRequested: true, ManifestHash: true },
      });
      if (!current || current.CancelRequested) {
        throw new VideoTransferError("Le transfert a été annulé.", {
          statusCode: 409,
          code: "TRANSFER_CANCELLED",
        });
      }
      if (current.ManifestHash && current.ManifestHash !== manifestHash) {
        throw new VideoTransferError(
          "Les fichiers source ont changé depuis la création de l'export.",
          { statusCode: 409, code: "SOURCE_MANIFEST_CHANGED" }
        );
      }
      if (!current.ManifestHash) {
        await transaction.videoTransferFile.deleteMany({
          where: { VideoTransferID: transferId },
        });
        await transaction.videoTransferFile.createMany({
          data: manifest.files.map((file) => ({
            VideoTransferFileID: randomUUID(),
            VideoTransferID: transferId,
            RelativePath: file.relativePath,
            Size: BigInt(file.size),
            Sha256: file.sha256,
            Status: TRANSFER_FILE_STATUS.PENDING,
          })),
        });
      }
      await transaction.videoTransfer.update({
        where: { VideoTransferID: transferId },
        data: {
          Manifest: manifest,
          ManifestHash: manifestHash,
          DestinationSeasonID: requested.destinationSeasonId,
          TotalFiles: manifest.files.length,
          TotalBytes: BigInt(manifest.totalBytes),
          CurrentStep: EXPORT_STEP.MANIFEST,
          Progress: 10,
        },
      });
    });
    await updateTransferStep({
      transferId,
      stepKey: EXPORT_STEP.MANIFEST,
      label: "Préparation des fichiers",
      statusLabel: `${manifest.files.length} fichiers prêts à être transférés`,
      progress: 100,
      status: TRANSFER_STEP_STATUS.COMPLETED,
    });

    await ensureNotCancelled(transferId, signal);
    if (!recoveringFinalization) {
      await transitionActiveExport(transferId, {
        Status: TRANSFER_STATUS.CREATING_REMOTE,
        CurrentStep: EXPORT_STEP.DATABASE,
        Progress: 12,
      });
    }
    await updateTransferStep({
      transferId,
      stepKey: EXPORT_STEP.DATABASE,
      label: "Création sur le serveur principal",
      statusLabel: "Réservation de la vidéo en état bloqué",
      progress: 20,
      status: TRANSFER_STEP_STATUS.RUNNING,
    });
    const remoteSession = await createPrimaryImportSession({
      manifest,
      manifestHash,
      signal,
    });
    const remoteTransfer = remoteSession?.transfer;
    const remoteTransferId = remoteTransfer?.id;
    if (!remoteTransferId) {
      throw new VideoTransferError(
        "Le serveur principal n'a pas retourné de session valide.",
        { statusCode: 502, code: "INVALID_PRIMARY_SESSION" }
      );
    }
    try {
      await ensureNotCancelled(transferId, signal);
    } catch (error) {
      await cancelPrimaryImportSession({
        transferId: remoteTransferId,
      }).catch(() => {});
      throw error;
    }
    const remoteRecorded = await prisma.videoTransfer.updateMany({
      where: {
        VideoTransferID: transferId,
        CancelRequested: false,
        Status: {
          in: recoveringFinalization
            ? [TRANSFER_STATUS.FINALIZING]
            : [TRANSFER_STATUS.CREATING_REMOTE],
        },
      },
      data: {
        ...(!recoveringFinalization
          ? { Status: TRANSFER_STATUS.READY }
          : {}),
        CurrentStep: EXPORT_STEP.DATABASE,
        Progress: 15,
        RemoteTransferID: remoteTransferId,
        DestinationVideoID: remoteTransfer.destinationVideoId || null,
      },
    });
    if (remoteRecorded.count !== 1) {
      await cancelPrimaryImportSession({
        transferId: remoteTransferId,
      }).catch(() => {});
      throw new VideoTransferError(
        "L'export a été annulé pendant la création distante.",
        { statusCode: 409, code: "TRANSFER_CANCELLED" }
      );
    }
    await updateTransferStep({
      transferId,
      stepKey: EXPORT_STEP.DATABASE,
      label: "Création sur le serveur principal",
      statusLabel: "Vidéo réservée en état bloqué",
      progress: 100,
      status: TRANSFER_STEP_STATUS.COMPLETED,
    });

    const remoteFilesByPath = new Map(
      (remoteSession.files || []).map((file) => [file.relativePath, file])
    );
    const sourceRoot = path.join(VIDEO_ROOT, String(transfer.SourceVideoID));
    let progressLogged = false;
    if (!recoveringFinalization) {
      await transitionActiveExport(transferId, {
        Status: TRANSFER_STATUS.TRANSFERRING,
        CurrentStep: EXPORT_STEP.TRANSFER,
        Progress: 15,
      });
    }
    await updateTransferStep({
      transferId,
      stepKey: EXPORT_STEP.TRANSFER,
      label: "Transfert des fichiers",
      statusLabel: "Envoi sécurisé vers le serveur principal",
      progress: 0,
      status: TRANSFER_STEP_STATUS.RUNNING,
    });
    const localFiles = await prisma.videoTransferFile.findMany({
      where: { VideoTransferID: transferId },
      orderBy: { RelativePath: "asc" },
    });
    await mapWithConcurrency(
      localFiles,
      config.concurrency,
      async (localFile) => {
        await ensureNotCancelled(transferId, signal);
        const remoteFile = remoteFilesByPath.get(localFile.RelativePath);
        if (!remoteFile?.fileId) {
          throw new VideoTransferError(
            `Le serveur principal n'attend pas ${localFile.RelativePath}.`,
            { statusCode: 502, code: "PRIMARY_MANIFEST_MISMATCH" }
          );
        }
        if (
          remoteFile.status !== TRANSFER_FILE_STATUS.VERIFIED
          || localFile.Status !== TRANSFER_FILE_STATUS.VERIFIED
        ) {
          const absolutePath = path.join(
            sourceRoot,
            ...localFile.RelativePath.split("/")
          );
          await prisma.videoTransferFile.update({
            where: { VideoTransferFileID: localFile.VideoTransferFileID },
            data: { Status: TRANSFER_FILE_STATUS.UPLOADING },
          });
          await uploadPrimaryImportFile({
            transferId: remoteTransferId,
            fileId: remoteFile.fileId,
            absolutePath,
            size: localFile.Size.toString(),
            sha256: localFile.Sha256,
            signal,
          });
        }
        await prisma.videoTransferFile.update({
          where: { VideoTransferFileID: localFile.VideoTransferFileID },
          data: {
            Status: TRANSFER_FILE_STATUS.VERIFIED,
            BytesReceived: localFile.Size,
          },
        });
        const totals = await refreshTransferFileTotals(transferId);
        const stepProgress =
          totals.TotalBytes > 0n
            ? Number((totals.TransferredBytes * 100n) / totals.TotalBytes)
            : 100;
        await transitionActiveExport(transferId, {
          Progress: 15 + Math.round(stepProgress * 0.65),
        }, {
          allowFinalizing: recoveringFinalization,
        });
        await updateTransferStep({
          transferId,
          stepKey: EXPORT_STEP.TRANSFER,
          label: "Transfert des fichiers",
          statusLabel: `${totals.TransferredFiles}/${totals.TotalFiles} fichiers envoyés`,
          progress: stepProgress,
          status:
            totals.TransferredFiles === totals.TotalFiles
              ? TRANSFER_STEP_STATUS.COMPLETED
              : TRANSFER_STEP_STATUS.RUNNING,
        });
        if (!progressLogged) {
          progressLogged = true;
          await createLog({
            request: asLogRequest(),
            UtilisateurID: transfer.InitiatedByUserID,
            ActionNom: "video_transfer_in_progress",
            VideoID: transfer.SourceVideoID,
            Champ: "video_transfer",
            NouvelleValeur: transferId,
            Meta: { transferId, remoteTransferId },
            DedupeMs: TRANSFER_LOG_DEDUPE_MS,
          });
        }
      }
    );
    const finalTransferTotals = await refreshTransferFileTotals(transferId);
    await transitionActiveExport(transferId, {
      Progress: 80,
      TransferredFiles: finalTransferTotals.TransferredFiles,
      TransferredBytes: finalTransferTotals.TransferredBytes,
    }, {
      allowFinalizing: recoveringFinalization,
    });

    await ensureNotCancelled(transferId, signal);
    if (!recoveringFinalization) {
      await transitionActiveExport(transferId, {
        Status: TRANSFER_STATUS.VERIFYING,
        CurrentStep: EXPORT_STEP.VERIFY,
        Progress: 82,
      });
    }
    await updateTransferStep({
      transferId,
      stepKey: EXPORT_STEP.VERIFY,
      label: "Vérification de réception",
      statusLabel: "Contrôle final sur le serveur principal",
      progress: 30,
      status: TRANSFER_STEP_STATUS.RUNNING,
    });
    const verified = await verifyPrimaryImportSession({
      transferId: remoteTransferId,
      signal,
    });
    if (recoveringFinalization) {
      await transitionActiveExport(transferId, {
        CurrentStep: EXPORT_STEP.VERIFY,
        Progress: 90,
        Receipt: verified?.transfer?.receipt || Prisma.DbNull,
      }, { allowFinalizing: true });
    } else {
      await transitionActiveExport(transferId, {
        Status: TRANSFER_STATUS.VERIFIED,
        CurrentStep: EXPORT_STEP.VERIFY,
        Progress: 90,
        Receipt: verified?.transfer?.receipt || Prisma.DbNull,
      });
    }
    await updateTransferStep({
      transferId,
      stepKey: EXPORT_STEP.VERIFY,
      label: "Vérification de réception",
      statusLabel: "Réception intégrale confirmée",
      progress: 100,
      status: TRANSFER_STEP_STATUS.COMPLETED,
    });

    const finalizing = recoveringFinalization
      ? { count: 1 }
      : await prisma.videoTransfer.updateMany({
        where: {
          VideoTransferID: transferId,
          Status: TRANSFER_STATUS.VERIFIED,
          CancelRequested: false,
        },
        data: {
          Status: TRANSFER_STATUS.FINALIZING,
          CurrentStep: EXPORT_STEP.FINALIZE,
          Progress: 92,
        },
      });
    if (finalizing.count !== 1) {
      throw new VideoTransferError("L'export a été annulé avant sa publication.", {
        statusCode: 409,
        code: "TRANSFER_CANCELLED",
      });
    }
    await updateTransferStep({
      transferId,
      stepKey: EXPORT_STEP.FINALIZE,
      label: "Publication sur le serveur principal",
      statusLabel: "Activation atomique de la vidéo",
      progress: 25,
      status: TRANSFER_STEP_STATUS.RUNNING,
    });
    remoteFinalizationAttempted = true;
    const finalized = await finalizePrimaryImportSession({
      transferId: remoteTransferId,
      signal,
    });
    remoteFinalized = true;
    const finalizedTransfer = finalized?.transfer;
    await completeLocalExport({
      transferId,
      remoteTransferId,
      remoteTransfer: finalizedTransfer,
      fallbackDestinationVideoId: remoteTransfer.destinationVideoId,
    });
  } catch (error) {
    if (
      recoveringFinalization
      || remoteFinalizationAttempted
      || remoteFinalized
    ) {
      await prisma.videoTransfer.update({
        where: { VideoTransferID: transferId },
        data: { ErrorMessage: error.message },
      }).catch(() => {});
    } else {
      await markExportFailed(transferId, error);
    }
  } finally {
    exportAbortControllers.delete(transferId);
  }
};

const queueExportJob = (transferId) => {
  if (runningExportJobs.has(transferId)) return runningExportJobs.get(transferId);
  const running = Promise.resolve()
    .then(() => runExportJob(transferId))
    .finally(() => {
      if (runningExportJobs.get(transferId) === running) {
        runningExportJobs.delete(transferId);
      }
    });
  runningExportJobs.set(transferId, running);
  return running;
};

export async function getPrimaryPreflightForVideo({ videoId }) {
  const config = assertCloneTransferConfiguration();
  const video = await findSourceVideo(videoId);
  const [rawPrincipal, genres, series] = await Promise.all([
    fetchPrimaryCapabilities(),
    fetchPrimaryGenres(),
    fetchPrimarySeries(),
  ]);
  const principal = validatePrimaryCapabilities(rawPrincipal, config);
  const genresByName = new Map(
    genres.map((genre) => [
      String(genre.Nom ?? genre.name ?? "").trim().toLocaleLowerCase("fr"),
      Number(genre.GenreID ?? genre.id),
    ])
  );
  const selectedGenreIds = [];
  const missingGenreNames = [];
  for (const videoGenre of video.VideoGenres) {
    const name = String(videoGenre.Genre.Nom || "").trim();
    const destinationId = genresByName.get(name.toLocaleLowerCase("fr"));
    if (destinationId) selectedGenreIds.push(destinationId);
    else if (name) missingGenreNames.push(name);
  }
  return {
    principal: {
      instanceId: principal.instanceId,
      origin: config.primaryBaseUrl.origin,
    },
    genres,
    selectedGenreIds,
    missingGenreNames,
    series,
  };
}

export const getPrimarySeasons = (seriesId) =>
  fetchPrimarySeriesSeasons(seriesId);

export async function getExportJob(transferId) {
  const { instanceId } = assertCloneTransferConfiguration();
  const transfer = await getTransferById(transferId);
  return transfer?.Direction === "EXPORT"
    && transfer.SourceInstanceID === instanceId
    ? transfer
    : null;
}

export function getExportJobForVideo(videoId) {
  const { instanceId } = assertCloneTransferConfiguration();
  return prisma.videoTransfer.findUnique({
    where: {
      Direction_SourceInstanceID_SourceVideoID: {
        Direction: "EXPORT",
        SourceInstanceID: instanceId,
        SourceVideoID: Number(videoId),
      },
    },
    include: transferWithDetails,
  });
}

export async function createExportJob({
  videoId,
  destinationSeasonId,
  genreIds,
  user,
  request,
}) {
  const config = assertCloneTransferConfiguration();
  await findSourceVideo(videoId);
  const requested = normalizedJobRequest({ destinationSeasonId, genreIds });
  if (
    requested.genreIds.some(
      (genreId) => !Number.isInteger(genreId) || genreId <= 0
    )
  ) {
    throw new VideoTransferError("La sélection de genres est invalide.", {
      statusCode: 400,
      code: "INVALID_DESTINATION_GENRES",
    });
  }

  const existing = await getExportJobForVideo(videoId);
  if (existing && existing.Status !== TRANSFER_STATUS.CANCELLED) {
    if (
      ![
        TRANSFER_STATUS.COMPLETED,
        TRANSFER_STATUS.FAILED,
      ].includes(existing.Status)
      && sameJobRequest(jobRequest(existing), requested)
    ) {
      queueExportJob(existing.VideoTransferID);
      return existing;
    }
    if (existing.Status === TRANSFER_STATUS.FAILED) {
      throw new VideoTransferError(
        "Cet export est en erreur et doit être repris avec le mot de passe du super administrateur.",
        { statusCode: 409, code: "EXPORT_REQUIRES_RESUME" }
      );
    }
    throw new VideoTransferError(
      existing.Status === TRANSFER_STATUS.COMPLETED
        ? "Cette vidéo a déjà été exportée vers le serveur principal."
        : "Un export existe déjà avec une autre saison ou sélection de genres.",
      { statusCode: 409, code: "EXPORT_ALREADY_EXISTS" }
    );
  }

  const transferId = existing?.VideoTransferID || randomUUID();
  const pendingManifest = { request: requested };
  const now = new Date();
  await prisma.$transaction(async (transaction) => {
    if (existing) {
      await transaction.videoTransferFile.deleteMany({
        where: { VideoTransferID: transferId },
      });
      await transaction.videoTransferStep.deleteMany({
        where: { VideoTransferID: transferId },
      });
      await transaction.videoTransfer.update({
        where: { VideoTransferID: transferId },
        data: {
          DestinationVideoID: null,
          DestinationSeasonID: requested.destinationSeasonId,
          InitiatedByUserID: user.UtilisateurID,
          InitiatedByNickname: user.Surnom,
          RemoteTransferID: null,
          ManifestHash: null,
          Manifest: pendingManifest,
          Receipt: Prisma.DbNull,
          Warnings: [],
          Status: TRANSFER_STATUS.QUEUED,
          CurrentStep: EXPORT_STEP.PREFLIGHT,
          Progress: 0,
          TotalFiles: 0,
          TransferredFiles: 0,
          TotalBytes: 0n,
          TransferredBytes: 0n,
          CancelRequested: false,
          ResumeCount: 0,
          ErrorMessage: null,
          StartedAt: now,
          CompletedAt: null,
        },
      });
    } else {
      await transaction.videoTransfer.create({
        data: {
          VideoTransferID: transferId,
          Direction: "EXPORT",
          SourceInstanceID: config.instanceId,
          SourceVideoID: Number(videoId),
          DestinationSeasonID: requested.destinationSeasonId,
          InitiatedByUserID: user.UtilisateurID,
          InitiatedByNickname: user.Surnom,
          Manifest: pendingManifest,
          Warnings: [],
          Status: TRANSFER_STATUS.QUEUED,
          CurrentStep: EXPORT_STEP.PREFLIGHT,
          StartedAt: now,
        },
      });
    }
  });
  await updateTransferStep({
    transferId,
    stepKey: EXPORT_STEP.PREFLIGHT,
    label: "Vérification du serveur principal",
    statusLabel: "Export placé dans la file",
    progress: 0,
    status: TRANSFER_STEP_STATUS.PENDING,
  });
  await createLog({
    request: asLogRequest(request),
    UtilisateurID: user.UtilisateurID,
    ActionNom: "video_export_started",
    VideoID: Number(videoId),
    Champ: "video_transfer",
    NouvelleValeur: transferId,
    Meta: {
      transferId,
      destinationSeasonId: requested.destinationSeasonId,
      genreIds: requested.genreIds,
      restartedAfterCancellation: Boolean(existing),
    },
    DedupeMs: TRANSFER_LOG_DEDUPE_MS,
  });
  queueExportJob(transferId);
  return getTransferById(transferId);
}

export async function resumeExportJob({ transferId, user }) {
  const { instanceId } = assertCloneTransferConfiguration();
  const current = await getTransferById(transferId);
  if (
    !current
    || current.Direction !== "EXPORT"
    || current.SourceInstanceID !== instanceId
  ) {
    throw new VideoTransferError("Export introuvable.", {
      statusCode: 404,
      code: "TRANSFER_NOT_FOUND",
    });
  }
  const resumesFinalization =
    current.Status === TRANSFER_STATUS.FINALIZING
    && Boolean(current.ErrorMessage);
  if (
    current.Status !== TRANSFER_STATUS.FAILED
    && !resumesFinalization
  ) {
    throw new VideoTransferError(
      "Seul un export en erreur peut être repris.",
      { statusCode: 409, code: "EXPORT_NOT_RESUMABLE" }
    );
  }
  const resumed = await prisma.videoTransfer.updateMany({
    where: {
      VideoTransferID: transferId,
      Direction: "EXPORT",
      SourceInstanceID: instanceId,
      Status: current.Status,
      ...(
        resumesFinalization
          ? { ErrorMessage: { not: null } }
          : {}
      ),
    },
    data: {
      ...(
        resumesFinalization
          ? {
            Status: TRANSFER_STATUS.FINALIZING,
            CurrentStep: EXPORT_STEP.FINALIZE,
          }
          : {
            Status: TRANSFER_STATUS.QUEUED,
            CurrentStep: EXPORT_STEP.PREFLIGHT,
            CompletedAt: null,
          }
      ),
      CancelRequested: false,
      ErrorMessage: null,
      InitiatedByUserID: user.UtilisateurID,
      InitiatedByNickname: user.Surnom,
      ResumeCount: { increment: 1 },
    },
  });
  if (resumed.count !== 1) {
    const existing = await getTransferById(transferId);
    throw new VideoTransferError(
      existing
        ? "L'état de l'export a changé avant sa reprise."
        : "Export introuvable.",
      {
        statusCode: existing ? 409 : 404,
        code: existing ? "EXPORT_RESUME_CONFLICT" : "TRANSFER_NOT_FOUND",
      }
    );
  }
  queueExportJob(transferId);
  return getTransferById(transferId);
}

export async function cancelExportJob({ transferId, user }) {
  const { instanceId } = assertCloneTransferConfiguration();
  const current = await getTransferById(transferId);
  if (
    !current
    || current.Direction !== "EXPORT"
    || current.SourceInstanceID !== instanceId
  ) {
    throw new VideoTransferError("Export introuvable.", {
      statusCode: 404,
      code: "TRANSFER_NOT_FOUND",
    });
  }
  if (current.Status === TRANSFER_STATUS.CANCELLED) return current;
  if (
    [TRANSFER_STATUS.FINALIZING, TRANSFER_STATUS.COMPLETED].includes(
      current.Status
    )
  ) {
    throw new VideoTransferError(
      "Cet export est déjà en cours de publication ou terminé.",
      { statusCode: 409, code: "EXPORT_NOT_CANCELLABLE" }
    );
  }

  const requested = await prisma.videoTransfer.updateMany({
    where: {
      VideoTransferID: transferId,
      Direction: "EXPORT",
      SourceInstanceID: instanceId,
      Status: {
        notIn: [
          TRANSFER_STATUS.FINALIZING,
          TRANSFER_STATUS.COMPLETED,
          TRANSFER_STATUS.CANCELLED,
        ],
      },
    },
    data: {
      Status: TRANSFER_STATUS.CANCEL_REQUESTED,
      CurrentStep: "cancelled",
      CancelRequested: true,
    },
  });
  if (requested.count !== 1) {
    throw new VideoTransferError(
      "L'export est déjà en cours de publication ou terminé.",
      { statusCode: 409, code: "EXPORT_NOT_CANCELLABLE" }
    );
  }
  exportAbortControllers.get(transferId)?.abort(new Error("cancelled"));
  const running = runningExportJobs.get(transferId);
  if (running) {
    await running.catch(() => {});
  }

  let cancellationState = await getTransferById(transferId);
  try {
    if (
      !cancellationState.RemoteTransferID
      && cancellationState.ManifestHash
      && cancellationState.Manifest?.version === 1
    ) {
      // Une création distante peut avoir été commitée avant une perte d'ACK.
      // Le POST est idempotent sur (instance source, vidéo source), donc le
      // rejouer permet de retrouver la session à annuler sans laisser de
      // destination BLOCKED orpheline.
      const remoteSession = await createPrimaryImportSession({
        manifest: cancellationState.Manifest,
        manifestHash: cancellationState.ManifestHash,
      });
      const recoveredRemoteId = remoteSession?.transfer?.id;
      if (!recoveredRemoteId) {
        throw new VideoTransferError(
          "Le serveur principal n'a pas retourné la session à annuler.",
          { statusCode: 502, code: "INVALID_PRIMARY_SESSION" }
        );
      }
      const recorded = await prisma.videoTransfer.updateMany({
        where: {
          VideoTransferID: transferId,
          Direction: "EXPORT",
          SourceInstanceID: instanceId,
          Status: TRANSFER_STATUS.CANCEL_REQUESTED,
          CancelRequested: true,
        },
        data: {
          RemoteTransferID: recoveredRemoteId,
          DestinationVideoID:
            remoteSession.transfer.destinationVideoId || null,
        },
      });
      if (recorded.count !== 1) {
        throw new VideoTransferError(
          "L'état local a changé avant l'annulation distante.",
          { statusCode: 409, code: "EXPORT_CANCEL_CONFLICT" }
        );
      }
      cancellationState = {
        ...cancellationState,
        RemoteTransferID: recoveredRemoteId,
        DestinationVideoID:
          remoteSession.transfer.destinationVideoId || null,
      };
    }
    if (cancellationState.RemoteTransferID) {
      await cancelPrimaryImportSession({
        transferId: cancellationState.RemoteTransferID,
      });
    }
  } catch (error) {
    await prisma.videoTransfer.updateMany({
      where: {
        VideoTransferID: transferId,
        Direction: "EXPORT",
        SourceInstanceID: instanceId,
        Status: TRANSFER_STATUS.CANCEL_REQUESTED,
      },
      data: {
        Status: TRANSFER_STATUS.FAILED,
        CancelRequested: false,
        ErrorMessage:
          `L'annulation n'a pas pu être confirmée par le serveur principal : ${error.message}`,
      },
    });
    throw error;
  }
  const cancelled = await prisma.videoTransfer.updateMany({
    where: {
      VideoTransferID: transferId,
      Direction: "EXPORT",
      SourceInstanceID: instanceId,
      Status: TRANSFER_STATUS.CANCEL_REQUESTED,
      CancelRequested: true,
    },
    data: {
      Status: TRANSFER_STATUS.CANCELLED,
      CurrentStep: "cancelled",
      Progress: cancellationState.Progress,
      CancelRequested: true,
      CompletedAt: new Date(),
    },
  });
  if (cancelled.count !== 1) {
    throw new VideoTransferError(
      "L'état local a changé avant la confirmation d'annulation.",
      { statusCode: 409, code: "EXPORT_CANCEL_CONFLICT" }
    );
  }
  await updateTransferStep({
    transferId,
    stepKey: "cancelled",
    label: "Annulation",
    statusLabel: "Export annulé sur les deux serveurs",
    progress: 100,
    status: TRANSFER_STEP_STATUS.CANCELLED,
  });
  await createLog({
    request: asLogRequest(),
    UtilisateurID: user.UtilisateurID,
    ActionNom: "video_transfer_cancelled",
    VideoID: current.SourceVideoID,
    Champ: "video_transfer",
    NouvelleValeur: transferId,
    Meta: {
      transferId,
      remoteTransferId: cancellationState.RemoteTransferID,
    },
    DedupeMs: TRANSFER_LOG_DEDUPE_MS,
  });
  return getTransferById(transferId);
}

export async function recoverInterruptedExportJobs() {
  const config = assertCloneTransferConfiguration();
  const jobs = await prisma.videoTransfer.findMany({
    where: {
      Direction: "EXPORT",
      SourceInstanceID: config.instanceId,
      Status: {
        in: [
          ...RECOVERABLE_EXPORT_STATUSES,
          TRANSFER_STATUS.CANCEL_REQUESTED,
        ],
      },
    },
    select: {
      VideoTransferID: true,
      Status: true,
      InitiatedByUserID: true,
      InitiatedByNickname: true,
    },
  });
  for (const job of jobs) {
    if (job.Status === TRANSFER_STATUS.CANCEL_REQUESTED) {
      await cancelExportJob({
        transferId: job.VideoTransferID,
        user: {
          UtilisateurID: job.InitiatedByUserID,
          Surnom: job.InitiatedByNickname,
        },
      }).catch((error) => {
        console.error(
          "[video-export-cancel-recovery]",
          job.VideoTransferID,
          error
        );
      });
    } else {
      queueExportJob(job.VideoTransferID);
    }
  }
  return jobs.length;
}

export const waitForExportJob = async (transferId) =>
  runningExportJobs.get(transferId);
