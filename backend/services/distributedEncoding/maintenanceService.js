import fs from "fs";
import path from "path";

import { ETAT } from "../../constants.js";
import { prisma } from "../db.js";
import { VIDEO_ROOT } from "../video/videoPaths.js";
import { VIDEO_TRANSFER_BLOCK_MARKER } from "../videoTransferConfig.js";
import { cleanupReservedImportedVideo } from "../video/videoImportPersistenceService.js";
import {
  ACTIVE_ENCODING_JOB_STATUSES,
  DISTRIBUTED_ENCODING_INGESTING_TIMEOUT_MS,
  DISTRIBUTED_ENCODING_ORPHAN_WORKSPACE_TTL_MS,
  DISTRIBUTED_ENCODING_PLANNING_TIMEOUT_MS,
  ENCODING_JOB_STATUS,
  ENCODING_TASK_STATUS,
  INCOMPLETE_ENCODING_CLEANUP_STEP,
  INCOMPLETE_ENCODING_EXPIRED_STEP,
} from "./constants.js";
import { getDistributedEncodingConfig } from "./config.js";
import { advanceDistributedEncodingJob } from "./finalizationService.js";
import { recoverAcceptedEncodingArtifact } from "./artifactService.js";
import {
  pruneExpiredEncodingRequestNonces,
  reclaimExpiredEncodingLeases,
} from "./persistence.js";
import {
  cleanupDistributedJobFiles,
  getDistributedJobPaths,
  resolveDistributedSourcePath,
} from "./sourceService.js";
import { taskOutputPrefix } from "./artifactManifest.js";

const FAILURE_RETENTION_MS = 24 * 60 * 60 * 1000;
const WORKSPACE_JOB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export {
  INCOMPLETE_ENCODING_CLEANUP_STEP,
  INCOMPLETE_ENCODING_EXPIRED_STEP,
} from "./constants.js";
export const isIncompleteEncodingJobStatus = (status) => [
  ENCODING_JOB_STATUS.INGESTING,
  ENCODING_JOB_STATUS.PLANNING,
].includes(status);

const incompleteJobMessage = (status) => status === ENCODING_JOB_STATUS.INGESTING
  ? "L'ingestion distribuée est restée incomplète après un redémarrage."
  : "La planification distribuée est restée incomplète après un redémarrage.";

const defaultSourceExists = (relativePath) => {
  try {
    return fs.existsSync(resolveDistributedSourcePath(relativePath));
  } catch {
    return false;
  }
};

const getReservedVideoState = async (job, database) => {
  if (!job.VideoID) return { exists: false, active: false, ready: false };
  const video = await database.video.findUnique({
    where: { VideoID: job.VideoID },
    select: { EtatID: true },
  });
  if (!video) return { exists: false, active: false, ready: false };
  const active = video.EtatID === ETAT.ACTIVE;
  const markerPath = path.join(
    VIDEO_ROOT,
    String(job.VideoID),
    VIDEO_TRANSFER_BLOCK_MARKER
  );
  return {
    exists: true,
    active,
    ready: video.EtatID === ETAT.BLOCKED && fs.existsSync(markerPath),
  };
};

const claimIncompleteJobForCleanup = async ({
  job,
  cutoff,
  now,
  database,
}) => {
  if (
    job.Status === ENCODING_JOB_STATUS.FAILED
    && job.CurrentStep === INCOMPLETE_ENCODING_CLEANUP_STEP
  ) {
    return true;
  }
  const claimed = await database.videoEncodingJob.updateMany({
    where: {
      VideoEncodingJobID: job.VideoEncodingJobID,
      Status: job.Status,
      UpdatedAt: { lte: cutoff },
    },
    data: {
      Status: ENCODING_JOB_STATUS.FAILED,
      CurrentStep: INCOMPLETE_ENCODING_CLEANUP_STEP,
      ErrorMessage: incompleteJobMessage(job.Status),
      CompletedAt: now,
      CancelRequested: false,
    },
  });
  return claimed.count === 1;
};

/**
 * Reprend le seul état PLANNING qui est entièrement matérialisé. Les autres
 * états incomplets passent d'abord par un marqueur DB durable avant toute
 * suppression, afin qu'un second redémarrage puisse terminer le nettoyage.
 */
export async function recoverIncompleteDistributedEncodingJobs({
  now = new Date(),
  database = prisma,
  planningTimeoutMs = DISTRIBUTED_ENCODING_PLANNING_TIMEOUT_MS,
  ingestingTimeoutMs = DISTRIBUTED_ENCODING_INGESTING_TIMEOUT_MS,
  sourceExists = defaultSourceExists,
  getReservationState,
  cleanupReservedVideo = cleanupReservedImportedVideo,
  cleanupJobFiles = cleanupDistributedJobFiles,
  logger = console,
} = {}) {
  const instant = new Date(now);
  const planningCutoff = new Date(instant.getTime() - planningTimeoutMs);
  const ingestingCutoff = new Date(instant.getTime() - ingestingTimeoutMs);
  const jobs = await database.videoEncodingJob.findMany({
    where: {
      OR: [
        {
          Status: ENCODING_JOB_STATUS.PLANNING,
          UpdatedAt: { lte: planningCutoff },
        },
        {
          Status: ENCODING_JOB_STATUS.INGESTING,
          UpdatedAt: { lte: ingestingCutoff },
        },
        {
          Status: ENCODING_JOB_STATUS.FAILED,
          CurrentStep: INCOMPLETE_ENCODING_CLEANUP_STEP,
        },
      ],
    },
    include: { Tasks: true },
    orderBy: { UpdatedAt: "asc" },
  });
  const result = {
    queued: 0,
    expired: 0,
    cleanupPending: 0,
    skipped: 0,
    failed: 0,
  };
  const readReservationState = getReservationState
    || ((job) => getReservedVideoState(job, database));

  for (const job of jobs) {
    try {
      const reservation = await readReservationState(job);
      if (reservation.active) {
        // La réconciliation de publication, exécutée juste après, est la seule
        // autorisée à conclure un job dont la vidéo est déjà visible.
        result.skipped += 1;
        continue;
      }

      const cutoff = job.Status === ENCODING_JOB_STATUS.INGESTING
        ? ingestingCutoff
        : planningCutoff;
      const recoverablePlanning =
        job.Status === ENCODING_JOB_STATUS.PLANNING
        && Boolean(job.VideoID)
        && reservation.ready
        && (job.Tasks || []).length > 0
        && sourceExists(job.SourceRelativePath);
      if (recoverablePlanning) {
        const queued = await database.videoEncodingJob.updateMany({
          where: {
            VideoEncodingJobID: job.VideoEncodingJobID,
            Status: ENCODING_JOB_STATUS.PLANNING,
            UpdatedAt: { lte: planningCutoff },
          },
          data: {
            Status: ENCODING_JOB_STATUS.QUEUED,
            CurrentStep: "queued",
            ErrorMessage: null,
            CompletedAt: null,
            StartedAt: job.StartedAt || instant,
            CancelRequested: false,
          },
        });
        if (queued.count === 1) result.queued += 1;
        else result.skipped += 1;
        continue;
      }

      if (!(await claimIncompleteJobForCleanup({
        job,
        cutoff,
        now: instant,
        database,
      }))) {
        result.skipped += 1;
        continue;
      }

      try {
        if (job.VideoID) await cleanupReservedVideo(job.VideoID);
        await cleanupJobFiles(job.VideoEncodingJobID);
      } catch (error) {
        result.cleanupPending += 1;
        result.failed += 1;
        logger.error?.(
          `[distributed-encoding:incomplete-cleanup:${job.VideoEncodingJobID}]`,
          error.message
        );
        continue;
      }

      const finalized = await database.videoEncodingJob.updateMany({
        where: {
          VideoEncodingJobID: job.VideoEncodingJobID,
          Status: ENCODING_JOB_STATUS.FAILED,
          CurrentStep: INCOMPLETE_ENCODING_CLEANUP_STEP,
        },
        data: {
          VideoID: null,
          CurrentStep: INCOMPLETE_ENCODING_EXPIRED_STEP,
          CompletedAt: instant,
        },
      });
      if (finalized.count === 1) result.expired += 1;
      else result.skipped += 1;
    } catch (error) {
      result.failed += 1;
      logger.error?.(
        `[distributed-encoding:incomplete-recovery:${job.VideoEncodingJobID}]`,
        error.message
      );
    }
  }
  return result;
}

const collectWorkspaceDirectories = async (roots) => {
  const workspaces = new Map();
  for (const root of new Set(roots.map((value) => path.resolve(value)))) {
    let entries;
    try {
      entries = await fs.promises.readdir(root, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      if (
        !entry.isDirectory()
        || !WORKSPACE_JOB_ID_PATTERN.test(entry.name)
      ) continue;
      const paths = workspaces.get(entry.name) || [];
      paths.push(path.join(root, entry.name));
      workspaces.set(entry.name, paths);
    }
  }
  return workspaces;
};

const hasRecentWorkspaceActivity = async (target, cutoffMs) => {
  let stats;
  try {
    stats = await fs.promises.lstat(target);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  if (stats.mtimeMs > cutoffMs) return true;
  if (!stats.isDirectory() || stats.isSymbolicLink()) return false;
  const entries = await fs.promises.readdir(target, { withFileTypes: true });
  for (const entry of entries) {
    if (await hasRecentWorkspaceActivity(path.join(target, entry.name), cutoffMs)) {
      return true;
    }
  }
  return false;
};

/** Nettoie uniquement les dossiers UUID sans ligne VideoEncodingJob. */
export async function cleanupOrphanDistributedEncodingWorkspaces({
  now = new Date(),
  database = prisma,
  ttlMs = DISTRIBUTED_ENCODING_ORPHAN_WORKSPACE_TTL_MS,
  roots,
  logger = console,
} = {}) {
  const config = roots ? null : getDistributedEncodingConfig();
  const workspaceRoots = roots || [config.sourceRoot, config.stagingRoot];
  const workspaces = await collectWorkspaceDirectories(workspaceRoots);
  const ids = [...workspaces.keys()];
  if (ids.length === 0) {
    return { scanned: 0, removed: 0, recent: 0, tracked: 0, failed: 0 };
  }
  const trackedRows = await database.videoEncodingJob.findMany({
    where: { VideoEncodingJobID: { in: ids } },
    select: { VideoEncodingJobID: true },
  });
  const tracked = new Set(trackedRows.map((job) => job.VideoEncodingJobID));
  const cutoffMs = new Date(now).getTime() - ttlMs;
  const result = { scanned: ids.length, removed: 0, recent: 0, tracked: 0, failed: 0 };

  for (const [jobId, directories] of workspaces) {
    if (tracked.has(jobId)) {
      result.tracked += 1;
      continue;
    }
    try {
      let recent = false;
      for (const directory of directories) {
        if (await hasRecentWorkspaceActivity(directory, cutoffMs)) {
          recent = true;
          break;
        }
      }
      if (recent) {
        result.recent += 1;
        continue;
      }

      // Le job peut être créé entre le premier inventaire et ce point. Cette
      // seconde lecture réduit la fenêtre FS/DB à la seule suppression finale.
      const createdMeanwhile = await database.videoEncodingJob.findUnique({
        where: { VideoEncodingJobID: jobId },
        select: { VideoEncodingJobID: true },
      });
      if (createdMeanwhile) {
        result.tracked += 1;
        continue;
      }
      await Promise.all(directories.map((directory) =>
        fs.promises.rm(directory, { recursive: true, force: true })
      ));
      result.removed += 1;
    } catch (error) {
      result.failed += 1;
      logger.error?.(
        `[distributed-encoding:orphan-workspace:${jobId}]`,
        error.message
      );
    }
  }
  return result;
}

const hasMovedPublicationArtifacts = (job) => {
  if (!job.VideoID || !(job.Tasks || []).length) return false;
  const finalHlsDir = path.join(VIDEO_ROOT, String(job.VideoID), "hls");
  return job.Tasks
    .filter((task) => task.Required)
    .every((task) =>
      task.Status === ENCODING_TASK_STATUS.SUCCEEDED
      && fs.existsSync(path.join(
        finalHlsDir,
        ...taskOutputPrefix(task.TaskKey)
          .replace(/^hls\//, "")
          .replace(/\/$/, "")
          .split("/"),
        "playlist.m3u8"
      ))
    );
};

const reconcilePublishedVideo = async (job) => {
  if (!job.VideoID) return false;
  const video = await prisma.video.findUnique({
    where: { VideoID: job.VideoID },
    select: { EtatID: true },
  });
  if (video?.EtatID !== ETAT.ACTIVE) return false;
  fs.rmSync(
    path.join(VIDEO_ROOT, String(job.VideoID), VIDEO_TRANSFER_BLOCK_MARKER),
    { force: true }
  );
  await cleanupDistributedJobFiles(job.VideoEncodingJobID).catch(() => {});
  await prisma.videoEncodingJob.update({
    where: { VideoEncodingJobID: job.VideoEncodingJobID },
    data: {
      Status: ENCODING_JOB_STATUS.COMPLETED,
      CurrentStep: "completed",
      Progress: 100,
      ErrorMessage: null,
      CompletedAt: job.CompletedAt || new Date(),
      CancelRequested: false,
    },
  });
  return true;
};

const recoverMissingAcceptedArtifacts = async (job) => {
  if (
    [
      ENCODING_JOB_STATUS.ASSEMBLING,
      ENCODING_JOB_STATUS.VERIFYING,
      ENCODING_JOB_STATUS.PUBLISHING,
    ].includes(job.Status)
  ) {
    return { promoted: 0, reset: 0 };
  }
  const paths = getDistributedJobPaths(job.VideoEncodingJobID);
  let promoted = 0;
  let reset = 0;
  for (const task of job.Tasks || []) {
    if (task.Status !== ENCODING_TASK_STATUS.SUCCEEDED) continue;
    const output = path.join(
      paths.acceptedRoot,
      ...taskOutputPrefix(task.TaskKey).replace(/\/$/, "").split("/")
    );
    const playlist = path.join(output, "playlist.m3u8");
    if (fs.existsSync(playlist)) continue;
    if (await recoverAcceptedEncodingArtifact(task)) {
      promoted += 1;
      continue;
    }
    await prisma.videoEncodingTask.update({
      where: { VideoEncodingTaskID: task.VideoEncodingTaskID },
      data: {
        Status: ENCODING_TASK_STATUS.PENDING,
        AssignedWorkerID: null,
        LeaseTokenHash: null,
        LeaseExpiresAt: null,
        ArtifactManifest: null,
        ArtifactManifestHash: null,
        Phase: null,
        Progress: 0,
        MaxAttempts: { increment: 1 },
        ErrorMessage: "Artefact accepté manquant après redémarrage.",
        CompletedAt: null,
      },
    });
    reset += 1;
  }
  if (reset > 0 && job.Status === ENCODING_JOB_STATUS.FAILED) {
    await prisma.videoEncodingJob.update({
      where: { VideoEncodingJobID: job.VideoEncodingJobID },
      data: {
        Status: ENCODING_JOB_STATUS.QUEUED,
        CurrentStep: "queued",
        Progress: 0,
        ErrorMessage: null,
        CompletedAt: null,
      },
    });
  }
  return { promoted, reset };
};

export async function runDistributedEncodingMaintenance({ cleanup = false } = {}) {
  const [reclaimedLeases, prunedNonces, incompleteJobs, orphanWorkspaces] =
    await Promise.all([
    reclaimExpiredEncodingLeases(),
    pruneExpiredEncodingRequestNonces(),
    recoverIncompleteDistributedEncodingJobs(),
    cleanup
      ? cleanupOrphanDistributedEncodingWorkspaces()
      : Promise.resolve({ scanned: 0, removed: 0, recent: 0, tracked: 0, failed: 0 }),
  ]);
  const jobs = await prisma.videoEncodingJob.findMany({
    where: {
      Status: {
        in: [...ACTIVE_ENCODING_JOB_STATUSES, ENCODING_JOB_STATUS.FAILED],
      },
    },
    include: { Tasks: true },
  });
  let jobsAdvanced = 0;
  let tasksRecovered = 0;
  let candidatesPromoted = 0;
  let expiredFailures = 0;
  let incompleteJobsWaiting = 0;
  const now = Date.now();

  for (const job of jobs) {
    if (await reconcilePublishedVideo(job)) {
      jobsAdvanced += 1;
      continue;
    }
    if (
      job.Status === ENCODING_JOB_STATUS.FAILED
      && hasMovedPublicationArtifacts(job)
    ) {
      await prisma.videoEncodingJob.update({
        where: { VideoEncodingJobID: job.VideoEncodingJobID },
        data: {
          Status: ENCODING_JOB_STATUS.PUBLISHING,
          CurrentStep: "publishing",
          ErrorMessage: null,
          CompletedAt: null,
        },
      });
      job.Status = ENCODING_JOB_STATUS.PUBLISHING;
      job.CurrentStep = "publishing";
      job.ErrorMessage = null;
      job.CompletedAt = null;
    }
    if (isIncompleteEncodingJobStatus(job.Status)) {
      // advance() recalculerait Progress et rafraîchirait UpdatedAt toutes les
      // quinze secondes, empêchant précisément la détection d'un état figé.
      incompleteJobsWaiting += 1;
      continue;
    }
    const recovery = await recoverMissingAcceptedArtifacts(job);
    tasksRecovered += recovery.reset;
    candidatesPromoted += recovery.promoted;
    if (
      cleanup
      && job.Status === ENCODING_JOB_STATUS.FAILED
      && new Date(job.CompletedAt || job.UpdatedAt).getTime()
        <= now - FAILURE_RETENTION_MS
    ) {
      if (job.VideoID) await cleanupReservedImportedVideo(job.VideoID);
      await cleanupDistributedJobFiles(job.VideoEncodingJobID);
      await prisma.videoEncodingJob.update({
        where: { VideoEncodingJobID: job.VideoEncodingJobID },
        data: {
          VideoID: null,
          CurrentStep: "expired",
          ErrorMessage: `${job.ErrorMessage || "Le job a échoué."} Source temporaire expirée.`,
        },
      });
      expiredFailures += 1;
      continue;
    }
    await advanceDistributedEncodingJob(job.VideoEncodingJobID).catch((error) => {
      console.error(
        `[distributed-encoding:maintenance:${job.VideoEncodingJobID}]`,
        error.message
      );
    });
    jobsAdvanced += 1;
  }

  return {
    reclaimedLeases,
    prunedNonces: prunedNonces.count,
    jobsAdvanced,
    tasksRecovered,
    candidatesPromoted,
    expiredFailures,
    incompleteJobs,
    incompleteJobsWaiting,
    orphanWorkspaces,
  };
}
