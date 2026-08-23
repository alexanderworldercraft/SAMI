import { AI_SUBTITLE_LANGUAGES } from "../services/aiSubtitles/constants.js";
import { getAiSubtitleConfig, isAiSubtitleEnvironmentEnabled } from "../services/aiSubtitles/config.js";
import {
  getVideoAiSubtitleJobs,
  listVideosWithoutFrenchSubtitles,
  queueAiSubtitleJob,
  serializeAiSubtitleJob,
} from "../services/aiSubtitles/jobService.js";
import {
  getAiSubtitleSetting,
  setAiSubtitleSetting,
} from "../services/aiSubtitles/settingService.js";
import {
  deleteGeneratedAiSubtitle,
  getGeneratedAiSubtitle,
  listGeneratedAiSubtitles,
  recreateGeneratedAiSubtitle,
  updateGeneratedAiSubtitleSegments,
  updateGeneratedAiSubtitleText,
} from "../services/aiSubtitles/adminService.js";
import { sendAiSubtitleError } from "../services/aiSubtitles/error.js";
import { prisma } from "../services/db.js";
import { ensureAdmin, ensureSuperAdmin } from "../services/authz.js";
import { canAccessPremium, isVideoPremium } from "../services/video/videoAccess.js";
import { createLog } from "./logController.js";

const ensureVideoAccess = async (request, reply) => {
  const videoId = Number(request.params?.videoId);
  if (!Number.isInteger(videoId) || videoId <= 0) {
    reply.status(400).send({ error: "VideoID invalide." });
    return null;
  }
  const [video, user] = await Promise.all([
    prisma.video.findUnique({
      where: { VideoID: videoId },
      include: { Saison: { include: { Series: true } } },
    }),
    prisma.utilisateur.findUnique({
      where: { UtilisateurID: request.user.userId },
      select: { UtilisateurID: true, GradeID: true, PremiumEndDate: true },
    }),
  ]);
  if (!video || video.EtatID !== 1) {
    reply.status(404).send({ error: "Vidéo introuvable." });
    return null;
  }
  if (!user) {
    reply.status(401).send({ error: "Utilisateur introuvable." });
    return null;
  }
  if (isVideoPremium(video) && !canAccessPremium(user)) {
    reply.status(403).send({ error: "Abonnement premium requis.", code: "PREMIUM_REQUIRED" });
    return null;
  }
  return { video, user };
};

export const getAiSubtitleConfiguration = async (_request, reply) => {
  try {
    const setting = await getAiSubtitleSetting();
    const environmentEnabled = isAiSubtitleEnvironmentEnabled();
    const config = environmentEnabled ? getAiSubtitleConfig() : null;
    return reply.send({
      ...setting,
      environmentEnabled,
      role: config?.role || null,
      pipelineVersion: config?.pipelineVersion || null,
      languages: AI_SUBTITLE_LANGUAGES,
    });
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Configuration IA indisponible.");
  }
};

export const updateAiSubtitleConfiguration = async (request, reply) => {
  try {
    const admin = await ensureAdmin(request, reply);
    if (!admin) return;
    if (typeof request.body?.active !== "boolean") {
      return reply.status(400).send({ error: "active doit être un booléen." });
    }
    if (request.body.active && !isAiSubtitleEnvironmentEnabled()) {
      return reply.status(409).send({
        error: "Activez SAMI_AI_SUBTITLES_ENABLED sur le serveur avant cette fonctionnalité.",
        code: "AI_SUBTITLE_ENVIRONMENT_DISABLED",
      });
    }
    const previous = await getAiSubtitleSetting();
    const setting = await setAiSubtitleSetting(request.body.active);
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "ai_subtitles_toggle",
      Champ: "ai_subtitles",
      AncienneValeur: String(previous.active),
      NouvelleValeur: String(setting.active),
    });
    return reply.send({
      ...setting,
      environmentEnabled: true,
      role: getAiSubtitleConfig().role,
      languages: AI_SUBTITLE_LANGUAGES,
    });
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Modification de la configuration IA impossible.");
  }
};

export const getAdminVideosWithoutFrenchSubtitles = async (request, reply) => {
  try {
    const admin = await ensureAdmin(request, reply);
    if (!admin) return;
    return reply.send(await listVideosWithoutFrenchSubtitles({ page: request.query?.page }));
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Liste des vidéos sans sous-titres français indisponible.");
  }
};

export const getAdminGeneratedAiSubtitles = async (request, reply) => {
  try {
    const admin = await ensureAdmin(request, reply);
    if (!admin) return;
    return reply.send(await listGeneratedAiSubtitles({
      page: request.query?.page,
      search: request.query?.search,
    }));
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Liste des sous-titres IA indisponible.");
  }
};

export const getAdminGeneratedAiSubtitle = async (request, reply) => {
  try {
    const admin = await ensureAdmin(request, reply);
    if (!admin) return;
    return reply.send(await getGeneratedAiSubtitle(request.params?.subtitleId));
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Sous-titre IA indisponible.");
  }
};

export const updateAdminGeneratedAiSubtitleText = async (request, reply) => {
  try {
    const admin = await ensureAdmin(request, reply);
    if (!admin) return;
    const subtitle = await updateGeneratedAiSubtitleText(
      request.params?.subtitleId,
      request.body?.texts
    );
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "ai_subtitle_updated",
      VideoID: subtitle.video.id,
      Champ: "text",
      NouvelleValeur: `${subtitle.segments.length} segments`,
    });
    return reply.send(subtitle);
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Modification du sous-titre IA impossible.");
  }
};

export const updateAdminGeneratedAiSubtitleSegments = async (request, reply) => {
  try {
    const admin = await ensureSuperAdmin(request, reply);
    if (!admin) return;
    const subtitle = await updateGeneratedAiSubtitleSegments(
      request.params?.subtitleId,
      request.body?.segments
    );
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "ai_subtitle_updated",
      VideoID: subtitle.video.id,
      Champ: "segments",
      NouvelleValeur: `${subtitle.segments.length} segments`,
    });
    return reply.send(subtitle);
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Correction temporelle du sous-titre IA impossible.");
  }
};

export const deleteAdminGeneratedAiSubtitle = async (request, reply) => {
  try {
    const admin = await ensureAdmin(request, reply);
    if (!admin) return;
    const subtitle = await deleteGeneratedAiSubtitle(request.params?.subtitleId);
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "ai_subtitle_deleted",
      VideoID: subtitle.video.id,
      Champ: "language",
      AncienneValeur: String(subtitle.language || ""),
    });
    return reply.send({ deleted: true, subtitle });
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Suppression du sous-titre IA impossible.");
  }
};

export const recreateAdminGeneratedAiSubtitle = async (request, reply) => {
  try {
    const admin = await ensureAdmin(request, reply);
    if (!admin) return;
    const result = await recreateGeneratedAiSubtitle(request.params?.subtitleId, {
      requestedByUserId: admin.userId,
    });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "ai_subtitle_recreated",
      VideoID: result.job.videoId,
      Champ: "language",
      NouvelleValeur: result.job.targetLanguage,
    });
    return reply.status(202).send(result);
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Recréation du sous-titre IA impossible.");
  }
};

export const requestAiSubtitle = async (request, reply) => {
  try {
    const access = await ensureVideoAccess(request, reply);
    if (!access) return;
    const queued = await queueAiSubtitleJob({
      videoId: access.video.VideoID,
      targetLanguage: request.body?.language,
      requestedByUserId: access.user.UtilisateurID,
      automatic: false,
    });
    await createLog({
      request,
      UtilisateurID: access.user.UtilisateurID,
      ActionNom: "ai_subtitle_requested",
      VideoID: access.video.VideoID,
      Champ: "language",
      NouvelleValeur: String(request.body?.language || ""),
      DedupeMs: 5_000,
    });
    return reply.status(queued.alreadyAvailable ? 200 : 202).send({
      alreadyAvailable: queued.alreadyAvailable,
      job: serializeAiSubtitleJob(queued.job),
    });
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Demande de sous-titre IA impossible.");
  }
};

export const getVideoAiSubtitles = async (request, reply) => {
  try {
    const access = await ensureVideoAccess(request, reply);
    if (!access) return;
    return reply.send({
      jobs: await getVideoAiSubtitleJobs(access.video.VideoID),
      languages: AI_SUBTITLE_LANGUAGES,
    });
  } catch (error) {
    return sendAiSubtitleError(reply, error, "État des sous-titres IA indisponible.");
  }
};
