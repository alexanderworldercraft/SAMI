import fs from "fs";
import path from "path";

import {
  assertDistributedPrimaryConfig,
  isDistributedEncodingEnvironmentEnabled,
} from "./config.js";
import {
  ENCODING_TASK_KIND,
  ENCODING_TASK_PHASE,
} from "./constants.js";
import { acquireEncodingCapacity, setEncodingMaxSlots } from "./capacity.js";
import { buildDistributedArtifactManifest } from "./artifactManifest.js";
import {
  completeEncodingArtifacts,
  markLocalArtifactFilesVerified,
  registerEncodingArtifactManifest,
} from "./artifactService.js";
import {
  encodeAudioRendition,
  encodeSingleVideoProfile,
} from "./ffmpeg/index.js";
import { advanceDistributedEncodingJob } from "./finalizationService.js";
import {
  ensurePrimaryEncodingWorkerRegistered,
  getPrimaryEncodingCapabilities,
} from "./jobService.js";
import {
  failEncodingTaskLease,
  recalculateEncodingJobProgress,
  releaseEncodingTaskLease,
  renewEncodingTaskLease,
} from "./persistence.js";
import { claimNextEncodingTask } from "./scheduler.js";
import {
  getDistributedJobPaths,
  resolveDistributedSourcePath,
} from "./sourceService.js";

const CLAIM_INTERVAL_MS = 3_000;

export async function executePrimaryEncodingClaim(claim, {
  config = assertDistributedPrimaryConfig(),
  signal,
} = {}) {
  const { task, job, attempt, leaseToken, leaseGeneration } = claim;
  const paths = getDistributedJobPaths(job.VideoEncodingJobID);
  const attemptRoot = path.join(
    paths.attemptsRoot,
    attempt.VideoEncodingTaskAttemptID
  );
  const outputDir = path.join(attemptRoot, "hls");
  const sourcePath = resolveDistributedSourcePath(job.SourceRelativePath);
  await fs.promises.mkdir(outputDir, { recursive: true });
  let progress = 0;
  let phase = ENCODING_TASK_PHASE.ENCODING;
  let renewInFlight = null;
  const abortController = new AbortController();
  const abortFromRuntime = () => {
    if (!abortController.signal.aborted) {
      abortController.abort(signal?.reason || new Error("Runtime arrêté."));
    }
  };
  if (signal?.aborted) abortFromRuntime();
  else signal?.addEventListener?.("abort", abortFromRuntime, { once: true });

  const renew = async () => {
    if (renewInFlight) return renewInFlight;
    renewInFlight = renewEncodingTaskLease({
      taskId: task.VideoEncodingTaskID,
      workerId: config.instanceId,
      leaseToken,
      leaseGeneration,
      progress,
      phase,
    }).finally(() => {
      renewInFlight = null;
    });
    return renewInFlight;
  };
  await renew();
  const renewTimer = setInterval(
    () => renew().catch((error) => abortController.abort(error)),
    25_000
  );
  renewTimer.unref?.();

  try {
    if (task.Kind === ENCODING_TASK_KIND.VIDEO_PROFILE) {
      await encodeSingleVideoProfile({
        videoPath: sourcePath,
        outputDir,
        profile: task.Spec.profile,
        videoStreamIndex: task.Spec.videoStreamIndex,
        audioStreamIndex: task.Spec.audioStreamIndex,
        includeAudio: task.Spec.includeAudio,
        durationSeconds: task.Spec.durationSeconds,
        segmentDurationSeconds: task.Spec.segmentDurationSeconds,
        audioBitrateKbps: task.Spec.audioBitrateKbps,
        onProgress: (value) => {
          progress = value;
        },
        signal: abortController.signal,
      });
    } else if (task.Kind === ENCODING_TASK_KIND.AUDIO_RENDITION) {
      await encodeAudioRendition({
        videoPath: sourcePath,
        outputDir,
        track: task.Spec.track,
        durationSeconds: task.Spec.durationSeconds,
        segmentDurationSeconds: task.Spec.segmentDurationSeconds,
        audioBitrateKbps: task.Spec.audioBitrateKbps,
        onProgress: (value) => {
          progress = value;
        },
        signal: abortController.signal,
      });
    } else {
      throw new Error(`Type de tâche ${task.Kind} non supporté.`);
    }

    progress = 100;
    phase = ENCODING_TASK_PHASE.UPLOADING;
    await renew();
    const { manifest, manifestHash } = await buildDistributedArtifactManifest({
      root: attemptRoot,
      jobId: job.VideoEncodingJobID,
      taskId: task.VideoEncodingTaskID,
      attemptId: attempt.VideoEncodingTaskAttemptID,
      taskKey: task.TaskKey,
      leaseGeneration,
      sourceSha256: job.SourceSha256,
      planHash: job.EncodingSpecHash,
    });
    await registerEncodingArtifactManifest({
      taskId: task.VideoEncodingTaskID,
      workerId: config.instanceId,
      leaseToken,
      leaseGeneration,
      manifest,
      manifestHash,
    });
    await markLocalArtifactFilesVerified({
      taskId: task.VideoEncodingTaskID,
      workerId: config.instanceId,
      leaseToken,
      leaseGeneration,
    });
    phase = ENCODING_TASK_PHASE.VERIFYING;
    await renew();
    await completeEncodingArtifacts({
      taskId: task.VideoEncodingTaskID,
      workerId: config.instanceId,
      leaseToken,
      leaseGeneration,
    });
  } catch (error) {
    const transition = signal?.aborted
      ? releaseEncodingTaskLease({
          taskId: task.VideoEncodingTaskID,
          workerId: config.instanceId,
          leaseToken,
          leaseGeneration,
          reason: "Le runtime primary s'est arrêté pendant l'encodage.",
        })
      : failEncodingTaskLease({
          taskId: task.VideoEncodingTaskID,
          workerId: config.instanceId,
          leaseToken,
          leaseGeneration,
          errorMessage: error.message,
        });
    await transition.catch(() => {});
    throw error;
  } finally {
    clearInterval(renewTimer);
    signal?.removeEventListener?.("abort", abortFromRuntime);
    await recalculateEncodingJobProgress(job.VideoEncodingJobID).catch(() => {});
    await advanceDistributedEncodingJob(job.VideoEncodingJobID).catch((error) => {
      console.error("[distributed-encoding:advance]", error);
    });
  }
}

export async function runOnePrimaryEncodingClaim({
  claim = claimNextEncodingTask,
  execute = executePrimaryEncodingClaim,
  signal,
} = {}) {
  if (!isDistributedEncodingEnvironmentEnabled()) return null;
  const config = assertDistributedPrimaryConfig();
  const worker = await ensurePrimaryEncodingWorkerRegistered();
  setEncodingMaxSlots(worker.MaxSlots || 1);
  const release = await acquireEncodingCapacity({ wait: false, exclusive: false });
  if (!release) return null;
  try {
    const next = await claim({ instanceId: config.instanceId });
    if (!next) return null;
    await execute(next, { config, signal });
    return next;
  } finally {
    release();
  }
}

export async function startPrimaryDistributedEncodingRuntime() {
  if (!isDistributedEncodingEnvironmentEnabled()) {
    return { enabled: false, stop() {} };
  }
  const capabilities = await getPrimaryEncodingCapabilities();
  await ensurePrimaryEncodingWorkerRegistered({ capabilities });
  const config = assertDistributedPrimaryConfig();
  let stopped = false;
  const running = new Set();
  const controllers = new Set();
  let maxSlots = 1;

  const heartbeat = () => ensurePrimaryEncodingWorkerRegistered({ capabilities }).then((worker) => {
    maxSlots = worker.MaxSlots || 1;
    setEncodingMaxSlots(maxSlots);
  }).catch((error) => {
    console.error("[distributed-encoding:primary-heartbeat]", error.message);
  });
  const tick = () => {
    if (stopped || running.size >= maxSlots) return;
    for (let slot = running.size; slot < maxSlots; slot += 1) {
      const controller = new AbortController();
      controllers.add(controller);
      const run = runOnePrimaryEncodingClaim({ signal: controller.signal })
        .catch((error) => {
          console.error("[distributed-encoding:primary-worker]", error);
        })
        .finally(() => {
          running.delete(run);
          controllers.delete(controller);
        });
      running.add(run);
    }
  };
  await heartbeat();
  const heartbeatTimer = setInterval(heartbeat, config.heartbeatIntervalMs);
  const claimTimer = setInterval(tick, CLAIM_INTERVAL_MS);
  heartbeatTimer.unref?.();
  claimTimer.unref?.();
  tick();

  return {
    enabled: true,
    async stop() {
      stopped = true;
      clearInterval(heartbeatTimer);
      clearInterval(claimTimer);
      for (const controller of controllers) controller.abort(new Error("Arrêt du runtime primary."));
      await Promise.allSettled([...running]);
    },
  };
}
