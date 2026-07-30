import jwt from "jsonwebtoken";
import { prisma } from "../db.js";
import { getJwtFromRequest } from "../../middlewares/authMiddleware.js";
import { ETAT } from "../../constants.js";

export const getUserIdFromRequest = (request) => {
  const token = getJwtFromRequest(request);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.userId;
    return Number.isFinite(Number(userId)) ? Number(userId) : null;
  } catch (err) {
    return null;
  }
};

export const getSeriesResetMap = async (userId, seriesIds) => {
  const ids = Array.from(
    new Set((seriesIds || []).map((id) => Number(id)).filter(Number.isInteger))
  );

  if (!userId || ids.length === 0) return new Map();

  const resets = await prisma.userSeriesWatchReset.findMany({
    where: {
      UserID: Number(userId),
      SeriesID: { in: ids },
    },
    select: {
      SeriesID: true,
      ResetAt: true,
    },
  });

  return new Map(resets.map((reset) => [reset.SeriesID, reset.ResetAt]));
};

export const countWatchedEpisodesAfterReset = (logs, resetBySeriesId = new Map()) => {
  const watchedVideoIdsBySeries = new Map();

  (logs || []).forEach((log) => {
    const seriesId = log.SeriesID;
    const videoId = log.VideoID;
    if (!seriesId || !videoId) return;

    const resetAt = resetBySeriesId.get(seriesId);
    if (resetAt && new Date(log.DateAction) <= new Date(resetAt)) return;

    if (!watchedVideoIdsBySeries.has(seriesId)) {
      watchedVideoIdsBySeries.set(seriesId, new Set());
    }
    watchedVideoIdsBySeries.get(seriesId).add(videoId);
  });

  const counts = new Map();
  watchedVideoIdsBySeries.forEach((videoIds, seriesId) => {
    counts.set(seriesId, videoIds.size);
  });

  return counts;
};

export const attachWatchStatus = async (items, userId) => {
  if (!userId || !Array.isArray(items) || items.length === 0) return items;

  const action = await prisma.action.findUnique({
    where: { Nom: "video_first_play" },
    select: { ActionID: true },
  });

  if (!action?.ActionID) return items;

  const filmIds = items.filter((item) => item.type === "video").map((item) => item.id);
  const seriesIds = items.filter((item) => item.type === "series").map((item) => item.id);
  const resetBySeriesId = await getSeriesResetMap(userId, seriesIds);

  const [filmLogCounts, seriesEpisodeTotalsRaw, seriesWatchedRaw] = await Promise.all([
    filmIds.length > 0
      ? prisma.log.groupBy({
          by: ["VideoID"],
          where: {
            ActionID: action.ActionID,
            UtilisateurID: userId,
            VideoID: { in: filmIds },
          },
          _count: { _all: true },
        })
      : [],
    seriesIds.length > 0
      ? prisma.saison.findMany({
          where: { SeriesID: { in: seriesIds } },
          select: {
            SeriesID: true,
            _count: {
              select: {
                Episodes: { where: { EtatID: ETAT.ACTIVE } },
              },
            },
          },
        })
      : [],
    seriesIds.length > 0
      ? prisma.log.findMany({
          where: {
            ActionID: action.ActionID,
            UtilisateurID: userId,
            SeriesID: { in: seriesIds },
            VideoID: { not: null },
          },
          select: {
            SeriesID: true,
            VideoID: true,
            DateAction: true,
          },
        })
      : [],
  ]);

  const watchedFilmIds = new Set(filmLogCounts.map((row) => row.VideoID));

  const seriesEpisodeTotals = new Map();
  seriesEpisodeTotalsRaw.forEach((row) => {
    const prev = seriesEpisodeTotals.get(row.SeriesID) || 0;
    seriesEpisodeTotals.set(row.SeriesID, prev + row._count.Episodes);
  });

  const seriesWatchedCounts = countWatchedEpisodesAfterReset(seriesWatchedRaw, resetBySeriesId);

  return items.map((item) => {
    if (item.type === "video") {
      return { ...item, Watched: watchedFilmIds.has(item.id) };
    }

    if (item.type === "series") {
      const total = seriesEpisodeTotals.get(item.id) || 0;
      const watched = seriesWatchedCounts.get(item.id) || 0;
      return {
        ...item,
        WatchedCount: watched,
        TotalEpisodes: total,
        WatchedAll: total > 0 && watched >= total,
      };
    }

    return item;
  });
};
