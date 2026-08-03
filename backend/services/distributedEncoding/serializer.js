import {
  ACTIVE_ENCODING_JOB_STATUSES,
  DISTRIBUTED_ENCODING_OFFLINE_AFTER_MS,
  ENCODING_WORKER_ROLE,
} from "./constants.js";

export const toEncodingJsonValue = (value) => {
  if (value === undefined || value === null) return value ?? null;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toEncodingJsonValue);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        toEncodingJsonValue(nested),
      ])
    );
  }
  return value;
};

export const getEncodingWorkerStatus = (
  worker,
  { now = new Date(), offlineAfterMs = DISTRIBUTED_ENCODING_OFFLINE_AFTER_MS } = {}
) => {
  if (!worker?.Enabled) return "disabled";
  if (worker.Draining) return "draining";
  const heartbeat = worker.LastHeartbeatAt
    ? new Date(worker.LastHeartbeatAt).getTime()
    : Number.NaN;
  return Number.isFinite(heartbeat)
    && heartbeat >= new Date(now).getTime() - offlineAfterMs
    ? "online"
    : "offline";
};

export const serializeEncodingWorker = (worker, options = {}) =>
  toEncodingJsonValue({
    id: worker.VideoEncodingWorkerID,
    displayName: worker.DisplayName || null,
    role: String(worker.Role || "").toUpperCase(),
    enabled: worker.Enabled,
    draining: worker.Draining,
    status: getEncodingWorkerStatus(worker, options),
    protocolVersion: worker.ProtocolVersion,
    pipelineVersion: worker.PipelineVersion,
    platform: worker.Platform || null,
    architecture: worker.Architecture || null,
    ffmpegVersion: worker.FfmpegVersion || null,
    maxNominalHeight: worker.MaxNominalHeight,
    supportsH264: worker.SupportsH264,
    supportsAac: worker.SupportsAac,
    maxSlots: worker.MaxSlots,
    performanceScore: worker.PerformanceScore,
    capabilities: worker.Capabilities || {},
    bootId: worker.BootID || null,
    lastHeartbeatAt: worker.LastHeartbeatAt || null,
    lastError: worker.LastError || null,
    activeLeaseCount:
      worker._count?.AssignedTasks
      ?? worker.ActiveLeaseCount
      ?? 0,
    createdAt: worker.CreatedAt,
    updatedAt: worker.UpdatedAt,
  });

export const serializeEncodingArtifact = (file) =>
  toEncodingJsonValue({
    id: file.VideoEncodingArtifactFileID,
    attemptId: file.VideoEncodingTaskAttemptID,
    relativePath: file.RelativePath,
    size: file.Size,
    sha256: file.Sha256,
    status: file.Status,
    bytesReceived: file.BytesReceived,
    createdAt: file.CreatedAt,
    updatedAt: file.UpdatedAt,
  });

export const serializeEncodingAttempt = (attempt) =>
  toEncodingJsonValue({
    id: attempt.VideoEncodingTaskAttemptID,
    taskId: attempt.VideoEncodingTaskID,
    workerId: attempt.VideoEncodingWorkerID,
    attemptNumber: attempt.AttemptNumber,
    leaseGeneration: attempt.LeaseGeneration,
    status: attempt.Status,
    progress: attempt.Progress,
    manifestHash: attempt.ManifestHash || null,
    error: attempt.ErrorMessage || null,
    startedAt: attempt.StartedAt,
    lastRenewedAt: attempt.LastRenewedAt || null,
    completedAt: attempt.CompletedAt || null,
    createdAt: attempt.CreatedAt,
    updatedAt: attempt.UpdatedAt,
    files: (attempt.Files || []).map(serializeEncodingArtifact),
  });

export const serializeEncodingTask = (task) =>
  toEncodingJsonValue({
    id: task.VideoEncodingTaskID,
    jobId: task.VideoEncodingJobID,
    key: task.TaskKey,
    kind: task.Kind,
    profileLabel: task.ProfileLabel || null,
    nominalHeight: task.NominalHeight ?? null,
    priority: task.Priority,
    weight: task.Weight,
    required: task.Required,
    spec: task.Spec,
    specHash: task.SpecHash,
    status: task.Status,
    phase: task.Phase || null,
    assignedWorkerId: task.AssignedWorkerID || null,
    preferredWorkerId: task.PreferredWorkerID || null,
    preferenceExpiresAt: task.PreferenceExpiresAt || null,
    leaseGeneration: task.LeaseGeneration,
    leaseExpiresAt: task.LeaseExpiresAt || null,
    attemptCount: task.AttemptCount,
    maxAttempts: task.MaxAttempts,
    nextEligibleAt: task.NextEligibleAt || null,
    progress: task.Progress,
    artifactManifest: task.ArtifactManifest || null,
    artifactManifestHash: task.ArtifactManifestHash || null,
    error: task.ErrorMessage || null,
    startedAt: task.StartedAt || null,
    completedAt: task.CompletedAt || null,
    createdAt: task.CreatedAt,
    updatedAt: task.UpdatedAt,
    attempts: (task.Attempts || []).map(serializeEncodingAttempt),
  });

export const serializeEncodingJob = (job, { now = new Date() } = {}) => {
  const snapshot = job.RequestSnapshot || {};
  const startedAt = job.StartedAt || job.CreatedAt || null;
  const completedAt = job.CompletedAt || null;
  const isActive = ACTIVE_ENCODING_JOB_STATUSES.includes(job.Status);
  const startTimestamp = startedAt ? new Date(startedAt).getTime() : null;
  const elapsedEnd = completedAt || (!isActive ? job.UpdatedAt : null) || now;
  const endTimestamp = new Date(elapsedEnd).getTime();
  const elapsedMs = Number.isFinite(startTimestamp) && Number.isFinite(endTimestamp)
    ? Math.max(0, endTimestamp - startTimestamp)
    : null;

  return toEncodingJsonValue({
    id: job.VideoEncodingJobID,
    title: snapshot.title || job.SourceOriginalName,
    videoId: job.VideoID ?? null,
    initiatedByUserId: job.InitiatedByUserID ?? null,
    status: job.Status,
    currentStep: job.CurrentStep || null,
    progress: job.Progress,
    sourceOriginalName: job.SourceOriginalName,
    sourceSize: job.SourceSize,
    sourceSha256: job.SourceSha256,
    sourceMetadata: job.SourceMetadata || null,
    request: snapshot,
    video: {
      titre: snapshot.title || job.SourceOriginalName,
      audio: snapshot.audio || null,
      audioTracks: Array.isArray(snapshot.audioTracks)
        ? snapshot.audioTracks
        : [],
      subtitles: Array.isArray(snapshot.subtitles)
        ? snapshot.subtitles.map((subtitle) => subtitle?.label).filter(Boolean)
        : [],
      saisonNumero: snapshot.seasonNumber ?? null,
      seriesTitre: snapshot.seriesTitle || null,
    },
    pipelineVersion: job.PipelineVersion,
    encodingSpecHash: job.EncodingSpecHash,
    cancelRequested: job.CancelRequested,
    error: job.ErrorMessage || null,
    warnings: job.Warnings || [],
    noCloneSinceAt: job.NoCloneSinceAt || null,
    startedAt,
    completedAt,
    elapsedMs,
    createdAt: job.CreatedAt,
    updatedAt: job.UpdatedAt,
    tasks: (job.Tasks || []).map(serializeEncodingTask),
  });
};

// Alias explicites pour les futurs contrôleurs et clients internes.
export const serializeVideoEncodingWorker = serializeEncodingWorker;
export const serializeVideoEncodingTask = serializeEncodingTask;
export const serializeVideoEncodingJob = serializeEncodingJob;

export const isPrimaryEncodingWorker = (worker) =>
  String(worker?.Role || "").toUpperCase() === ENCODING_WORKER_ROLE.PRIMARY;
