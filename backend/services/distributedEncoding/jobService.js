import fs from "fs";
import { randomUUID } from "crypto";

import { prisma } from "../db.js";
import {
  buildAddVideoAudioLabel,
  buildAudioTrackPlans,
  getAudioStreams,
  getAutoLanguageGenreNames,
  getVideoStream,
  parseOptionalPositiveInt,
  parseRequestedGenreIds,
  selectPreferredAudioStream,
  VideoImportValidationError,
} from "../video/videoImportHelpers.js";
import {
  extractVideoSubtitles,
  probeVideo,
} from "../video/videoTranscodingService.js";
import {
  cleanupReservedImportedVideo,
  reserveImportedVideoForEncodingJob,
} from "../video/videoImportPersistenceService.js";
import {
  isMultiAudioActive,
} from "../../controllers/appSettingController.js";
import { sha256String, stableStringify } from "../videoTransferSecurity.js";
import {
  assertDistributedPrimaryConfig,
  getDistributedEncodingConfig,
  isDistributedEncodingEnvironmentEnabled,
} from "./config.js";
import {
  ACTIVE_ENCODING_JOB_STATUSES,
  DISTRIBUTED_ENCODING_PIPELINE_VERSION,
  ENCODING_JOB_STATUS,
  ENCODING_TASK_KIND,
  ENCODING_TASK_STATUS,
  ENCODING_WORKER_ROLE,
  INCOMPLETE_ENCODING_CLEANUP_STEP,
  INCOMPLETE_ENCODING_EXPIRED_STEP,
} from "./constants.js";
import { distributedEncodingError } from "./error.js";
import {
  assertPrimaryEncodingCapabilities,
  collectDistributedEncodingWorkerCapabilities,
} from "./capabilityService.js";
import {
  createEncodingJob,
  createEncodingTasks,
  getEncodingWorker,
  getJobWithDetails,
  heartbeatEncodingWorker,
  listEncodingWorkers,
  updateEncodingJob,
  upsertEncodingWorker,
} from "./persistence.js";
import {
  serializeEncodingJob,
  serializeEncodingWorker,
} from "./serializer.js";
import { isEncodingWorkerOnline } from "./scheduler.js";
import {
  cleanupDistributedJobFiles,
  getDistributedJobPaths,
  readDistributedVideoMultipart,
  resolveDistributedSourcePath,
} from "./sourceService.js";
import {
  buildVideoEncodingPlan,
  VIDEO_ENCODING_SPEC_VERSION,
} from "./ffmpeg/index.js";
import {
  getDistributedEncodingSetting,
  isDistributedEncodingSettingActive,
  setDistributedEncodingSetting,
} from "./settingService.js";
import { buildDistributedEncodingTerminalHistoryWhere } from "./retentionPolicy.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const distributedEncodingAttemptSummarySelect = Object.freeze({
  VideoEncodingTaskAttemptID: true,
  VideoEncodingTaskID: true,
  VideoEncodingWorkerID: true,
  AttemptNumber: true,
  LeaseGeneration: true,
  Status: true,
  Progress: true,
  ManifestHash: true,
  ErrorMessage: true,
  StartedAt: true,
  LastRenewedAt: true,
  CompletedAt: true,
  CreatedAt: true,
  UpdatedAt: true,
});

const distributedEncodingTaskSummarySelect = Object.freeze({
  VideoEncodingTaskID: true,
  VideoEncodingJobID: true,
  TaskKey: true,
  Kind: true,
  ProfileLabel: true,
  NominalHeight: true,
  Priority: true,
  Weight: true,
  Required: true,
  SpecHash: true,
  Status: true,
  Phase: true,
  AssignedWorkerID: true,
  PreferredWorkerID: true,
  PreferenceExpiresAt: true,
  LeaseGeneration: true,
  LeaseExpiresAt: true,
  AttemptCount: true,
  MaxAttempts: true,
  NextEligibleAt: true,
  Progress: true,
  ArtifactManifestHash: true,
  ErrorMessage: true,
  StartedAt: true,
  CompletedAt: true,
  CreatedAt: true,
  UpdatedAt: true,
  Attempts: {
    orderBy: { AttemptNumber: "asc" },
    select: distributedEncodingAttemptSummarySelect,
  },
});

const distributedEncodingJobSummarySelect = Object.freeze({
  VideoEncodingJobID: true,
  VideoID: true,
  InitiatedByUserID: true,
  Status: true,
  CurrentStep: true,
  Progress: true,
  SourceOriginalName: true,
  SourceSize: true,
  RequestSnapshot: true,
  PipelineVersion: true,
  CancelRequested: true,
  ErrorMessage: true,
  Warnings: true,
  NoCloneSinceAt: true,
  StartedAt: true,
  CompletedAt: true,
  CreatedAt: true,
  UpdatedAt: true,
  Tasks: {
    orderBy: [{ Priority: "desc" }, { CreatedAt: "asc" }],
    select: distributedEncodingTaskSummarySelect,
  },
});

const nominalHeightForProfile = (profile) => {
  if (String(profile.label).toUpperCase() === "4K") return 2160;
  const parsed = Number.parseInt(String(profile.label), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number(profile.height);
};

let primaryEncodingCapabilitiesPromise = null;

export function getPrimaryEncodingCapabilities() {
  if (!primaryEncodingCapabilitiesPromise) {
    const config = assertDistributedPrimaryConfig();
    primaryEncodingCapabilitiesPromise = collectDistributedEncodingWorkerCapabilities({
      config,
      requireFfprobe: true,
      maxNominalHeight: config.primaryMaxNominalHeight,
    });
  }
  return primaryEncodingCapabilitiesPromise;
}

export const buildPrimaryEncodingHeartbeat = ({ config, capabilities }) => ({
  protocolVersion: config.protocolVersion,
  pipelineVersion: config.pipelineVersion,
  platform: capabilities.platform,
  architecture: capabilities.architecture,
  ffmpegVersion: capabilities.ffmpegVersion,
  maxNominalHeight: capabilities.supportsH264
    ? config.primaryMaxNominalHeight
    : 0,
  supportsH264: capabilities.supportsH264,
  supportsAac: capabilities.supportsAac,
  maxSlots: 1,
  capabilities: capabilities.capabilities,
  lastError: capabilities.probeError,
});

const sanitizeRequestSnapshot = ({
  data,
  requestedGenreIds,
  autoLanguageGenreNames,
  subtitleInfos,
  plan,
  audioStream,
  audioTracks,
  season,
}) => ({
  title: data.titre,
  summary: data.resumer || null,
  seasonId: data.SaisonID ?? null,
  requestedGenreIds,
  autoLanguageGenreNames,
  imageRelativePath: data.imageRelativePath || null,
  imageExtension: data.imageTempExt || null,
  subtitles: subtitleInfos.map((subtitle) => ({
    filename: subtitle.filename,
    label: subtitle.label,
    relativePath: `subtitles/${subtitle.filename}`,
  })),
  audio: buildAddVideoAudioLabel(audioStream),
  audioTracks: audioTracks.map((track) => track.label).filter(Boolean),
  seasonNumber: season?.Numero ?? null,
  seriesTitle: season?.Series?.Titre ?? null,
  multiAudio: plan.multiAudio,
  audioRenditions: plan.audioRenditions,
  mediaDurations: {
    videoSeconds: plan.durationSeconds,
    audioTracks: plan.audioRenditions.map((track) => ({
      label: track.label,
      order: track.order,
      sourceSeconds: track.sourceDurationSeconds,
      silencePaddingSeconds: track.silencePaddingSeconds,
    })),
  },
  videoOriginalName: data.videoOriginalName,
});

export const buildDistributedEncodingTasks = ({ plan, encodingSpecHash }) => {
  const videoTasks = plan.profiles.map((profile) => {
    const spec = {
      specVersion: VIDEO_ENCODING_SPEC_VERSION,
      profile,
      includeAudio: !plan.multiAudio,
      videoStreamIndex: plan.videoStreamIndex,
      audioStreamIndex: plan.audioStreamIndex,
      durationSeconds: plan.durationSeconds,
      segmentDurationSeconds: plan.segmentDurationSeconds,
      audioBitrateKbps: plan.audioBitrateKbps,
      planHash: encodingSpecHash,
    };
    return {
      id: randomUUID(),
      key: `video-${profile.label}`,
      kind: ENCODING_TASK_KIND.VIDEO_PROFILE,
      profileLabel: profile.label,
      nominalHeight: nominalHeightForProfile(profile),
      priority: 100,
      weight: Math.max(1, Math.round(profile.width * profile.height * profile.bitrate)),
      spec,
      specHash: sha256String(stableStringify(spec)),
    };
  });
  const audioTasks = plan.audioRenditions.map((track) => {
    const spec = {
      specVersion: VIDEO_ENCODING_SPEC_VERSION,
      track,
      primaryOnly: true,
      durationSeconds: plan.durationSeconds,
      segmentDurationSeconds: plan.segmentDurationSeconds,
      audioBitrateKbps: plan.audioBitrateKbps,
      planHash: encodingSpecHash,
    };
    return {
      id: randomUUID(),
      key: `audio-${track.order}`,
      kind: ENCODING_TASK_KIND.AUDIO_RENDITION,
      // ProfileLabel est un identifiant technique stocké dans un VARCHAR(32).
      // Le libellé utilisateur complet reste disponible dans Spec.track.label.
      profileLabel: `Audio ${track.order + 1}`,
      nominalHeight: null,
      priority: 90,
      weight: Math.max(1, Math.round(plan.durationSeconds * plan.audioBitrateKbps)),
      spec,
      specHash: sha256String(stableStringify(spec)),
    };
  });
  return [...videoTasks, ...audioTasks];
};

export const buildAudioDurationWarnings = (plan) =>
  plan.audioRenditions.flatMap((track) => {
    if (track.sourceDurationSeconds == null) {
      return [{
        code: "AUDIO_TRACK_DURATION_UNKNOWN",
        message: `La durée de la piste audio « ${track.label} » n'a pas pu être `
          + "déterminée. Sa sortie sera alignée sur la durée de la vidéo.",
        trackOrder: track.order,
        sourceDurationSeconds: null,
        targetDurationSeconds: plan.durationSeconds,
        silencePaddingSeconds: null,
      }];
    }
    if (Number(track.silencePaddingSeconds) <= 2) return [];
    return [{
      code: "AUDIO_TRACK_PADDED_WITH_SILENCE",
      message: `La piste audio « ${track.label} » est plus courte que la vidéo de `
        + `${Number(track.silencePaddingSeconds).toFixed(3)} s. `
        + "La fin sera complétée avec du silence.",
      trackOrder: track.order,
      sourceDurationSeconds: track.sourceDurationSeconds,
      targetDurationSeconds: plan.durationSeconds,
      silencePaddingSeconds: track.silencePaddingSeconds,
    }];
  });

const getSeason = async (seasonId) => {
  if (!seasonId) return null;
  const season = await prisma.saison.findUnique({
    where: { SaisonID: seasonId },
    select: {
      SaisonID: true,
      Numero: true,
      Series: { select: { Titre: true } },
    },
  });
  if (!season) {
    throw new VideoImportValidationError("La saison sélectionnée est introuvable.");
  }
  return season;
};

export async function ensurePrimaryEncodingWorkerRegistered(options = {}) {
  const config = assertDistributedPrimaryConfig();
  const capabilities = assertPrimaryEncodingCapabilities(
    options.capabilities || await getPrimaryEncodingCapabilities()
  );
  const heartbeat = buildPrimaryEncodingHeartbeat({ config, capabilities });
  await upsertEncodingWorker({
    instanceId: config.instanceId,
    displayName: config.instanceId,
    role: ENCODING_WORKER_ROLE.PRIMARY,
    enabled: true,
    ...heartbeat,
    performanceScore: 0.1,
  });
  return heartbeatEncodingWorker(config.instanceId, heartbeat);
}

export async function getAvailableEncodingClones({ now = new Date() } = {}) {
  const config = getDistributedEncodingConfig();
  const workers = await listEncodingWorkers({ includeDisabled: false });
  return workers.filter((worker) =>
    worker.Role === ENCODING_WORKER_ROLE.CLONE
    && !worker.Draining
    && worker.ProtocolVersion === config.protocolVersion
    && worker.PipelineVersion === config.pipelineVersion
    && worker.SupportsH264
    && worker.SupportsAac
    && isEncodingWorkerOnline(worker, { now })
  );
}

export async function getDistributedEncodingPublicConfig() {
  let config;
  let configurationError = null;
  try {
    config = getDistributedEncodingConfig();
  } catch (error) {
    configurationError = error.message;
  }
  const setting = await getDistributedEncodingSetting();
  const workers = config?.role === ENCODING_WORKER_ROLE.PRIMARY
    ? await listEncodingWorkers()
    : [];
  const now = new Date();
  const serializedWorkers = workers.map((worker) =>
    serializeEncodingWorker(worker, { now })
  );
  const activeClones = serializedWorkers.filter((worker) =>
    worker.role === ENCODING_WORKER_ROLE.CLONE
    && worker.status === "online"
    && worker.protocolVersion === config?.protocolVersion
    && worker.pipelineVersion === config?.pipelineVersion
    && worker.supportsH264
    && worker.supportsAac
  );
  const environmentEnabled = Boolean(config?.enabled);
  const isPrimary = config?.role === ENCODING_WORKER_ROLE.PRIMARY;
  const enabled = environmentEnabled && setting.active && isPrimary;
  const canStart = enabled && activeClones.length > 0;
  let reason = null;
  if (configurationError) reason = configurationError;
  else if (!isPrimary) reason = "Cette instance n'est pas le serveur principal.";
  else if (!environmentEnabled) reason = "Le kill switch serveur est désactivé.";
  else if (!setting.active) reason = "La fonctionnalité expérimentale est désactivée.";
  else if (activeClones.length === 0) {
    reason = "Aucun clone d'encodage n'est actuellement disponible.";
  }

  return {
    enabled: setting.active,
    environmentEnabled,
    operational: enabled,
    canStart,
    reason,
    instanceRole: config?.role?.toLowerCase() || null,
    instanceId: config?.instanceId || null,
    protocolVersion: config?.protocolVersion || null,
    pipelineVersion: config?.pipelineVersion || null,
    activeCloneCount: activeClones.length,
    artifactRetentionDays: config?.artifactRetentionDays ?? null,
    jobRetentionDays: config?.jobRetentionDays ?? null,
    workers: serializedWorkers,
    updatedAt: setting.updatedAt,
  };
}

export async function updateDistributedEncodingPublicConfig(enabled) {
  const config = getDistributedEncodingConfig();
  if (config.role !== ENCODING_WORKER_ROLE.PRIMARY) {
    throw distributedEncodingError(
      "Cette fonctionnalité ne peut être activée que sur le serveur principal.",
      "DISTRIBUTED_ENCODING_PRIMARY_REQUIRED",
      409
    );
  }
  if (enabled && !isDistributedEncodingEnvironmentEnabled()) {
    throw distributedEncodingError(
      "Le kill switch SAMI_DISTRIBUTED_ENCODING_ENABLED est désactivé.",
      "DISTRIBUTED_ENCODING_ENV_DISABLED",
      409
    );
  }
  await setDistributedEncodingSetting(enabled);
  return getDistributedEncodingPublicConfig();
}

export async function assertDistributedEncodingCanStart() {
  const config = assertDistributedPrimaryConfig();
  if (!(await isDistributedEncodingSettingActive())) {
    throw distributedEncodingError(
      "La fonctionnalité expérimentale d'encodage distribué est désactivée.",
      "DISTRIBUTED_ENCODING_DISABLED",
      409
    );
  }
  const clones = await getAvailableEncodingClones();
  if (clones.length === 0) {
    throw distributedEncodingError(
      "Aucun clone d'encodage n'est actuellement disponible. Vérifiez leur connexion ou utilisez l'ajout classique.",
      "NO_COMPATIBLE_ENCODING_WORKER",
      409,
      { retryable: true }
    );
  }
  return { config, clones };
}

export async function createDistributedVideoJob({ request, adminUserId }) {
  const { config } = await assertDistributedEncodingCanStart();
  const jobId = randomUUID();
  let videoId = null;
  let jobCreated = false;
  let input = null;

  try {
    input = await readDistributedVideoMultipart({ request, jobId });
    if (!input.data.titre) {
      throw new VideoImportValidationError("Le titre est obligatoire.");
    }
    if (input.data.titre.length > 100) {
      throw new VideoImportValidationError("Le titre ne peut pas dépasser 100 caractères.");
    }
    input.data.SaisonID = parseOptionalPositiveInt(
      input.data.SaisonID ?? input.data.saisonID ?? input.data.saisonId,
      "SaisonID"
    );
    const season = await getSeason(input.data.SaisonID);
    const requestedGenreIds = parseRequestedGenreIds(input.data.genres);
    const metadata = await probeVideo(input.sourcePath);
    const videoStream = getVideoStream(metadata);
    const audioStream = selectPreferredAudioStream(metadata);
    if (!videoStream) throw new VideoImportValidationError("Aucun flux vidéo disponible.");
    if (!audioStream) throw new VideoImportValidationError("Aucune piste audio disponible.");
    const audioStreams = getAudioStreams(metadata);
    const audioTracks = buildAudioTrackPlans(audioStreams, audioStream);
    const multiAudioEnabled = await isMultiAudioActive();
    const plan = buildVideoEncodingPlan({
      metadata,
      videoStream,
      audioStream,
      audioTracks,
      multiAudioEnabled,
    });
    const subtitleStreams = (metadata.streams || []).filter(
      (stream) => stream.codec_type === "subtitle"
    );
    const subtitleInfos = await extractVideoSubtitles({
      videoPath: input.sourcePath,
      subtitleStreams,
      outputDir: input.paths.subtitlesDir,
    });
    const autoLanguageGenreNames = getAutoLanguageGenreNames({
      audioStream,
      subtitleStreams,
      multiAudio: plan.multiAudio,
    });
    const encodingSpecHash = sha256String(stableStringify({
      sourceSha256: input.sourceSha256,
      pipelineVersion: config.pipelineVersion,
      plan,
    }));
    const requestSnapshot = sanitizeRequestSnapshot({
      data: input.data,
      requestedGenreIds,
      autoLanguageGenreNames,
      subtitleInfos,
      plan,
      audioStream,
      audioTracks: multiAudioEnabled ? audioTracks : [],
      season,
    });

    await createEncodingJob({
      id: jobId,
      initiatedByUserId: adminUserId,
      status: ENCODING_JOB_STATUS.PLANNING,
      currentStep: "planning",
      sourceRelativePath: input.sourceRelativePath,
      sourceOriginalName: input.sourceOriginalName,
      sourceSize: input.sourceSize,
      sourceSha256: input.sourceSha256,
      sourceMetadata: metadata,
      requestSnapshot,
      pipelineVersion: config.pipelineVersion || DISTRIBUTED_ENCODING_PIPELINE_VERSION,
      encodingSpecHash,
      idempotencyKey: request.headers["x-idempotency-key"] || null,
      warnings: buildAudioDurationWarnings(plan),
    });
    jobCreated = true;
    const reservedVideo = await reserveImportedVideoForEncodingJob({
      data: {
        titre: requestSnapshot.title,
        resumer: requestSnapshot.summary,
        SaisonID: requestSnapshot.seasonId,
      },
      adminUserId,
      jobId,
    });
    videoId = reservedVideo.VideoID;
    await createEncodingTasks(
      jobId,
      buildDistributedEncodingTasks({ plan, encodingSpecHash })
    );
    return updateEncodingJob(jobId, {
      status: ENCODING_JOB_STATUS.QUEUED,
      currentStep: "queued",
      progress: 0,
      startedAt: new Date(),
    });
  } catch (error) {
    if (videoId) await cleanupReservedImportedVideo(videoId);
    if (jobCreated) {
      await prisma.videoEncodingJob.delete({
        where: { VideoEncodingJobID: jobId },
      }).catch(() => {});
    }
    await cleanupDistributedJobFiles(jobId).catch(() => {});
    throw error;
  }
}

export async function listDistributedVideoJobs({
  active = false,
  page = 1,
  limit = 20,
} = {}) {
  const normalizedLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const requestedPage = Number.isSafeInteger(Number(page))
    ? Math.max(1, Number(page))
    : 1;
  const where = active
    ? { Status: { in: ACTIVE_ENCODING_JOB_STATUSES } }
    : undefined;
  const total = await prisma.videoEncodingJob.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / normalizedLimit));
  const normalizedPage = Math.min(requestedPage, totalPages);
  const jobs = await prisma.videoEncodingJob.findMany({
    where,
    orderBy: { UpdatedAt: active ? "asc" : "desc" },
    skip: (normalizedPage - 1) * normalizedLimit,
    take: normalizedLimit,
    select: distributedEncodingJobSummarySelect,
  });
  return {
    jobs: jobs.map(serializeEncodingJob),
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      total,
      totalPages,
      hasPreviousPage: normalizedPage > 1,
      hasNextPage: normalizedPage < totalPages,
    },
  };
}

export async function getDistributedEncodingRetentionSnapshot({ now = new Date() } = {}) {
  const config = getDistributedEncodingConfig();
  const checkedAt = new Date(now);
  const artifactCutoff = new Date(
    checkedAt.getTime() - config.artifactRetentionDays * DAY_MS
  );
  const jobCutoff = new Date(
    checkedAt.getTime() - config.jobRetentionDays * DAY_MS
  );
  const retainedTerminalWhere = buildDistributedEncodingTerminalHistoryWhere(checkedAt);
  const artifactEligibleJobWhere = buildDistributedEncodingTerminalHistoryWhere(
    artifactCutoff
  );
  const jobEligibleWhere = buildDistributedEncodingTerminalHistoryWhere(jobCutoff);
  const retainedArtifactWhere = {
    Attempt: { Task: { Job: retainedTerminalWhere } },
  };
  const eligibleArtifactWhere = {
    Attempt: { Task: { Job: artifactEligibleJobWhere } },
  };

  const [
    totalJobs,
    eligibleJobs,
    terminalJobDates,
    totalArtifacts,
    eligibleArtifacts,
    terminalArtifactDates,
  ] = await Promise.all([
    prisma.videoEncodingJob.count(),
    prisma.videoEncodingJob.count({ where: jobEligibleWhere }),
    prisma.videoEncodingJob.aggregate({
      where: retainedTerminalWhere,
      _min: { CompletedAt: true },
      _max: { CompletedAt: true },
    }),
    prisma.videoEncodingArtifactFile.count(),
    prisma.videoEncodingArtifactFile.count({ where: eligibleArtifactWhere }),
    prisma.videoEncodingArtifactFile.aggregate({
      where: retainedArtifactWhere,
      _min: { CreatedAt: true },
      _max: { CreatedAt: true },
    }),
  ]);

  return {
    checkedAt: checkedAt.toISOString(),
    artifactRetentionDays: config.artifactRetentionDays,
    jobRetentionDays: config.jobRetentionDays,
    jobs: {
      total: totalJobs,
      eligibleForPurge: eligibleJobs,
      cutoff: jobCutoff.toISOString(),
      oldestTerminalCompletedAt: terminalJobDates._min.CompletedAt || null,
      newestTerminalCompletedAt: terminalJobDates._max.CompletedAt || null,
    },
    artifacts: {
      total: totalArtifacts,
      eligibleForPurge: eligibleArtifacts,
      cutoff: artifactCutoff.toISOString(),
      oldestTerminalCreatedAt: terminalArtifactDates._min.CreatedAt || null,
      newestTerminalCreatedAt: terminalArtifactDates._max.CreatedAt || null,
    },
  };
}

export async function getDistributedVideoJob(jobId) {
  const job = await getJobWithDetails(jobId);
  return job ? serializeEncodingJob(job) : null;
}

export async function resumeDistributedVideoJob(jobId) {
  const job = await getJobWithDetails(jobId);
  if (!job) {
    throw distributedEncodingError("Job introuvable.", "VIDEO_ENCODING_JOB_NOT_FOUND", 404);
  }
  if (job.Status !== ENCODING_JOB_STATUS.FAILED) {
    throw distributedEncodingError(
      "Seul un job en échec peut être repris.",
      "VIDEO_ENCODING_JOB_NOT_RESUMABLE",
      409
    );
  }
  if ([
    INCOMPLETE_ENCODING_CLEANUP_STEP,
    INCOMPLETE_ENCODING_EXPIRED_STEP,
  ].includes(job.CurrentStep)) {
    throw distributedEncodingError(
      "Cette ingestion incomplète est en cours de nettoyage ou a expiré.",
      "VIDEO_ENCODING_JOB_NOT_RESUMABLE",
      409
    );
  }
  const sourcePath = resolveDistributedSourcePath(job.SourceRelativePath);
  if (!fs.existsSync(sourcePath)) {
    throw distributedEncodingError(
      "La source temporaire a expiré. Importez de nouveau la vidéo.",
      "VIDEO_ENCODING_SOURCE_EXPIRED",
      410
    );
  }
  await prisma.$transaction(async (tx) => {
    await tx.videoEncodingTask.updateMany({
      where: {
        VideoEncodingJobID: job.VideoEncodingJobID,
        Status: { in: [ENCODING_TASK_STATUS.FAILED, ENCODING_TASK_STATUS.RETRY_WAIT] },
      },
      data: {
        Status: ENCODING_TASK_STATUS.PENDING,
        MaxAttempts: { increment: 4 },
        NextEligibleAt: null,
        Phase: null,
        Progress: 0,
        ArtifactManifest: null,
        ArtifactManifestHash: null,
        ErrorMessage: null,
        CompletedAt: null,
      },
    });
    await tx.videoEncodingJob.update({
      where: { VideoEncodingJobID: job.VideoEncodingJobID },
      data: {
        Status: ENCODING_JOB_STATUS.QUEUED,
        CurrentStep: "queued",
        CancelRequested: false,
        ErrorMessage: null,
        CompletedAt: null,
      },
    });
  });
  return getDistributedVideoJob(jobId);
}

export async function requestDistributedVideoJobCancellation(jobId) {
  const job = await getJobWithDetails(jobId);
  if (!job) {
    throw distributedEncodingError("Job introuvable.", "VIDEO_ENCODING_JOB_NOT_FOUND", 404);
  }
  if (!ACTIVE_ENCODING_JOB_STATUSES.includes(job.Status)) {
    return serializeEncodingJob(job);
  }
  if (job.Status === ENCODING_JOB_STATUS.PUBLISHING) {
    throw distributedEncodingError(
      "La publication atomique a déjà commencé et ne peut plus être annulée.",
      "VIDEO_ENCODING_JOB_PUBLICATION_STARTED",
      409
    );
  }

  const cancellation = await prisma.videoEncodingJob.updateMany({
    where: {
      VideoEncodingJobID: String(jobId),
      Status: {
        in: ACTIVE_ENCODING_JOB_STATUSES.filter(
          (status) => status !== ENCODING_JOB_STATUS.PUBLISHING
        ),
      },
      CancelRequested: false,
    },
    data: {
      Status: ENCODING_JOB_STATUS.CANCEL_REQUESTED,
      CurrentStep: "cancelling",
      CancelRequested: true,
    },
  });
  if (cancellation.count !== 1) {
    const current = await getJobWithDetails(jobId);
    if (current?.Status === ENCODING_JOB_STATUS.PUBLISHING) {
      throw distributedEncodingError(
        "La publication atomique a déjà commencé et ne peut plus être annulée.",
        "VIDEO_ENCODING_JOB_PUBLICATION_STARTED",
        409
      );
    }
  }
  return getDistributedVideoJob(jobId);
}

export async function listDistributedEncodingWorkers() {
  const workers = await listEncodingWorkers();
  return workers.map((worker) => serializeEncodingWorker(worker));
}

const normalizeWorkerDisplayName = (value, fallback) => {
  const displayName = String(value ?? fallback).trim();
  if (!displayName || displayName.length > 191) {
    throw distributedEncodingError(
      "Le nom affiché du worker doit contenir entre 1 et 191 caractères.",
      "INVALID_ENCODING_WORKER_DISPLAY_NAME"
    );
  }
  return displayName;
};

const normalizeWorkerPerformanceScore = (value, fallback = 1) => {
  const score = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(score) || score < 0.001 || score > 1_000_000) {
    throw distributedEncodingError(
      "La priorité de performance du worker est invalide.",
      "INVALID_ENCODING_WORKER_PERFORMANCE"
    );
  }
  return score;
};

const normalizeWorkerMaxHeight = (value, fallback = 2160) => {
  const height = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(height) || height < 240 || height > 16_384) {
    throw distributedEncodingError(
      "La résolution maximale du worker est invalide.",
      "INVALID_ENCODING_WORKER_MAX_HEIGHT"
    );
  }
  return height;
};

const normalizeOptionalWorkerBoolean = (payload, field, fallback) => {
  const value = payload?.[field];
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw distributedEncodingError(
      `${field} doit être un booléen.`,
      "INVALID_ENCODING_WORKER_STATE"
    );
  }
  return value;
};

export async function registerDistributedEncodingWorker(payload) {
  const config = assertDistributedPrimaryConfig();
  const instanceId = String(payload?.instanceId || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{1,99}$/.test(instanceId)) {
    throw distributedEncodingError(
      "SAMI_INSTANCE_ID est invalide.",
      "INVALID_ENCODING_WORKER_ID"
    );
  }
  if (instanceId === config.instanceId) {
    throw distributedEncodingError(
      "Le primary est géré automatiquement.",
      "PRIMARY_WORKER_MANAGED_AUTOMATICALLY",
      409
    );
  }
  const worker = await upsertEncodingWorker({
    instanceId,
    displayName: normalizeWorkerDisplayName(payload.displayName, instanceId),
    role: ENCODING_WORKER_ROLE.CLONE,
    enabled: normalizeOptionalWorkerBoolean(payload, "enabled", true),
    draining: normalizeOptionalWorkerBoolean(payload, "draining", false),
    pipelineVersion: config.pipelineVersion,
    protocolVersion: config.protocolVersion,
    maxNominalHeight: normalizeWorkerMaxHeight(payload.maxNominalHeight),
    supportsH264: true,
    supportsAac: true,
    maxSlots: 1,
    performanceScore: normalizeWorkerPerformanceScore(payload.performanceScore),
  });
  return serializeEncodingWorker(worker);
}

export async function patchDistributedEncodingWorker(instanceId, payload) {
  const config = assertDistributedPrimaryConfig();
  const worker = await getEncodingWorker(instanceId);
  if (!worker) {
    throw distributedEncodingError("Worker introuvable.", "ENCODING_WORKER_NOT_FOUND", 404);
  }
  if (worker.VideoEncodingWorkerID === config.instanceId) {
    throw distributedEncodingError(
      "Le primary est géré automatiquement.",
      "PRIMARY_WORKER_MANAGED_AUTOMATICALLY",
      409
    );
  }
  const updated = await prisma.videoEncodingWorker.update({
    where: { VideoEncodingWorkerID: worker.VideoEncodingWorkerID },
    data: {
      ...(payload.displayName !== undefined
        ? { DisplayName: normalizeWorkerDisplayName(payload.displayName) }
        : {}),
      ...(payload.enabled !== undefined
        ? { Enabled: normalizeOptionalWorkerBoolean(payload, "enabled") }
        : {}),
      ...(payload.draining !== undefined
        ? { Draining: normalizeOptionalWorkerBoolean(payload, "draining") }
        : {}),
      ...(payload.performanceScore !== undefined
        ? { PerformanceScore: normalizeWorkerPerformanceScore(payload.performanceScore) }
        : {}),
      ...(payload.maxNominalHeight !== undefined
        ? { MaxNominalHeight: normalizeWorkerMaxHeight(payload.maxNominalHeight) }
        : {}),
    },
  });
  return serializeEncodingWorker(updated);
}

export async function deleteDistributedEncodingWorker(instanceId) {
  const config = assertDistributedPrimaryConfig();
  const normalizedInstanceId = String(instanceId || "");
  if (normalizedInstanceId === config.instanceId) {
    throw distributedEncodingError(
      "Le worker primary ne peut pas être supprimé.",
      "PRIMARY_WORKER_MANAGED_AUTOMATICALLY",
      409
    );
  }
  const worker = await getEncodingWorker(normalizedInstanceId);
  if (!worker) {
    throw distributedEncodingError(
      "Worker introuvable.",
      "ENCODING_WORKER_NOT_FOUND",
      404
    );
  }
  const activeLeases = await prisma.videoEncodingTask.count({
    where: {
      AssignedWorkerID: normalizedInstanceId,
      Status: ENCODING_TASK_STATUS.LEASED,
    },
  });
  if (activeLeases > 0) {
    throw distributedEncodingError(
      "Le worker possède encore une tâche active. Placez-le d'abord en draining.",
      "ENCODING_WORKER_BUSY",
      409
    );
  }
  const historicalAttempts = await prisma.videoEncodingTaskAttempt.count({
    where: { VideoEncodingWorkerID: normalizedInstanceId },
  });
  if (historicalAttempts > 0) {
    await prisma.videoEncodingWorker.update({
      where: { VideoEncodingWorkerID: normalizedInstanceId },
      data: { Enabled: false, Draining: true },
    });
    return {
      deleted: false,
      disabled: true,
      reason: "Le worker est conservé pour l'historique des tentatives.",
    };
  }
  await prisma.videoEncodingWorker.delete({
    where: { VideoEncodingWorkerID: normalizedInstanceId },
  });
  return { deleted: true };
}

export const getDistributedJobPathsForService = getDistributedJobPaths;
