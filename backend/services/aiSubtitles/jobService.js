import crypto from "crypto";
import fs from "fs";
import path from "path";

import { ETAT } from "../../constants.js";
import { prisma } from "../db.js";
import { upsertEncodingWorker } from "../distributedEncoding/persistence.js";
import { VIDEO_ROOT } from "../video/videoPaths.js";
import {
  AI_SUBTITLE_JOB_STATUS,
  AI_SUBTITLE_OFFLINE_AFTER_MS,
  AI_SUBTITLE_PHASE,
  AI_SUBTITLE_RETRY_BACKOFF_MS,
} from "./constants.js";
import { assertAiSubtitleConfig } from "./config.js";
import {
  aiLanguageLabel,
  isFullFrenchSubtitle,
  normalizeAiLanguage,
  requireAiLanguage,
} from "./language.js";
import {
  cleanupAiSubtitleSource,
  prepareAiSubtitleAudio,
  resolveAiSubtitleSource,
} from "./sourceService.js";
import { isAiSubtitleSettingActive } from "./settingService.js";
import { buildWebVtt, normalizeAiSegments } from "./vtt.js";

const { createHash, randomBytes, randomUUID, timingSafeEqual } = crypto;
const ACTIVE_JOB_STATUSES = [
  AI_SUBTITLE_JOB_STATUS.QUEUED,
  AI_SUBTITLE_JOB_STATUS.PREPARING,
  AI_SUBTITLE_JOB_STATUS.LEASED,
];

const hashLease = (token) => createHash("sha256").update(String(token), "utf8").digest("hex");
const clampProgress = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const serializeBigInt = (value) => value == null ? null : value.toString();

export const serializeAiSubtitleJob = (job) => job && ({
  id: job.AiSubtitleJobID,
  videoId: job.VideoID,
  targetLanguage: job.TargetLanguage,
  requestedByUserId: job.RequestedByUserID,
  automatic: Boolean(job.Automatic),
  status: job.Status,
  phase: job.Phase,
  progress: job.Progress,
  sourceLanguage: job.SourceLanguage,
  assignedWorkerId: job.AssignedWorkerID,
  attemptCount: job.AttemptCount,
  maxAttempts: job.MaxAttempts,
  error: job.ErrorMessage,
  createdAt: job.CreatedAt,
  updatedAt: job.UpdatedAt,
  completedAt: job.CompletedAt,
});

export const serializeAiSubtitleWorker = (worker) => worker && ({
  id: worker.AiSubtitleWorkerID,
  role: worker.Role,
  ready: Boolean(worker.Ready),
  engine: worker.Engine,
  device: worker.Device,
  model: worker.Model,
  translationModel: worker.TranslationModel,
  pipelineVersion: worker.PipelineVersion,
  performanceScore: worker.PerformanceScore,
  maxSlots: worker.MaxSlots,
  lastHeartbeatAt: worker.LastHeartbeatAt,
  lastError: worker.LastError,
  capabilities: worker.Capabilities,
});

const frenchSubtitleWhere = {
  AND: [
    {
      OR: [
        { Language: { in: ["fr", "fra", "fre"] } },
        { Label: { in: ["fr", "fra", "fre", "French", "Français", "Francais"] } },
        { Label: { contains: "French" } },
        { Label: { contains: "Français" } },
        { Label: { contains: "Francais" } },
        { CheminSubtitle: { contains: "/fre_" } },
        { CheminSubtitle: { contains: "/fra_" } },
        { CheminSubtitle: { contains: "/fr_" } },
      ],
    },
    { Type: { not: "FORCED" } },
    { NOT: { Label: { contains: "Forced" } } },
    { NOT: { Label: { contains: "forcé" } } },
  ],
};

export async function videoHasFullSubtitle(videoId, language, { database = prisma } = {}) {
  const normalized = requireAiLanguage(language);
  const subtitles = await database.videoSubtitle.findMany({
    where: { VideoID: Number(videoId) },
    select: {
      Language: true,
      Label: true,
      CheminSubtitle: true,
      Type: true,
    },
  });
  if (normalized === "fr") return subtitles.some(isFullFrenchSubtitle);
  return subtitles.some((subtitle) =>
    String(subtitle.Type || "FULL").toUpperCase() !== "FORCED"
    && String(subtitle.Language || "").toLowerCase() === normalized
  );
}

export async function listVideosWithoutFrenchSubtitles({ page = 1, database = prisma } = {}) {
  const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const pageSize = 40;
  const where = {
    EtatID: ETAT.ACTIVE,
    VideoSubtitles: { none: frenchSubtitleWhere },
  };
  const total = await database.video.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const videos = await database.video.findMany({
    where,
    orderBy: [{ CreateDate: "desc" }, { VideoID: "desc" }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    select: {
      VideoID: true,
      Titre: true,
      CreateDate: true,
      Saison: {
        select: {
          Numero: true,
          Series: { select: { Titre: true } },
        },
      },
      AiSubtitleJobs: {
        where: { TargetLanguage: "fr" },
        take: 1,
        orderBy: { CreatedAt: "desc" },
      },
    },
  });
  return {
    items: videos.map((video) => ({
      videoId: video.VideoID,
      title: video.Titre,
      seriesTitle: video.Saison?.Series?.Titre || null,
      seasonNumber: video.Saison?.Numero ?? null,
      createdAt: video.CreateDate,
      job: serializeAiSubtitleJob(video.AiSubtitleJobs[0]),
    })),
    pagination: {
      page: currentPage,
      pageSize,
      total,
      totalPages,
    },
  };
}

export async function queueAiSubtitleJob({
  videoId,
  targetLanguage,
  requestedByUserId = null,
  automatic = false,
  database = prisma,
} = {}) {
  if (!(await isAiSubtitleSettingActive({ database }))) {
    const error = new Error("La génération de sous-titres IA est désactivée.");
    error.statusCode = 409;
    error.code = "AI_SUBTITLES_DISABLED";
    throw error;
  }
  const parsedVideoId = Number(videoId);
  const language = requireAiLanguage(targetLanguage);
  const video = await database.video.findUnique({
    where: { VideoID: parsedVideoId },
    select: { VideoID: true, EtatID: true },
  });
  if (!video || video.EtatID !== ETAT.ACTIVE) {
    const error = new Error("Vidéo introuvable.");
    error.statusCode = 404;
    throw error;
  }
  if (await videoHasFullSubtitle(parsedVideoId, language, { database })) {
    return { alreadyAvailable: true, job: null };
  }

  const config = assertAiSubtitleConfig();
  const existing = await database.aiSubtitleJob.findUnique({
    where: { VideoID_TargetLanguage: { VideoID: parsedVideoId, TargetLanguage: language } },
  });
  if (existing && existing.Status !== AI_SUBTITLE_JOB_STATUS.FAILED) {
    return { alreadyAvailable: false, job: existing };
  }
  if (requestedByUserId && !existing) {
    const activeForUser = await database.aiSubtitleJob.count({
      where: {
        RequestedByUserID: Number(requestedByUserId),
        Status: { in: ACTIVE_JOB_STATUSES },
      },
    });
    if (activeForUser >= 3) {
      const error = new Error(
        "Trois demandes de sous-titres IA sont déjà en cours pour ce compte."
      );
      error.statusCode = 429;
      error.code = "AI_SUBTITLE_USER_QUEUE_LIMIT";
      throw error;
    }
  }
  if (existing) {
    const job = await database.aiSubtitleJob.update({
      where: { AiSubtitleJobID: existing.AiSubtitleJobID },
      data: {
        RequestedByUserID: requestedByUserId || existing.RequestedByUserID,
        Automatic: automatic && existing.RequestedByUserID == null,
        Status: AI_SUBTITLE_JOB_STATUS.QUEUED,
        Phase: AI_SUBTITLE_PHASE.QUEUED,
        Progress: 0,
        ErrorMessage: null,
        NextEligibleAt: null,
        AttemptCount: 0,
        StartedAt: null,
        CompletedAt: null,
        SourceRelativePath: null,
        SourceSize: null,
        SourceSha256: null,
        AssignedWorkerID: null,
        LeaseTokenHash: null,
        LeaseExpiresAt: null,
        PipelineVersion: config.pipelineVersion,
      },
    });
    return { alreadyAvailable: false, job };
  }
  const job = await database.aiSubtitleJob.create({
    data: {
      AiSubtitleJobID: randomUUID(),
      VideoID: parsedVideoId,
      TargetLanguage: language,
      RequestedByUserID: requestedByUserId,
      Automatic: automatic,
      Status: AI_SUBTITLE_JOB_STATUS.QUEUED,
      Phase: AI_SUBTITLE_PHASE.QUEUED,
      PipelineVersion: config.pipelineVersion,
    },
  });
  return { alreadyAvailable: false, job };
}

export async function queueAutomaticFrenchSubtitle(videoId) {
  if (!(await isAiSubtitleSettingActive())) return null;
  return queueAiSubtitleJob({ videoId, targetLanguage: "fr", automatic: true });
}

export async function prepareNextAiSubtitleSource({ database = prisma, config } = {}) {
  const runtimeConfig = config || assertAiSubtitleConfig();
  if (runtimeConfig.role !== "PRIMARY") return null;
  const candidates = await database.aiSubtitleJob.findMany({
    where: {
      Status: AI_SUBTITLE_JOB_STATUS.QUEUED,
      SourceRelativePath: null,
      Video: { AiTranscript: { is: null } },
    },
    orderBy: [{ Automatic: "desc" }, { CreatedAt: "asc" }],
    take: 40,
    include: {
      Video: {
        select: {
          CheminAcces: true,
          AiSubtitleJobs: {
            where: {
              OR: [
                { Status: { in: [
                  AI_SUBTITLE_JOB_STATUS.PREPARING,
                  AI_SUBTITLE_JOB_STATUS.LEASED,
                ] } },
                {
                  Status: AI_SUBTITLE_JOB_STATUS.QUEUED,
                  SourceRelativePath: { not: null },
                },
              ],
            },
            select: { AiSubtitleJobID: true },
          },
        },
      },
    },
  });
  const job = candidates.find((candidate) => (
    candidate.Video.AiSubtitleJobs.length === 0
  ));
  if (!job) return null;
  const locked = await database.aiSubtitleJob.updateMany({
    where: {
      AiSubtitleJobID: job.AiSubtitleJobID,
      Status: AI_SUBTITLE_JOB_STATUS.QUEUED,
      SourceRelativePath: null,
    },
    data: {
      Status: AI_SUBTITLE_JOB_STATUS.PREPARING,
      Phase: AI_SUBTITLE_PHASE.PREPARING_AUDIO,
      Progress: 2,
    },
  });
  if (locked.count !== 1) return null;
  try {
    const source = await prepareAiSubtitleAudio({
      jobId: job.AiSubtitleJobID,
      videoPath: job.Video.CheminAcces,
      config: runtimeConfig,
    });
    return database.aiSubtitleJob.update({
      where: { AiSubtitleJobID: job.AiSubtitleJobID },
      data: {
        Status: AI_SUBTITLE_JOB_STATUS.QUEUED,
        Phase: AI_SUBTITLE_PHASE.QUEUED,
        Progress: 5,
        SourceRelativePath: source.relativePath,
        SourceSize: BigInt(source.size),
        SourceSha256: source.sha256,
        ErrorMessage: null,
      },
    });
  } catch (error) {
    await cleanupAiSubtitleSource(job.AiSubtitleJobID, runtimeConfig).catch(() => {});
    await database.aiSubtitleJob.update({
      where: { AiSubtitleJobID: job.AiSubtitleJobID },
      data: {
        Status: AI_SUBTITLE_JOB_STATUS.FAILED,
        Phase: AI_SUBTITLE_PHASE.FAILED,
        SourceRelativePath: null,
        SourceSize: null,
        SourceSha256: null,
        ErrorMessage: String(error?.message || error).slice(0, 4000),
        CompletedAt: new Date(),
      },
    });
    throw error;
  }
}

export async function ensureAiPrimaryWorker({ database = prisma, config } = {}) {
  const runtimeConfig = config || assertAiSubtitleConfig();
  await upsertEncodingWorker({
    instanceId: runtimeConfig.instanceId,
    role: "PRIMARY",
    pipelineVersion: process.env.SAMI_DISTRIBUTED_ENCODING_PIPELINE_VERSION
      || "sami-hls-libx264-aac-v1",
    displayName: "Serveur principal",
    enabled: true,
    maxNominalHeight: 360,
  }, { database });
}

export async function heartbeatAiSubtitleWorker(workerId, heartbeat, {
  database = prisma,
  now = new Date(),
} = {}) {
  const registry = await database.videoEncodingWorker.findUnique({
    where: { VideoEncodingWorkerID: String(workerId) },
  });
  if (!registry || !registry.Enabled) {
    const error = new Error("Le worker IA n'est pas enregistré ou est désactivé.");
    error.statusCode = 403;
    error.code = "AI_SUBTITLE_WORKER_FORBIDDEN";
    throw error;
  }
  return database.aiSubtitleWorker.upsert({
    where: { AiSubtitleWorkerID: String(workerId) },
    create: {
      AiSubtitleWorkerID: String(workerId),
      Role: String(heartbeat.role || registry.Role).toUpperCase(),
      Ready: Boolean(heartbeat.ready),
      Engine: heartbeat.engine || null,
      Device: heartbeat.device || null,
      Model: heartbeat.model || null,
      TranslationModel: heartbeat.translationModel || null,
      PipelineVersion: String(heartbeat.pipelineVersion || ""),
      PerformanceScore: Number(heartbeat.performanceScore) || registry.PerformanceScore || 1,
      MaxSlots: 1,
      Capabilities: heartbeat.capabilities || null,
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
      TranslationModel: heartbeat.translationModel || null,
      PipelineVersion: String(heartbeat.pipelineVersion || ""),
      PerformanceScore: Number(heartbeat.performanceScore) || registry.PerformanceScore || 1,
      MaxSlots: 1,
      Capabilities: heartbeat.capabilities || null,
      BootID: heartbeat.bootId || null,
      LastHeartbeatAt: now,
      LastError: heartbeat.lastError || null,
    },
  });
}

export async function reclaimExpiredAiSubtitleLeases({
  database = prisma,
  now = new Date(),
  config,
} = {}) {
  const expired = await database.aiSubtitleJob.findMany({
    where: {
      Status: AI_SUBTITLE_JOB_STATUS.LEASED,
      LeaseExpiresAt: { lte: now },
    },
    select: {
      AiSubtitleJobID: true,
      AttemptCount: true,
      MaxAttempts: true,
      SourceRelativePath: true,
    },
  });
  for (const job of expired) {
    const exhausted = job.AttemptCount >= job.MaxAttempts;
    const backoff = AI_SUBTITLE_RETRY_BACKOFF_MS[Math.min(
      Math.max(0, job.AttemptCount - 1),
      AI_SUBTITLE_RETRY_BACKOFF_MS.length - 1
    )];
    const updated = await database.aiSubtitleJob.updateMany({
      where: {
        AiSubtitleJobID: job.AiSubtitleJobID,
        Status: AI_SUBTITLE_JOB_STATUS.LEASED,
        LeaseExpiresAt: { lte: now },
      },
      data: {
        Status: exhausted ? AI_SUBTITLE_JOB_STATUS.FAILED : AI_SUBTITLE_JOB_STATUS.QUEUED,
        Phase: exhausted ? AI_SUBTITLE_PHASE.FAILED : AI_SUBTITLE_PHASE.QUEUED,
        AssignedWorkerID: null,
        LeaseTokenHash: null,
        LeaseExpiresAt: null,
        NextEligibleAt: exhausted ? null : new Date(now.getTime() + backoff),
        ErrorMessage: "Le worker IA n'a pas renouvelé son bail.",
        CompletedAt: exhausted ? now : null,
        ...(exhausted ? {
          SourceRelativePath: null,
          SourceSize: null,
          SourceSha256: null,
        } : {}),
      },
    });
    if (updated.count === 1 && exhausted && job.SourceRelativePath) {
      await cleanupAiSubtitleSource(job.AiSubtitleJobID, config).catch(() => {});
    }
  }
  return expired.length;
}

const workerIsOnline = (worker, now, config) =>
  worker.Ready
  && worker.Registry?.Enabled
  && !worker.Registry?.Draining
  && worker.PipelineVersion === config.pipelineVersion
  && worker.LastHeartbeatAt
  && new Date(worker.LastHeartbeatAt).getTime() >= now.getTime() - AI_SUBTITLE_OFFLINE_AFTER_MS;

export async function claimNextAiSubtitleJob({
  workerId,
  database = prisma,
  config,
  now = new Date(),
} = {}) {
  const runtimeConfig = config || assertAiSubtitleConfig();
  const instant = new Date(now);
  await reclaimExpiredAiSubtitleLeases({ database, now: instant, config: runtimeConfig });
  return database.$transaction(async (tx) => {
    const workers = await tx.aiSubtitleWorker.findMany({
      include: { Registry: true },
    });
    const onlineWorkers = workers
      .filter((item) => workerIsOnline(item, instant, runtimeConfig))
      .sort((left, right) =>
        Number(right.PerformanceScore) - Number(left.PerformanceScore)
        || left.AiSubtitleWorkerID.localeCompare(right.AiSubtitleWorkerID)
      );
    const preferredWorker = onlineWorkers[0];
    if (preferredWorker?.AiSubtitleWorkerID !== String(workerId)) return null;
    const [activeAiJobs, encodingBusy] = await Promise.all([
      tx.aiSubtitleJob.count({
        where: {
          Status: AI_SUBTITLE_JOB_STATUS.LEASED,
          LeaseExpiresAt: { gt: instant },
        },
      }),
      tx.videoEncodingTask.count({
        where: {
          AssignedWorkerID: preferredWorker.AiSubtitleWorkerID,
          Status: "LEASED",
          LeaseExpiresAt: { gt: instant },
        },
      }),
    ]);
    if (activeAiJobs > 0 || encodingBusy > 0) return null;

    const jobs = await tx.aiSubtitleJob.findMany({
      where: {
        Status: AI_SUBTITLE_JOB_STATUS.QUEUED,
        OR: [{ NextEligibleAt: null }, { NextEligibleAt: { lte: instant } }],
        AND: [{
          OR: [
            { SourceRelativePath: { not: null } },
            { Video: { AiTranscript: { isNot: null } } },
          ],
        }],
      },
      orderBy: [{ Automatic: "desc" }, { CreatedAt: "asc" }],
      take: 20,
      include: { Video: { include: { AiTranscript: true } } },
    });
    const candidate = jobs[0] || null;
    if (!candidate) return null;

    const leaseToken = randomBytes(32).toString("base64url");
    const leaseGeneration = candidate.LeaseGeneration + 1;
    const leaseExpiresAt = new Date(instant.getTime() + runtimeConfig.leaseDurationMs);
    const updated = await tx.aiSubtitleJob.updateMany({
      where: {
        AiSubtitleJobID: candidate.AiSubtitleJobID,
        Status: AI_SUBTITLE_JOB_STATUS.QUEUED,
        LeaseGeneration: candidate.LeaseGeneration,
      },
      data: {
        Status: AI_SUBTITLE_JOB_STATUS.LEASED,
        Phase: candidate.Video.AiTranscript
          ? AI_SUBTITLE_PHASE.TRANSLATING
          : AI_SUBTITLE_PHASE.TRANSCRIBING,
        Progress: 10,
        AssignedWorkerID: String(workerId),
        LeaseTokenHash: hashLease(leaseToken),
        LeaseGeneration: leaseGeneration,
        LeaseExpiresAt: leaseExpiresAt,
        AttemptCount: { increment: 1 },
        StartedAt: candidate.StartedAt || instant,
        ErrorMessage: null,
      },
    });
    if (updated.count !== 1) return null;
    return {
      job: await tx.aiSubtitleJob.findUnique({
        where: { AiSubtitleJobID: candidate.AiSubtitleJobID },
        include: { Video: { include: { AiTranscript: true } } },
      }),
      leaseToken,
      leaseGeneration,
      leaseExpiresAt,
      renewAfterMs: runtimeConfig.leaseRenewIntervalMs,
    };
  });
}

const assertActiveLease = async ({ jobId, workerId, leaseToken, leaseGeneration, database }) => {
  const job = await database.aiSubtitleJob.findUnique({
    where: { AiSubtitleJobID: String(jobId) },
  });
  const expected = Buffer.from(job?.LeaseTokenHash || "", "hex");
  const actual = Buffer.from(hashLease(leaseToken), "hex");
  if (
    !job
    || job.Status !== AI_SUBTITLE_JOB_STATUS.LEASED
    || job.AssignedWorkerID !== String(workerId)
    || job.LeaseGeneration !== Number(leaseGeneration)
    || expected.length !== actual.length
    || !timingSafeEqual(expected, actual)
    || !job.LeaseExpiresAt
    || job.LeaseExpiresAt <= new Date()
  ) {
    const error = new Error("Le bail de sous-titrage IA n'est plus valide.");
    error.statusCode = 409;
    error.code = "AI_SUBTITLE_LEASE_LOST";
    throw error;
  }
  return job;
};

export async function renewAiSubtitleLease({
  jobId, workerId, leaseToken, leaseGeneration, progress, phase,
  database = prisma, config,
}) {
  const runtimeConfig = config || assertAiSubtitleConfig();
  const job = await assertActiveLease({
    jobId, workerId, leaseToken, leaseGeneration, database,
  });
  return database.aiSubtitleJob.update({
    where: { AiSubtitleJobID: job.AiSubtitleJobID },
    data: {
      Progress: clampProgress(progress),
      Phase: phase || job.Phase,
      LeaseExpiresAt: new Date(Date.now() + runtimeConfig.leaseDurationMs),
    },
  });
}

export async function failAiSubtitleLease({
  jobId, workerId, leaseToken, leaseGeneration, errorMessage,
  database = prisma, config,
}) {
  const job = await assertActiveLease({
    jobId, workerId, leaseToken, leaseGeneration, database,
  });
  const exhausted = job.AttemptCount >= job.MaxAttempts;
  const backoff = AI_SUBTITLE_RETRY_BACKOFF_MS[Math.min(
    Math.max(0, job.AttemptCount - 1),
    AI_SUBTITLE_RETRY_BACKOFF_MS.length - 1
  )];
  const updated = await database.aiSubtitleJob.update({
    where: { AiSubtitleJobID: job.AiSubtitleJobID },
    data: {
      Status: exhausted ? AI_SUBTITLE_JOB_STATUS.FAILED : AI_SUBTITLE_JOB_STATUS.QUEUED,
      Phase: exhausted ? AI_SUBTITLE_PHASE.FAILED : AI_SUBTITLE_PHASE.QUEUED,
      AssignedWorkerID: null,
      LeaseTokenHash: null,
      LeaseExpiresAt: null,
      NextEligibleAt: exhausted ? null : new Date(Date.now() + backoff),
      ErrorMessage: String(errorMessage || "Échec du moteur IA.").slice(0, 4000),
      CompletedAt: exhausted ? new Date() : null,
      ...(exhausted ? {
        SourceRelativePath: null,
        SourceSize: null,
        SourceSha256: null,
      } : {}),
    },
  });
  if (exhausted && job.SourceRelativePath) {
    await cleanupAiSubtitleSource(job.AiSubtitleJobID, config).catch(() => {});
  }
  return updated;
}

export async function getAiSubtitleLeaseSource({
  jobId, workerId, leaseToken, leaseGeneration, database = prisma,
}) {
  const job = await assertActiveLease({
    jobId, workerId, leaseToken, leaseGeneration, database,
  });
  if (!job.SourceRelativePath || !job.SourceSize || !job.SourceSha256) {
    const error = new Error("Cette tâche utilise une transcription existante et n'a pas de source audio.");
    error.statusCode = 404;
    throw error;
  }
  return job;
}

export const serializeAiSubtitleClaim = (claim) => claim && ({
  job: serializeAiSubtitleJob(claim.job),
  source: claim.job.SourceRelativePath ? {
    size: serializeBigInt(claim.job.SourceSize),
    sha256: claim.job.SourceSha256,
  } : null,
  transcript: claim.job.Video?.AiTranscript ? {
    sourceLanguage: claim.job.Video.AiTranscript.SourceLanguage,
    segments: claim.job.Video.AiTranscript.Segments,
  } : null,
  leaseToken: claim.leaseToken,
  leaseGeneration: claim.leaseGeneration,
  leaseExpiresAt: claim.leaseExpiresAt,
  renewAfterMs: claim.renewAfterMs,
});

const writeGeneratedVtt = async ({ videoId, language, segments }) => {
  const directory = path.join(VIDEO_ROOT, String(videoId), "sousTitre");
  const filename = `${language}_ai.vtt`;
  const finalPath = path.join(directory, filename);
  const temporaryPath = `${finalPath}.${randomUUID()}.tmp`;
  await fs.promises.mkdir(directory, { recursive: true });
  try {
    await fs.promises.writeFile(temporaryPath, buildWebVtt(segments), {
      encoding: "utf8",
      mode: 0o640,
    });
    await fs.promises.rename(temporaryPath, finalPath);
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
  return {
    absolutePath: finalPath,
    storagePath: path.posix.join(
      "uploads", "video", String(videoId), "sousTitre", filename
    ),
  };
};

export async function completeAiSubtitleLease({
  jobId, workerId, leaseToken, leaseGeneration, result,
  database = prisma, config,
}) {
  const runtimeConfig = config || assertAiSubtitleConfig();
  const job = await assertActiveLease({
    jobId, workerId, leaseToken, leaseGeneration, database,
  });
  const targetSegments = normalizeAiSegments(result?.targetSegments);
  const sourceSegments = result?.sourceSegments
    ? normalizeAiSegments(result.sourceSegments)
    : null;
  const sourceLanguage = normalizeAiLanguage(result?.sourceLanguage || job.TargetLanguage);
  if (!sourceLanguage) throw new TypeError("La langue source détectée est invalide.");
  const generatedVtt = await writeGeneratedVtt({
    videoId: job.VideoID,
    language: job.TargetLanguage,
    segments: targetSegments,
  });

  let completed;
  try {
    completed = await database.$transaction(async (tx) => {
      await assertActiveLease({
        jobId,
        workerId,
        leaseToken,
        leaseGeneration,
        database: tx,
      });
      if (sourceSegments) {
        await tx.aiVideoTranscript.upsert({
          where: { VideoID: job.VideoID },
          create: {
            VideoID: job.VideoID,
            SourceLanguage: sourceLanguage,
            Segments: sourceSegments,
            PlainText: sourceSegments.map((segment) => segment.text).join("\n"),
            TranscriptionModel: String(result?.transcriptionModel || "unknown").slice(0, 120),
            PipelineVersion: runtimeConfig.pipelineVersion,
          },
          update: {
            SourceLanguage: sourceLanguage,
            Segments: sourceSegments,
            PlainText: sourceSegments.map((segment) => segment.text).join("\n"),
            TranscriptionModel: String(result?.transcriptionModel || "unknown").slice(0, 120),
            PipelineVersion: runtimeConfig.pipelineVersion,
          },
        });
      }
      await tx.videoSubtitle.upsert({
        where: { AiSubtitleJobID: job.AiSubtitleJobID },
        create: {
          VideoID: job.VideoID,
          Label: `${aiLanguageLabel(job.TargetLanguage)} (IA)`,
          CheminSubtitle: generatedVtt.storagePath,
          Language: job.TargetLanguage,
          Type: "FULL",
          Origin: "AI",
          AiSubtitleJobID: job.AiSubtitleJobID,
        },
        update: {
          Label: `${aiLanguageLabel(job.TargetLanguage)} (IA)`,
          CheminSubtitle: generatedVtt.storagePath,
          Language: job.TargetLanguage,
          Type: "FULL",
          Origin: "AI",
        },
      });
      return tx.aiSubtitleJob.update({
        where: { AiSubtitleJobID: job.AiSubtitleJobID },
        data: {
          Status: AI_SUBTITLE_JOB_STATUS.COMPLETED,
          Phase: AI_SUBTITLE_PHASE.COMPLETED,
          Progress: 100,
          SourceLanguage: sourceLanguage,
          TranscriptionModel: String(result?.transcriptionModel || "unknown").slice(0, 120),
          TranslationModel: String(result?.translationModel || "none").slice(0, 191),
          SourceRelativePath: null,
          SourceSize: null,
          SourceSha256: null,
          AssignedWorkerID: null,
          LeaseTokenHash: null,
          LeaseExpiresAt: null,
          ErrorMessage: null,
          CompletedAt: new Date(),
        },
      });
    });
  } catch (error) {
    await fs.promises.rm(generatedVtt.absolutePath, { force: true }).catch(() => {});
    throw error;
  }
  await cleanupAiSubtitleSource(job.AiSubtitleJobID, runtimeConfig).catch(() => {});
  return completed;
}

export const getLocalAiSubtitleSourcePath = (job) =>
  job?.SourceRelativePath ? resolveAiSubtitleSource(job.SourceRelativePath) : null;

export async function getVideoAiSubtitleJobs(videoId, { database = prisma } = {}) {
  const jobs = await database.aiSubtitleJob.findMany({
    where: { VideoID: Number(videoId) },
    orderBy: { CreatedAt: "asc" },
  });
  return jobs.map(serializeAiSubtitleJob);
}
