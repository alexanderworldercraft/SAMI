import crypto from "crypto";
import { prisma } from "../db.js";
import {
  ACTIVE_ENCODING_JOB_STATUSES,
  DISTRIBUTED_ENCODING_LEASE_DURATION_MS,
  DISTRIBUTED_ENCODING_MAX_SLOTS,
  DISTRIBUTED_ENCODING_RETRY_BACKOFF_MS,
  ENCODING_ATTEMPT_STATUS,
  ENCODING_JOB_STATUS,
  ENCODING_TASK_KIND,
  ENCODING_TASK_STATUS,
  ENCODING_WORKER_ROLE,
} from "./constants.js";

const { createHash, randomUUID } = crypto;

export const VIDEO_ENCODING_TASK_PROFILE_LABEL_MAX_LENGTH = 32;

export const encodingJobWithDetails = Object.freeze({
  Tasks: {
    include: {
      Attempts: true,
    },
  },
});

export const encodingJobLifecycleDetails = Object.freeze({
  Tasks: {
    select: {
      VideoEncodingTaskID: true,
      VideoEncodingJobID: true,
      TaskKey: true,
      Kind: true,
      ProfileLabel: true,
      NominalHeight: true,
      Required: true,
      Spec: true,
      Status: true,
      ErrorMessage: true,
    },
  },
});

export class DistributedEncodingPersistenceError extends Error {
  constructor(
    message,
    {
      code = "DISTRIBUTED_ENCODING_ERROR",
      statusCode,
      retryable,
      cause,
    } = {}
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = "DistributedEncodingPersistenceError";
    this.code = code;
    if (statusCode !== undefined) this.statusCode = statusCode;
    if (retryable !== undefined) this.retryable = retryable;
  }
}

const persistenceError = (message, code, cause) =>
  new DistributedEncodingPersistenceError(message, { code, cause });

export const clampEncodingProgress = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

export const hashEncodingLeaseToken = (token) => {
  const normalized = String(token || "");
  if (normalized.length < 32) {
    throw new TypeError("Le jeton de lease d'encodage est invalide.");
  }
  return createHash("sha256").update(normalized, "utf8").digest("hex");
};

const normalizeWorkerRole = (role) => {
  const normalized = String(role || "").trim().toUpperCase();
  if (!Object.values(ENCODING_WORKER_ROLE).includes(normalized)) {
    throw new TypeError('Le rôle du worker doit valoir "PRIMARY" ou "CLONE".');
  }
  return normalized;
};

const optionalNumber = (value, field, { min = 0 } = {}) => {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min) {
    throw new TypeError(`${field} doit être un nombre supérieur ou égal à ${min}.`);
  }
  return number;
};

const mapDefined = (entries) => Object.fromEntries(
  entries.filter(([, value]) => value !== undefined)
);

const workerUpdateData = (data = {}) => mapDefined([
  ["DisplayName", data.displayName],
  ["Role", data.role === undefined ? undefined : normalizeWorkerRole(data.role)],
  ["Enabled", data.enabled],
  ["Draining", data.draining],
  ["ProtocolVersion", optionalNumber(data.protocolVersion, "protocolVersion")],
  ["PipelineVersion", data.pipelineVersion],
  ["Platform", data.platform],
  ["Architecture", data.architecture],
  ["FfmpegVersion", data.ffmpegVersion],
  ["MaxNominalHeight", optionalNumber(
    data.maxNominalHeight,
    "maxNominalHeight"
  )],
  ["SupportsH264", data.supportsH264],
  ["SupportsAac", data.supportsAac],
  // La V1 ne permet volontairement qu'un seul encodage simultané.
  ["MaxSlots", data.maxSlots === undefined
    ? undefined
    : Math.min(
      DISTRIBUTED_ENCODING_MAX_SLOTS,
      optionalNumber(data.maxSlots, "maxSlots", { min: 1 })
    )],
  ["PerformanceScore", optionalNumber(
    data.performanceScore,
    "performanceScore",
    { min: 0.001 }
  )],
  ["Capabilities", data.capabilities],
  ["BootID", data.bootId],
  ["LastHeartbeatAt", data.lastHeartbeatAt],
  ["LastError", data.lastError],
]);

export const getEncodingWorker = (
  instanceId,
  { database = prisma } = {}
) => database.videoEncodingWorker.findUnique({
  where: { VideoEncodingWorkerID: String(instanceId) },
});

export const listEncodingWorkers = (
  { includeDisabled = true, database = prisma } = {}
) => database.videoEncodingWorker.findMany({
  where: includeDisabled ? undefined : { Enabled: true },
  orderBy: [
    { Role: "asc" },
    { PerformanceScore: "desc" },
    { VideoEncodingWorkerID: "asc" },
  ],
  include: {
    _count: {
      select: {
        AssignedTasks: {
          where: {
            Status: ENCODING_TASK_STATUS.LEASED,
            LeaseExpiresAt: { gt: new Date() },
          },
        },
      },
    },
  },
});

export async function upsertEncodingWorker(
  { instanceId, ...data },
  { database = prisma } = {}
) {
  const id = String(instanceId || "").trim();
  if (!id) throw new TypeError("instanceId est requis.");
  const mapped = workerUpdateData(data);
  const role = mapped.Role ?? normalizeWorkerRole(data.role);
  const pipelineVersion = String(mapped.PipelineVersion || "").trim();
  if (!pipelineVersion) throw new TypeError("pipelineVersion est requise.");

  return database.videoEncodingWorker.upsert({
    where: { VideoEncodingWorkerID: id },
    create: {
      VideoEncodingWorkerID: id,
      ...mapped,
      Role: role,
      PipelineVersion: pipelineVersion,
      Enabled: data.enabled ?? false,
      MaxSlots: DISTRIBUTED_ENCODING_MAX_SLOTS,
    },
    update: mapped,
  });
}

export function updateEncodingWorker(
  instanceId,
  data,
  { database = prisma } = {}
) {
  return database.videoEncodingWorker.update({
    where: { VideoEncodingWorkerID: String(instanceId) },
    data: workerUpdateData(data),
  });
}

export async function heartbeatEncodingWorker(
  instanceId,
  heartbeat = {},
  { now = new Date(), database = prisma } = {}
) {
  const mutableCapabilityFields = workerUpdateData({
    protocolVersion: heartbeat.protocolVersion,
    pipelineVersion: heartbeat.pipelineVersion,
    platform: heartbeat.platform,
    architecture: heartbeat.architecture,
    ffmpegVersion: heartbeat.ffmpegVersion,
    // MaxNominalHeight est un plafond administrateur. La capacité détectée
    // reste dans Capabilities et un heartbeat ne peut jamais élargir ce plafond.
    supportsH264: heartbeat.supportsH264,
    supportsAac: heartbeat.supportsAac,
    maxSlots: heartbeat.maxSlots,
    capabilities: heartbeat.capabilities,
    bootId: heartbeat.bootId,
    lastError: heartbeat.lastError ?? null,
  });
  const result = await database.videoEncodingWorker.updateMany({
    where: {
      VideoEncodingWorkerID: String(instanceId),
      Enabled: true,
    },
    data: {
      ...mutableCapabilityFields,
      LastHeartbeatAt: new Date(now),
    },
  });
  if (result.count !== 1) {
    throw persistenceError(
      "Le worker d'encodage n'existe pas ou est désactivé.",
      "ENCODING_WORKER_NOT_ENABLED"
    );
  }
  return getEncodingWorker(instanceId, { database });
}

export const getJobWithDetails = (
  jobId,
  { database = prisma } = {}
) => database.videoEncodingJob.findUnique({
  where: { VideoEncodingJobID: String(jobId) },
  include: encodingJobWithDetails,
});

export const getJobForLifecycle = (
  jobId,
  { database = prisma } = {}
) => database.videoEncodingJob.findUnique({
  where: { VideoEncodingJobID: String(jobId) },
  include: encodingJobLifecycleDetails,
});

export const listActiveJobs = (
  { database = prisma, limit = 100 } = {}
) => database.videoEncodingJob.findMany({
  where: { Status: { in: ACTIVE_ENCODING_JOB_STATUSES } },
  orderBy: { UpdatedAt: "asc" },
  take: Math.max(1, Math.min(500, Number(limit) || 100)),
  include: encodingJobWithDetails,
});

export function createEncodingJob(data, { database = prisma } = {}) {
  return database.videoEncodingJob.create({
    data: {
      VideoEncodingJobID: data.id || randomUUID(),
      VideoID: data.videoId ?? null,
      IdempotencyKey: data.idempotencyKey ?? null,
      InitiatedByUserID: data.initiatedByUserId ?? null,
      Status: data.status || ENCODING_JOB_STATUS.INGESTING,
      CurrentStep: data.currentStep ?? "ingest",
      Progress: clampEncodingProgress(data.progress ?? 0),
      SourceRelativePath: data.sourceRelativePath,
      SourceOriginalName: data.sourceOriginalName,
      SourceSize: BigInt(data.sourceSize),
      SourceSha256: data.sourceSha256,
      SourceMetadata: data.sourceMetadata ?? undefined,
      RequestSnapshot: data.requestSnapshot || {},
      PipelineVersion: data.pipelineVersion,
      EncodingSpecHash: data.encodingSpecHash,
      Warnings: data.warnings ?? [],
      NoCloneSinceAt: data.noCloneSinceAt ?? null,
      StartedAt: data.startedAt ?? null,
    },
    include: encodingJobWithDetails,
  });
}

const encodingJobUpdateData = (data = {}) => mapDefined([
  ["VideoID", data.videoId],
  ["Status", data.status],
  ["CurrentStep", data.currentStep],
  ["Progress", data.progress === undefined
    ? undefined
    : clampEncodingProgress(data.progress)],
  ["SourceRelativePath", data.sourceRelativePath],
  ["SourceOriginalName", data.sourceOriginalName],
  ["SourceSize", data.sourceSize === undefined
    ? undefined
    : BigInt(data.sourceSize)],
  ["SourceSha256", data.sourceSha256],
  ["SourceMetadata", data.sourceMetadata],
  ["RequestSnapshot", data.requestSnapshot],
  ["PipelineVersion", data.pipelineVersion],
  ["EncodingSpecHash", data.encodingSpecHash],
  ["CancelRequested", data.cancelRequested],
  ["ErrorMessage", data.errorMessage],
  ["Warnings", data.warnings],
  ["NoCloneSinceAt", data.noCloneSinceAt],
  ["StartedAt", data.startedAt],
  ["CompletedAt", data.completedAt],
]);

export function updateEncodingJob(
  jobId,
  data,
  { database = prisma } = {}
) {
  return database.videoEncodingJob.update({
    where: { VideoEncodingJobID: String(jobId) },
    data: encodingJobUpdateData(data),
    include: encodingJobWithDetails,
  });
}

export function createEncodingTasks(
  jobId,
  tasks,
  { database = prisma } = {}
) {
  for (const [index, task] of tasks.entries()) {
    const profileLabel = task.profileLabel == null
      ? null
      : String(task.profileLabel);
    const profileLabelLength = profileLabel == null
      ? 0
      : Array.from(profileLabel).length;
    if (profileLabelLength > VIDEO_ENCODING_TASK_PROFILE_LABEL_MAX_LENGTH) {
      throw new DistributedEncodingPersistenceError(
        `Le libellé technique de la tâche ${task.key || index + 1} dépasse `
          + `${VIDEO_ENCODING_TASK_PROFILE_LABEL_MAX_LENGTH} caractères `
          + `(${profileLabelLength} caractères reçus). Le job n'a pas été créé.`,
        {
          code: "VIDEO_ENCODING_TASK_PROFILE_LABEL_TOO_LONG",
          statusCode: 500,
          retryable: false,
        }
      );
    }
  }

  return database.videoEncodingTask.createMany({
    data: tasks.map((task, index) => ({
      VideoEncodingTaskID: task.id || randomUUID(),
      VideoEncodingJobID: String(jobId),
      TaskKey: task.key,
      Kind: task.kind || ENCODING_TASK_KIND.VIDEO_PROFILE,
      ProfileLabel: task.profileLabel ?? null,
      NominalHeight: task.nominalHeight ?? null,
      Priority: task.priority ?? 0,
      Weight: BigInt(task.weight ?? task.nominalHeight ?? index),
      Required: task.required ?? true,
      Spec: task.spec || {},
      SpecHash: task.specHash,
      Status: task.status || ENCODING_TASK_STATUS.PENDING,
      PreferredWorkerID: task.preferredWorkerId ?? null,
      PreferenceExpiresAt: task.preferenceExpiresAt ?? null,
      MaxAttempts: task.maxAttempts ?? 4,
      NextEligibleAt: task.nextEligibleAt ?? null,
    })),
  });
}

export function updateEncodingTask(
  taskId,
  data,
  { database = prisma } = {}
) {
  return database.videoEncodingTask.update({
    where: { VideoEncodingTaskID: String(taskId) },
    data: mapDefined([
      ["Status", data.status],
      ["Phase", data.phase],
      ["Progress", data.progress === undefined
        ? undefined
        : clampEncodingProgress(data.progress)],
      ["NextEligibleAt", data.nextEligibleAt],
      ["ArtifactManifest", data.artifactManifest],
      ["ArtifactManifestHash", data.artifactManifestHash],
      ["ErrorMessage", data.errorMessage],
      ["StartedAt", data.startedAt],
      ["CompletedAt", data.completedAt],
    ]),
  });
}

const leaseLost = () => persistenceError(
  "Le lease d'encodage n'est plus valide.",
  "ENCODING_LEASE_LOST"
);

export async function renewEncodingTaskLease(
  {
    taskId,
    workerId,
    leaseToken,
    leaseGeneration,
    progress,
    phase,
  },
  {
    now = new Date(),
    leaseDurationMs = DISTRIBUTED_ENCODING_LEASE_DURATION_MS,
    database = prisma,
  } = {}
) {
  const instant = new Date(now);
  const leaseExpiresAt = new Date(instant.getTime() + leaseDurationMs);
  const tokenHash = hashEncodingLeaseToken(leaseToken);

  return database.$transaction(async (tx) => {
    const claimed = await tx.videoEncodingTask.updateMany({
      where: {
        VideoEncodingTaskID: String(taskId),
        AssignedWorkerID: String(workerId),
        Status: ENCODING_TASK_STATUS.LEASED,
        LeaseTokenHash: tokenHash,
        LeaseGeneration: Number(leaseGeneration),
        LeaseExpiresAt: { gt: instant },
      },
      data: {
        LeaseExpiresAt: leaseExpiresAt,
        ...(progress === undefined
          ? {}
          : { Progress: clampEncodingProgress(progress) }),
        ...(phase === undefined ? {} : { Phase: phase }),
      },
    });
    if (claimed.count !== 1) throw leaseLost();

    await tx.videoEncodingTaskAttempt.updateMany({
      where: {
        VideoEncodingTaskID: String(taskId),
        VideoEncodingWorkerID: String(workerId),
        LeaseGeneration: Number(leaseGeneration),
        Status: ENCODING_ATTEMPT_STATUS.RUNNING,
      },
      data: {
        LastRenewedAt: instant,
        ...(progress === undefined
          ? {}
          : { Progress: clampEncodingProgress(progress) }),
      },
    });

    // Un renouvellement de lease signé avec sa progression constitue aussi un
    // signe de vie du clone. Le garde-fou des cinq minutes du primary ne doit
    // donc jamais se déclencher pendant qu'un worker avance réellement, même
    // si son heartbeat périodique a été momentanément retardé.
    await tx.videoEncodingWorker.updateMany({
      where: {
        VideoEncodingWorkerID: String(workerId),
        Enabled: true,
      },
      data: { LastHeartbeatAt: instant },
    });

    return tx.videoEncodingTask.findUnique({
      where: { VideoEncodingTaskID: String(taskId) },
    });
  });
}

export async function completeEncodingTaskLease(
  {
    taskId,
    workerId,
    leaseToken,
    leaseGeneration,
    artifactManifest,
    artifactManifestHash,
  },
  { now = new Date(), database = prisma } = {}
) {
  const instant = new Date(now);
  const tokenHash = hashEncodingLeaseToken(leaseToken);

  return database.$transaction(async (tx) => {
    const completed = await tx.videoEncodingTask.updateMany({
      where: {
        VideoEncodingTaskID: String(taskId),
        AssignedWorkerID: String(workerId),
        Status: ENCODING_TASK_STATUS.LEASED,
        LeaseTokenHash: tokenHash,
        LeaseGeneration: Number(leaseGeneration),
        LeaseExpiresAt: { gt: instant },
      },
      data: {
        Status: ENCODING_TASK_STATUS.SUCCEEDED,
        Progress: 100,
        ArtifactManifest: artifactManifest,
        ArtifactManifestHash: artifactManifestHash,
        LeaseTokenHash: null,
        LeaseExpiresAt: null,
        CompletedAt: instant,
      },
    });
    if (completed.count !== 1) throw leaseLost();

    await tx.videoEncodingTaskAttempt.updateMany({
      where: {
        VideoEncodingTaskID: String(taskId),
        VideoEncodingWorkerID: String(workerId),
        LeaseGeneration: Number(leaseGeneration),
        Status: ENCODING_ATTEMPT_STATUS.RUNNING,
      },
      data: {
        Status: ENCODING_ATTEMPT_STATUS.SUCCEEDED,
        Progress: 100,
        ManifestHash: artifactManifestHash,
        CompletedAt: instant,
      },
    });

    return tx.videoEncodingTask.findUnique({
      where: { VideoEncodingTaskID: String(taskId) },
    });
  });
}

const getRetryDelayMs = (attemptCount) => {
  const index = Math.max(
    0,
    Math.min(
      DISTRIBUTED_ENCODING_RETRY_BACKOFF_MS.length - 1,
      Number(attemptCount || 1) - 1
    )
  );
  return DISTRIBUTED_ENCODING_RETRY_BACKOFF_MS[index];
};

const transitionEncodingTaskLease = async ({
  taskId,
  workerId,
  leaseToken,
  leaseGeneration,
  errorMessage,
  attemptStatus,
  cancelTask = false,
  now = new Date(),
  database = prisma,
}) => {
  const instant = new Date(now);
  const tokenHash = hashEncodingLeaseToken(leaseToken);

  return database.$transaction(async (tx) => {
    const current = await tx.videoEncodingTask.findUnique({
      where: { VideoEncodingTaskID: String(taskId) },
      select: {
        AttemptCount: true,
        MaxAttempts: true,
      },
    });
    if (!current) throw leaseLost();

    const canRetry = !cancelTask && current.AttemptCount < current.MaxAttempts;
    const nextEligibleAt = canRetry
      ? new Date(instant.getTime() + getRetryDelayMs(current.AttemptCount))
      : null;
    const nextStatus = cancelTask
      ? ENCODING_TASK_STATUS.CANCELLED
      : canRetry
        ? ENCODING_TASK_STATUS.RETRY_WAIT
        : ENCODING_TASK_STATUS.FAILED;
    const changed = await tx.videoEncodingTask.updateMany({
      where: {
        VideoEncodingTaskID: String(taskId),
        AssignedWorkerID: String(workerId),
        Status: ENCODING_TASK_STATUS.LEASED,
        LeaseTokenHash: tokenHash,
        LeaseGeneration: Number(leaseGeneration),
        LeaseExpiresAt: { gt: instant },
      },
      data: {
        Status: nextStatus,
        AssignedWorkerID: null,
        LeaseTokenHash: null,
        LeaseExpiresAt: null,
        NextEligibleAt: nextEligibleAt,
        Phase: null,
        Progress: 0,
        ArtifactManifest: null,
        ArtifactManifestHash: null,
        ErrorMessage: errorMessage || null,
        ...(canRetry ? {} : { CompletedAt: instant }),
      },
    });
    if (changed.count !== 1) throw leaseLost();

    await tx.videoEncodingTaskAttempt.updateMany({
      where: {
        VideoEncodingTaskID: String(taskId),
        VideoEncodingWorkerID: String(workerId),
        LeaseGeneration: Number(leaseGeneration),
        Status: ENCODING_ATTEMPT_STATUS.RUNNING,
      },
      data: {
        Status: attemptStatus,
        ErrorMessage: errorMessage || null,
        CompletedAt: instant,
      },
    });
    return tx.videoEncodingTask.findUnique({
      where: { VideoEncodingTaskID: String(taskId) },
    });
  });
};

export const failEncodingTaskLease = (
  {
    taskId,
    workerId,
    leaseToken,
    leaseGeneration,
    errorMessage,
  },
  options = {}
) => transitionEncodingTaskLease({
  taskId,
  workerId,
  leaseToken,
  leaseGeneration,
  errorMessage,
  attemptStatus: ENCODING_ATTEMPT_STATUS.FAILED,
  ...options,
});

export const releaseEncodingTaskLease = (
  {
    taskId,
    workerId,
    leaseToken,
    leaseGeneration,
    reason,
    cancelTask = false,
  },
  options = {}
) => transitionEncodingTaskLease({
  taskId,
  workerId,
  leaseToken,
  leaseGeneration,
  errorMessage: reason,
  attemptStatus: ENCODING_ATTEMPT_STATUS.CANCELLED,
  cancelTask,
  ...options,
});

export async function recalculateEncodingJobProgress(
  jobId,
  { database = prisma } = {}
) {
  const tasks = await database.videoEncodingTask.findMany({
    where: {
      VideoEncodingJobID: String(jobId),
      Required: true,
    },
    select: {
      Weight: true,
      Progress: true,
      Status: true,
    },
  });
  let totalWeight = 0n;
  let completedWeight = 0n;
  for (const task of tasks) {
    const weight = BigInt(task.Weight) > 0n ? BigInt(task.Weight) : 1n;
    const progress = task.Status === ENCODING_TASK_STATUS.SUCCEEDED
      ? 100
      : clampEncodingProgress(task.Progress);
    totalWeight += weight;
    completedWeight += weight * BigInt(progress);
  }
  const progress = totalWeight > 0n
    ? Number(completedWeight / totalWeight)
    : 0;
  return database.videoEncodingJob.update({
    where: { VideoEncodingJobID: String(jobId) },
    data: { Progress: clampEncodingProgress(progress) },
  });
}

export async function reclaimExpiredEncodingLeases(
  { now = new Date(), database = prisma } = {}
) {
  const instant = new Date(now);
  const expired = await database.videoEncodingTask.findMany({
    where: {
      Status: ENCODING_TASK_STATUS.LEASED,
      LeaseExpiresAt: { lte: instant },
    },
    select: {
      VideoEncodingTaskID: true,
      LeaseGeneration: true,
      AttemptCount: true,
      MaxAttempts: true,
    },
  });

  let reclaimed = 0;
  for (const task of expired) {
    const retry = task.AttemptCount < task.MaxAttempts;
    const nextEligibleAt = retry
      ? new Date(instant.getTime() + getRetryDelayMs(task.AttemptCount))
      : null;
    const changed = await database.$transaction(async (tx) => {
      const result = await tx.videoEncodingTask.updateMany({
        where: {
          VideoEncodingTaskID: task.VideoEncodingTaskID,
          Status: ENCODING_TASK_STATUS.LEASED,
          LeaseGeneration: task.LeaseGeneration,
          LeaseExpiresAt: { lte: instant },
        },
        data: {
          Status: retry
            ? ENCODING_TASK_STATUS.RETRY_WAIT
            : ENCODING_TASK_STATUS.FAILED,
          AssignedWorkerID: null,
          LeaseTokenHash: null,
          LeaseExpiresAt: null,
          NextEligibleAt: nextEligibleAt,
          Phase: null,
          Progress: 0,
          ArtifactManifest: null,
          ArtifactManifestHash: null,
          ErrorMessage: "Le worker n'a pas renouvelé son lease à temps.",
          ...(retry ? {} : { CompletedAt: instant }),
        },
      });
      if (result.count !== 1) return false;

      await tx.videoEncodingTaskAttempt.updateMany({
        where: {
          VideoEncodingTaskID: task.VideoEncodingTaskID,
          LeaseGeneration: task.LeaseGeneration,
          Status: ENCODING_ATTEMPT_STATUS.RUNNING,
        },
        data: {
          Status: ENCODING_ATTEMPT_STATUS.EXPIRED,
          ErrorMessage: "Lease expiré.",
          CompletedAt: instant,
        },
      });
      return true;
    });
    if (changed) reclaimed += 1;
  }
  return reclaimed;
}

export async function consumeEncodingRequestNonce(
  {
    workerId,
    nonce,
    expiresAt,
  },
  { now = new Date(), database = prisma } = {}
) {
  const normalizedNonce = String(nonce || "");
  if (normalizedNonce.length < 16 || normalizedNonce.length > 128) {
    throw new TypeError("Le nonce d'encodage est invalide.");
  }
  const expiration = new Date(expiresAt);
  if (!Number.isFinite(expiration.getTime()) || expiration <= new Date(now)) {
    throw new TypeError("L'expiration du nonce d'encodage est invalide.");
  }

  try {
    return await database.videoEncodingRequestNonce.create({
      data: {
        VideoEncodingWorkerID: String(workerId),
        Nonce: normalizedNonce,
        ExpiresAt: expiration,
      },
    });
  } catch (cause) {
    if (cause?.code === "P2002") {
      throw persistenceError(
        "Cette requête d'encodage a déjà été utilisée.",
        "ENCODING_NONCE_REPLAYED",
        cause
      );
    }
    throw cause;
  }
}

export const pruneExpiredEncodingRequestNonces = (
  { now = new Date(), database = prisma } = {}
) => database.videoEncodingRequestNonce.deleteMany({
  where: { ExpiresAt: { lte: new Date(now) } },
});

export async function listPurgeableEncodingSourceHashesForWorker(
  workerId,
  { database = prisma, limit = 250 } = {}
) {
  const jobs = await database.videoEncodingJob.findMany({
    where: {
      OR: [
        { Status: ENCODING_JOB_STATUS.COMPLETED },
        { Status: ENCODING_JOB_STATUS.CANCELLED },
        {
          Status: ENCODING_JOB_STATUS.FAILED,
          CurrentStep: "expired",
        },
      ],
      Tasks: {
        some: {
          Attempts: {
            some: { VideoEncodingWorkerID: String(workerId) },
          },
        },
      },
    },
    select: { SourceSha256: true },
    orderBy: { UpdatedAt: "desc" },
    take: Math.max(1, Math.min(1_000, Number(limit) || 250)),
  });
  return Array.from(new Set(jobs.map((job) => job.SourceSha256)));
}

// Alias longs pour rester explicite dans les couches HTTP et orchestration.
export const getVideoEncodingWorker = getEncodingWorker;
export const listVideoEncodingWorkers = listEncodingWorkers;
export const upsertVideoEncodingWorker = upsertEncodingWorker;
export const updateVideoEncodingWorker = updateEncodingWorker;
export const heartbeatVideoEncodingWorker = heartbeatEncodingWorker;
export const listActiveVideoEncodingJobs = listActiveJobs;
export const getVideoEncodingJobWithDetails = getJobWithDetails;
export const createVideoEncodingJob = createEncodingJob;
export const updateVideoEncodingJob = updateEncodingJob;
