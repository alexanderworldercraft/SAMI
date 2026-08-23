import crypto from "crypto";
import fs from "fs";
import path from "path";

import { ETAT } from "../../constants.js";
import { prisma } from "../db.js";
import { resolveUploadPath, VIDEO_ROOT } from "../video/videoPaths.js";
import { assertAiSubtitleConfig } from "./config.js";
import {
  AI_SUBTITLE_JOB_STATUS,
  AI_SUBTITLE_PHASE,
} from "./constants.js";
import { aiSubtitleError } from "./error.js";
import { aiLanguageLabel, normalizeAiLanguage } from "./language.js";
import { cleanupAiSubtitleSource } from "./sourceService.js";
import { isAiSubtitleSettingActive } from "./settingService.js";
import {
  buildWebVtt,
  normalizeEditedAiSegments,
  parseWebVtt,
} from "./vtt.js";

const { randomUUID } = crypto;
const ACTIVE_STATUSES = [
  AI_SUBTITLE_JOB_STATUS.QUEUED,
  AI_SUBTITLE_JOB_STATUS.PREPARING,
  AI_SUBTITLE_JOB_STATUS.LEASED,
];
const PAGE_SIZE = 40;
const MAX_VTT_SIZE = 20 * 1024 * 1024;

const serializeVideo = (video) => ({
  id: video.VideoID,
  title: video.Titre,
  path: video.CheminAcces,
  seriesTitle: video.Saison?.Series?.Titre || null,
  seasonNumber: video.Saison?.Numero ?? null,
});

const serializeGeneratedSubtitleTrack = (subtitle) => ({
  id: subtitle.VideoSubtitleID,
  label: subtitle.Label,
  language: subtitle.Language,
  type: subtitle.Type,
  origin: subtitle.Origin,
  createdAt: subtitle.CreateDate,
  job: subtitle.AiSubtitleJob ? {
    id: subtitle.AiSubtitleJob.AiSubtitleJobID,
    status: subtitle.AiSubtitleJob.Status,
    phase: subtitle.AiSubtitleJob.Phase,
    progress: subtitle.AiSubtitleJob.Progress,
    sourceLanguage: subtitle.AiSubtitleJob.SourceLanguage,
    transcriptionModel: subtitle.AiSubtitleJob.TranscriptionModel,
    translationModel: subtitle.AiSubtitleJob.TranslationModel,
    completedAt: subtitle.AiSubtitleJob.CompletedAt,
    error: subtitle.AiSubtitleJob.ErrorMessage,
  } : null,
});

const serializeGeneratedSubtitle = (subtitle) => ({
  ...serializeGeneratedSubtitleTrack(subtitle),
  video: serializeVideo(subtitle.Video),
});

const generatedSubtitleInclude = {
  AiSubtitleJob: true,
  Video: {
    select: {
      VideoID: true,
      Titre: true,
      CheminAcces: true,
      EtatID: true,
      Saison: {
        select: {
          Numero: true,
          Series: { select: { Titre: true } },
        },
      },
    },
  },
};

const requireGeneratedSubtitle = async (subtitleId, { database = prisma } = {}) => {
  const id = Number(subtitleId);
  if (!Number.isInteger(id) || id <= 0) {
    throw aiSubtitleError("Identifiant de sous-titre invalide.", "AI_SUBTITLE_INVALID_ID", 400);
  }
  const subtitle = await database.videoSubtitle.findFirst({
    where: { VideoSubtitleID: id, Origin: "AI" },
    include: generatedSubtitleInclude,
  });
  if (!subtitle || subtitle.Video.EtatID !== ETAT.ACTIVE) {
    throw aiSubtitleError("Sous-titre IA introuvable.", "AI_SUBTITLE_NOT_FOUND", 404);
  }
  return subtitle;
};

const resolveGeneratedSubtitlePath = (subtitle) => {
  const absolutePath = resolveUploadPath(subtitle.CheminSubtitle);
  const videoSubtitleRoot = `${path.resolve(
    VIDEO_ROOT,
    String(subtitle.VideoID),
    "sousTitre"
  )}${path.sep}`;
  if (!absolutePath || !path.resolve(absolutePath).startsWith(videoSubtitleRoot)) {
    throw aiSubtitleError(
      "Le chemin du sous-titre IA est invalide.",
      "AI_SUBTITLE_INVALID_STORAGE_PATH",
      409
    );
  }
  return absolutePath;
};

const readGeneratedSubtitleSegments = async (subtitle) => {
  const absolutePath = resolveGeneratedSubtitlePath(subtitle);
  let stat;
  try {
    stat = await fs.promises.stat(absolutePath);
  } catch (error) {
    throw aiSubtitleError(
      "Le fichier VTT du sous-titre IA est introuvable.",
      "AI_SUBTITLE_FILE_NOT_FOUND",
      404,
      error
    );
  }
  if (!stat.isFile() || stat.size > MAX_VTT_SIZE) {
    throw aiSubtitleError(
      "Le fichier VTT du sous-titre IA est invalide.",
      "AI_SUBTITLE_INVALID_FILE",
      409
    );
  }
  try {
    const content = await fs.promises.readFile(absolutePath, "utf8");
    return { absolutePath, segments: parseWebVtt(content) };
  } catch (error) {
    if (error?.code?.startsWith?.("AI_SUBTITLE_")) throw error;
    throw aiSubtitleError(
      error?.message || "Lecture du fichier VTT impossible.",
      "AI_SUBTITLE_INVALID_VTT",
      409,
      error
    );
  }
};

const writeGeneratedSubtitleSegments = async (absolutePath, segments) => {
  const normalized = normalizeEditedAiSegments(segments);
  const temporaryPath = `${absolutePath}.${randomUUID()}.tmp`;
  try {
    await fs.promises.writeFile(temporaryPath, buildWebVtt(normalized), {
      encoding: "utf8",
      mode: 0o640,
    });
    await fs.promises.rename(temporaryPath, absolutePath);
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {});
    throw aiSubtitleError(
      "Enregistrement atomique du sous-titre impossible.",
      "AI_SUBTITLE_WRITE_FAILED",
      500,
      error
    );
  }
  return normalized;
};

export async function listGeneratedAiSubtitles({
  page = 1,
  search = "",
  database = prisma,
} = {}) {
  const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const normalizedSearch = String(search || "").trim().slice(0, 100);
  if (!normalizedSearch) {
    return {
      items: [],
      pagination: {
        page: 1,
        pageSize: PAGE_SIZE,
        total: 0,
        totalPages: 1,
      },
      searchRequired: true,
    };
  }
  const where = {
    EtatID: ETAT.ACTIVE,
    VideoSubtitles: { some: { Origin: "AI" } },
    OR: [
      { Titre: { contains: normalizedSearch } },
      { Saison: { Series: { Titre: { contains: normalizedSearch } } } },
      {
        VideoSubtitles: {
          some: {
            Origin: "AI",
            OR: [
              { Label: { contains: normalizedSearch } },
              { Language: { contains: normalizedSearch } },
            ],
          },
        },
      },
    ],
  };
  const total = await database.video.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const videos = await database.video.findMany({
    where,
    orderBy: [{ CreateDate: "desc" }, { VideoID: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      VideoID: true,
      Titre: true,
      CheminAcces: true,
      Saison: {
        select: {
          Numero: true,
          Series: { select: { Titre: true } },
        },
      },
      VideoSubtitles: {
        where: { Origin: "AI" },
        orderBy: [{ CreateDate: "desc" }, { VideoSubtitleID: "desc" }],
        include: { AiSubtitleJob: true },
      },
    },
  });
  return {
    items: videos.map((video) => ({
      video: serializeVideo(video),
      subtitles: video.VideoSubtitles.map(serializeGeneratedSubtitleTrack),
    })),
    pagination: {
      page: currentPage,
      pageSize: PAGE_SIZE,
      total,
      totalPages,
    },
  };
}

export async function getGeneratedAiSubtitle(subtitleId, options = {}) {
  const subtitle = await requireGeneratedSubtitle(subtitleId, options);
  const { segments } = await readGeneratedSubtitleSegments(subtitle);
  return {
    ...serializeGeneratedSubtitle(subtitle),
    segments,
  };
}

export async function updateGeneratedAiSubtitleText(subtitleId, texts, options = {}) {
  const subtitle = await requireGeneratedSubtitle(subtitleId, options);
  const { absolutePath, segments } = await readGeneratedSubtitleSegments(subtitle);
  if (!Array.isArray(texts) || texts.length !== segments.length) {
    throw aiSubtitleError(
      "Le nombre de textes ne correspond pas au fichier actuel.",
      "AI_SUBTITLE_TEXT_COUNT_MISMATCH",
      409
    );
  }
  const updated = segments.map((segment, index) => ({
    ...segment,
    text: String(texts[index] || ""),
  }));
  const savedSegments = await writeGeneratedSubtitleSegments(absolutePath, updated);
  return { ...serializeGeneratedSubtitle(subtitle), segments: savedSegments };
}

export async function updateGeneratedAiSubtitleSegments(subtitleId, segments, options = {}) {
  const subtitle = await requireGeneratedSubtitle(subtitleId, options);
  const { absolutePath } = await readGeneratedSubtitleSegments(subtitle);
  const savedSegments = await writeGeneratedSubtitleSegments(absolutePath, segments);
  return { ...serializeGeneratedSubtitle(subtitle), segments: savedSegments };
}

export async function deleteGeneratedAiSubtitle(subtitleId, {
  database = prisma,
} = {}) {
  const subtitle = await requireGeneratedSubtitle(subtitleId, { database });
  if (subtitle.AiSubtitleJob && ACTIVE_STATUSES.includes(subtitle.AiSubtitleJob.Status)) {
    throw aiSubtitleError(
      "Ce sous-titre est en cours de recréation.",
      "AI_SUBTITLE_JOB_ACTIVE",
      409
    );
  }
  const absolutePath = resolveGeneratedSubtitlePath(subtitle);
  await database.$transaction(async (tx) => {
    await tx.videoSubtitle.delete({
      where: { VideoSubtitleID: subtitle.VideoSubtitleID },
    });
    if (subtitle.AiSubtitleJobID) {
      await tx.aiSubtitleJob.deleteMany({
        where: { AiSubtitleJobID: subtitle.AiSubtitleJobID },
      });
    }
  });
  await fs.promises.rm(absolutePath, { force: true }).catch((error) => {
    console.warn("[ai-subtitles] fichier VTT orphelin après suppression :", error.message);
  });
  return serializeGeneratedSubtitle(subtitle);
}

export async function recreateGeneratedAiSubtitle(subtitleId, {
  requestedByUserId,
  database = prisma,
  config,
} = {}) {
  if (!(await isAiSubtitleSettingActive({ database }))) {
    throw aiSubtitleError(
      "La génération de sous-titres IA est désactivée.",
      "AI_SUBTITLES_DISABLED",
      409
    );
  }
  const runtimeConfig = config || assertAiSubtitleConfig();
  const subtitle = await requireGeneratedSubtitle(subtitleId, { database });
  const language = normalizeAiLanguage(subtitle.Language);
  if (!language) {
    throw aiSubtitleError(
      "La langue de ce sous-titre IA est invalide.",
      "AI_SUBTITLE_INVALID_LANGUAGE",
      409
    );
  }
  const activeJobs = await database.aiSubtitleJob.count({
    where: { VideoID: subtitle.VideoID, Status: { in: ACTIVE_STATUSES } },
  });
  if (activeJobs > 0) {
    throw aiSubtitleError(
      "Une génération IA est déjà en cours pour cette vidéo.",
      "AI_SUBTITLE_JOB_ACTIVE",
      409
    );
  }
  const existingJob = subtitle.AiSubtitleJob || await database.aiSubtitleJob.findUnique({
    where: {
      VideoID_TargetLanguage: {
        VideoID: subtitle.VideoID,
        TargetLanguage: language,
      },
    },
  });
  const jobId = existingJob?.AiSubtitleJobID || randomUUID();
  await database.$transaction(async (tx) => {
    await tx.aiVideoTranscript.deleteMany({ where: { VideoID: subtitle.VideoID } });
    if (existingJob) {
      await tx.aiSubtitleJob.update({
        where: { AiSubtitleJobID: jobId },
        data: {
          RequestedByUserID: Number(requestedByUserId) || existingJob.RequestedByUserID,
          Automatic: false,
          Status: AI_SUBTITLE_JOB_STATUS.QUEUED,
          Phase: AI_SUBTITLE_PHASE.QUEUED,
          Progress: 0,
          SourceRelativePath: null,
          SourceSize: null,
          SourceSha256: null,
          AssignedWorkerID: null,
          LeaseTokenHash: null,
          LeaseExpiresAt: null,
          AttemptCount: 0,
          NextEligibleAt: null,
          SourceLanguage: null,
          TranscriptionModel: null,
          TranslationModel: null,
          PipelineVersion: runtimeConfig.pipelineVersion,
          ErrorMessage: null,
          StartedAt: null,
          CompletedAt: null,
        },
      });
    } else {
      await tx.aiSubtitleJob.create({
        data: {
          AiSubtitleJobID: jobId,
          VideoID: subtitle.VideoID,
          TargetLanguage: language,
          RequestedByUserID: Number(requestedByUserId) || null,
          Automatic: false,
          Status: AI_SUBTITLE_JOB_STATUS.QUEUED,
          Phase: AI_SUBTITLE_PHASE.QUEUED,
          PipelineVersion: runtimeConfig.pipelineVersion,
        },
      });
    }
    if (subtitle.AiSubtitleJobID !== jobId) {
      await tx.videoSubtitle.update({
        where: { VideoSubtitleID: subtitle.VideoSubtitleID },
        data: {
          AiSubtitleJobID: jobId,
          Label: `${aiLanguageLabel(language)} (IA)`,
        },
      });
    }
  });
  if (existingJob?.SourceRelativePath) {
    await cleanupAiSubtitleSource(jobId, runtimeConfig).catch(() => {});
  }
  return {
    subtitle: serializeGeneratedSubtitle(subtitle),
    job: {
      id: jobId,
      videoId: subtitle.VideoID,
      targetLanguage: language,
      status: AI_SUBTITLE_JOB_STATUS.QUEUED,
      phase: AI_SUBTITLE_PHASE.QUEUED,
      progress: 0,
    },
  };
}
