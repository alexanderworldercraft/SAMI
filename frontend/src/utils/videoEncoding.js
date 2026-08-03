export const VIDEO_ENCODING_POLL_INTERVAL_MS = 2000;

export const NO_ENCODING_WORKER_MESSAGE =
  "Aucun clone d’encodage n’est actuellement disponible. Vérifiez leur connexion ou utilisez l’ajout classique.";

export const DISTRIBUTED_ENCODING_TOOLTIP =
  "Répartit l’encodage des différentes résolutions entre le serveur principal et les clones disponibles. Cette fonctionnalité expérimentale est réservée au super administrateur.";

const asNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asOptionalNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const clampEncodingProgress = (value) =>
  Math.min(100, Math.max(0, Math.round(asNumber(value, 0))));

export const unwrapVideoEncodingConfig = (payload) =>
  payload?.config || payload?.data?.config || payload?.data || payload || null;

export const getVideoEncodingWorkers = (payload) => {
  const workers = payload?.workers || payload?.data?.workers || payload?.data || payload;
  return Array.isArray(workers) ? workers.map(normalizeVideoEncodingWorker) : [];
};

export const normalizeVideoEncodingWorker = (worker = {}) => ({
  ...worker,
  id: String(
    worker.id
      ?? worker.instanceId
      ?? worker.InstanceID
      ?? worker.workerId
      ?? ""
  ),
  displayName:
    worker.displayName
    || worker.name
    || worker.instanceId
    || worker.InstanceID
    || worker.id
    || "Clone",
  role: String(worker.role || worker.instanceRole || "clone").toLowerCase(),
  status: String(worker.status || worker.state || "offline").toLowerCase(),
  enabled: worker.enabled !== false,
  draining: Boolean(worker.draining),
  maxSlots: Math.max(0, Math.round(asNumber(worker.maxSlots, 0))),
  activeLeaseCount: Math.max(0, Math.round(asNumber(worker.activeLeaseCount, 0))),
});

export const isPrimaryVideoEncodingConfig = (config) =>
  String(config?.instanceRole || config?.role || "").toLowerCase() === "primary";

export const isVideoEncodingEnabled = (config) =>
  Boolean(config?.enabled ?? config?.active);

const ONLINE_WORKER_STATUSES = new Set(["online", "available", "active", "busy"]);

export const isAvailableEncodingClone = (worker) => {
  const normalized = normalizeVideoEncodingWorker(worker);
  return normalized.role !== "primary"
    && normalized.enabled
    && !normalized.draining
    && ONLINE_WORKER_STATUSES.has(normalized.status);
};

export const countAvailableEncodingClones = (workers) =>
  (Array.isArray(workers) ? workers : []).filter(isAvailableEncodingClone).length;

export const getVideoEncodingJobId = (job) => {
  const value = job?.id
    ?? job?.jobId
    ?? job?.VideoEncodingJobID
    ?? job?.DistributedVideoJobID;
  return value === undefined || value === null ? "" : String(value);
};

export const normalizeVideoEncodingTask = (task = {}) => ({
  ...task,
  id: String(task.id ?? task.taskId ?? task.VideoEncodingTaskID ?? task.key ?? ""),
  key: String(task.key ?? task.taskKey ?? task.StepKey ?? task.id ?? "task"),
  kind: String(task.kind || task.type || "profile").toLowerCase(),
  profileLabel:
    task.profileLabel
    || task.profile?.label
    || task.resolution
    || task.label
    || task.key
    || "Profil",
  status: String(task.status || task.state || "pending").toLowerCase(),
  phase: String(task.phase || task.currentStep || task.statusLabel || "").toLowerCase(),
  assignedWorkerId:
    task.assignedWorkerId
    ?? task.workerId
    ?? task.WorkerInstanceID
    ?? null,
  progress: clampEncodingProgress(task.progress ?? task.Progress),
  error: task.error || task.errorMessage || task.ErrorMessage || null,
  attemptCount: Math.max(0, Math.round(asNumber(task.attemptCount ?? task.attempt, 0))),
  maxAttempts: Math.max(0, Math.round(asNumber(task.maxAttempts, 0))),
  startedAt: task.startedAt ?? task.StartedAt ?? null,
  completedAt: task.completedAt ?? task.CompletedAt ?? null,
  createdAt: task.createdAt ?? task.CreatedAt ?? null,
  updatedAt: task.updatedAt ?? task.UpdatedAt ?? null,
});

export const normalizeVideoEncodingJob = (job = {}) => ({
  ...job,
  id: getVideoEncodingJobId(job),
  title:
    job.title
    || job.titre
    || job.Titre
    || job.video?.Titre
    || job.video?.title
    || job.sourceOriginalName
    || "Encodage multi-server",
  video: job.video && typeof job.video === "object"
    ? job.video
    : null,
  status: String(job.status || job.state || "queued").toLowerCase(),
  currentStep: job.currentStep || job.step || null,
  progress: clampEncodingProgress(job.progress ?? job.Progress),
  error: job.error || job.errorMessage || job.ErrorMessage || null,
  warnings: Array.isArray(job.warnings) ? job.warnings : [],
  startedAt: job.startedAt ?? job.StartedAt ?? null,
  completedAt: job.completedAt ?? job.CompletedAt ?? null,
  createdAt: job.createdAt ?? job.CreatedAt ?? null,
  updatedAt: job.updatedAt ?? job.UpdatedAt ?? null,
  elapsedMs: asOptionalNumber(job.elapsedMs),
  elapsedReceivedAt:
    job.elapsedReceivedAt
    ?? (asOptionalNumber(job.elapsedMs) !== null ? Date.now() : null),
  tasks: (Array.isArray(job.tasks) ? job.tasks : Array.isArray(job.Tasks) ? job.Tasks : [])
    .map(normalizeVideoEncodingTask),
});

export const getVideoEncodingJobs = (payload) => {
  const jobs = payload?.jobs || payload?.data?.jobs || payload?.data || payload;
  return Array.isArray(jobs) ? jobs.map(normalizeVideoEncodingJob) : [];
};

export const unwrapVideoEncodingJob = (payload) => {
  const job = payload?.job || payload?.data?.job || payload?.data || payload;
  return job && typeof job === "object" ? normalizeVideoEncodingJob(job) : null;
};

export const TERMINAL_VIDEO_ENCODING_STATUSES = new Set([
  "cancelled",
  "canceled",
  "completed",
  "failed",
  "error",
  "succeeded",
]);

export const DISMISSIBLE_VIDEO_ENCODING_STATUSES = new Set([
  "cancelled",
  "canceled",
  "completed",
  "succeeded",
]);

export const isTerminalVideoEncodingJob = (job) =>
  TERMINAL_VIDEO_ENCODING_STATUSES.has(
    String(job?.status || job?.state || "").toLowerCase()
  );

export const isDismissibleVideoEncodingJob = (job) =>
  DISMISSIBLE_VIDEO_ENCODING_STATUSES.has(
    String(job?.status || job?.state || "").toLowerCase()
  );

export const mergeVideoEncodingJobs = (currentJobs, incomingJobs, limit = 6) => {
  const byId = new Map();
  for (const rawJob of [...(currentJobs || []), ...(incomingJobs || [])]) {
    const job = normalizeVideoEncodingJob(rawJob);
    if (!job.id) continue;
    const previous = byId.get(job.id);
    byId.set(job.id, previous
      ? {
          ...previous,
          ...job,
          tasks: job.tasks.length > 0 ? job.tasks : previous.tasks,
        }
      : job);
  }

  return Array.from(byId.values())
    .sort((left, right) => {
      const leftDate = new Date(left.updatedAt || left.createdAt || 0).getTime();
      const rightDate = new Date(right.updatedAt || right.createdAt || 0).getTime();
      return rightDate - leftDate;
    })
    .slice(0, limit);
};
