import crypto from "crypto";
import { prisma } from "../db.js";
import {
  ACTIVE_ENCODING_JOB_STATUSES,
  CLAIMABLE_ENCODING_TASK_STATUSES,
  DISTRIBUTED_ENCODING_LEASE_DURATION_MS,
  DISTRIBUTED_ENCODING_LEASE_RENEW_INTERVAL_MS,
  DISTRIBUTED_ENCODING_MAX_SLOTS,
  DISTRIBUTED_ENCODING_OFFLINE_AFTER_MS,
  DISTRIBUTED_ENCODING_PRIMARY_FALLBACK_AFTER_MS,
  DISTRIBUTED_ENCODING_PRIMARY_MAX_NOMINAL_HEIGHT,
  DISTRIBUTED_ENCODING_PROTOCOL_VERSION,
  ENCODING_ATTEMPT_STATUS,
  ENCODING_JOB_STATUS,
  ENCODING_TASK_KIND,
  ENCODING_TASK_STATUS,
  ENCODING_WORKER_ROLE,
} from "./constants.js";
import {
  hashEncodingLeaseToken,
  reclaimExpiredEncodingLeases as reclaimExpiredLeases,
} from "./persistence.js";
import {
  serializeEncodingAttempt,
  serializeEncodingJob,
  serializeEncodingTask,
} from "./serializer.js";

const { randomBytes, randomUUID } = crypto;

const field = (object, prismaName, publicName) =>
  object?.[prismaName] ?? object?.[publicName];

const timestamp = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

const workerId = (worker) =>
  String(field(worker, "VideoEncodingWorkerID", "id") || "");
const workerRole = (worker) =>
  String(field(worker, "Role", "role") || "").toUpperCase();
const taskId = (task) =>
  String(field(task, "VideoEncodingTaskID", "id") || "");
const taskKind = (task) =>
  String(field(task, "Kind", "kind") || "");
const taskHeight = (task) => Number(
  field(task, "NominalHeight", "nominalHeight") ?? 0
);
const taskWeight = (task) => Number(field(task, "Weight", "weight") ?? 0);
const taskPriority = (task) => Number(field(task, "Priority", "priority") ?? 0);

export const isEncodingWorkerOnline = (
  worker,
  {
    now = new Date(),
    offlineAfterMs = DISTRIBUTED_ENCODING_OFFLINE_AFTER_MS,
  } = {}
) => {
  if (!field(worker, "Enabled", "enabled")) return false;
  if (field(worker, "Draining", "draining")) return false;
  const heartbeat = timestamp(field(worker, "LastHeartbeatAt", "lastHeartbeatAt"));
  return heartbeat !== null
    && heartbeat >= new Date(now).getTime() - offlineAfterMs;
};

export const isEncodingWorkerCompatible = (worker, task) => {
  const protocolVersion = Number(
    field(worker, "ProtocolVersion", "protocolVersion")
  );
  if (protocolVersion !== DISTRIBUTED_ENCODING_PROTOCOL_VERSION) return false;

  const workerPipeline = String(
    field(worker, "PipelineVersion", "pipelineVersion") || ""
  );
  const taskPipeline = String(
    task?.Job?.PipelineVersion
    ?? task?.job?.pipelineVersion
    ?? task?.PipelineVersion
    ?? task?.pipelineVersion
    ?? ""
  );
  if (!workerPipeline || !taskPipeline || workerPipeline !== taskPipeline) {
    return false;
  }

  const spec = field(task, "Spec", "spec") || {};
  if (
    spec.primaryOnly === true
    && workerRole(worker) !== ENCODING_WORKER_ROLE.PRIMARY
  ) return false;

  if (taskKind(task) === ENCODING_TASK_KIND.AUDIO_RENDITION) {
    return Boolean(field(worker, "SupportsAac", "supportsAac"));
  }
  if (taskKind(task) !== ENCODING_TASK_KIND.VIDEO_PROFILE) return false;

  if (!field(worker, "SupportsH264", "supportsH264")) return false;
  if (
    spec.includeAudio !== false
    && !field(worker, "SupportsAac", "supportsAac")
  ) return false;

  // MaxNominalHeight est une limite normale pour le primary, pas une limite
  // matérielle absolue : au-delà de 360p, le garde-fou des cinq minutes
  // ci-dessous autorise explicitement le dépassement d'urgence. Pour un clone,
  // cette valeur reste une capacité stricte annoncée par le heartbeat.
  return workerRole(worker) === ENCODING_WORKER_ROLE.PRIMARY
    || Number(field(worker, "MaxNominalHeight", "maxNominalHeight") || 0)
      >= taskHeight(task);
};

export const getCompatibleCloneHeartbeatAnchor = ({
  task,
  cloneWorkers = [],
}) => {
  const heartbeats = cloneWorkers
    .filter((worker) => workerRole(worker) === ENCODING_WORKER_ROLE.CLONE)
    .filter((worker) => field(worker, "Enabled", "enabled"))
    .filter((worker) => !field(worker, "Draining", "draining"))
    .filter((worker) => isEncodingWorkerCompatible(worker, task))
    .map((worker) => timestamp(
      field(worker, "LastHeartbeatAt", "lastHeartbeatAt")
    ))
    .filter((value) => value !== null);
  return heartbeats.length > 0 ? Math.max(...heartbeats) : null;
};

export const getPrimaryFallbackAnchor = ({ task, cloneWorkers = [] }) => {
  const anchors = [
    timestamp(field(task, "CreatedAt", "createdAt")),
    timestamp(task?.Job?.NoCloneSinceAt ?? task?.job?.noCloneSinceAt),
    getCompatibleCloneHeartbeatAnchor({ task, cloneWorkers }),
  ].filter((value) => value !== null);
  return anchors.length > 0 ? Math.max(...anchors) : null;
};

export const isPrimaryHighResolutionFallbackReady = ({
  task,
  cloneWorkers = [],
  now = new Date(),
  fallbackAfterMs = DISTRIBUTED_ENCODING_PRIMARY_FALLBACK_AFTER_MS,
}) => {
  if (
    taskKind(task) !== ENCODING_TASK_KIND.VIDEO_PROFILE
    || taskHeight(task) <= DISTRIBUTED_ENCODING_PRIMARY_MAX_NOMINAL_HEIGHT
  ) {
    return true;
  }
  const anchor = getPrimaryFallbackAnchor({ task, cloneWorkers });
  return anchor !== null && new Date(now).getTime() - anchor >= fallbackAfterMs;
};

const isPreferenceAvailable = (task, worker, now) => {
  const preferredId = field(task, "PreferredWorkerID", "preferredWorkerId");
  const expiresAt = timestamp(
    field(task, "PreferenceExpiresAt", "preferenceExpiresAt")
  );
  if (!preferredId || expiresAt === null || expiresAt <= new Date(now).getTime()) {
    return true;
  }
  return String(preferredId) === workerId(worker);
};

export const canEncodingWorkerClaimTask = ({
  worker,
  task,
  cloneWorkers = [],
  now = new Date(),
}) => {
  if (!isEncodingWorkerOnline(worker, { now })) return false;
  if (!CLAIMABLE_ENCODING_TASK_STATUSES.includes(
    field(task, "Status", "status")
  )) return false;
  if (Number(field(task, "AttemptCount", "attemptCount") || 0)
      >= Number(field(task, "MaxAttempts", "maxAttempts") || 0)) return false;

  const nextEligibleAt = timestamp(
    field(task, "NextEligibleAt", "nextEligibleAt")
  );
  if (nextEligibleAt !== null && nextEligibleAt > new Date(now).getTime()) {
    return false;
  }
  if (!isPreferenceAvailable(task, worker, now)) return false;
  if (!isEncodingWorkerCompatible(worker, task)) return false;

  const job = task.Job || task.job;
  if (job) {
    if (field(job, "CancelRequested", "cancelRequested")) return false;
    if (!ACTIVE_ENCODING_JOB_STATUSES.includes(field(job, "Status", "status"))) {
      return false;
    }
  }

  if (workerRole(worker) !== ENCODING_WORKER_ROLE.PRIMARY) return true;
  return isPrimaryHighResolutionFallbackReady({ task, cloneWorkers, now });
};

const compareTaskIdentity = (left, right) =>
  taskId(left).localeCompare(taskId(right));

export const orderEncodingTasksForWorker = (tasks, worker) => {
  const role = workerRole(worker);
  return [...tasks].sort((left, right) => {
    const priorityDifference = taskPriority(right) - taskPriority(left);
    if (priorityDifference) return priorityDifference;

    const leftCost = Math.max(taskHeight(left), taskWeight(left));
    const rightCost = Math.max(taskHeight(right), taskWeight(right));
    const costDifference = role === ENCODING_WORKER_ROLE.PRIMARY
      ? leftCost - rightCost
      : rightCost - leftCost;
    return costDifference || compareTaskIdentity(left, right);
  });
};

const compareWorkersByPerformance = (left, right) => {
  const scoreDifference = Number(
    field(right, "PerformanceScore", "performanceScore") || 0
  ) - Number(field(left, "PerformanceScore", "performanceScore") || 0);
  return scoreDifference || workerId(left).localeCompare(workerId(right));
};

/**
 * Réserve la première vague : les clones, triés du plus rapide au plus lent,
 * reçoivent d'abord les rendus les plus lourds. Le principal, volontairement
 * servi en dernier, reçoit la tâche la plus légère encore disponible. Les
 * préférences expirent pour ne jamais bloquer durablement la file.
 */
export const buildInitialTaskPreferences = ({
  workers,
  tasks,
  cloneWorkers = workers,
  now = new Date(),
  preferenceDurationMs = DISTRIBUTED_ENCODING_OFFLINE_AFTER_MS,
  reservedWorkerIds = [],
}) => {
  const instant = new Date(now);
  const expiresAt = new Date(instant.getTime() + preferenceDurationMs);
  const reservedWorkers = new Set(
    [...reservedWorkerIds].map((value) => String(value))
  );
  const availableWorkers = workers
    .filter((worker) => isEncodingWorkerOnline(worker, { now: instant }))
    .filter((worker) => !reservedWorkers.has(workerId(worker)))
    .filter((worker) => Number(
      field(worker, "ActiveLeaseCount", "activeLeaseCount") || 0
    ) < DISTRIBUTED_ENCODING_MAX_SLOTS);
  const primaryWorkers = availableWorkers
    .filter((worker) => workerRole(worker) === ENCODING_WORKER_ROLE.PRIMARY)
    .sort(compareWorkersByPerformance);
  const clones = availableWorkers
    .filter((worker) => workerRole(worker) === ENCODING_WORKER_ROLE.CLONE)
    .sort(compareWorkersByPerformance);
  const remaining = new Map(tasks.map((task) => [taskId(task), task]));
  const preferences = [];

  for (const worker of clones) {
    const candidates = orderEncodingTasksForWorker(
      [...remaining.values()].filter((task) => canEncodingWorkerClaimTask({
        worker,
        task,
        cloneWorkers,
        now: instant,
      })),
      worker
    );
    if (candidates.length === 0) continue;
    const selected = candidates[0];
    remaining.delete(taskId(selected));
    preferences.push({
      taskId: taskId(selected),
      workerId: workerId(worker),
      expiresAt,
    });
  }

  for (const worker of primaryWorkers) {
    const candidates = orderEncodingTasksForWorker(
      [...remaining.values()].filter((task) => canEncodingWorkerClaimTask({
        worker,
        task,
        cloneWorkers,
        now: instant,
      })),
      worker
    );
    if (candidates.length === 0) continue;
    const selected = candidates[0];
    remaining.delete(taskId(selected));
    preferences.push({
      taskId: taskId(selected),
      workerId: workerId(worker),
      expiresAt,
    });
  }

  return preferences;
};

const attachActiveLeaseCounts = (workers, activeLeases) => {
  const counts = new Map();
  for (const lease of activeLeases) {
    const id = String(lease.AssignedWorkerID || "");
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return workers.map((worker) => ({
    ...worker,
    ActiveLeaseCount: counts.get(worker.VideoEncodingWorkerID) || 0,
  }));
};

const taskQueueWhere = (now) => ({
  Status: { in: CLAIMABLE_ENCODING_TASK_STATUSES },
  OR: [
    { NextEligibleAt: null },
    { NextEligibleAt: { lte: now } },
  ],
  Job: {
    Status: {
      in: [ENCODING_JOB_STATUS.QUEUED, ENCODING_JOB_STATUS.RUNNING],
    },
    CancelRequested: false,
  },
});

const updateJobNoCloneWindows = async ({ tx, tasks, workers, now }) => {
  const jobs = new Map();
  for (const task of tasks) {
    if (task.Job) jobs.set(task.Job.VideoEncodingJobID, task.Job);
  }

  for (const job of jobs.values()) {
    const compatibleClones = workers.filter((worker) =>
      workerRole(worker) === ENCODING_WORKER_ROLE.CLONE
      && field(worker, "Enabled", "enabled")
      && !field(worker, "Draining", "draining")
      && String(field(worker, "PipelineVersion", "pipelineVersion") || "")
        === job.PipelineVersion
    );
    const online = compatibleClones.some((worker) =>
      isEncodingWorkerOnline(worker, { now })
    );
    let noCloneSinceAt = null;
    if (!online) {
      const latestHeartbeat = compatibleClones
        .map((worker) => timestamp(worker.LastHeartbeatAt))
        .filter((value) => value !== null)
        .reduce((latest, value) => Math.max(latest, value), 0);
      noCloneSinceAt = new Date(Math.max(
        timestamp(job.CreatedAt) || 0,
        latestHeartbeat
      ));
    }
    const current = timestamp(job.NoCloneSinceAt);
    const next = timestamp(noCloneSinceAt);
    if (current === next) continue;
    await tx.videoEncodingJob.update({
      where: { VideoEncodingJobID: job.VideoEncodingJobID },
      data: { NoCloneSinceAt: noCloneSinceAt },
    });
    job.NoCloneSinceAt = noCloneSinceAt;
  }
};

export async function claimNextEncodingTask({
  instanceId,
  now = new Date(),
  database = prisma,
  tokenFactory = () => randomBytes(32).toString("base64url"),
} = {}) {
  const instant = new Date(now);
  return database.$transaction(async (tx) => {
    const worker = await tx.videoEncodingWorker.findUnique({
      where: { VideoEncodingWorkerID: String(instanceId) },
    });
    if (!worker || !isEncodingWorkerOnline(worker, { now: instant })) return null;

    const activeLeaseCount = await tx.videoEncodingTask.count({
      where: {
        AssignedWorkerID: worker.VideoEncodingWorkerID,
        Status: ENCODING_TASK_STATUS.LEASED,
        LeaseExpiresAt: { gt: instant },
      },
    });
    if (activeLeaseCount >= DISTRIBUTED_ENCODING_MAX_SLOTS) return null;

    let tasks = await tx.videoEncodingTask.findMany({
      where: taskQueueWhere(instant),
      include: { Job: true },
      orderBy: [{ Priority: "desc" }, { CreatedAt: "asc" }],
      take: 250,
    });
    if (tasks.length === 0) return null;

    const [registeredWorkers, activeLeases] = await Promise.all([
      tx.videoEncodingWorker.findMany({
        where: { Enabled: true },
      }),
      tx.videoEncodingTask.findMany({
        where: {
          Status: ENCODING_TASK_STATUS.LEASED,
          LeaseExpiresAt: { gt: instant },
        },
        select: { AssignedWorkerID: true },
      }),
    ]);
    const workers = attachActiveLeaseCounts(registeredWorkers, activeLeases);
    const cloneWorkers = workers.filter(
      (candidate) => workerRole(candidate) === ENCODING_WORKER_ROLE.CLONE
    );

    await updateJobNoCloneWindows({ tx, tasks, workers, now: instant });

    const activePreferenceWorkerIds = new Set(
      tasks
        .filter((task) => {
          const preferredId = field(
            task,
            "PreferredWorkerID",
            "preferredWorkerId"
          );
          const expiresAt = timestamp(
            field(task, "PreferenceExpiresAt", "preferenceExpiresAt")
          );
          return preferredId && expiresAt !== null && expiresAt > instant.getTime();
        })
        .map((task) => field(
          task,
          "PreferredWorkerID",
          "preferredWorkerId"
        ))
    );
    const preferences = buildInitialTaskPreferences({
      workers,
      tasks: tasks.filter((task) => {
        const preferred = task.PreferredWorkerID;
        const expiresAt = timestamp(task.PreferenceExpiresAt);
        return !preferred || expiresAt === null || expiresAt <= instant.getTime();
      }),
      cloneWorkers,
      now: instant,
      // Un worker qui possède déjà une préférence active appartient encore à
      // la première vague, même s'il n'a pas eu le temps de faire son claim.
      // Les tâches sans préférence restent donc disponibles pour le premier
      // worker qui termine réellement son encodage.
      reservedWorkerIds: activePreferenceWorkerIds,
    });
    for (const preference of preferences) {
      await tx.videoEncodingTask.updateMany({
        where: {
          VideoEncodingTaskID: preference.taskId,
          Status: { in: CLAIMABLE_ENCODING_TASK_STATUSES },
          OR: [
            { PreferredWorkerID: null },
            { PreferenceExpiresAt: null },
            { PreferenceExpiresAt: { lte: instant } },
          ],
        },
        data: {
          PreferredWorkerID: preference.workerId,
          PreferenceExpiresAt: preference.expiresAt,
        },
      });
    }

    // Recharge les préférences pour arbitrer correctement les claims concurrents.
    tasks = await tx.videoEncodingTask.findMany({
      where: taskQueueWhere(instant),
      include: { Job: true },
      orderBy: [{ Priority: "desc" }, { CreatedAt: "asc" }],
      take: 250,
    });
    const candidates = orderEncodingTasksForWorker(
      tasks.filter((task) => canEncodingWorkerClaimTask({
        worker,
        task,
        cloneWorkers,
        now: instant,
      })),
      worker
    );

    for (const candidate of candidates) {
      const leaseToken = String(tokenFactory());
      const leaseExpiresAt = new Date(
        instant.getTime() + DISTRIBUTED_ENCODING_LEASE_DURATION_MS
      );
      const claimed = await tx.videoEncodingTask.updateMany({
        where: {
          VideoEncodingTaskID: candidate.VideoEncodingTaskID,
          Status: candidate.Status,
          AttemptCount: candidate.AttemptCount,
          AssignedWorkerID: null,
          Job: {
            Status: {
              in: [ENCODING_JOB_STATUS.QUEUED, ENCODING_JOB_STATUS.RUNNING],
            },
            CancelRequested: false,
          },
          OR: [
            { PreferredWorkerID: null },
            { PreferredWorkerID: worker.VideoEncodingWorkerID },
            { PreferenceExpiresAt: null },
            { PreferenceExpiresAt: { lte: instant } },
          ],
        },
        data: {
          Status: ENCODING_TASK_STATUS.LEASED,
          AssignedWorkerID: worker.VideoEncodingWorkerID,
          LeaseTokenHash: hashEncodingLeaseToken(leaseToken),
          LeaseGeneration: { increment: 1 },
          LeaseExpiresAt: leaseExpiresAt,
          AttemptCount: { increment: 1 },
          NextEligibleAt: null,
          Progress: 0,
          ErrorMessage: null,
          StartedAt: candidate.StartedAt || instant,
        },
      });
      if (claimed.count !== 1) continue;

      const task = await tx.videoEncodingTask.findUnique({
        where: { VideoEncodingTaskID: candidate.VideoEncodingTaskID },
        include: { Job: true },
      });
      const attempt = await tx.videoEncodingTaskAttempt.create({
        data: {
          VideoEncodingTaskAttemptID: randomUUID(),
          VideoEncodingTaskID: task.VideoEncodingTaskID,
          VideoEncodingWorkerID: worker.VideoEncodingWorkerID,
          AttemptNumber: task.AttemptCount,
          LeaseGeneration: task.LeaseGeneration,
          Status: ENCODING_ATTEMPT_STATUS.RUNNING,
          LastRenewedAt: instant,
        },
      });
      await tx.videoEncodingJob.updateMany({
        where: {
          VideoEncodingJobID: task.VideoEncodingJobID,
          Status: {
            in: [
              ENCODING_JOB_STATUS.PLANNING,
              ENCODING_JOB_STATUS.QUEUED,
            ],
          },
        },
        data: {
          Status: ENCODING_JOB_STATUS.RUNNING,
          CurrentStep: "encoding",
          StartedAt: task.Job.StartedAt || instant,
        },
      });

      return {
        task,
        job: task.Job,
        attempt,
        serializedTask: serializeEncodingTask(task),
        serializedJob: serializeEncodingJob(task.Job),
        serializedAttempt: serializeEncodingAttempt(attempt),
        leaseToken,
        leaseGeneration: task.LeaseGeneration,
        leaseExpiresAt,
        renewAfterMs: DISTRIBUTED_ENCODING_LEASE_RENEW_INTERVAL_MS,
      };
    }
    return null;
  });
}

export const reclaimExpiredEncodingLeases = (options) =>
  reclaimExpiredLeases(options);

export const claimNextVideoEncodingTask = claimNextEncodingTask;
