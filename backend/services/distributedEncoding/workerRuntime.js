import crypto from "crypto";
import fs from "fs";
import path from "path";

import {
  assertDistributedWorkerConfig,
} from "./config.js";
import {
  ENCODING_TASK_KIND,
  ENCODING_TASK_PHASE,
  ENCODING_WORKER_ROLE,
} from "./constants.js";
import { distributedEncodingError } from "./error.js";
import {
  collectDistributedEncodingWorkerCapabilities,
} from "./capabilityService.js";
import {
  buildDistributedArtifactManifest,
} from "./artifactManifest.js";
import {
  ensureDistributedSourceCached,
  pinDistributedSource,
  purgeDistributedSourceCache,
  unpinDistributedSource,
} from "./cacheService.js";
import { withEncodingCapacity } from "./capacity.js";
import {
  encodeAudioRendition,
  encodeSingleVideoProfile,
  getFfmpegExecutable,
} from "./ffmpeg/index.js";
import {
  claimRemoteEncodingTask,
  completeRemoteEncodingTask,
  failRemoteEncodingTask,
  registerRemoteEncodingArtifacts,
  releaseRemoteEncodingTask,
  renewRemoteEncodingTask,
  sendWorkerHeartbeat,
  uploadRemoteEncodingArtifact,
} from "./workerClient.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_ERROR_LENGTH = 4_000;
const DEFAULT_CLAIM_POLL_INTERVAL_MS = 15_000;
const SHUTDOWN_NOTIFICATION_TIMEOUT_MS = 5_000;
const CLAIM_ERROR_BACKOFF_MS = Object.freeze([15_000, 60_000, 5 * 60_000]);

const defaultDependencies = Object.freeze({
  buildArtifactManifest: buildDistributedArtifactManifest,
  claimTask: claimRemoteEncodingTask,
  completeTask: completeRemoteEncodingTask,
  encodeAudio: encodeAudioRendition,
  encodeVideo: encodeSingleVideoProfile,
  ensureSourceCached: ensureDistributedSourceCached,
  failTask: failRemoteEncodingTask,
  getFfmpegExecutable,
  pinSource: pinDistributedSource,
  purgeSource: purgeDistributedSourceCache,
  registerArtifacts: registerRemoteEncodingArtifacts,
  releaseTask: releaseRemoteEncodingTask,
  renewTask: renewRemoteEncodingTask,
  sendHeartbeat: sendWorkerHeartbeat,
  unpinSource: unpinDistributedSource,
  uploadArtifact: uploadRemoteEncodingArtifact,
  withCapacity: withEncodingCapacity,
});

const field = (object, ...names) => {
  for (const name of names) {
    if (object?.[name] !== undefined && object?.[name] !== null) {
      return object[name];
    }
  }
  return undefined;
};

const errorMessage = (error) => String(
  error?.message || error || "Erreur d'encodage distribué inconnue."
).slice(0, MAX_ERROR_LENGTH);

const safeLoggerCall = (logger, method, ...args) => {
  try {
    logger?.[method]?.(...args);
  } catch {
    // Le journal ne doit jamais interrompre un encodage.
  }
};

const requireUuid = (value, fieldName) => {
  const normalized = String(value || "").toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw distributedEncodingError(
      `${fieldName} est invalide dans le claim.`,
      "INVALID_DISTRIBUTED_ENCODING_CLAIM",
      502
    );
  }
  return normalized;
};

const requireHash = (value, fieldName) => {
  const normalized = String(value || "").toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw distributedEncodingError(
      `${fieldName} est invalide dans le claim.`,
      "INVALID_DISTRIBUTED_ENCODING_CLAIM",
      502
    );
  }
  return normalized;
};

const normalizeClaim = (payload) => {
  if (!payload) return null;
  const claim = payload.claim === null
    ? null
    : payload.claim || payload.lease || payload;
  if (!claim || !claim.task) return null;

  const rawTask = claim.task;
  const rawJob = claim.job || rawTask.Job || rawTask.job;
  const rawAttempt = claim.attempt || claim.Attempt;
  const rawSource = claim.source || rawJob?.source;
  const task = {
    id: requireUuid(
      field(rawTask, "id", "VideoEncodingTaskID"),
      "task.id"
    ),
    key: String(field(rawTask, "key", "TaskKey") || ""),
    kind: String(field(rawTask, "kind", "Kind") || "").toUpperCase(),
    profileLabel: field(rawTask, "profileLabel", "ProfileLabel") || null,
    spec: field(rawTask, "spec", "Spec") || {},
    specHash: field(rawTask, "specHash", "SpecHash") || null,
    raw: rawTask,
  };
  const job = {
    id: requireUuid(
      field(rawJob, "id", "VideoEncodingJobID")
      ?? field(rawSource, "jobId"),
      "job.id"
    ),
    sourceOriginalName: String(
      field(
        rawSource,
        "originalName",
        "name"
      )
      || field(rawJob, "sourceOriginalName", "SourceOriginalName")
      || "source.bin"
    ),
    sourceSize: Number(
      field(rawSource, "size")
      ?? field(rawJob, "sourceSize", "SourceSize")
    ),
    sourceSha256: requireHash(
      field(rawSource, "sha256", "hash")
      ?? field(rawJob, "sourceSha256", "SourceSha256"),
      "job.sourceSha256"
    ),
    sourceMetadata:
      field(rawJob, "sourceMetadata", "SourceMetadata") || null,
    encodingSpecHash: requireHash(
      field(rawJob, "encodingSpecHash", "EncodingSpecHash"),
      "job.encodingSpecHash"
    ),
    raw: rawJob,
  };
  const attempt = {
    id: requireUuid(
      field(rawAttempt, "id", "VideoEncodingTaskAttemptID"),
      "attempt.id"
    ),
    raw: rawAttempt,
  };
  const leaseToken = String(claim.leaseToken || "");
  const leaseGeneration = Number(
    claim.leaseGeneration
    ?? field(rawTask, "leaseGeneration", "LeaseGeneration")
  );

  if (!task.key || !Object.values(ENCODING_TASK_KIND).includes(task.kind)) {
    throw distributedEncodingError(
      "La tâche attribuée n'est pas supportée par ce worker.",
      "UNSUPPORTED_DISTRIBUTED_ENCODING_TASK",
      502
    );
  }
  if (!Number.isSafeInteger(job.sourceSize) || job.sourceSize <= 0) {
    throw distributedEncodingError(
      "La taille de la source du claim est invalide.",
      "INVALID_DISTRIBUTED_ENCODING_CLAIM",
      502
    );
  }
  if (!leaseToken || !Number.isSafeInteger(leaseGeneration) || leaseGeneration <= 0) {
    throw distributedEncodingError(
      "Le lease du claim est invalide.",
      "INVALID_DISTRIBUTED_ENCODING_CLAIM",
      502
    );
  }

  return {
    task,
    job,
    attempt,
    leaseToken,
    leaseGeneration,
    leaseExpiresAt: claim.leaseExpiresAt || null,
    renewAfterMs: Number(claim.renewAfterMs) || null,
  };
};

export { collectDistributedEncodingWorkerCapabilities };

const portableRemove = async (target, fsModule = fs) => {
  await fsModule.promises.rm(target, {
    recursive: true,
    force: true,
    maxRetries: 4,
    retryDelay: 100,
  });
};

const createAttemptWorkspace = async ({ config, attemptId, fsModule }) => {
  const root = path.resolve(config.stagingRoot, "worker-attempts", attemptId);
  await portableRemove(root, fsModule);
  await fsModule.promises.mkdir(root, { recursive: true, mode: 0o700 });
  return root;
};

const workspaceFile = (root, relativePath) => {
  const segments = String(relativePath || "").split("/");
  const absolute = path.resolve(root, ...segments);
  const prefix = `${path.resolve(root)}${path.sep}`;
  if (!absolute.startsWith(prefix)) {
    throw distributedEncodingError(
      "Un chemin d'artefact sort du workspace de la tentative.",
      "DISTRIBUTED_ARTIFACT_SCOPE_MISMATCH",
      502
    );
  }
  return absolute;
};

const shouldAbortForRenewResponse = (response) => Boolean(
  response?.cancelRequested
  || response?.cancelled
  || response?.job?.cancelRequested
  || response?.continue === false
);

const createLeaseKeeper = ({
  claim,
  controller,
  dependencies,
  intervalMs,
  logger,
}) => {
  let phase = ENCODING_TASK_PHASE.DOWNLOADING;
  let progress = 0;
  let timer = null;
  let renewal = Promise.resolve();
  let fatalError = null;
  let stopped = false;

  const update = (nextPhase, nextProgress) => {
    if (nextPhase) phase = nextPhase;
    if (nextProgress !== undefined) {
      const numeric = Number(nextProgress);
      if (Number.isFinite(numeric)) {
        progress = Math.max(progress, Math.min(99, Math.round(numeric)));
      }
    }
  };

  const renewNow = () => {
    if (stopped || fatalError || controller.signal.aborted) return renewal;
    renewal = renewal.then(async () => {
      if (stopped || fatalError || controller.signal.aborted) return null;
      try {
        const response = await dependencies.renewTask({
          taskId: claim.task.id,
          leaseToken: claim.leaseToken,
          leaseGeneration: claim.leaseGeneration,
          phase,
          progress,
        }, { signal: controller.signal });
        if (shouldAbortForRenewResponse(response)) {
          throw distributedEncodingError(
            "Le primary a demandé l'annulation de la tâche.",
            "DISTRIBUTED_TASK_CANCELLED",
            409
          );
        }
        return response;
      } catch (error) {
        fatalError = error;
        if (!controller.signal.aborted) controller.abort(error);
        throw error;
      }
    });
    renewal.catch((error) => {
      safeLoggerCall(
        logger,
        "warn",
        "[distributed-encoding-worker] renouvellement de lease impossible",
        error
      );
    });
    return renewal;
  };

  const start = async () => {
    await renewNow();
    if (stopped || fatalError) return;
    timer = setInterval(() => {
      void renewNow();
    }, intervalMs);
    timer.unref?.();
  };

  const stop = async () => {
    stopped = true;
    if (timer) clearInterval(timer);
    await renewal.catch(() => {});
  };

  return {
    get fatalError() {
      return fatalError;
    },
    renewNow,
    start,
    stop,
    update,
  };
};

const encodeClaim = async ({
  claim,
  sourcePath,
  workspace,
  keeper,
  dependencies,
  signal,
}) => {
  const spec = claim.task.spec;
  const outputDir = path.join(workspace, "hls");
  const common = {
    videoPath: sourcePath,
    outputDir,
    durationSeconds: Number(spec.durationSeconds) || 0,
    segmentDurationSeconds: Number(spec.segmentDurationSeconds) || 4,
    audioBitrateKbps: Number(spec.audioBitrateKbps) || 192,
    onProgress: (percent) => {
      const normalized = Math.max(0, Math.min(100, Number(percent) || 0));
      keeper.update(
        ENCODING_TASK_PHASE.ENCODING,
        10 + Math.round(normalized * 0.65)
      );
    },
    signal,
  };

  if (claim.task.kind === ENCODING_TASK_KIND.VIDEO_PROFILE) {
    return dependencies.encodeVideo({
      ...common,
      profile: spec.profile,
      videoStreamIndex: spec.videoStreamIndex,
      audioStreamIndex: spec.audioStreamIndex,
      includeAudio: spec.includeAudio !== false,
    });
  }
  if (claim.task.kind === ENCODING_TASK_KIND.AUDIO_RENDITION) {
    if (spec.primaryOnly === true) {
      throw distributedEncodingError(
        "Cette rendition audio est réservée au serveur principal.",
        "DISTRIBUTED_PRIMARY_ONLY_TASK",
        409
      );
    }
    return dependencies.encodeAudio({
      ...common,
      track: spec.track,
    });
  }
  throw distributedEncodingError(
    `Le type de tâche ${claim.task.kind} n'est pas supporté.`,
    "UNSUPPORTED_DISTRIBUTED_ENCODING_TASK",
    500
  );
};

const validateRegisteredFiles = ({ manifest, registration }) => {
  const registry = registration?.registration || registration;
  if (!Array.isArray(registry?.files)) {
    throw distributedEncodingError(
      "Le primary n'a pas retourné le registre des artefacts.",
      "INVALID_DISTRIBUTED_ARTIFACT_REGISTRATION",
      502,
      { retryable: true }
    );
  }
  const localByPath = new Map(
    manifest.files.map((file) => [file.relativePath, file])
  );
  const seen = new Set();
  const files = registry.files.map((remote) => {
    const local = localByPath.get(String(remote?.relativePath || ""));
    if (
      !local
      || !remote?.id
      || seen.has(local.relativePath)
      || String(remote.size) !== String(local.size)
      || String(remote.sha256 || "").toLowerCase() !== local.sha256
    ) {
      throw distributedEncodingError(
        "Le registre d'artefacts retourné par le primary ne correspond pas au manifeste.",
        "DISTRIBUTED_ARTIFACT_REGISTRATION_MISMATCH",
        409
      );
    }
    seen.add(local.relativePath);
    return { remote, local };
  });
  if (files.length !== manifest.files.length) {
    throw distributedEncodingError(
      "Le primary n'a pas enregistré tous les artefacts du manifeste.",
      "DISTRIBUTED_ARTIFACT_REGISTRATION_MISMATCH",
      409
    );
  }
  return files;
};

const isLeaseLost = (error) => error?.code === "ENCODING_LEASE_LOST";
const isAbortError = (error) => error?.name === "AbortError"
  || error?.code === "ABORT_ERR"
  || error?.code === "DISTRIBUTED_TASK_CANCELLED";

const reportClaimFailure = async ({
  claim,
  error,
  runtimeStopping,
  dependencies,
  logger,
}) => {
  if (isLeaseLost(error)) return "LEASE_LOST";
  const retryable = Boolean(error?.retryable);
  const release = runtimeStopping || retryable || isAbortError(error);
  const payload = {
    taskId: claim.task.id,
    leaseToken: claim.leaseToken,
    leaseGeneration: claim.leaseGeneration,
    error: errorMessage(error),
    code: String(error?.code || "DISTRIBUTED_ENCODING_WORKER_ERROR"),
    retryable,
  };
  try {
    if (release && runtimeStopping) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(new Error("shutdown notification timeout")),
        SHUTDOWN_NOTIFICATION_TIMEOUT_MS
      );
      timeout.unref?.();
      try {
        await dependencies.releaseTask(payload, { signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    } else if (release) await dependencies.releaseTask(payload);
    else await dependencies.failTask(payload);
  } catch (notificationError) {
    safeLoggerCall(
      logger,
      "warn",
      "[distributed-encoding-worker] signalement d'échec impossible",
      notificationError
    );
  }
  return release ? "RELEASED" : "FAILED";
};

/**
 * Démarre le worker clone. Le runtime ne traite jamais plus d'un claim à la
 * fois et expose runOneClaim pour les tests et les démarrages pilotés.
 */
export function startDistributedEncodingWorkerRuntime(options = {}) {
  const config = options.config || assertDistributedWorkerConfig();
  if (config.role !== ENCODING_WORKER_ROLE.CLONE) {
    throw distributedEncodingError(
      "Le runtime worker distribué ne peut démarrer que sur un clone.",
      "DISTRIBUTED_WORKER_ROLE_REQUIRED",
      500
    );
  }

  const dependencies = {
    ...defaultDependencies,
    ...(options.dependencies || {}),
  };
  const fsModule = options.fsModule || fs;
  const logger = options.logger === undefined ? console : options.logger;
  const bootId = String(options.bootId || crypto.randomUUID());
  const claimPollIntervalMs = Math.max(
    250,
    Number(options.claimPollIntervalMs) || DEFAULT_CLAIM_POLL_INTERVAL_MS
  );
  let stopped = false;
  let activeRun = null;
  let activeController = null;
  let claimTimer = null;
  let heartbeatTimer = null;
  let heartbeatInFlight = null;
  let heartbeatController = null;
  let capabilityPromise = null;
  let lastError = null;
  let consecutiveClaimErrors = 0;
  let stopPromise = null;

  const getCapabilities = () => {
    if (!capabilityPromise) {
      capabilityPromise = Promise.resolve(
        options.capabilities
        || collectDistributedEncodingWorkerCapabilities({
          config,
          fsModule,
          ffmpegPath: dependencies.getFfmpegExecutable(),
        })
      ).then((capabilities) => {
        if (capabilities.probeError && !lastError) {
          lastError = capabilities.probeError;
        }
        return capabilities;
      });
    }
    return capabilityPromise;
  };

  const sendHeartbeat = () => {
    if (heartbeatInFlight) return heartbeatInFlight;
    const controller = new AbortController();
    heartbeatController = controller;
    heartbeatInFlight = (async () => {
      const snapshot = await getCapabilities();
      const {
        probeError: _probeError,
        ...publicSnapshot
      } = snapshot;
      const heartbeatError = lastError;
      const response = await dependencies.sendHeartbeat({
        ...publicSnapshot,
        protocolVersion: config.protocolVersion,
        pipelineVersion: config.pipelineVersion,
        maxSlots: 1,
        bootId,
        lastError: heartbeatError,
      }, { signal: controller.signal });
      const purgeHashes = Array.isArray(response?.purgeSourceSha256)
        ? response.purgeSourceSha256
        : [];
      for (const sourceSha256 of purgeHashes) {
        try {
          await dependencies.purgeSource(sourceSha256);
        } catch (error) {
          safeLoggerCall(
            logger,
            "warn",
            "[distributed-encoding-worker] purge de cache impossible",
            error
          );
        }
      }
      if (lastError === heartbeatError) {
        lastError = snapshot.probeError || null;
      }
    })().catch((error) => {
      lastError = errorMessage(error);
      safeLoggerCall(
        logger,
        "warn",
        "[distributed-encoding-worker] heartbeat impossible",
        error
      );
    }).finally(() => {
      heartbeatInFlight = null;
      if (heartbeatController === controller) heartbeatController = null;
    });
    return heartbeatInFlight;
  };

  const processClaim = async (claim, controller) => {
    let keeper = null;
    let pinned = false;
    let workspace = null;
    let purgeSource = false;
    let completed = false;
    try {
      const renewIntervalMs = Math.max(
        250,
        claim.renewAfterMs || Number(config.leaseRenewIntervalMs) || 30_000
      );
      keeper = createLeaseKeeper({
        claim,
        controller,
        dependencies,
        intervalMs: renewIntervalMs,
        logger,
      });
      await keeper.start();

      if (
        claim.task.kind === ENCODING_TASK_KIND.AUDIO_RENDITION
        && claim.task.spec.primaryOnly === true
      ) {
        throw distributedEncodingError(
          "Cette rendition audio est réservée au serveur principal.",
          "DISTRIBUTED_PRIMARY_ONLY_TASK",
          409
        );
      }

      workspace = await createAttemptWorkspace({
        config,
        attemptId: claim.attempt.id,
        fsModule,
      });
      dependencies.pinSource(claim.job.sourceSha256);
      pinned = true;
      const cached = await dependencies.ensureSourceCached({
        jobId: claim.job.id,
        taskId: claim.task.id,
        leaseToken: claim.leaseToken,
        leaseGeneration: claim.leaseGeneration,
        sha256: claim.job.sourceSha256,
        size: claim.job.sourceSize,
        originalName: claim.job.sourceOriginalName,
        signal: controller.signal,
      });

      keeper.update(ENCODING_TASK_PHASE.ENCODING, 10);
      await keeper.renewNow();
      await dependencies.withCapacity(
        () => encodeClaim({
          claim,
          sourcePath: cached.sourcePath,
          workspace,
          keeper,
          dependencies,
          signal: controller.signal,
        }),
        { signal: controller.signal }
      );
      if (keeper.fatalError) throw keeper.fatalError;

      const { manifest, manifestHash } = await dependencies.buildArtifactManifest({
        root: workspace,
        jobId: claim.job.id,
        taskId: claim.task.id,
        attemptId: claim.attempt.id,
        taskKey: claim.task.key,
        leaseGeneration: claim.leaseGeneration,
        sourceSha256: claim.job.sourceSha256,
        planHash: claim.job.encodingSpecHash,
      });

      keeper.update(ENCODING_TASK_PHASE.UPLOADING, 76);
      await keeper.renewNow();
      const registration = await dependencies.registerArtifacts({
        taskId: claim.task.id,
        manifest,
        manifestHash,
        leaseToken: claim.leaseToken,
      }, { signal: controller.signal });
      const registeredFiles = validateRegisteredFiles({ manifest, registration });
      const pendingFiles = registeredFiles.filter(
        ({ remote }) => String(remote.status || "").toUpperCase() !== "VERIFIED"
      );
      for (let index = 0; index < pendingFiles.length; index += 1) {
        const { remote, local } = pendingFiles[index];
        await dependencies.uploadArtifact({
          taskId: claim.task.id,
          fileId: remote.id,
          absolutePath: workspaceFile(workspace, local.relativePath),
          size: Number(local.size),
          sha256: local.sha256,
          leaseToken: claim.leaseToken,
          leaseGeneration: claim.leaseGeneration,
          signal: controller.signal,
        });
        keeper.update(
          ENCODING_TASK_PHASE.UPLOADING,
          76 + Math.round(((index + 1) / pendingFiles.length) * 20)
        );
      }

      keeper.update(ENCODING_TASK_PHASE.VERIFYING, 98);
      await keeper.renewNow();
      const completion = await dependencies.completeTask({
        taskId: claim.task.id,
        leaseToken: claim.leaseToken,
        leaseGeneration: claim.leaseGeneration,
      }, { signal: controller.signal });
      purgeSource = Boolean(
        completion?.purgeSource || completion?.result?.purgeSource
      );
      completed = true;
      lastError = null;
      return {
        claimed: true,
        completed: true,
        taskId: claim.task.id,
        attemptId: claim.attempt.id,
        cacheHit: Boolean(cached.cacheHit),
        uploadedFiles: pendingFiles.length,
        purgeSource,
      };
    } catch (error) {
      const operationalError = keeper?.fatalError || error;
      lastError = errorMessage(operationalError);
      await keeper?.stop();
      const status = await reportClaimFailure({
        claim,
        error: operationalError,
        runtimeStopping: stopped,
        dependencies,
        logger,
      });
      return {
        claimed: true,
        completed: false,
        taskId: claim.task.id,
        attemptId: claim.attempt.id,
        status,
        error: operationalError,
      };
    } finally {
      await keeper?.stop();
      if (pinned) {
        try {
          dependencies.unpinSource(claim.job.sourceSha256);
        } catch (error) {
          safeLoggerCall(logger, "warn", "[distributed-encoding-worker] unpin impossible", error);
        }
      }
      if (completed && purgeSource) {
        try {
          await dependencies.purgeSource(claim.job.sourceSha256);
        } catch (error) {
          safeLoggerCall(logger, "warn", "[distributed-encoding-worker] purge impossible", error);
        }
      }
      if (workspace) {
        try {
          await portableRemove(workspace, fsModule);
        } catch (error) {
          safeLoggerCall(logger, "warn", "[distributed-encoding-worker] nettoyage impossible", error);
        }
      }
    }
  };

  const runOneClaim = () => {
    if (stopped) return Promise.resolve({ claimed: false, stopped: true });
    if (activeRun) return Promise.resolve({ claimed: false, busy: true });

    const controller = new AbortController();
    activeController = controller;
    activeRun = (async () => {
      const response = await dependencies.claimTask({}, {
        signal: controller.signal,
      });
      const claim = normalizeClaim(response);
      if (!claim) return { claimed: false };
      safeLoggerCall(
        logger,
        "info",
        `[distributed-encoding-worker:${claim.task.id}] tâche attribuée au clone (${claim.task.kind}, ${claim.task.key}, job ${claim.job.id}).`
      );
      return processClaim(claim, controller);
    })().finally(() => {
      activeRun = null;
      if (activeController === controller) activeController = null;
    });
    return activeRun;
  };

  const runClaimLoop = async () => {
    if (stopped) return;
    let delay = claimPollIntervalMs;
    try {
      const result = await runOneClaim();
      consecutiveClaimErrors = 0;
      if (result.claimed) delay = 250;
    } catch (error) {
      if (!stopped) {
        lastError = errorMessage(error);
        delay = CLAIM_ERROR_BACKOFF_MS[Math.min(
          consecutiveClaimErrors,
          CLAIM_ERROR_BACKOFF_MS.length - 1
        )];
        consecutiveClaimErrors += 1;
        safeLoggerCall(
          logger,
          "warn",
          "[distributed-encoding-worker] claim impossible",
          error
        );
      }
    }
    if (stopped) return;
    claimTimer = setTimeout(runClaimLoop, delay);
    claimTimer.unref?.();
  };

  const ready = options.autoStart === false
    ? Promise.resolve()
    : (async () => {
      await sendHeartbeat();
      if (stopped) return;
      heartbeatTimer = setInterval(
        () => void sendHeartbeat(),
        Number(config.heartbeatIntervalMs) || 15_000
      );
      heartbeatTimer.unref?.();
      void runClaimLoop();
    })();

  const stop = () => {
    if (stopPromise) return stopPromise;
    stopped = true;
    stopPromise = (async () => {
      if (claimTimer) clearTimeout(claimTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (heartbeatController && !heartbeatController.signal.aborted) {
        heartbeatController.abort(new Error("Arrêt du runtime worker."));
      }
      if (activeController && !activeController.signal.aborted) {
        activeController.abort(
          distributedEncodingError(
            "Le runtime worker distribué s'arrête.",
            "DISTRIBUTED_WORKER_STOPPED",
            409
          )
        );
      }
      await activeRun?.catch(() => {});
      await heartbeatInFlight?.catch(() => {});
    })();
    return stopPromise;
  };

  return {
    bootId,
    ready,
    runOneClaim,
    stop,
  };
}
