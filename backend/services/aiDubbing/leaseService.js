import crypto from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "../db.js";
import { upsertEncodingWorker } from "../distributedEncoding/persistence.js";
import {
  AI_DUBBING_OFFLINE_AFTER_MS,
  AI_DUBBING_RETRY_BACKOFF_MS,
  AI_DUBBING_STATUS,
} from "./constants.js";
import { assertAiDubbingConfig } from "./config.js";
import {
  cleanupAiDubbingArtifacts,
  receiveAiDubbingArtifact,
  resolveUploadedAiDubbingArtifacts,
  validateAiDubbingArtifactManifest,
} from "./artifactService.js";
import { promoteAiDubbingResult } from "./resultService.js";
import {
  cleanupAiDubbingInput,
  openAiDubbingInputAsset,
  prepareAiDubbingInput,
} from "./sourceService.js";

const { createHash, randomBytes, timingSafeEqual } = crypto;
const hashLease = (token) => createHash("sha256").update(String(token), "utf8").digest("hex");
const clampProgress = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const queuedStatuses = [AI_DUBBING_STATUS.QUEUED_PREVIEW, AI_DUBBING_STATUS.QUEUED_FULL];
const processingStatuses = [
  AI_DUBBING_STATUS.PROCESSING_PREVIEW,
  AI_DUBBING_STATUS.PROCESSING_FULL,
];

export const serializeAiDubbingWorker = (worker) => worker && ({
  id: worker.AiDubbingWorkerID,
  role: worker.Role,
  ready: Boolean(worker.Ready),
  engine: worker.Engine,
  device: worker.Device,
  model: worker.Model,
  modelRevision: worker.ModelRevision,
  pipelineVersion: worker.PipelineVersion,
  performanceScore: worker.PerformanceScore,
  capabilities: worker.Capabilities,
  lastHeartbeatAt: worker.LastHeartbeatAt,
  lastError: worker.LastError,
});

export async function listAiDubbingWorkers({ database = prisma, now = new Date() } = {}) {
  const workers = await database.aiDubbingWorker.findMany({
    include: { Registry: true },
    orderBy: [{ PerformanceScore: "desc" }, { AiDubbingWorkerID: "asc" }],
  });
  const offlineBefore = now.getTime() - AI_DUBBING_OFFLINE_AFTER_MS;
  return workers.map((worker) => ({
    ...serializeAiDubbingWorker(worker),
    enabled: Boolean(worker.Registry?.Enabled),
    draining: Boolean(worker.Registry?.Draining),
    online: Boolean(
      worker.LastHeartbeatAt
      && new Date(worker.LastHeartbeatAt).getTime() >= offlineBefore
    ),
  }));
}

export const serializeAiDubbingLease = (claim) => claim && ({
  job: {
    id: claim.job.AiDubbingJobID,
    videoId: claim.job.VideoID,
    targetLanguage: claim.job.TargetLanguage,
    sourceLanguage: claim.job.SourceLanguage,
    phase: claim.phase,
    previewStartSeconds: claim.job.PreviewStartSeconds,
    expectedSpeakerCount: claim.job.ExpectedSpeakerCount,
    manualVoiceReferences: claim.job.ManualVoiceReferences || null,
    rejectedVoiceReferences: Array.isArray(claim.job.RejectedVoiceReferences)
      ? claim.job.RejectedVoiceReferences
      : [],
    regenerationTarget: Array.isArray(claim.job.VoiceSamples)
      ? String(claim.job.VoiceSamples.find((sample) => sample?.regenerationRequested === true)?.speaker || "") || null
      : null,
    voiceProfileChecksum: claim.job.VoiceProfileChecksum,
    speakerCount: claim.job.SpeakerCount,
    models: {
      voiceEngine: claim.job.VoiceEngine,
      voiceModel: claim.job.VoiceModel,
      voiceModelRevision: claim.job.VoiceModelRevision,
      diarization: claim.job.DiarizationModel,
      separation: claim.job.SeparationModel,
      pipeline: claim.job.PipelineVersion,
      generationConfigHash: claim.job.GenerationConfigHash,
    },
  },
  inputManifest: claim.job.InputManifest,
  inputManifestHash: claim.job.InputManifestHash,
  leaseToken: claim.leaseToken,
  leaseGeneration: claim.leaseGeneration,
  leaseExpiresAt: claim.leaseExpiresAt,
  renewAfterMs: claim.renewAfterMs,
});

export async function ensureAiDubbingPrimaryWorker({ database = prisma, config } = {}) {
  const runtimeConfig = config || assertAiDubbingConfig();
  await upsertEncodingWorker({
    instanceId: runtimeConfig.instanceId,
    role: "PRIMARY",
    pipelineVersion: process.env.SAMI_DISTRIBUTED_ENCODING_PIPELINE_VERSION
      || "sami-hls-libx264-aac-v1",
    displayName: "Primary de test doublage IA",
    enabled: true,
    maxNominalHeight: 360,
  }, { database });
}

export async function heartbeatAiDubbingWorker(workerId, heartbeat, {
  database = prisma,
  now = new Date(),
} = {}) {
  const registry = await database.videoEncodingWorker.findUnique({
    where: { VideoEncodingWorkerID: String(workerId) },
  });
  if (!registry || !registry.Enabled) {
    const error = new Error("Le worker de doublage n'est pas enregistré ou est désactivé.");
    error.statusCode = 403;
    error.code = "AI_DUBBING_WORKER_FORBIDDEN";
    throw error;
  }
  return database.aiDubbingWorker.upsert({
    where: { AiDubbingWorkerID: String(workerId) },
    create: {
      AiDubbingWorkerID: String(workerId),
      Role: String(heartbeat.role || registry.Role).toUpperCase(),
      Ready: Boolean(heartbeat.ready),
      Engine: heartbeat.engine || null,
      Device: heartbeat.device || null,
      Model: heartbeat.model || null,
      ModelRevision: heartbeat.modelRevision || null,
      PipelineVersion: String(heartbeat.pipelineVersion || ""),
      PerformanceScore: Number(heartbeat.performanceScore) || registry.PerformanceScore || 1,
      MaxSlots: 1,
      Capabilities: heartbeat.capabilities ?? Prisma.DbNull,
      BootID: heartbeat.bootId || null,
      LastHeartbeatAt: now,
      LastError: heartbeat.lastError || null,
    },
    update: {
      Role: String(heartbeat.role || registry.Role).toUpperCase(),
      Ready: Boolean(heartbeat.ready),
      Engine: heartbeat.engine || null,
      Device: heartbeat.device || null,
      Model: heartbeat.model || null,
      ModelRevision: heartbeat.modelRevision || null,
      PipelineVersion: String(heartbeat.pipelineVersion || ""),
      PerformanceScore: Number(heartbeat.performanceScore) || registry.PerformanceScore || 1,
      MaxSlots: 1,
      Capabilities: heartbeat.capabilities ?? Prisma.DbNull,
      BootID: heartbeat.bootId || null,
      LastHeartbeatAt: now,
      LastError: heartbeat.lastError || null,
    },
  });
}

export async function prepareNextAiDubbingInput({ database = prisma, config } = {}) {
  const runtimeConfig = config || assertAiDubbingConfig();
  if (runtimeConfig.role !== "PRIMARY") return null;
  const jobs = await database.aiDubbingJob.findMany({
    where: {
      Status: { in: queuedStatuses },
      InputManifest: { equals: Prisma.DbNull },
      OR: [{ NextEligibleAt: null }, { NextEligibleAt: { lte: new Date() } }],
    },
    orderBy: { CreatedAt: "asc" },
    take: 10,
    include: {
      Video: {
        include: {
          AiTranscript: true,
          VideoSubtitles: true,
        },
      },
    },
  });
  const job = jobs[0];
  if (!job) return null;
  const locked = await database.aiDubbingJob.updateMany({
    where: {
      AiDubbingJobID: job.AiDubbingJobID,
      Status: job.Status,
      InputManifest: { equals: Prisma.DbNull },
      Phase: job.Phase,
    },
    data: { Phase: "PREPARING_INPUT", Progress: 1, ErrorMessage: null },
  });
  if (locked.count !== 1) return null;
  try {
    const subtitle = job.Video.VideoSubtitles
      .filter((item) => String(item.Language || "").toLowerCase() === job.TargetLanguage)
      .sort((left, right) => String(left.Origin || "").localeCompare(String(right.Origin || "")))[0];
    if (!subtitle) throw new Error("Le sous-titre cible validé est introuvable.");
    const prepared = await prepareAiDubbingInput({
      job,
      videoPath: job.Video.CheminAcces,
      subtitlePath: subtitle.CheminSubtitle,
      sourceTranscript: job.Video.AiTranscript,
      config: runtimeConfig,
    });
    return database.aiDubbingJob.update({
      where: { AiDubbingJobID: job.AiDubbingJobID },
      data: {
        Phase: "QUEUED",
        Progress: 3,
        InputManifest: prepared.manifest,
        InputManifestHash: prepared.manifestHash,
        ErrorMessage: null,
      },
    });
  } catch (error) {
    await database.aiDubbingJob.update({
      where: { AiDubbingJobID: job.AiDubbingJobID },
      data: {
        Status: AI_DUBBING_STATUS.FAILED,
        Phase: "FAILED",
        ErrorMessage: String(error?.message || error).slice(0, 10_000),
        CompletedAt: new Date(),
      },
    });
    throw error;
  }
}

const workerIsOnline = (worker, now, config) => (
  worker.Ready
  && worker.Registry?.Enabled
  && !worker.Registry?.Draining
  && worker.PipelineVersion === config.pipelineVersion
  && worker.LastHeartbeatAt
  && new Date(worker.LastHeartbeatAt).getTime() >= now.getTime() - AI_DUBBING_OFFLINE_AFTER_MS
);

export const aiDubbingWorkerMatchesJob = (worker, job) => (
  worker.PipelineVersion === job.PipelineVersion
  && worker.Capabilities?.profile?.generationConfigHash === job.GenerationConfigHash
  && worker.Engine === job.VoiceEngine
  && worker.Model === job.VoiceModel
  && (worker.ModelRevision || null) === (job.VoiceModelRevision || null)
  && (
    !Array.isArray(worker.Capabilities?.languages)
    || worker.Capabilities.languages.includes(job.TargetLanguage)
  )
);

export async function reclaimExpiredAiDubbingLeases({ database = prisma, now = new Date() } = {}) {
  const jobs = await database.aiDubbingJob.findMany({
    where: { Status: { in: processingStatuses }, LeaseExpiresAt: { lte: now } },
  });
  for (const job of jobs) {
    const exhausted = job.AttemptCount >= job.MaxAttempts;
    const backoff = AI_DUBBING_RETRY_BACKOFF_MS[Math.min(
      Math.max(0, job.AttemptCount - 1),
      AI_DUBBING_RETRY_BACKOFF_MS.length - 1
    )];
    await database.aiDubbingJob.updateMany({
      where: {
        AiDubbingJobID: job.AiDubbingJobID,
        Status: job.Status,
        LeaseGeneration: job.LeaseGeneration,
        LeaseExpiresAt: { lte: now },
      },
      data: {
        Status: exhausted
          ? AI_DUBBING_STATUS.FAILED
          : job.Status === AI_DUBBING_STATUS.PROCESSING_PREVIEW
            ? AI_DUBBING_STATUS.QUEUED_PREVIEW
            : AI_DUBBING_STATUS.QUEUED_FULL,
        Phase: exhausted ? "FAILED" : "QUEUED",
        AssignedWorkerID: null,
        LeaseTokenHash: null,
        LeaseExpiresAt: null,
        ArtifactManifest: Prisma.DbNull,
        ArtifactManifestHash: null,
        NextEligibleAt: exhausted ? null : new Date(now.getTime() + backoff),
        ErrorMessage: "Le clone de doublage n'a pas renouvelé son bail.",
        CompletedAt: exhausted ? now : null,
      },
    });
    await cleanupAiDubbingArtifacts(job).catch(() => {});
  }
  return jobs.length;
}

export async function claimNextAiDubbingJob({
  workerId,
  database = prisma,
  config,
  now = new Date(),
} = {}) {
  const runtimeConfig = config || assertAiDubbingConfig();
  const instant = new Date(now);
  await reclaimExpiredAiDubbingLeases({ database, now: instant });
  return database.$transaction(async (tx) => {
    const requester = await tx.aiDubbingWorker.findUnique({
      where: { AiDubbingWorkerID: String(workerId) },
      include: { Registry: true },
    });
    if (!requester || !workerIsOnline(requester, instant, runtimeConfig)) return null;
    const [dubbingBusy, subtitleBusy, encodingBusy] = await Promise.all([
      tx.aiDubbingJob.count({
        where: { AssignedWorkerID: String(workerId), Status: { in: processingStatuses }, LeaseExpiresAt: { gt: instant } },
      }),
      tx.aiSubtitleJob.count({
        where: { AssignedWorkerID: String(workerId), Status: "LEASED", LeaseExpiresAt: { gt: instant } },
      }),
      tx.videoEncodingTask.count({
        where: { AssignedWorkerID: String(workerId), Status: "LEASED", LeaseExpiresAt: { gt: instant } },
      }),
    ]);
    if (dubbingBusy || subtitleBusy || encodingBusy) return null;
    const workers = await tx.aiDubbingWorker.findMany({ include: { Registry: true } });
    const online = workers.filter((worker) => workerIsOnline(worker, instant, runtimeConfig));
    const jobs = await tx.aiDubbingJob.findMany({
      where: {
        Status: { in: queuedStatuses },
        Phase: "QUEUED",
        OR: [{ NextEligibleAt: null }, { NextEligibleAt: { lte: instant } }],
      },
      orderBy: { CreatedAt: "asc" },
      take: 20,
    });
    const candidate = jobs.find((job) => {
      if (!job.InputManifest || !job.InputManifestHash) return false;
      const eligible = online.filter((worker) => aiDubbingWorkerMatchesJob(worker, job));
      eligible.sort((left, right) => {
        if (job.PreferredWorkerID) {
          if (left.AiDubbingWorkerID === job.PreferredWorkerID) return -1;
          if (right.AiDubbingWorkerID === job.PreferredWorkerID) return 1;
        }
        return Number(right.PerformanceScore) - Number(left.PerformanceScore)
          || left.AiDubbingWorkerID.localeCompare(right.AiDubbingWorkerID);
      });
      return eligible[0]?.AiDubbingWorkerID === String(workerId);
    });
    if (!candidate) return null;
    const leaseToken = randomBytes(32).toString("base64url");
    const leaseGeneration = candidate.LeaseGeneration + 1;
    const leaseExpiresAt = new Date(instant.getTime() + runtimeConfig.leaseDurationMs);
    const processingStatus = candidate.Status === AI_DUBBING_STATUS.QUEUED_PREVIEW
      ? AI_DUBBING_STATUS.PROCESSING_PREVIEW
      : AI_DUBBING_STATUS.PROCESSING_FULL;
    const updated = await tx.aiDubbingJob.updateMany({
      where: {
        AiDubbingJobID: candidate.AiDubbingJobID,
        Status: candidate.Status,
        LeaseGeneration: candidate.LeaseGeneration,
      },
      data: {
        Status: processingStatus,
        Phase: "DOWNLOADING",
        Progress: 5,
        AssignedWorkerID: String(workerId),
        LeaseTokenHash: hashLease(leaseToken),
        LeaseGeneration: leaseGeneration,
        LeaseExpiresAt: leaseExpiresAt,
        AttemptCount: { increment: 1 },
        ArtifactManifest: Prisma.DbNull,
        ArtifactManifestHash: null,
        StartedAt: candidate.StartedAt || instant,
        CompletedAt: null,
        ErrorMessage: null,
      },
    });
    if (updated.count !== 1) return null;
    return {
      job: await tx.aiDubbingJob.findUnique({ where: { AiDubbingJobID: candidate.AiDubbingJobID } }),
      phase: processingStatus === AI_DUBBING_STATUS.PROCESSING_PREVIEW ? "preview" : "full",
      leaseToken,
      leaseGeneration,
      leaseExpiresAt,
      renewAfterMs: runtimeConfig.leaseRenewIntervalMs,
    };
  });
}

export async function assertActiveAiDubbingLease({
  jobId,
  workerId,
  leaseToken,
  leaseGeneration,
  database = prisma,
} = {}) {
  const job = await database.aiDubbingJob.findUnique({
    where: { AiDubbingJobID: String(jobId) },
  });
  const expected = Buffer.from(job?.LeaseTokenHash || "", "hex");
  const actual = Buffer.from(hashLease(leaseToken), "hex");
  if (
    !job
    || !processingStatuses.includes(job.Status)
    || job.AssignedWorkerID !== String(workerId)
    || job.LeaseGeneration !== Number(leaseGeneration)
    || expected.length !== actual.length
    || !timingSafeEqual(expected, actual)
    || !job.LeaseExpiresAt
    || job.LeaseExpiresAt <= new Date()
  ) {
    const error = new Error("Le bail de doublage IA n'est plus valide.");
    error.statusCode = 409;
    error.code = "AI_DUBBING_LEASE_LOST";
    throw error;
  }
  return job;
}

export async function renewAiDubbingLease({
  jobId, workerId, leaseToken, leaseGeneration, progress, phase,
  database = prisma, config,
} = {}) {
  const runtimeConfig = config || assertAiDubbingConfig();
  const job = await assertActiveAiDubbingLease({ jobId, workerId, leaseToken, leaseGeneration, database });
  return database.aiDubbingJob.update({
    where: { AiDubbingJobID: job.AiDubbingJobID },
    data: {
      Progress: clampProgress(progress),
      Phase: String(phase || job.Phase).slice(0, 32),
      LeaseExpiresAt: new Date(Date.now() + runtimeConfig.leaseDurationMs),
    },
  });
}

export async function failAiDubbingLease({
  jobId, workerId, leaseToken, leaseGeneration, errorMessage, retryable = true,
  database = prisma,
} = {}) {
  const job = await assertActiveAiDubbingLease({ jobId, workerId, leaseToken, leaseGeneration, database });
  const exhausted = retryable === false || job.AttemptCount >= job.MaxAttempts;
  const backoff = AI_DUBBING_RETRY_BACKOFF_MS[Math.min(
    Math.max(0, job.AttemptCount - 1),
    AI_DUBBING_RETRY_BACKOFF_MS.length - 1
  )];
  const queuedStatus = job.Status === AI_DUBBING_STATUS.PROCESSING_PREVIEW
    ? AI_DUBBING_STATUS.QUEUED_PREVIEW
    : AI_DUBBING_STATUS.QUEUED_FULL;
  const updated = await database.aiDubbingJob.update({
    where: { AiDubbingJobID: job.AiDubbingJobID },
    data: {
      Status: exhausted ? AI_DUBBING_STATUS.FAILED : queuedStatus,
      Phase: exhausted ? "FAILED" : "QUEUED",
      AssignedWorkerID: null,
      LeaseTokenHash: null,
      LeaseExpiresAt: null,
      ArtifactManifest: Prisma.DbNull,
      ArtifactManifestHash: null,
      NextEligibleAt: exhausted ? null : new Date(Date.now() + backoff),
      ErrorMessage: String(errorMessage || "Échec du clone de doublage.").slice(0, 10_000),
      CompletedAt: exhausted ? new Date() : null,
    },
  });
  await cleanupAiDubbingArtifacts(job).catch(() => {});
  return updated;
}

export async function getAiDubbingLeaseAsset({
  jobId, workerId, leaseToken, leaseGeneration, fileId, offset,
  database = prisma, config,
} = {}) {
  const job = await assertActiveAiDubbingLease({ jobId, workerId, leaseToken, leaseGeneration, database });
  return openAiDubbingInputAsset({ job, fileId, offset, config });
}

export async function registerAiDubbingArtifactManifest({
  jobId, workerId, leaseToken, leaseGeneration, manifest, manifestHash,
  database = prisma,
} = {}) {
  const job = await assertActiveAiDubbingLease({ jobId, workerId, leaseToken, leaseGeneration, database });
  const expectedPhase = job.Status === AI_DUBBING_STATUS.PROCESSING_PREVIEW ? "preview" : "full";
  const validated = validateAiDubbingArtifactManifest(manifest, expectedPhase);
  if (validated.hash !== String(manifestHash || "")) {
    const error = new Error("L'empreinte du manifeste de sortie est invalide.");
    error.statusCode = 409;
    throw error;
  }
  return database.aiDubbingJob.update({
    where: { AiDubbingJobID: job.AiDubbingJobID },
    data: {
      ArtifactManifest: validated.manifest,
      ArtifactManifestHash: validated.hash,
      Phase: "UPLOADING",
      Progress: Math.max(job.Progress, 92),
    },
  });
}

export async function uploadAiDubbingArtifact({
  jobId, workerId, leaseToken, leaseGeneration, fileId, stream,
  declaredBodySha256, declaredContentLength, database = prisma, config,
} = {}) {
  const job = await assertActiveAiDubbingLease({ jobId, workerId, leaseToken, leaseGeneration, database });
  if (!job.ArtifactManifest) throw new Error("Le manifeste de sortie doit être enregistré avant les fichiers.");
  return receiveAiDubbingArtifact({
    job,
    fileId,
    stream,
    declaredBodySha256,
    declaredContentLength,
    config,
  });
}

export async function completeAiDubbingLease({
  jobId, workerId, leaseToken, leaseGeneration, result,
  database = prisma, config,
} = {}) {
  const runtimeConfig = config || assertAiDubbingConfig();
  const job = await assertActiveAiDubbingLease({ jobId, workerId, leaseToken, leaseGeneration, database });
  if (!job.ArtifactManifest || !job.ArtifactManifestHash) {
    throw new Error("Le clone n'a enregistré aucun manifeste de sortie.");
  }
  const files = await resolveUploadedAiDubbingArtifacts(job, runtimeConfig);
  const promoted = await promoteAiDubbingResult({ job, result, files, database });
  await cleanupAiDubbingArtifacts(job, runtimeConfig).catch(() => {});
  if (job.Status === AI_DUBBING_STATUS.PROCESSING_FULL) {
    await cleanupAiDubbingInput(job.AiDubbingJobID, runtimeConfig).catch(() => {});
  }
  return promoted;
}
