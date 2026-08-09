import fs from "fs";
import path from "path";

import { ENCODING_JOB_STATUS, ENCODING_TASK_KIND, ENCODING_TASK_STATUS } from "./constants.js";
import { prisma } from "../db.js";
import { VIDEO_ROOT } from "../video/videoPaths.js";
import { ensureGenreIdsByNames } from "../video/videoImportHelpers.js";
import {
  cleanupReservedImportedVideo,
  finalizeReservedImportedVideo,
} from "../video/videoImportPersistenceService.js";
import { generateVideoPreviewFramesFromMaster } from "../video/videoPreviewService.js";
import { generateVideoPreviewLiveFromMaster } from "../video/videoPreviewLiveService.js";
import {
  isContentPreviewActive,
  isPreviewLiveActive,
} from "../../controllers/appSettingController.js";
import { assembleMasterPlaylist, validateHlsMediaPlaylist } from "./ffmpeg/index.js";
import { distributedEncodingError } from "./error.js";
import {
  cleanupDistributedJobFiles,
  getDistributedJobPaths,
  resolveDistributedSourcePath,
} from "./sourceService.js";
import {
  getJobForLifecycle,
  recalculateEncodingJobProgress,
  updateEncodingJob,
} from "./persistence.js";

const runningFinalizations = new Map();

const cumulativeBoundaries = (durations) => {
  const boundaries = [];
  let total = 0;
  for (const duration of durations.slice(0, -1)) {
    total += duration;
    boundaries.push(total);
  }
  return boundaries;
};

const validateVariantAlignment = async ({ hlsDir, videoTasks }) => {
  const variants = [];
  for (const task of videoTasks) {
    const playlistPath = path.join(hlsDir, task.ProfileLabel, "playlist.m3u8");
    const validation = await validateHlsMediaPlaylist({
      playlistPath,
      requireIndependentSegments: true,
    });
    variants.push({
      label: task.ProfileLabel,
      boundaries: cumulativeBoundaries(validation.durations),
    });
  }
  const reference = variants[0];
  for (const variant of variants.slice(1)) {
    if (variant.boundaries.length !== reference.boundaries.length) {
      throw distributedEncodingError(
        `Les segments ${variant.label} ne sont pas alignés avec ${reference.label}.`,
        "DISTRIBUTED_HLS_ALIGNMENT_MISMATCH",
        422
      );
    }
    for (let index = 0; index < reference.boundaries.length; index += 1) {
      if (Math.abs(reference.boundaries[index] - variant.boundaries[index]) > 0.35) {
        throw distributedEncodingError(
          `Les segments ${variant.label} ne sont pas alignés avec ${reference.label}.`,
          "DISTRIBUTED_HLS_ALIGNMENT_MISMATCH",
          422
        );
      }
    }
  }
};

const buildFinalizationInputs = async (job) => {
  const snapshot = job.RequestSnapshot || {};
  const paths = getDistributedJobPaths(job.VideoEncodingJobID);
  const videoTasks = job.Tasks
    .filter((task) => task.Kind === ENCODING_TASK_KIND.VIDEO_PROFILE)
    .sort((left, right) => Number(left.NominalHeight) - Number(right.NominalHeight));
  const audioTasks = job.Tasks
    .filter((task) => task.Kind === ENCODING_TASK_KIND.AUDIO_RENDITION)
    .sort((left, right) => Number(left.Spec?.track?.order) - Number(right.Spec?.track?.order));

  const finalHlsDir = path.join(VIDEO_ROOT, String(job.VideoID), "hls");
  const assemblyHlsDir = fs.existsSync(paths.acceptedHlsDir)
    ? paths.acceptedHlsDir
    : finalHlsDir;
  await validateVariantAlignment({ hlsDir: assemblyHlsDir, videoTasks });
  const playlists = videoTasks.map((task) => ({
    resolutionPlaylist: `${task.ProfileLabel}/playlist.m3u8`,
    bitrate: task.Spec.profile.bitrate,
    width: task.Spec.profile.width,
    height: task.Spec.profile.height,
  }));
  const audioTracks = audioTasks.map((task) => ({
    label: task.Spec.track.label,
    language: task.Spec.track.language,
    isDefault: task.Spec.track.isDefault,
    order: task.Spec.track.order,
    sourceIndex: task.Spec.track.sourceIndex,
    outputChannels: 2,
    relativePlaylist: `audio/${task.Spec.track.order}/playlist.m3u8`,
  }));
  await assembleMasterPlaylist({
    outputDir: assemblyHlsDir,
    playlists,
    audioTracks,
    multiAudio: Boolean(snapshot.multiAudio),
    audioBitrateKbps: 192,
  });

  const autoGenreIds = await ensureGenreIdsByNames(
    snapshot.autoLanguageGenreNames || []
  );
  const genreIds = Array.from(new Set([
    ...(snapshot.requestedGenreIds || []).map(Number),
    ...autoGenreIds,
  ]));
  const subtitleInfos = (snapshot.subtitles || []).map((subtitle) => ({
    filename: subtitle.filename,
    label: subtitle.label,
    tempPath: path.join(paths.sourceRoot, ...String(subtitle.relativePath).split("/")),
  }));
  const imageTempPath = snapshot.imageRelativePath
    ? resolveDistributedSourcePath(snapshot.imageRelativePath)
    : null;
  return {
    paths,
    genreIds,
    subtitleInfos,
    audioTracks,
    imageTempPath,
    imageExtension: snapshot.imageExtension || null,
  };
};

const finalizeCompletedJob = async (job) => {
  const locked = await prisma.videoEncodingJob.updateMany({
    where: {
      VideoEncodingJobID: job.VideoEncodingJobID,
      Status: {
        in: [
          ENCODING_JOB_STATUS.QUEUED,
          ENCODING_JOB_STATUS.RUNNING,
          ENCODING_JOB_STATUS.ASSEMBLING,
          ENCODING_JOB_STATUS.VERIFYING,
          ENCODING_JOB_STATUS.PUBLISHING,
        ],
      },
      CancelRequested: false,
    },
    data: {
      Status: ENCODING_JOB_STATUS.ASSEMBLING,
      CurrentStep: "assembling",
      ErrorMessage: null,
    },
  });
  if (locked.count !== 1) return getJobForLifecycle(job.VideoEncodingJobID);

  try {
    const fresh = await getJobForLifecycle(job.VideoEncodingJobID);
    const inputs = await buildFinalizationInputs(fresh);
    await updateEncodingJob(job.VideoEncodingJobID, {
      status: ENCODING_JOB_STATUS.VERIFYING,
      currentStep: "verifying",
      progress: 99,
    });
    const publishing = await prisma.videoEncodingJob.updateMany({
      where: {
        VideoEncodingJobID: job.VideoEncodingJobID,
        Status: {
          in: [
            ENCODING_JOB_STATUS.ASSEMBLING,
            ENCODING_JOB_STATUS.VERIFYING,
          ],
        },
        CancelRequested: false,
      },
      data: {
        Status: ENCODING_JOB_STATUS.PUBLISHING,
        CurrentStep: "publishing",
      },
    });
    if (publishing.count !== 1) {
      const current = await getJobForLifecycle(job.VideoEncodingJobID);
      if (current?.CancelRequested) return cancelJob(current);
      return current;
    }
    const published = await finalizeReservedImportedVideo({
      videoId: fresh.VideoID,
      hlsDir: inputs.paths.acceptedHlsDir,
      subtitleInfos: inputs.subtitleInfos,
      audioTrackInfos: inputs.audioTracks,
      genreIds: inputs.genreIds,
      imageTempPath: inputs.imageTempPath,
      imageExtension: inputs.imageExtension,
    });
    try {
      if (await isContentPreviewActive()) {
        await generateVideoPreviewFramesFromMaster({
          videoId: fresh.VideoID,
          masterPlaylistPath: path.join(published.finalHlsDir, "master.m3u8"),
        });
      }
    } catch (error) {
      console.warn(
        `[distributed-encoding] Preview classique non générée pour ${fresh.VideoID}:`,
        error.message
      );
    }
    try {
      if (await isPreviewLiveActive()) {
        await generateVideoPreviewLiveFromMaster({
          videoId: fresh.VideoID,
          masterPlaylistPath: path.join(published.finalHlsDir, "master.m3u8"),
        });
      }
    } catch (error) {
      console.warn(
        `[distributed-encoding] Preview Live non générée pour ${fresh.VideoID}:`,
        error.message
      );
    }
    await cleanupDistributedJobFiles(job.VideoEncodingJobID);
    await updateEncodingJob(job.VideoEncodingJobID, {
      status: ENCODING_JOB_STATUS.COMPLETED,
      currentStep: "completed",
      progress: 100,
      completedAt: new Date(),
      errorMessage: null,
      cancelRequested: false,
    });
    return getJobForLifecycle(job.VideoEncodingJobID);
  } catch (error) {
    await updateEncodingJob(job.VideoEncodingJobID, {
      status: ENCODING_JOB_STATUS.FAILED,
      currentStep: "failed",
      errorMessage: error.message,
      completedAt: new Date(),
    });
    throw error;
  }
};

const cancelJob = async (job) => {
  await prisma.$transaction(async (tx) => {
    const taskIds = job.Tasks.map((task) => task.VideoEncodingTaskID);
    await tx.videoEncodingTask.updateMany({
      where: {
        VideoEncodingJobID: job.VideoEncodingJobID,
        Status: { notIn: [ENCODING_TASK_STATUS.SUCCEEDED, ENCODING_TASK_STATUS.CANCELLED] },
      },
      data: {
        Status: ENCODING_TASK_STATUS.CANCELLED,
        AssignedWorkerID: null,
        LeaseTokenHash: null,
        LeaseExpiresAt: null,
        CompletedAt: new Date(),
        ErrorMessage: "Job annulé par le super administrateur.",
      },
    });
    await tx.videoEncodingTaskAttempt.updateMany({
      where: {
        VideoEncodingTaskID: { in: taskIds },
        Status: "RUNNING",
      },
      data: {
        Status: "CANCELLED",
        CompletedAt: new Date(),
        ErrorMessage: "Job annulé par le super administrateur.",
      },
    });
  });
  if (job.VideoID) await cleanupReservedImportedVideo(job.VideoID);
  await cleanupDistributedJobFiles(job.VideoEncodingJobID);
  await prisma.videoEncodingJob.update({
    where: { VideoEncodingJobID: job.VideoEncodingJobID },
    data: {
      Status: ENCODING_JOB_STATUS.CANCELLED,
      CurrentStep: "cancelled",
      CompletedAt: new Date(),
      Progress: 0,
      CancelRequested: false,
    },
  });
  return getJobForLifecycle(job.VideoEncodingJobID);
};

async function advance(jobId) {
  let job = await getJobForLifecycle(jobId);
  if (!job) return null;
  if (job.Status === ENCODING_JOB_STATUS.CANCEL_REQUESTED || job.CancelRequested) {
    return cancelJob(job);
  }
  if (
    [
      ENCODING_JOB_STATUS.COMPLETED,
      ENCODING_JOB_STATUS.CANCELLED,
      ENCODING_JOB_STATUS.FAILED,
    ].includes(job.Status)
  ) {
    return job;
  }
  await recalculateEncodingJobProgress(jobId);
  job = await getJobForLifecycle(jobId);
  const required = job.Tasks.filter((task) => task.Required);
  const failed = required.find((task) => task.Status === ENCODING_TASK_STATUS.FAILED);
  if (failed) {
    return updateEncodingJob(jobId, {
      status: ENCODING_JOB_STATUS.FAILED,
      currentStep: "failed",
      errorMessage: failed.ErrorMessage || `La tâche ${failed.TaskKey} a échoué.`,
      completedAt: new Date(),
    });
  }
  if (
    required.length > 0
    && required.every((task) => task.Status === ENCODING_TASK_STATUS.SUCCEEDED)
  ) {
    return finalizeCompletedJob(job);
  }
  return job;
}

export function advanceDistributedEncodingJob(jobId) {
  const id = String(jobId);
  if (runningFinalizations.has(id)) return runningFinalizations.get(id);
  const promise = advance(id).finally(() => {
    if (runningFinalizations.get(id) === promise) runningFinalizations.delete(id);
  });
  runningFinalizations.set(id, promise);
  return promise;
}
