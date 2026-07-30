import { prisma } from "../services/db.js";
import { updateLatestVideoPlayLogProgress } from "./logController.js";
import { parsePositiveInt } from "../utils/requestParsing.js";
import { normalizeProgress } from "../services/video/videoAccess.js";
import { getSeriesResetMap } from "../services/video/videoWatchStatusService.js";
import { ETAT } from "../constants.js";

export const getVideoProgress = async (request, reply) => {
  const userId = parsePositiveInt(request.user?.userId);
  const videoId = parsePositiveInt(request.params?.id);

  if (!userId) {
    return reply.status(401).send({ error: "Utilisateur non authentifié." });
  }

  if (!videoId) {
    return reply.status(400).send({ error: "VideoID invalide." });
  }

  try {
    const progress = await prisma.userVideoProgress.findFirst({
      where: {
        UserID: userId,
        VideoID: videoId,
        Video: { EtatID: ETAT.ACTIVE },
      },
    });

    return reply.send({ progress: normalizeProgress(progress) });
  } catch (error) {
    console.error("getVideoProgress error:", error);
    return reply.status(500).send({ error: "Erreur interne du serveur." });
  }
};

export const upsertVideoProgress = async (request, reply) => {
  const userId = parsePositiveInt(request.user?.userId);
  const videoId = parsePositiveInt(request.params?.id);
  const timecode = parsePositiveInt(request.body?.Timecode ?? request.body?.timecode);
  const duration = parsePositiveInt(request.body?.Duration ?? request.body?.duration);
  const progressLogAction = request.body?.ProgressLogAction === "video_resume_play"
    ? "video_resume_play"
    : "video_first_play";

  if (!userId) {
    return reply.status(401).send({ error: "Utilisateur non authentifié." });
  }

  if (!videoId) {
    return reply.status(400).send({ error: "VideoID invalide." });
  }

  if (!timecode || !duration) {
    return reply.status(400).send({ error: "Timecode et Duration doivent être des entiers positifs." });
  }

  try {
    const videoExists = await prisma.video.findFirst({
      where: { VideoID: videoId, EtatID: ETAT.ACTIVE },
      select: { VideoID: true },
    });

    if (!videoExists) {
      return reply.status(404).send({ error: "Vidéo non trouvée." });
    }

    const progressPercent = (timecode / duration) * 100;

    if (progressPercent > 80) {
      await prisma.userVideoProgress.deleteMany({
        where: {
          UserID: userId,
          VideoID: videoId,
        },
      });

      await updateLatestVideoPlayLogProgress({
        UtilisateurID: userId,
        VideoID: videoId,
        endTimecode: duration,
        duration,
        final: true,
        ActionNoms: [progressLogAction],
      });

      return reply.send({
        progress: null,
        deleted: true,
        reason: "PROGRESS_OVER_80",
      });
    }

    const progress = await prisma.userVideoProgress.upsert({
      where: {
        UserID_VideoID: {
          UserID: userId,
          VideoID: videoId,
        },
      },
      create: {
        UserID: userId,
        VideoID: videoId,
        Timecode: timecode,
        Duration: duration,
      },
      update: {
        Timecode: timecode,
        Duration: duration,
      },
    });

    await updateLatestVideoPlayLogProgress({
      UtilisateurID: userId,
      VideoID: videoId,
      endTimecode: timecode,
      duration,
      final: false,
      ActionNoms: [progressLogAction],
    });

    return reply.send({
      progress: normalizeProgress(progress),
      deleted: false,
    });
  } catch (error) {
    console.error("upsertVideoProgress error:", error);
    return reply.status(500).send({ error: "Erreur interne du serveur." });
  }
};

export const deleteVideoProgress = async (request, reply) => {
  const userId = parsePositiveInt(request.user?.userId);
  const videoId = parsePositiveInt(request.params?.id);
  const source = request.body?.Source ?? request.body?.source ?? request.query?.source;
  const skipLogCompletion = source === "resume_modal";

  if (!userId) {
    return reply.status(401).send({ error: "Utilisateur non authentifié." });
  }

  if (!videoId) {
    return reply.status(400).send({ error: "VideoID invalide." });
  }

  try {
    const previousProgress = await prisma.userVideoProgress.findUnique({
      where: {
        UserID_VideoID: {
          UserID: userId,
          VideoID: videoId,
        },
      },
      select: {
        Duration: true,
      },
    });

    await prisma.userVideoProgress.deleteMany({
      where: {
        UserID: userId,
        VideoID: videoId,
      },
    });

    if (previousProgress?.Duration && !skipLogCompletion) {
      await updateLatestVideoPlayLogProgress({
        UtilisateurID: userId,
        VideoID: videoId,
        endTimecode: previousProgress.Duration,
        duration: previousProgress.Duration,
        final: true,
        ActionNoms: ["video_first_play"],
      });
    }

    return reply.send({ progress: null, deleted: true });
  } catch (error) {
    console.error("deleteVideoProgress error:", error);
    return reply.status(500).send({ error: "Erreur interne du serveur." });
  }
};

const buildResumeProgressPayload = (progress) => {
  if (!progress?.Video) return normalizeProgress(progress);

  const normalized = normalizeProgress(progress);
  return {
    ...normalized,
    Video: {
      VideoID: progress.Video.VideoID,
      Titre: progress.Video.Titre,
      CheminImage: progress.Video.CheminImage,
      SaisonID: progress.Video.SaisonID,
      SaisonNumero: progress.Video.Saison?.Numero ?? null,
      SeriesID: progress.Video.Saison?.Series?.SeriesID ?? null,
      SeriesTitre: progress.Video.Saison?.Series?.Titre ?? null,
      SeriesCheminImage: progress.Video.Saison?.Series?.CheminImage ?? null,
    },
  };
};

const buildSeriesContinuePayload = (video) => {
  if (!video) return null;

  return {
    VideoID: video.VideoID,
    Titre: video.Titre,
    CheminImage: video.CheminImage,
    SaisonID: video.SaisonID,
    SaisonNumero: video.Saison?.Numero ?? null,
    SeriesID: video.Saison?.Series?.SeriesID ?? null,
    SeriesTitre: video.Saison?.Series?.Titre ?? null,
    SeriesCheminImage: video.Saison?.Series?.CheminImage ?? null,
  };
};

const findNextSeriesEpisodesForUser = async (userId, limit = 10) => {
  const action = await prisma.action.findUnique({
    where: { Nom: "video_first_play" },
    select: { ActionID: true },
  });

  if (!action?.ActionID) return [];

  const recentSeriesLogs = await prisma.log.findMany({
    where: {
      ActionID: action.ActionID,
      UtilisateurID: userId,
      SeriesID: { not: null },
      VideoID: { not: null },
    },
    select: {
      VideoID: true,
      SeriesID: true,
      DateAction: true,
    },
    orderBy: { DateAction: "desc" },
    take: 100,
  });

  if (!recentSeriesLogs.length) return [];

  const resetBySeriesId = await getSeriesResetMap(
    userId,
    recentSeriesLogs.map((log) => log.SeriesID)
  );

  const latestLogBySeries = [];
  const seenSeriesIds = new Set();

  for (const log of recentSeriesLogs) {
    if (!log.SeriesID || seenSeriesIds.has(log.SeriesID)) continue;

    const resetAt = resetBySeriesId.get(log.SeriesID);
    if (resetAt && new Date(log.DateAction) <= new Date(resetAt)) continue;

    seenSeriesIds.add(log.SeriesID);
    latestLogBySeries.push(log);
  }

  if (!latestLogBySeries.length) return [];

  const nextEpisodes = [];

  for (const latestSeriesLog of latestLogBySeries) {
    const resetAt = resetBySeriesId.get(latestSeriesLog.SeriesID);
    const [series, watchedLogs] = await Promise.all([
      prisma.series.findUnique({
        where: { SeriesID: latestSeriesLog.SeriesID },
        select: {
          Saisons: {
            select: {
              Numero: true,
              Episodes: {
                where: { EtatID: ETAT.ACTIVE },
                select: {
                  VideoID: true,
                  Titre: true,
                  CheminImage: true,
                  SaisonID: true,
                  Saison: {
                    select: {
                      Numero: true,
                      Series: {
                        select: {
                          SeriesID: true,
                          Titre: true,
                          CheminImage: true,
                        },
                      },
                    },
                  },
                },
                orderBy: { Titre: "asc" },
              },
            },
            orderBy: { Numero: "asc" },
          },
        },
      }),
      prisma.log.findMany({
        where: {
          ActionID: action.ActionID,
          UtilisateurID: userId,
          SeriesID: latestSeriesLog.SeriesID,
          VideoID: { not: null },
          ...(resetAt ? { DateAction: { gt: resetAt } } : {}),
        },
        select: { VideoID: true },
      }),
    ]);

    const episodes = (series?.Saisons || []).flatMap((saison) => saison.Episodes || []);
    const latestIndex = episodes.findIndex((episode) => episode.VideoID === latestSeriesLog.VideoID);
    if (latestIndex === -1) continue;

    const watchedVideoIds = new Set(watchedLogs.map((log) => log.VideoID).filter(Boolean));
    const nextEpisode = episodes
      .slice(latestIndex + 1)
      .find((episode) => !watchedVideoIds.has(episode.VideoID));

    if (nextEpisode) {
      nextEpisodes.push(buildSeriesContinuePayload(nextEpisode));
    }

    if (nextEpisodes.length >= limit) break;
  }

  return nextEpisodes;
};

export const getResumeProgressOverview = async (request, reply) => {
  const userId = parsePositiveInt(request.user?.userId);

  if (!userId) {
    return reply.status(401).send({ error: "Utilisateur non authentifié." });
  }

  const include = {
    Video: {
      select: {
        VideoID: true,
        Titre: true,
        CheminImage: true,
        SaisonID: true,
        Saison: {
          select: {
            Numero: true,
            Series: {
              select: {
                SeriesID: true,
                Titre: true,
                CheminImage: true,
              },
            },
          },
        },
      },
    },
  };

  try {
    const [latest, total] = await Promise.all([
      prisma.userVideoProgress.findFirst({
        where: {
          UserID: userId,
          Video: { EtatID: ETAT.ACTIVE },
        },
        orderBy: { UpdatedAt: "desc" },
        include,
      }),
      prisma.userVideoProgress.count({
        where: {
          UserID: userId,
          Video: { EtatID: ETAT.ACTIVE },
        },
      }),
    ]);

    const random =
      total > 0
        ? await prisma.userVideoProgress.findFirst({
            where: {
              UserID: userId,
              Video: { EtatID: ETAT.ACTIVE },
            },
            orderBy: { UpdatedAt: "desc" },
            skip: Math.floor(Math.random() * total),
            include,
          })
        : null;
    const nextSeriesEpisodes = total === 0 ? await findNextSeriesEpisodesForUser(userId) : [];
    const nextSeriesEpisode = nextSeriesEpisodes[0] || null;

    return reply.send({
      latest: buildResumeProgressPayload(latest),
      random: buildResumeProgressPayload(random),
      nextSeriesEpisode,
      nextSeriesEpisodes,
      total,
    });
  } catch (error) {
    console.error("getResumeProgressOverview error:", error);
    return reply.status(500).send({ error: "Erreur interne du serveur." });
  }
};
