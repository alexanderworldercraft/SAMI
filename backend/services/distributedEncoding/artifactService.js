import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Transform } from "stream";
import { finished, pipeline } from "stream/promises";
import { randomUUID } from "crypto";

import { prisma } from "../db.js";
import { probeVideo } from "../video/videoTranscodingService.js";
import {
  normalizeVideoTransferRelativePath,
  resolveVideoTransferPath,
  sha256File,
  sha256String,
  stableStringify,
} from "../videoTransferSecurity.js";
import {
  ENCODING_ARTIFACT_STATUS,
  ENCODING_TASK_KIND,
  ENCODING_TASK_PHASE,
  ENCODING_TASK_STATUS,
} from "./constants.js";
import { distributedEncodingError } from "./error.js";
import {
  taskOutputPrefix,
  validateDistributedArtifactManifest,
} from "./artifactManifest.js";
import {
  completeEncodingTaskLease,
  hashEncodingLeaseToken,
} from "./persistence.js";
import { getDistributedJobPaths } from "./sourceService.js";
import { validateHlsMediaPlaylist } from "./ffmpeg/index.js";

const safeEqualHex = (left, right) => {
  if (!/^[a-f0-9]{64}$/i.test(String(left)) || !/^[a-f0-9]{64}$/i.test(String(right))) {
    return false;
  }
  const leftBuffer = Buffer.from(String(left), "hex");
  const rightBuffer = Buffer.from(String(right), "hex");
  return leftBuffer.length === rightBuffer.length
    && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};
const artifactPromotionLocks = new Map();
const artifactTransferLocks = new Map();

const withArtifactTransferLock = async (taskId, operation) => {
  const key = String(taskId || "");
  const previous = artifactTransferLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const tail = previous.catch(() => {}).then(() => current);
  artifactTransferLocks.set(key, tail);

  await previous.catch(() => {});
  try {
    return await operation();
  } finally {
    release();
    if (artifactTransferLocks.get(key) === tail) {
      artifactTransferLocks.delete(key);
    }
  }
};

const safeUuidPathSegment = (value, field) => {
  const normalized = String(value || "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(normalized)) {
    throw distributedEncodingError(
      `${field} est invalide pour le stockage des artefacts.`,
      "INVALID_DISTRIBUTED_ARTIFACT_PATH",
      500
    );
  }
  return normalized;
};

export const getEncodingArtifactCandidatePath = ({
  jobId,
  taskId,
  attemptId,
  leaseGeneration,
  taskKey,
}) => {
  const paths = getDistributedJobPaths(jobId);
  const generation = Number(leaseGeneration);
  if (!Number.isSafeInteger(generation) || generation <= 0) {
    throw distributedEncodingError(
      "La génération du candidat d'artefact est invalide.",
      "INVALID_DISTRIBUTED_ARTIFACT_PATH",
      500
    );
  }
  return path.join(
    paths.acceptedRoot,
    ".candidates",
    safeUuidPathSegment(taskId, "taskId"),
    `${generation}-${safeUuidPathSegment(attemptId, "attemptId")}`,
    ...taskOutputPrefix(taskKey).replace(/\/$/, "").split("/")
  );
};

const getAcceptedOutputPath = ({ jobId, taskKey }) => {
  const paths = getDistributedJobPaths(jobId);
  return path.join(
    paths.acceptedRoot,
    ...taskOutputPrefix(taskKey).replace(/\/$/, "").split("/")
  );
};

const promoteCandidate = async ({ candidate, destination, lockKey }) => {
  const key = String(lockKey || destination);
  const existing = artifactPromotionLocks.get(key);
  if (existing) await existing;

  const promotion = (async () => {
    const destinationPlaylist = path.join(destination, "playlist.m3u8");
    if (fs.existsSync(destinationPlaylist)) {
      await fs.promises.rm(candidate, { recursive: true, force: true });
      return;
    }
    if (!fs.existsSync(path.join(candidate, "playlist.m3u8"))) {
      throw distributedEncodingError(
        "Le candidat d'artefact à promouvoir est introuvable.",
        "DISTRIBUTED_ARTIFACT_CANDIDATE_MISSING",
        409
      );
    }
    await fs.promises.mkdir(path.dirname(destination), { recursive: true });
    await fs.promises.rm(destination, { recursive: true, force: true });
    await fs.promises.rename(candidate, destination);
  })();
  artifactPromotionLocks.set(key, promotion);
  try {
    await promotion;
  } finally {
    if (artifactPromotionLocks.get(key) === promotion) {
      artifactPromotionLocks.delete(key);
    }
  }
};

export async function recoverAcceptedEncodingArtifact(task) {
  const manifest = task?.ArtifactManifest;
  if (!manifest?.attemptId || !manifest?.leaseGeneration) return false;
  const destination = getAcceptedOutputPath({
    jobId: task.VideoEncodingJobID,
    taskKey: task.TaskKey,
  });
  if (fs.existsSync(path.join(destination, "playlist.m3u8"))) return true;

  const candidate = getEncodingArtifactCandidatePath({
    jobId: task.VideoEncodingJobID,
    taskId: task.VideoEncodingTaskID,
    attemptId: manifest.attemptId,
    leaseGeneration: manifest.leaseGeneration,
    taskKey: task.TaskKey,
  });
  if (!fs.existsSync(path.join(candidate, "playlist.m3u8"))) return false;
  await promoteCandidate({
    candidate,
    destination,
    lockKey: task.VideoEncodingTaskID,
  });
  return true;
}

export async function getActiveEncodingLease({
  taskId,
  workerId,
  leaseToken,
  leaseGeneration,
  now = new Date(),
  database = prisma,
}) {
  const task = await database.videoEncodingTask.findUnique({
    where: { VideoEncodingTaskID: String(taskId) },
    include: {
      Job: true,
      Attempts: {
        where: { LeaseGeneration: Number(leaseGeneration) },
        include: { Files: { orderBy: { RelativePath: "asc" } } },
      },
    },
  });
  if (
    !task
    || task.Status !== ENCODING_TASK_STATUS.LEASED
    || task.AssignedWorkerID !== String(workerId)
    || task.LeaseGeneration !== Number(leaseGeneration)
    || !task.LeaseExpiresAt
    || new Date(task.LeaseExpiresAt) <= new Date(now)
    || !safeEqualHex(task.LeaseTokenHash, hashEncodingLeaseToken(leaseToken))
  ) {
    throw distributedEncodingError(
      "Le lease d'encodage n'est plus valide.",
      "ENCODING_LEASE_LOST",
      409
    );
  }
  const attempt = task.Attempts[0];
  if (!attempt) {
    throw distributedEncodingError(
      "La tentative d'encodage est introuvable.",
      "ENCODING_ATTEMPT_NOT_FOUND",
      409
    );
  }
  return { task, attempt };
}

export async function registerEncodingArtifactManifest({
  taskId,
  workerId,
  leaseToken,
  leaseGeneration,
  manifest,
  manifestHash,
  database = prisma,
}) {
  const { task, attempt } = await getActiveEncodingLease({
    taskId,
    workerId,
    leaseToken,
    leaseGeneration,
    database,
  });
  const normalized = validateDistributedArtifactManifest(manifest, {
    expectedJobId: task.VideoEncodingJobID,
    expectedTaskId: task.VideoEncodingTaskID,
    expectedAttemptId: attempt.VideoEncodingTaskAttemptID,
    expectedTaskKey: task.TaskKey,
    expectedLeaseGeneration: task.LeaseGeneration,
    expectedSourceSha256: task.Job.SourceSha256,
    expectedPlanHash: task.Job.EncodingSpecHash,
  });
  const computedHash = sha256String(stableStringify(normalized));
  if (!safeEqualHex(computedHash, manifestHash)) {
    throw distributedEncodingError(
      "Le hash du manifeste d'artefacts est invalide.",
      "DISTRIBUTED_ARTIFACT_MANIFEST_HASH_MISMATCH"
    );
  }

  if (task.ArtifactManifestHash) {
    if (!safeEqualHex(task.ArtifactManifestHash, computedHash)) {
      throw distributedEncodingError(
        "Un autre manifeste est déjà associé à cette tentative.",
        "DISTRIBUTED_ARTIFACT_MANIFEST_CONFLICT",
        409
      );
    }
    return {
      manifest: normalized,
      manifestHash: computedHash,
      files: attempt.Files.map((file) => ({
        id: file.VideoEncodingArtifactFileID,
        relativePath: file.RelativePath,
        size: String(file.Size),
        sha256: file.Sha256,
        status: file.Status,
      })),
    };
  }

  const rows = normalized.files.map((file) => ({
    VideoEncodingArtifactFileID: randomUUID(),
    VideoEncodingTaskAttemptID: attempt.VideoEncodingTaskAttemptID,
    RelativePath: file.relativePath,
    Size: BigInt(file.size),
    Sha256: file.sha256,
    Status: ENCODING_ARTIFACT_STATUS.PENDING,
  }));
  await database.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.videoEncodingTask.updateMany({
      where: {
        VideoEncodingTaskID: task.VideoEncodingTaskID,
        AssignedWorkerID: String(workerId),
        LeaseGeneration: Number(leaseGeneration),
        Status: ENCODING_TASK_STATUS.LEASED,
        LeaseTokenHash: hashEncodingLeaseToken(leaseToken),
        LeaseExpiresAt: { gt: now },
        ArtifactManifestHash: null,
      },
      data: {
        ArtifactManifest: normalized,
        ArtifactManifestHash: computedHash,
        Phase: ENCODING_TASK_PHASE.UPLOADING,
      },
    });
    if (updated.count !== 1) {
      throw distributedEncodingError(
        "Le manifeste n'a pas pu être associé au lease.",
        "ENCODING_LEASE_LOST",
        409
      );
    }
    await tx.videoEncodingArtifactFile.createMany({ data: rows });
  });

  return {
    manifest: normalized,
    manifestHash: computedHash,
    files: rows.map((file) => ({
      id: file.VideoEncodingArtifactFileID,
      relativePath: file.RelativePath,
      size: String(file.Size),
      sha256: file.Sha256,
      status: file.Status,
    })),
  };
}

async function receiveEncodingArtifactUnlocked({
  taskId,
  fileId,
  workerId,
  leaseToken,
  leaseGeneration,
  stream,
  declaredBodySha256,
  declaredContentLength,
  database = prisma,
}) {
  const { task, attempt } = await getActiveEncodingLease({
    taskId,
    workerId,
    leaseToken,
    leaseGeneration,
    database,
  });
  const file = attempt.Files.find(
    (candidate) => candidate.VideoEncodingArtifactFileID === String(fileId)
  );
  if (!file) {
    throw distributedEncodingError(
      "Le fichier d'artefact est introuvable.",
      "DISTRIBUTED_ARTIFACT_NOT_FOUND",
      404
    );
  }
  if (
    !safeEqualHex(file.Sha256, declaredBodySha256)
    || Number(file.Size) !== Number(declaredContentLength)
  ) {
    throw distributedEncodingError(
      "Les métadonnées signées du fichier ne correspondent pas au manifeste.",
      "DISTRIBUTED_ARTIFACT_UPLOAD_MISMATCH",
      409
    );
  }
  if (file.Status === ENCODING_ARTIFACT_STATUS.VERIFIED) {
    stream.resume();
    await finished(stream).catch(() => {});
    return { fileId: file.VideoEncodingArtifactFileID, verified: true, deduped: true };
  }

  const paths = getDistributedJobPaths(task.VideoEncodingJobID);
  const attemptRoot = path.join(
    paths.attemptsRoot,
    attempt.VideoEncodingTaskAttemptID
  );
  await fs.promises.mkdir(attemptRoot, { recursive: true });
  const destination = await resolveVideoTransferPath(
    attemptRoot,
    normalizeVideoTransferRelativePath(file.RelativePath),
    { mustExist: false }
  );
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  // Un temporaire propre à cette requête évite qu'un PUT concurrent ou rejoué
  // puisse délier/remplacer l'inode encore alimenté par un autre flux.
  const partial = `${destination}.${randomUUID()}.part`;
  await database.videoEncodingArtifactFile.update({
    where: { VideoEncodingArtifactFileID: file.VideoEncodingArtifactFileID },
    data: { Status: ENCODING_ARTIFACT_STATUS.UPLOADING, BytesReceived: 0 },
  });
  const hash = crypto.createHash("sha256");
  let received = 0;
  const meter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > Number(file.Size)) {
        callback(distributedEncodingError(
          "Le fichier reçu dépasse la taille annoncée.",
          "DISTRIBUTED_ARTIFACT_SIZE_EXCEEDED",
          413
        ));
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
      fs.createWriteStream(partial, { flags: "wx", mode: 0o600 })
    );
    const digest = hash.digest("hex");
    if (received !== Number(file.Size) || !safeEqualHex(digest, file.Sha256)) {
      throw distributedEncodingError(
        "Le fichier reçu est tronqué ou corrompu.",
        "DISTRIBUTED_ARTIFACT_DIGEST_MISMATCH",
        422
      );
    }
    const writtenStats = await fs.promises.stat(partial);
    const writtenDigest = await sha256File(partial);
    if (
      writtenStats.size !== received
      || !safeEqualHex(writtenDigest, file.Sha256)
    ) {
      throw distributedEncodingError(
        "Le fichier écrit sur disque est tronqué ou corrompu.",
        "DISTRIBUTED_ARTIFACT_DISK_MISMATCH",
        422
      );
    }
    await getActiveEncodingLease({
      taskId,
      workerId,
      leaseToken,
      leaseGeneration,
      database,
    });
    await fs.promises.rename(partial, destination);
    await database.videoEncodingArtifactFile.update({
      where: { VideoEncodingArtifactFileID: file.VideoEncodingArtifactFileID },
      data: {
        Status: ENCODING_ARTIFACT_STATUS.VERIFIED,
        BytesReceived: BigInt(received),
      },
    });
    return { fileId: file.VideoEncodingArtifactFileID, verified: true };
  } catch (error) {
    await fs.promises.rm(partial, { force: true });
    await database.videoEncodingArtifactFile.update({
      where: { VideoEncodingArtifactFileID: file.VideoEncodingArtifactFileID },
      data: {
        Status: ENCODING_ARTIFACT_STATUS.FAILED,
        BytesReceived: BigInt(received),
      },
    }).catch(() => {});
    throw error;
  }
}

export const receiveEncodingArtifact = (options) =>
  withArtifactTransferLock(options?.taskId, () =>
    receiveEncodingArtifactUnlocked(options)
  );

const verifySemanticOutput = async ({ task, playlistPath }) => {
  await validateHlsMediaPlaylist({
    playlistPath,
    requireIndependentSegments: task.Kind === ENCODING_TASK_KIND.VIDEO_PROFILE,
  });
  const metadata = await probeVideo(playlistPath);
  const streams = metadata?.streams || [];
  if (task.Kind === ENCODING_TASK_KIND.VIDEO_PROFILE) {
    const video = streams.find((stream) => stream.codec_type === "video");
    if (
      !video
      || video.codec_name !== "h264"
      || Number(video.width) !== Number(task.Spec?.profile?.width)
      || Number(video.height) !== Number(task.Spec?.profile?.height)
    ) {
      throw distributedEncodingError(
        `La sortie ${task.ProfileLabel} ne respecte pas son profil vidéo.`,
        "DISTRIBUTED_VIDEO_PROFILE_MISMATCH",
        422
      );
    }
    const audio = streams.find((stream) => stream.codec_type === "audio");
    if (task.Spec?.includeAudio && audio?.codec_name !== "aac") {
      throw distributedEncodingError(
        `La sortie ${task.ProfileLabel} ne contient pas l'audio AAC attendu.`,
        "DISTRIBUTED_AUDIO_PROFILE_MISMATCH",
        422
      );
    }
    if (!task.Spec?.includeAudio && audio) {
      throw distributedEncodingError(
        `La sortie ${task.ProfileLabel} contient une piste audio inattendue.`,
        "DISTRIBUTED_AUDIO_PROFILE_MISMATCH",
        422
      );
    }
  } else {
    const audio = streams.find((stream) => stream.codec_type === "audio");
    const video = streams.find((stream) => stream.codec_type === "video");
    if (!audio || audio.codec_name !== "aac" || video) {
      throw distributedEncodingError(
        "La rendition audio reçue est invalide.",
        "DISTRIBUTED_AUDIO_PROFILE_MISMATCH",
        422
      );
    }
  }

  const expectedDuration = Number(task.Job?.SourceMetadata?.format?.duration)
    || Number(task.Job?.SourceMetadata?.durationSeconds)
    || 0;
  const actualDuration = Number(metadata?.format?.duration) || 0;
  const tolerance = Math.max(2, expectedDuration * 0.02);
  if (
    expectedDuration > 0
    && (!actualDuration || Math.abs(actualDuration - expectedDuration) > tolerance)
  ) {
    throw distributedEncodingError(
      "La durée de l'artefact diffère de la source.",
      "DISTRIBUTED_ARTIFACT_DURATION_MISMATCH",
      422
    );
  }
};

const verifyArtifactFiles = async ({ task, attempt, database }) => {
  if (!task.ArtifactManifest || !task.ArtifactManifestHash) {
    throw distributedEncodingError(
      "Le manifeste d'artefacts est absent.",
      "DISTRIBUTED_ARTIFACT_MANIFEST_MISSING",
      409
    );
  }
  const files = await database.videoEncodingArtifactFile.findMany({
    where: { VideoEncodingTaskAttemptID: attempt.VideoEncodingTaskAttemptID },
  });
  if (
    files.length !== task.ArtifactManifest.files.length
    || files.some((file) => file.Status !== ENCODING_ARTIFACT_STATUS.VERIFIED)
  ) {
    throw distributedEncodingError(
      "Tous les artefacts ne sont pas encore vérifiés.",
      "DISTRIBUTED_ARTIFACTS_INCOMPLETE",
      409
    );
  }
  const paths = getDistributedJobPaths(task.VideoEncodingJobID);
  const attemptRoot = path.join(paths.attemptsRoot, attempt.VideoEncodingTaskAttemptID);
  for (const file of files) {
    const target = await resolveVideoTransferPath(attemptRoot, file.RelativePath);
    const stats = await fs.promises.stat(target);
    if (String(stats.size) !== String(file.Size)) {
      throw distributedEncodingError(
        `La taille de ${file.RelativePath} a changé après réception.`,
        "DISTRIBUTED_ARTIFACT_SIZE_MISMATCH",
        422
      );
    }
    if (!safeEqualHex(await sha256File(target), file.Sha256)) {
      throw distributedEncodingError(
        `Le hash de ${file.RelativePath} a changé après réception.`,
        "DISTRIBUTED_ARTIFACT_DIGEST_MISMATCH",
        422
      );
    }
  }
  const playlistPath = path.join(
    attemptRoot,
    ...`${taskOutputPrefix(task.TaskKey)}playlist.m3u8`.split("/")
  );
  await verifySemanticOutput({ task, playlistPath });
  return { attemptRoot, files };
};

async function completeEncodingArtifactsUnlocked({
  taskId,
  workerId,
  leaseToken,
  leaseGeneration,
  database = prisma,
}) {
  const lease = await getActiveEncodingLease({
    taskId,
    workerId,
    leaseToken,
    leaseGeneration,
    database,
  });
  const { task, attempt } = lease;
  const { attemptRoot } = await verifyArtifactFiles({ task, attempt, database });
  const relativeOutput = taskOutputPrefix(task.TaskKey).replace(/\/$/, "");
  const source = path.join(attemptRoot, ...relativeOutput.split("/"));
  const destination = getAcceptedOutputPath({
    jobId: task.VideoEncodingJobID,
    taskKey: task.TaskKey,
  });
  const candidate = getEncodingArtifactCandidatePath({
    jobId: task.VideoEncodingJobID,
    taskId: task.VideoEncodingTaskID,
    attemptId: attempt.VideoEncodingTaskAttemptID,
    leaseGeneration,
    taskKey: task.TaskKey,
  });
  await fs.promises.mkdir(path.dirname(candidate), { recursive: true });
  await fs.promises.rm(candidate, { recursive: true, force: true });
  await fs.promises.rename(source, candidate);

  try {
    const completed = await completeEncodingTaskLease({
      taskId: task.VideoEncodingTaskID,
      workerId,
      leaseToken,
      leaseGeneration,
      artifactManifest: task.ArtifactManifest,
      artifactManifestHash: task.ArtifactManifestHash,
    }, { database });
    await promoteCandidate({
      candidate,
      destination,
      lockKey: task.VideoEncodingTaskID,
    });
    await fs.promises.rm(attemptRoot, { recursive: true, force: true });
    return completed;
  } catch (error) {
    // Avant le CAS, ce candidat est propre à la génération et peut être
    // supprimé sans toucher un résultat accepté par un lease plus récent. Si
    // le CAS a réussi mais que la promotion a échoué, la maintenance retrouve
    // le candidat grâce au manifeste persistant et termine la publication.
    const current = await database.videoEncodingTask.findUnique({
      where: { VideoEncodingTaskID: task.VideoEncodingTaskID },
      select: { Status: true, LeaseGeneration: true },
    }).catch(() => null);
    if (
      current?.Status !== ENCODING_TASK_STATUS.SUCCEEDED
      || Number(current?.LeaseGeneration) !== Number(leaseGeneration)
    ) {
      await fs.promises.rm(candidate, { recursive: true, force: true }).catch(() => {});
    }
    throw error;
  }
}

export const completeEncodingArtifacts = (options) =>
  withArtifactTransferLock(options?.taskId, () =>
    completeEncodingArtifactsUnlocked(options)
  );

export async function markLocalArtifactFilesVerified({
  taskId,
  workerId,
  leaseToken,
  leaseGeneration,
  database = prisma,
}) {
  const { task, attempt } = await getActiveEncodingLease({
    taskId,
    workerId,
    leaseToken,
    leaseGeneration,
    database,
  });
  const paths = getDistributedJobPaths(task.VideoEncodingJobID);
  const attemptRoot = path.join(paths.attemptsRoot, attempt.VideoEncodingTaskAttemptID);
  for (const file of attempt.Files) {
    const target = await resolveVideoTransferPath(attemptRoot, file.RelativePath);
    const stats = await fs.promises.stat(target);
    const digest = await sha256File(target);
    if (String(stats.size) !== String(file.Size) || !safeEqualHex(digest, file.Sha256)) {
      throw distributedEncodingError(
        `L'artefact local ${file.RelativePath} ne correspond pas au manifeste.`,
        "DISTRIBUTED_LOCAL_ARTIFACT_MISMATCH",
        422
      );
    }
    await database.videoEncodingArtifactFile.update({
      where: { VideoEncodingArtifactFileID: file.VideoEncodingArtifactFileID },
      data: {
        Status: ENCODING_ARTIFACT_STATUS.VERIFIED,
        BytesReceived: file.Size,
      },
    });
  }
}
