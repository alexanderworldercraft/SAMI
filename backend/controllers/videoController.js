import fs from 'fs';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import jwt from 'jsonwebtoken';
import { prisma } from "../services/db.js";
import { startOfDay, endOfDay, startOfMonth, endOfMonth, subDays } from "date-fns";
import { fileURLToPath } from "url";
import { createLog, updateLatestVideoPlayLogProgress } from "./logController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.join(__dirname, "..");
const UPLOADS_ROOT = path.join(BACKEND_ROOT, "uploads");
const VIDEO_ROOT = path.join(UPLOADS_ROOT, "video");
const TEMP_ROOT = path.join(UPLOADS_ROOT, "tmp");
const IMAGE_ROOT = path.join(UPLOADS_ROOT, "images");
const ERROR_ROOT = path.join(UPLOADS_ROOT, "Error_videos");

const normalizeLangTag = (value) =>
  (value || "und").toLowerCase().replace(/[^a-z0-9_-]/g, "");

const getUserIdFromRequest = (request) => {
  const authHeader = request?.headers?.authorization || request?.headers?.Authorization;
  if (!authHeader || typeof authHeader !== "string") return null;
  const token = authHeader.split(" ")[1];
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded?.userId;
    return Number.isFinite(Number(userId)) ? Number(userId) : null;
  } catch (err) {
    return null;
  }
};

const getSeriesResetMap = async (userId, seriesIds) => {
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

const countWatchedEpisodesAfterReset = (logs, resetBySeriesId = new Map()) => {
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

const attachWatchStatus = async (items, userId) => {
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
            _count: { select: { Episodes: true } },
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

const ADDVIDEO_DEDUPE_MS = 2000;
const addVideoDedupeCache = new Map();

const isDuplicateAddVideo = (key, meta = {}, windowMs = ADDVIDEO_DEDUPE_MS) => {
  const now = Date.now();
  const lastSeen = addVideoDedupeCache.get(key);
  if (lastSeen && now - lastSeen.ts < windowMs) {
    if (meta.saisonId != null && lastSeen.saisonId == null) {
      lastSeen.saisonId = meta.saisonId;
    }
    return { duplicate: true, saisonId: lastSeen.saisonId };
  }
  addVideoDedupeCache.set(key, { ts: now, saisonId: meta.saisonId ?? null });
  for (const [k, entry] of addVideoDedupeCache.entries()) {
    if (now - entry.ts > windowMs) addVideoDedupeCache.delete(k);
  }
  return { duplicate: false, saisonId: meta.saisonId ?? null };
};

const cleanupAddVideoTemp = (paths = []) => {
  for (const target of paths) {
    if (!target) continue;
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch (err) {
      console.warn("Nettoyage temp échoué :", err.message);
    }
  }
};

// Helper : contenu premium ?
function isVideoPremium(video) {
  const videoPremium = !!video.Premium;
  const seriesPremium = !!video.Saison?.Series?.Premium;
  return videoPremium || seriesPremium;
}

// Helper : l'utilisateur a-t-il le droit d'accéder au premium ?
function canAccessPremium(user) {
  if (!user) return false;

  const isAdmin = user.GradeID === 1 || user.GradeID === 2;
  if (isAdmin) return true;

  if (!user.PremiumEndDate) return false;

  const now = new Date();
  const end = new Date(user.PremiumEndDate);
  return end > now;
}

const parsePositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const intValue = Math.floor(parsed);
  return intValue > 0 ? intValue : null;
};

const normalizeProgress = (progress) => {
  if (!progress) return null;
  const progressPercent =
    progress.ProgressPercent === null || progress.ProgressPercent === undefined
      ? (progress.Timecode / progress.Duration) * 100
      : Number(progress.ProgressPercent);

  return {
    UserVideoProgressID: progress.UserVideoProgressID?.toString?.() || String(progress.UserVideoProgressID),
    UserID: progress.UserID,
    VideoID: progress.VideoID,
    Timecode: progress.Timecode,
    Duration: progress.Duration,
    ProgressPercent: Number.isFinite(progressPercent) ? Number(progressPercent.toFixed(2)) : 0,
    UpdatedAt: progress.UpdatedAt,
  };
};

// GET /calendar/added-by-date?year=2025&month=6
export const getAdditionsByDate = async (req, reply) => {
  try {
    const year = parseInt(req.query.year);
    const month = parseInt(req.query.month) - 1; // JS: 0-indexed

    if (isNaN(year) || isNaN(month)) {
      return reply.code(400).send({ error: "Paramètres année ou mois invalides" });
    }

    const from = startOfMonth(new Date(year, month));
    const to = endOfMonth(new Date(year, month));

    const videoCounts = await prisma.video.groupBy({
      by: ["CreateDate"],
      _count: true,
      where: {
        CreateDate: {
          not: null,
          gte: from,
          lte: to,
        },
      },
    });

    const seriesCounts = await prisma.series.groupBy({
      by: ["CreateDate"],
      _count: true,
      where: {
        CreateDate: {
          not: null,
          gte: from,
          lte: to,
        },
      },
    });

    const combined = {};

    for (const entry of [...videoCounts, ...seriesCounts]) {
      const dateKey = entry.CreateDate.toISOString().split("T")[0];
      combined[dateKey] = (combined[dateKey] || 0) + entry._count;
    }

    return reply.send(combined);
  } catch (error) {
    console.error("Erreur getAdditionsByDate:", error);
    return reply.code(500).send({ error: "Erreur interne du serveur." });
  }
};

// GET /calendar/items-by-day?date=2025-06-14
export const getAdditionsForDate = async (req, reply) => {
  try {
    const date = req.query.date;
    if (!date) {
      return reply.code(400).send({ error: "Paramètre 'date' requis" });
    }

    const from = startOfDay(new Date(date));
    const to = endOfDay(new Date(date));

    const videos = await prisma.video.findMany({
      where: {
        CreateDate: {
          not: null,
          gte: from,
          lte: to,
        },
      },
      select: {
        VideoID: true,
        Titre: true,
        CheminImage: true,
        SaisonID: true,
        Saison: {
          select: {
            Series: {
              select: {
                Titre: true,
              },
            },
          },
        },
      },
    });

    const series = await prisma.series.findMany({
      where: {
        CreateDate: {
          not: null,
          gte: from,
          lte: to,
        },
      },
      select: {
        SeriesID: true,
        Titre: true,
        CheminImage: true,
      },
    });

    const formatted = [
      ...videos.map((v) => ({
        id: v.VideoID,
        Titre: v.Titre,
        CheminImage: v.CheminImage,
        type: "video",
        SaisonID: v.SaisonID,
        SerieTitre: v.Saison?.Series?.Titre || null,
      })),
      ...series.map((s) => ({
        id: s.SeriesID,
        Titre: s.Titre,
        CheminImage: s.CheminImage,
        type: "series",
      })),
    ];

    return reply.send({ items: formatted });
  } catch (error) {
    console.error("Erreur getAdditionsForDate:", error);
    return reply.code(500).send({ error: "Erreur interne du serveur." });
  }
};


// MAJ du status de films ou série
export const moveVideoToSeason = async (request, reply) => {
  const { videoId, SaisonID } = request.body;

  try {
    const updatedVideo = await prisma.video.update({
      where: { VideoID: parseInt(videoId) },
      data: { SaisonID: SaisonID ? parseInt(SaisonID) : null },
    });

    reply.send({ message: SaisonID ? "Vidéo déplacée dans la saison." : "Vidéo retirée de la série.", updatedVideo });
  } catch (error) {
    console.error("Erreur lors du changement de saison :", error);
    reply.status(500).send({ error: "Erreur lors du changement de saison." });
  }
};

// Recommandation 1
export const getRecommandation1 = async (request, reply) => {

  const { genre } = request.params;
  // Genre
  let currentGenres = [genre];
  const userId = getUserIdFromRequest(request);

  try {
    // Récupérer les vidéos indépendantes
    const allVideos = await prisma.video.findMany({
      where: { SaisonID: null },
      include: { VideoGenres: { include: { Genre: true } } },
    });

    // Récupérer les séries
    const allSeries = await prisma.series.findMany({
      include: {
        SeriesGenres: { include: { Genre: true } },
        Saisons: {
          include: {
            Episodes: {
              take: 1, // Récupère uniquement la première vidéo de la saison
              orderBy: { Titre: "asc" },
            },
          },
          orderBy: { Numero: "asc" },
        },
      },
    });

    // Formater les séries pour inclure le premier épisode
    const seriesWithFirstVideo = allSeries.map((serie) => {
      const firstSeason = serie.Saisons[0];
      const firstVideo = firstSeason?.Episodes[0];
      return {
        id: serie.SeriesID,
        type: "series",
        Titre: serie.Titre,
        Resumer: serie.Resumer,
        Premium: serie.Premium,
        CheminImage: serie.CheminImage,
        FirstVideoID: firstVideo?.VideoID || null, // ID de la première vidéo
        Saisons: serie.Saisons.length, // Nombre de saisons
        Genres: serie.SeriesGenres.map(sg => sg.Genre.Nom),
      };
    });

    // Fusionner les résultats
    const allItems = [
      ...seriesWithFirstVideo,
      ...allVideos.map((video) => ({
        id: video.VideoID,
        type: "video",
        Titre: video.Titre,
        Resumer: video.Resumer,
        Premium: video.Premium,
        CheminImage: video.CheminImage,
        Genres: video.VideoGenres.map((vg) => vg.Genre.Nom),
      })),
    ];

    // Filtrer et trier les films/séries par similarité de genres
    const recommendations = allItems
      .map(item => {
        const commonGenres = item.Genres.filter(genre => currentGenres.includes(genre));
        return { item, score: commonGenres.length };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 24)
      .map(item => item.item);
    // console.log(`Recommandations finales :`);
    // const result = recommendations.map(recommendation => ({
    //   id: recommendation.id,
    //   Titre: recommendation.Titre.slice(0, 5),
    //   Genres: recommendation.Genres
    // }));
    //console.table(result);

    // Renvoyer les recommandations
    const withWatchStatus = await attachWatchStatus(recommendations, userId);
    reply.send(withWatchStatus);

  } catch (error) {
    console.error("Erreur lors de la récupération des vidéos et séries :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération des vidéos et séries." });
  }
}

// Récupération des recommandations (par genres)
export const getRecommandationsParGenres = async (request, reply) => {
  const { id } = request.params;
  //console.log(`Récupération des recommandations pour l'ID : ${id}`);
  const userId = getUserIdFromRequest(request);

  try {
    // Récupérer les détails du film/série actuel
    const currentVideo = await prisma.video.findUnique({
      where: { VideoID: Number(id) },
      include: { VideoGenres: { include: { Genre: true } } },
    });
    //console.log(`Détails du film/série actuel récupérés :`, currentVideo);

    let currentGenres = [];
    let seriesToExclude = null;

    if (!currentVideo) {
      //console.log(`Film/série non trouvé pour l'ID : ${id}`);
      return reply.status(404).send({ error: "Film/série non trouvé." });
    }

    // Vérifier si l'élément actuel est un épisode d'une série
    if (currentVideo.SaisonID !== null) {
      //console.log(`L'élément actuel est un épisode d'une série. Récupération des genres de la série associée.`);

      // Récupérer la saison associée à l'épisode
      const saison = await prisma.saison.findUnique({
        where: { SaisonID: currentVideo.SaisonID },
        include: { Series: { include: { SeriesGenres: { include: { Genre: true } } } } },
      });

      if (saison && saison.Series && saison.Series.SeriesGenres) {
        currentGenres = saison.Series.SeriesGenres.map(sg => sg.Genre.Nom);
        seriesToExclude = saison.Series.SeriesID; // ID de la série à exclure
        //console.log(`Genres de la série associée récupérés :`, currentGenres);
      } else {
        console.log(`Aucune série ou genres associés trouvés pour l'épisode avec SaisonID : ${currentVideo.SaisonID}`);
      }
    } else {
      //console.log(`L'élément actuel est un film. Utilisation des genres du film.`);

      // Utiliser les genres du film
      if (currentVideo.VideoGenres) {
        currentGenres = currentVideo.VideoGenres.map(vg => vg.Genre.Nom);
        //console.log(`Genres du film récupérés :`, currentGenres);
      } else {
        console.log(`Aucun genre trouvé pour le film avec VideoID : ${currentVideo.VideoID}`);
      }
    }

    // Récupérer tous les films/séries
    const allVideos = await prisma.video.findMany({
      where: { VideoID: { not: Number(id) }, SaisonID: null }, // Exclure le film/série actuel
      include: { VideoGenres: { include: { Genre: true } } },
    });
    //console.log(`Tous les films/séries récupérés :`, allVideos);

    // Construire la condition pour exclure la série si applicable
    const seriesFilter = seriesToExclude ? { SeriesID: { not: seriesToExclude } } : {};

    const allSeries = await prisma.series.findMany({
      where: seriesFilter,
      include: {
        SeriesGenres: { include: { Genre: true } },
        Saisons: {
          include: {
            Episodes: {
              take: 1, // Récupère uniquement la première vidéo de la saison
              orderBy: { Titre: "asc" },
            },
          },
          orderBy: { Numero: "asc" },
        },
      },
    });
    //console.log(`Toutes les séries récupérées :`, allSeries);

    // Formater les séries pour inclure le premier épisode
    const seriesWithFirstVideo = allSeries.map((serie) => {
      const firstSeason = serie.Saisons[0];
      const firstVideo = firstSeason?.Episodes[0];
      return {
        id: serie.SeriesID,
        type: "series",
        Titre: serie.Titre,
        Resumer: serie.Resumer,
        Premium: serie.Premium,
        CheminImage: serie.CheminImage,
        FirstVideoID: firstVideo?.VideoID || null, // ID de la première vidéo
        Saisons: serie.Saisons.length, // Nombre de saisons
        Genres: serie.SeriesGenres.map(sg => sg.Genre.Nom),
      };
    });
    //console.log(`Séries formatées avec le premier épisode :`, seriesWithFirstVideo);

    // Fusionner les résultats
    const allItems = [
      ...seriesWithFirstVideo,
      ...allVideos.map((video) => ({
        id: video.VideoID,
        type: "video",
        Titre: video.Titre,
        Resumer: video.Resumer,
        Premium: video.Premium,
        CheminImage: video.CheminImage,
        Genres: video.VideoGenres.map((vg) => vg.Genre.Nom),
      })),
    ];
    //console.log(`Tous les éléments fusionnés :`, allItems);

    // Filtrer et trier les films/séries par similarité de genres
    const recommendations = allItems
      .map(item => {
        const commonGenres = item.Genres.filter(genre => currentGenres.includes(genre));
        return { item, score: commonGenres.length };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map(item => item.item);
    //console.log(`Recommandations finales :`, recommendations);

    // Renvoyer les recommandations
    const withWatchStatus = await attachWatchStatus(recommendations, userId);
    reply.send(withWatchStatus);
  } catch (error) {
    console.error("Erreur lors de la récupération des recommandations des vidéos :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération des recommandations des vidéos." });
  }
};

// Recommandations personnalisées basées sur l'historique utilisateur (video_first_play)
export const getPersonalizedRecommendations = async (request, reply) => {
  const { id } = request.params;
  const { userId } = request.user || {};

  if (!userId) {
    return reply.status(401).send({ error: "Unauthorized" });
  }

  try {
    const action = await prisma.action.findUnique({
      where: { Nom: "video_first_play" },
      select: { ActionID: true },
    });

    if (!action?.ActionID) {
      return reply.send({ similar: [], discovery: [] });
    }

    const logs = await prisma.log.findMany({
      where: {
        UtilisateurID: userId,
        ActionID: action.ActionID,
      },
      select: {
        VideoID: true,
        SeriesID: true,
      },
    });

    const watchedVideoIds = new Set(logs.map((log) => log.VideoID).filter(Boolean));
    const watchedSeriesIds = new Set(logs.map((log) => log.SeriesID).filter(Boolean));

    const watchedVideos = watchedVideoIds.size
      ? await prisma.video.findMany({
          where: { VideoID: { in: Array.from(watchedVideoIds) } },
          select: {
            VideoID: true,
            VideoGenres: { include: { Genre: true } },
            Saison: {
              select: {
                SaisonID: true,
                Series: {
                  select: {
                    SeriesID: true,
                    SeriesGenres: { include: { Genre: true } },
                  },
                },
              },
            },
          },
        })
      : [];

    const watchedGenres = new Set();
    const watchedSeriesEpisodeCounts = new Map();
    watchedVideos.forEach((video) => {
      video.VideoGenres?.forEach((vg) => watchedGenres.add(vg.Genre.Nom));
      if (video.Saison?.Series) {
        video.Saison.Series.SeriesGenres?.forEach((sg) =>
          watchedGenres.add(sg.Genre.Nom)
        );
        const seriesId = video.Saison.Series.SeriesID;
        watchedSeriesEpisodeCounts.set(
          seriesId,
          (watchedSeriesEpisodeCounts.get(seriesId) || 0) + 1
        );
      }
    });

    const watchedSeriesList = watchedSeriesIds.size
      ? await prisma.series.findMany({
          where: { SeriesID: { in: Array.from(watchedSeriesIds) } },
          select: {
            SeriesID: true,
            SeriesGenres: { include: { Genre: true } },
          },
        })
      : [];

    watchedSeriesList.forEach((serie) => {
      serie.SeriesGenres?.forEach((sg) => watchedGenres.add(sg.Genre.Nom));
    });

    const currentVideo = await prisma.video.findUnique({
      where: { VideoID: Number(id) },
      select: {
        VideoID: true,
        Saison: { select: { Series: { select: { SeriesID: true } } } },
      },
    });

    const currentSeriesId = currentVideo?.Saison?.Series?.SeriesID || null;

    const allVideos = await prisma.video.findMany({
      where: { SaisonID: null },
      include: { VideoGenres: { include: { Genre: true } } },
    });

    const allSeries = await prisma.series.findMany({
      include: {
        SeriesGenres: { include: { Genre: true } },
        Saisons: {
          include: {
            Episodes: {
              take: 1,
              orderBy: { Titre: "asc" },
            },
            _count: {
              select: { Episodes: true },
            },
          },
          orderBy: { Numero: "asc" },
        },
      },
    });

    const seriesEpisodeTotals = new Map(
      allSeries.map((serie) => [
        serie.SeriesID,
        serie.Saisons.reduce((acc, saison) => acc + (saison._count?.Episodes || 0), 0),
      ])
    );

    const seriesWithFirstVideo = allSeries.map((serie) => {
      const firstSeason = serie.Saisons[0];
      const firstVideo = firstSeason?.Episodes[0];
      return {
        id: serie.SeriesID,
        type: "series",
        Titre: serie.Titre,
        Resumer: serie.Resumer,
        Premium: serie.Premium,
        CheminImage: serie.CheminImage,
        FirstVideoID: firstVideo?.VideoID || null,
        Saisons: serie.Saisons.length,
        Genres: serie.SeriesGenres.map((sg) => sg.Genre.Nom),
      };
    });

    const allItems = [
      ...seriesWithFirstVideo,
      ...allVideos.map((video) => ({
        id: video.VideoID,
        type: "video",
        Titre: video.Titre,
        Resumer: video.Resumer,
        Premium: video.Premium,
        CheminImage: video.CheminImage,
        Genres: video.VideoGenres.map((vg) => vg.Genre.Nom),
      })),
    ];

    const filtered = allItems.filter((item) => {
      if (item.type === "video" && item.id === Number(id)) return false;
      if (item.type === "series" && currentSeriesId && item.id === currentSeriesId) return false;
      if (item.type === "video" && watchedVideoIds.has(item.id)) return false;
      if (item.type === "series") {
        const totalEpisodes = seriesEpisodeTotals.get(item.id) || 0;
        const watchedEpisodes = watchedSeriesEpisodeCounts.get(item.id) || 0;
        if (totalEpisodes > 0 && watchedEpisodes >= totalEpisodes) return false;
      }
      return true;
    });

    const scored = filtered.map((item) => {
      const overlap = item.Genres.filter((genre) => watchedGenres.has(genre)).length;
      return { item, overlap };
    });

    const similar = scored
      .filter((entry) => entry.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || a.item.Titre.localeCompare(b.item.Titre))
      .slice(0, 24)
      .map((entry) => entry.item);

    const discoveryPrimary = scored
      .filter((entry) => entry.overlap === 0)
      .sort((a, b) => a.item.Titre.localeCompare(b.item.Titre));

    const remainingForDiscovery = scored
      .filter((entry) => entry.overlap > 0)
      .sort((a, b) => a.overlap - b.overlap || a.item.Titre.localeCompare(b.item.Titre));

    const discovery = [...discoveryPrimary, ...remainingForDiscovery]
      .slice(0, 24)
      .map((entry) => entry.item);

    const [similarWithWatch, discoveryWithWatch] = await Promise.all([
      attachWatchStatus(similar, userId),
      attachWatchStatus(discovery, userId),
    ]);

    return reply.send({
      similar: similarWithWatch,
      discovery: discoveryWithWatch,
    });
  } catch (error) {
    console.error("Erreur lors des recommandations personnalisées :", error);
    return reply.status(500).send({ error: "Erreur lors des recommandations personnalisées." });
  }
};

// Récupérer la valeur total des vidéos
export const getTotalVideos = async (request, reply) => {
  try {
    const count = await prisma.video.count(); // Compte le nombre total de vidéos
    reply.send({ total: count });
  } catch (error) {
    console.error("Erreur lors de la récupération du nombre de vidéos :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération du nombre de vidéos." });
  }
};

// Récupérer la valeur total des films
export const getTotalFilms = async (request, reply) => {
  try {
    const count = await prisma.video.count({
      where: {
        SaisonID: null, // Filtrer les vidéos où SaisonID est null
      },
    });
    reply.send({ totalFilms: count });
  } catch (error) {
    console.error("Erreur lors de la récupération du nombre de films :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération du nombre de films." });
  }
};

// Récupérer la valeur total des séries
export const getTotalSeries = async (request, reply) => {
  try {
    const count = await prisma.series.count(); // Compte le nombre total de vidéos
    reply.send({ totalSeries: count });
  } catch (error) {
    console.error("Erreur lors de la récupération du nombre de vidéos :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération du nombre de vidéos." });
  }
};

// Récupérer les vidéos et séries avec recherche, pagination, tri et filtres par genres
export const getVideosAndSeries = async (request, reply) => {
  // ⬇️ NOUVEAU: on supporte sort= 'az' | 'za' | 'recent' | 'ancien' | 'most' | 'least'
  // - rétro-compatibilité: si 'sort' est absent, on garde 'order' (asc/desc) pour A-Z / Z-A
  const {
    page = 1,
    order = "asc",
    genres = "",
    search = "",
    sort: rawSort, // <-- nouveau
    ongoing: rawOngoing,
  } = request.query;

  const take = 40; // Nombre d'éléments par page
  const skip = (page - 1) * take;

  // Normalise le paramètre sort
  const sort = (rawSort || "").toLowerCase();
  const isSortProvided = ["az", "za", "recent", "ancien", "most", "least"].includes(sort);
  const isWatchSort = sort === "most" || sort === "least";
  const isOngoingRequested = ["1", "true", "yes", "on"].includes(
    String(rawOngoing || "").toLowerCase()
  );

  // Fonction utilitaire: date sûre => number (epoch). Null/undefined => 0 (considéré comme "très ancien")
  const safeEpoch = (d) => {
    try {
      const t = d ? new Date(d).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    } catch (_) {
      return 0;
    }
  };

  const genreIds = genres.split(",").map(Number).filter(Boolean);

  const searchCondition = search
    ? {
      OR: [
        { Titre: { contains: search.toLowerCase() } },
        { Resumer: { contains: search.toLowerCase() } },
      ],
    }
    : {};

  const genreCondition =
    genreIds.length > 0
      ? {
        AND: genreIds.map((id) => ({
          VideoGenres: { some: { GenreID: id } },
        })),
      }
      : {};

  try {
    // ⚠️ On ne fait PAS d'orderBy DB sur le Titre si on doit trier par date ensuite.
    //    On récupère les données puis on fusionne et trie côté Node (titre OU date).
    const orderByVideos =
      !isSortProvided // pas de 'sort' explicite => on conserve orderBy par titre (rétro-compatibilité)
        ? { Titre: order }
        : undefined;

    const orderBySeries =
      !isSortProvided ? { Titre: order } : undefined;

    // ---- VIDEOS (films) ----
    const videos = await prisma.video.findMany({
      where: {
        AND: [{ SaisonID: null }, genreCondition, searchCondition],
      },
      orderBy: orderByVideos,
      include: {
        VideoGenres: { include: { Genre: true } },
      },
      // On récupère CreateDate par défaut (pas besoin de select), mais on documente:
      // select: { ... , CreateDate: true } // (optionnel si ton Prisma renvoie tous les champs par défaut)
    });

    // ---- SERIES ----
    const series = await prisma.series.findMany({
      where: {
        AND: [
          genreIds.length > 0
            ? { AND: genreIds.map((id) => ({ SeriesGenres: { some: { GenreID: id } } })) }
            : {},
          searchCondition,
        ],
      },
      orderBy: orderBySeries,
      include: {
        SeriesGenres: { include: { Genre: true } },
        Saisons: {
          include: {
            Episodes: { take: 1, orderBy: { Titre: "asc" } },
          },
          orderBy: { Numero: "asc" },
        },
      },
    });

    // Formatage des séries (avec premier épisode + genres)
    const seriesWithFirstVideo = series.map((serie) => {
      const firstSeason = serie.Saisons[0];
      const firstVideo = firstSeason?.Episodes[0];
      return {
        id: serie.SeriesID,
        type: "series",
        Titre: serie.Titre,
        Resumer: serie.Resumer,
        Premium: serie.Premium,
        CheminImage: serie.CheminImage,
        FirstVideoID: firstVideo?.VideoID || null,
        Saisons: serie.Saisons.length,
        Genres: serie.SeriesGenres.map((sg) => sg.Genre.Nom),
        CreateDate: serie.CreateDate ?? null, // ⬅️ important pour les tris par date (null => très ancien)
      };
    });

    // Formatage des vidéos (films)
    const filmItems = videos.map((video) => ({
      id: video.VideoID,
      type: "video",
      Titre: video.Titre,
      Resumer: video.Resumer,
      Premium: video.Premium,
      CheminImage: video.CheminImage,
      Genres: video.VideoGenres.map((vg) => vg.Genre.Nom),
      CreateDate: video.CreateDate ?? null, // ⬅️ important pour les tris par date (null => très ancien)
    }));

    // ---- WATCH SCORES (optionnel) ----
    let getWatchScore = () => 0;
    if (isWatchSort) {
      const action = await prisma.action.findUnique({
        where: { Nom: "video_first_play" },
        select: { ActionID: true },
      });

      if (action?.ActionID) {
        const filmIds = videos.map((video) => video.VideoID);
        const seriesIds = series.map((serie) => serie.SeriesID);

        const [filmLogCounts, seriesLogCounts, seasonCounts] = await Promise.all([
          filmIds.length > 0
            ? prisma.log.groupBy({
                by: ["VideoID"],
                where: {
                  ActionID: action.ActionID,
                  VideoID: { in: filmIds },
                },
                _count: { _all: true },
              })
            : [],
          seriesIds.length > 0
            ? prisma.log.groupBy({
                by: ["SeriesID"],
                where: {
                  ActionID: action.ActionID,
                  SeriesID: { in: seriesIds },
                },
                _count: { _all: true },
              })
            : [],
          seriesIds.length > 0
            ? prisma.saison.findMany({
                where: { SeriesID: { in: seriesIds } },
                select: {
                  SeriesID: true,
                  _count: { select: { Episodes: true } },
                },
              })
            : [],
        ]);

        const filmScoreById = new Map(
          filmLogCounts.map((row) => [row.VideoID, row._count._all])
        );
        const seriesLogById = new Map(
          seriesLogCounts.map((row) => [row.SeriesID, row._count._all])
        );

        const seriesEpisodeTotals = new Map();
        seasonCounts.forEach((row) => {
          const prev = seriesEpisodeTotals.get(row.SeriesID) || 0;
          seriesEpisodeTotals.set(row.SeriesID, prev + row._count.Episodes);
        });

        getWatchScore = (item) => {
          if (item.type === "video") {
            return filmScoreById.get(item.id) || 0;
          }

          const logs = seriesLogById.get(item.id) || 0;
          const totalEpisodes = seriesEpisodeTotals.get(item.id) || 0;
          if (!totalEpisodes) return 0;
          return logs / totalEpisodes;
        };
      }
    }

    // Fusion
    let allItems = [...seriesWithFirstVideo, ...filmItems];

    // ---- ONGOING SERIES (filtre global) ----
    const userId = getUserIdFromRequest(request);
    if (isOngoingRequested) {
      if (!userId) {
        return reply.send({ items: [], totalItems: 0, totalPages: 0 });
      }

      const action = await prisma.action.findUnique({
        where: { Nom: "video_first_play" },
        select: { ActionID: true },
      });

      if (!action?.ActionID) {
        return reply.send({ items: [], totalItems: 0, totalPages: 0 });
      }

      const seriesIds = series.map((serie) => serie.SeriesID);
      if (!seriesIds.length) {
        return reply.send({ items: [], totalItems: 0, totalPages: 0 });
      }

      const resetBySeriesId = await getSeriesResetMap(userId, seriesIds);

      const [seriesEpisodeTotalsRaw, seriesWatchedRaw] = await Promise.all([
        prisma.saison.findMany({
          where: { SeriesID: { in: seriesIds } },
          select: {
            SeriesID: true,
            _count: { select: { Episodes: true } },
          },
        }),
        prisma.log.findMany({
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
        }),
      ]);

      const seriesEpisodeTotals = new Map();
      seriesEpisodeTotalsRaw.forEach((row) => {
        const prev = seriesEpisodeTotals.get(row.SeriesID) || 0;
        seriesEpisodeTotals.set(row.SeriesID, prev + row._count.Episodes);
      });

      const seriesWatchedCounts = countWatchedEpisodesAfterReset(seriesWatchedRaw, resetBySeriesId);

      allItems = seriesWithFirstVideo
        .map((item) => {
          const total = seriesEpisodeTotals.get(item.id) || 0;
          const watched = seriesWatchedCounts.get(item.id) || 0;
          return {
            ...item,
            WatchedCount: watched,
            TotalEpisodes: total,
            WatchedAll: total > 0 && watched >= total,
          };
        })
        .filter(
          (item) =>
            item.TotalEpisodes > 0 &&
            item.WatchedCount > 0 &&
            !item.WatchedAll &&
            item.WatchedCount < item.TotalEpisodes
        );
    }

    // ---- TRI ----
    // sort a priorité si fourni, sinon on retombe sur order asc/desc (titre)
    let sorted;
    if (sort === "az") {
      sorted = allItems.sort((a, b) => a.Titre.localeCompare(b.Titre));
    } else if (sort === "za") {
      sorted = allItems.sort((a, b) => b.Titre.localeCompare(a.Titre));
    } else if (sort === "recent") {
      // Récent → Ancien (dates nulles = très anciennes => en bas)
      sorted = allItems.sort((a, b) => safeEpoch(b.CreateDate) - safeEpoch(a.CreateDate));
    } else if (sort === "ancien") {
      // Ancien → Récent (dates nulles = très anciennes => en haut)
      sorted = allItems.sort((a, b) => safeEpoch(a.CreateDate) - safeEpoch(b.CreateDate));
    } else if (sort === "most") {
      sorted = allItems.sort(
        (a, b) => getWatchScore(b) - getWatchScore(a) || a.Titre.localeCompare(b.Titre)
      );
    } else if (sort === "least") {
      sorted = allItems.sort(
        (a, b) => getWatchScore(a) - getWatchScore(b) || a.Titre.localeCompare(b.Titre)
      );
    } else {
      // Rétro-compatibilité avec ?order=asc|desc
      sorted =
        order === "asc"
          ? allItems.sort((a, b) => a.Titre.localeCompare(b.Titre))
          : allItems.sort((a, b) => b.Titre.localeCompare(a.Titre));
    }

    // Pagination
    const paginatedItems = sorted.slice(skip, skip + take);

    // ---- WATCH STATUS (optionnel, par utilisateur) ----
    let itemsWithWatch = paginatedItems;
    if (userId) {
      const action = await prisma.action.findUnique({
        where: { Nom: "video_first_play" },
        select: { ActionID: true },
      });

      if (action?.ActionID) {
        const filmIds = paginatedItems.filter((item) => item.type === "video").map((item) => item.id);
        const seriesIds = paginatedItems.filter((item) => item.type === "series").map((item) => item.id);
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
                  _count: { select: { Episodes: true } },
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

        itemsWithWatch = paginatedItems.map((item) => {
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
      }
    }

    reply.send({
      items: itemsWithWatch,
      totalItems: allItems.length,
      totalPages: Math.ceil(allItems.length / take),
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des vidéos et séries :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération des vidéos et séries." });
  }
};

// Plus regardés sur les 30 derniers jours
export const getMostWatchedLast30Days = async (request, reply) => {
  try {
    const since = subDays(new Date(), 30);
    const action = await prisma.action.findUnique({
      where: { Nom: "video_first_play" },
      select: { ActionID: true },
    });

    // ---- VIDEOS (films) ----
    const videos = await prisma.video.findMany({
      where: { SaisonID: null },
      include: {
        VideoGenres: { include: { Genre: true } },
      },
    });

    // ---- SERIES ----
    const series = await prisma.series.findMany({
      include: {
        SeriesGenres: { include: { Genre: true } },
        Saisons: {
          include: {
            Episodes: { take: 1, orderBy: { Titre: "asc" } },
          },
          orderBy: { Numero: "asc" },
        },
      },
    });

    // Formatage des séries (avec premier épisode + genres)
    const seriesWithFirstVideo = series.map((serie) => {
      const firstSeason = serie.Saisons[0];
      const firstVideo = firstSeason?.Episodes[0];
      return {
        id: serie.SeriesID,
        type: "series",
        Titre: serie.Titre,
        Resumer: serie.Resumer,
        Premium: serie.Premium,
        CheminImage: serie.CheminImage,
        FirstVideoID: firstVideo?.VideoID || null,
        Saisons: serie.Saisons.length,
        Genres: serie.SeriesGenres.map((sg) => sg.Genre.Nom),
      };
    });

    // Formatage des vidéos (films)
    const filmItems = videos.map((video) => ({
      id: video.VideoID,
      type: "video",
      Titre: video.Titre,
      Resumer: video.Resumer,
      Premium: video.Premium,
      CheminImage: video.CheminImage,
      Genres: video.VideoGenres.map((vg) => vg.Genre.Nom),
    }));

    const allItems = [...seriesWithFirstVideo, ...filmItems];

    if (!action?.ActionID) {
      return reply.send([]);
    }

    const filmIds = videos.map((video) => video.VideoID);
    const seriesIds = series.map((serie) => serie.SeriesID);

    const [filmLogCounts, seriesLogCounts, seasonCounts] = await Promise.all([
      filmIds.length > 0
        ? prisma.log.groupBy({
            by: ["VideoID"],
            where: {
              ActionID: action.ActionID,
              DateAction: { gte: since },
              VideoID: { in: filmIds },
            },
            _count: { _all: true },
          })
        : [],
      seriesIds.length > 0
        ? prisma.log.groupBy({
            by: ["SeriesID"],
            where: {
              ActionID: action.ActionID,
              DateAction: { gte: since },
              SeriesID: { in: seriesIds },
            },
            _count: { _all: true },
          })
        : [],
      seriesIds.length > 0
        ? prisma.saison.findMany({
            where: { SeriesID: { in: seriesIds } },
            select: {
              SeriesID: true,
              _count: { select: { Episodes: true } },
            },
          })
        : [],
    ]);

    const filmScoreById = new Map(
      filmLogCounts.map((row) => [row.VideoID, row._count._all])
    );
    const seriesLogById = new Map(
      seriesLogCounts.map((row) => [row.SeriesID, row._count._all])
    );

    const seriesEpisodeTotals = new Map();
    seasonCounts.forEach((row) => {
      const prev = seriesEpisodeTotals.get(row.SeriesID) || 0;
      seriesEpisodeTotals.set(row.SeriesID, prev + row._count.Episodes);
    });

    const getWatchScore = (item) => {
      if (item.type === "video") {
        return filmScoreById.get(item.id) || 0;
      }

      const logs = seriesLogById.get(item.id) || 0;
      const totalEpisodes = seriesEpisodeTotals.get(item.id) || 0;
      if (!totalEpisodes) return 0;
      return logs / totalEpisodes;
    };

    const sorted = allItems
      .map((item) => ({ item, score: getWatchScore(item) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.item.Titre.localeCompare(b.item.Titre))
      .slice(0, 8)
      .map((entry) => entry.item);

    const userId = getUserIdFromRequest(request);
    const withWatchStatus = await attachWatchStatus(sorted, userId);

    return reply.send(withWatchStatus);
  } catch (error) {
    console.error("Erreur lors du calcul des plus regardés (30j) :", error);
    return reply.status(500).send({ error: "Erreur interne du serveur." });
  }
};

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
    const progress = await prisma.userVideoProgress.findUnique({
      where: {
        UserID_VideoID: {
          UserID: userId,
          VideoID: videoId,
        },
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
    const videoExists = await prisma.video.findUnique({
      where: { VideoID: videoId },
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
        where: { UserID: userId },
        orderBy: { UpdatedAt: "desc" },
        include,
      }),
      prisma.userVideoProgress.count({
        where: { UserID: userId },
      }),
    ]);

    const random =
      total > 0
        ? await prisma.userVideoProgress.findFirst({
            where: { UserID: userId },
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

// Récupérer les détails d'une vidéo
export const getVideoDetails = async (request, reply) => {
  const { id } = request.params;

  try {
    // 1) Récupérer la vidéo avec les infos nécessaires
    const video = await prisma.video.findUnique({
      where: { VideoID: parseInt(id) },
      include: {
        Saison: {
          include: {
            Series: {
              include: {
                Saisons: {
                  include: {
                    Episodes: {
                      orderBy: { Titre: "asc" },
                    },
                  },
                  orderBy: { Numero: "asc" },
                },
              },
            },
          },
        },
        VideoGenres: {
          include: { Genre: true },
        },
        VideoSubtitles: true,
      },
    });

    if (!video) {
      return reply.status(404).send({ error: "Vidéo non trouvée." });
    }

    // 2) Récupérer l'utilisateur (authMiddleware a déjà validé le token)
    const { userId } = request.user;

    const user = await prisma.utilisateur.findUnique({
      where: { UtilisateurID: userId },
      select: {
        UtilisateurID: true,
        GradeID: true,
        PremiumEndDate: true,
      },
    });

    if (!user) {
      // Cas un peu chelou : token valide mais user plus en BDD
      return reply.status(401).send({ error: "Utilisateur introuvable." });
    }

    // 3) Contrôle d'accès premium
    const premiumContent = isVideoPremium(video);

    if (premiumContent && !canAccessPremium(user)) {
      return reply.status(403).send({
        error: "Abonnement premium requis pour accéder à ce contenu.",
        code: "PREMIUM_REQUIRED",
      });
    }

    // 4) Logs utilisateur pour marquer les épisodes vus
    let watchedVideoIds = new Set();
    if (video.Saison?.Series?.Saisons?.length) {
      const action = await prisma.action.findUnique({
        where: { Nom: "video_first_play" },
        select: { ActionID: true },
      });

      if (action?.ActionID) {
        const seriesId = video.Saison.Series.SeriesID;
        const resetBySeriesId = await getSeriesResetMap(userId, [seriesId]);
        const resetAt = resetBySeriesId.get(seriesId);
        const episodeIds = video.Saison.Series.Saisons
          .flatMap((saison) => saison.Episodes || [])
          .map((episode) => episode.VideoID)
          .filter(Boolean);

        if (episodeIds.length > 0) {
          const logs = await prisma.log.findMany({
            where: {
              UtilisateurID: userId,
              ActionID: action.ActionID,
              VideoID: { in: episodeIds },
              ...(resetAt ? { DateAction: { gt: resetAt } } : {}),
            },
            select: { VideoID: true },
          });

          watchedVideoIds = new Set(logs.map((log) => log.VideoID).filter(Boolean));
        }
      }
    }



    // Récupérer et trier les sous-titres séparément
    const videoSubtitles = await prisma.videoSubtitle.findMany({
      where: { VideoID: parseInt(id) },
      orderBy: { Label: 'asc' }, // Tri des sous-titres par Label
    });

    // Ajouter les sous-titres triés à la réponse
    if (video) {
      video.VideoSubtitles = videoSubtitles; // Ajoute les sous-titres triés à l'objet vidéo
    }

    if (!video) {
      return reply.status(404).send({ error: "Vidéo non trouvée." });
    }

    // --- Rattachements personnes pour la VIDEO courante ---
    const videoLinks = await prisma.videoPersonne.findMany({
      where: { VideoID: parseInt(id, 10) },
      include: { Personne: true },
    });

    // Deux tableaux à plat avec { PersonneID, Prenom, Nom, Surnom, CheminImage }
    const VideoActeurs = videoLinks
      .filter(l => l.EstActeur)
      .map(l => ({
        PersonneID: l.PersonneID,
        Prenom: l.Personne.Prenom,
        Nom: l.Personne.Nom,
        Surnom: l.Personne.Surnom,
        CheminImage: l.Personne.CheminImage,
      }));

    const VideoRealisateurs = videoLinks
      .filter(l => l.EstRealisateur)
      .map(l => ({
        PersonneID: l.PersonneID,
        Prenom: l.Personne.Prenom,
        Nom: l.Personne.Nom,
        Surnom: l.Personne.Surnom,
        CheminImage: l.Personne.CheminImage,
      }));

    // Si la vidéo est dans une série, on prépare aussi les personnes au NIVEAU SERIE
    let SeriesActeurs = [];
    let SeriesRealisateurs = [];
    if (video.Saison?.Series?.SeriesID) {
      const seriesId = video.Saison.Series.SeriesID;
      const seriesLinks = await prisma.seriesPersonne.findMany({
        where: { SeriesID: seriesId },
        include: { Personne: true },
      });
      SeriesActeurs = seriesLinks
        .filter(l => l.EstActeur)
        .map(l => ({
          PersonneID: l.PersonneID,
          Prenom: l.Personne.Prenom,
          Nom: l.Personne.Nom,
          Surnom: l.Personne.Surnom,
          CheminImage: l.Personne.CheminImage,
        }));
      SeriesRealisateurs = seriesLinks
        .filter(l => l.EstRealisateur)
        .map(l => ({
          PersonneID: l.PersonneID,
          Prenom: l.Personne.Prenom,
          Nom: l.Personne.Nom,
          Surnom: l.Personne.Surnom,
          CheminImage: l.Personne.CheminImage,
        }));
    }

    // Si la vidéo fait partie d'une série, ajouter les informations supplémentaires
    if (video.Saison) {
      const series = video.Saison.Series;
      const saisons = series.Saisons.map((saison) => ({
        Numero: saison.Numero,
        Episodes: saison.Episodes.map((episode) => ({
          VideoID: episode.VideoID,
          Titre: episode.Titre,
          CheminAcces: episode.CheminAcces,
          Premium: !!episode.Premium,
          Watched: watchedVideoIds.has(episode.VideoID),
        })),
      }));

      reply.send({
        type: "series",
        video: {
          VideoID: video.VideoID,
          Titre: video.Titre,
          Resumer: video.Resumer,
          CheminAcces: video.CheminAcces,
          CheminImage: video.CheminImage,
          SaisonID: video.SaisonID,
          Premium: !!video.Premium,
          Genres: video.VideoGenres.map((vg) => vg.Genre.Nom),
          VideoSubtitles: video.VideoSubtitles.map((subtitle) => ({
            Label: subtitle.Label,
            CheminSubtitle: subtitle.CheminSubtitle,
          })),
          Acteurs: VideoActeurs,         // ⬅️ NOUVEAU
          Realisateurs: VideoRealisateurs, // ⬅️ NOUVEAU
        },
        series: {
          SeriesID: series.SeriesID,
          Titre: series.Titre,
          Resumer: series.Resumer,
          Saisons: saisons,
          Premium: !!series.Premium,
          CheminImage: series.CheminImage,
          Acteurs: SeriesActeurs,           // ⬅️ NOUVEAU
          Realisateurs: SeriesRealisateurs, // ⬅️ NOUVEAU
        },
      });
    } else {
      reply.send({
        type: "film",
        video: {
          VideoID: video.VideoID,
          Titre: video.Titre,
          Resumer: video.Resumer,
          CheminAcces: video.CheminAcces,
          CheminImage: video.CheminImage,
          SaisonID: video.SaisonID,
          Premium: !!video.Premium,
          Genres: video.VideoGenres.map((vg) => vg.Genre.Nom),
          VideoSubtitles: video.VideoSubtitles.map((subtitle) => ({
            Label: subtitle.Label,
            CheminSubtitle: subtitle.CheminSubtitle,
          })),
          Acteurs: VideoActeurs,         // ⬅️ NOUVEAU
          Realisateurs: VideoRealisateurs, // ⬅️ NOUVEAU
        },
      });
    }
  } catch (error) {
    console.error("Erreur lors de la récupération des détails de la vidéo :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération de la vidéo." });
  }
};

// PUT /api/videos/:id/image
export const updateVideoImage = async (request, reply) => {
  try {
    const { id } = request.params;
    const userId = request.user?.userId;
    const parts = request.parts();

    const videoId = parseInt(id, 10);
    console.log("[video:image] start", { videoId, userId });
    const allowedExts = new Set([
      ".jpg",
      ".jpeg",
      ".png",
      ".webp",
      ".gif",
      ".avif",
      ".heic",
      ".heif",
      ".jfif",
      ".bmp",
      ".tif",
      ".tiff",
    ]);
    const mimeToExt = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
      "image/gif": ".gif",
      "image/avif": ".avif",
      "image/heic": ".heic",
      "image/heif": ".heif",
      "image/jfif": ".jpg",
      "image/bmp": ".bmp",
      "image/tiff": ".tiff",
    };
    const afficheDir = path.join(VIDEO_ROOT, String(videoId), "affiche");
    if (!fs.existsSync(afficheDir)) fs.mkdirSync(afficheDir, { recursive: true });

    const oldVideo = await prisma.video.findUnique({
      where: { VideoID: videoId },
      select: { CheminImage: true },
    });

    let savedPath = null;

    // Lecture du fichier multipart
    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "image") {
        const filename = part.filename || "";
        const mime = (part.mimetype || "").toLowerCase();
        let ext = path.extname(filename).toLowerCase();
        if (mime && !mime.startsWith("image/")) {
          console.warn("[video:image] unsupported mimetype", { videoId, mime });
          return reply.code(400).send({ error: "Format d'image non supporté." });
        }
        if (!ext || !allowedExts.has(ext)) {
          const mappedExt = mimeToExt[mime];
          if (mappedExt) {
            ext = mappedExt;
          } else {
            console.warn("[video:image] unsupported format", { videoId, filename, mime });
            return reply.code(400).send({ error: "Format d'image non supporté." });
          }
        }

        const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newFilename = `affiche_${uniqueSuffix}${ext}`;
        const filePath = path.join(afficheDir, newFilename);
        const targetRelativePath = path.join(
          "uploads",
          "video",
          String(videoId),
          "affiche",
          newFilename
        );

        await new Promise((resolve, reject) => {
          const ws = fs.createWriteStream(filePath);
          part.file.pipe(ws).on("finish", resolve).on("error", reject);
        });

        savedPath = targetRelativePath;
        console.log("[video:image] file saved", { videoId, savedPath });
        break;
      }
    }

    if (!savedPath) {
      console.warn("[video:image] no file received", { videoId });
      return reply.code(400).send({ error: "Aucun fichier image reçu (champ 'image')." });
    }

    if (oldVideo && oldVideo.CheminImage) {
      const oldPath = path.join(BACKEND_ROOT, oldVideo.CheminImage);
      if (
        fs.existsSync(oldPath) &&
        !oldVideo.CheminImage.includes("default") &&
        oldVideo.CheminImage.startsWith(path.join("uploads", "video", String(videoId), "affiche"))
      ) {
        try {
          fs.unlinkSync(oldPath);
          console.log(`🗑️ Ancienne image supprimée : ${oldVideo.CheminImage}`);
        } catch (err) {
          console.warn("⚠️ Erreur lors de la suppression de l'ancienne image :", err.message);
        }
      }
    }

    // 🔹 Étape 2 : mettre à jour la BDD
    const updated = await prisma.video.update({
      where: { VideoID: videoId },
      data: { CheminImage: savedPath },
      select: { CheminImage: true },
    });
    console.log("[video:image] db updated", { videoId, savedPath });

    // Log audit image

    if (userId && Number.isFinite(Number(userId))) {
      // Contexte série/saison si épisode
      const ctx = await prisma.video.findUnique({
        where: { VideoID: parseInt(id, 10) },
        select: { SaisonID: true, Saison: { select: { SeriesID: true } } },
      });

      await createLog({
        request,
        UtilisateurID: Number(userId),
        ActionNom: "video_update",
        VideoID: parseInt(id, 10),
        SaisonID: ctx?.SaisonID ?? null,
        SeriesID: ctx?.Saison?.SeriesID ?? null,
        Champ: "CheminImage",
        AncienneValeur: oldVideo?.CheminImage ?? null,
        NouvelleValeur: savedPath,
        DedupeMs: 2000,
      });
    }

    reply.send(updated);
  } catch (error) {
    console.error("❌ Erreur updateVideoImage:", error);
    reply.code(500).send({ error: "Erreur lors de la mise à jour de l'image." });
  }
};

// Récupérer les informations de navigation (précédent/suivant)
export const getNavigationInfo = async (request, reply) => {
  const { id } = request.params;

  try {
    // Obtenez les détails de la vidéo actuelle
    const currentVideo = await prisma.video.findUnique({
      where: { VideoID: parseInt(id) },
      select: { Titre: true }
    });

    if (!currentVideo) {
      return reply.status(404).send({ error: "Vidéo non trouvée." });
    }

    const currentTitle = currentVideo.Titre;

    // Vidéo précédente par titre (ordre ASC)
    const prevVideo = await prisma.video.findFirst({
      where: { Titre: { lt: currentTitle } },
      orderBy: { Titre: "desc" }, // Récupère le titre le plus proche avant l'actuel
      select: { VideoID: true, Titre: true }
    });

    // Vidéo suivante par titre (ordre ASC)
    const nextVideo = await prisma.video.findFirst({
      where: { Titre: { gt: currentTitle } },
      orderBy: { Titre: "asc" }, // Récupère le titre le plus proche après l'actuel
      select: { VideoID: true, Titre: true }
    });

    reply.send({
      PrevVideoID: prevVideo?.VideoID || null,
      PrevVideoTitre: prevVideo?.Titre || null,
      NextVideoID: nextVideo?.VideoID || null,
      NextVideoTitre: nextVideo?.Titre || null,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des informations de navigation :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération des informations de navigation." });
  }
};

// Ajouter une vidéo à une saison
export const addEpisode = async (request, reply) => {
  const { Titre, Resumer, CheminAcces, CheminImage, EtatID, GenreIDs, SeriesID, Numero } = request.body;

  try {
    // Trouver la saison correspondante
    const saison = await prisma.saison.findFirst({
      where: {
        SeriesID,
        Numero,
      },
    });

    if (!saison) {
      return reply.status(404).send({ error: "Saison introuvable pour cette série et ce numéro." });
    }

    // Ajouter la vidéo à la saison
    const video = await prisma.video.create({
      data: {
        Titre,
        Resumer,
        CheminAcces,
        CheminImage,
        EtatID,
        SaisonID: saison.SaisonID,
        VideoGenres: {
          create: GenreIDs.map((GenreID) => ({ GenreID })),
        },
      },
    });

    reply.status(201).send(video);
  } catch (error) {
    console.error("Erreur lors de l'ajout de la vidéo :", error);
    reply.status(500).send({ error: "Erreur lors de l'ajout de la vidéo." });
  }
};

// Ajouter une nouvelle vidéo (CPU)
export const addVideo = async (req, reply, fastify) => {
  try {
    console.log("[addVideo] Début du traitement", {
      contentType: req.headers["content-type"],
    });
    const parts = req.parts();
    const data = {};
    const videoRoot = VIDEO_ROOT;
    const tempRoot = TEMP_ROOT;
    const tempVideoDir = path.join(tempRoot, "video");
    const hlsDir = path.join(tempRoot, `hls_${Date.now()}`);
    const imageDir = path.join(tempRoot, `images_${Date.now()}`);
    const subtitlesDir = path.join(tempRoot, `subtitles_${Date.now()}`);
    const errorDir = ERROR_ROOT;

    if (!fs.existsSync(tempRoot)) fs.mkdirSync(tempRoot, { recursive: true });
    if (!fs.existsSync(tempVideoDir)) fs.mkdirSync(tempVideoDir, { recursive: true });
    if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true });
    if (!fs.existsSync(imageDir)) fs.mkdirSync(imageDir, { recursive: true });
    if (!fs.existsSync(subtitlesDir)) fs.mkdirSync(subtitlesDir, { recursive: true });
    if (!fs.existsSync(errorDir)) fs.mkdirSync(errorDir, { recursive: true });

    let videoTempPath;

    for await (const part of parts) {
      try {
        if (!part.file) {
          const fieldName = String(part.fieldname || "").trim();
          const lowerName = fieldName.toLowerCase();
          const normalizedName = lowerName.replace(/[^a-z0-9]/g, "");
          const fieldValue = part.value ? part.value.trim() : undefined;
          console.log("[addVideo] Champ reçu :", fieldName, "=", fieldValue, "normalized:", normalizedName);
          data[fieldName] = fieldValue;
          if (lowerName === "titre") data.titre = fieldValue;
          if (lowerName === "resumer") data.resumer = fieldValue;
          if (normalizedName === "genres") data.genres = fieldValue;
          if (normalizedName === "saisonid") data.SaisonID = fieldValue;
          if (normalizedName === "utilisateurid") data.utilisateurID = fieldValue;
        } else {
          const extension = path.extname(part.filename).toLowerCase();
          const mimeType = part.mimetype;
          console.log(`Traitement du fichier : ${part.filename}, Type MIME : ${mimeType}`);

          // Extensions vidéos autorisées
          const videoExtensions = /\.(avi|mov|mkv|webm|flv|wmv|mp4)$/i;

          // Extensions images autorisées
          const imageExtensions = /\.(jpg|jpeg|png|webp|gif)$/i;

          const isVideoMime =
            mimeType.startsWith('video/') ||
            mimeType === 'application/octet-stream'; // certains navigateurs / serveurs envoient ça

          if (isVideoMime && videoExtensions.test(extension)) {
            if (!data.videoOriginalName) data.videoOriginalName = part.filename;
            const filePath = path.join(tempVideoDir, `${Date.now()}${extension}`);
            const writeStream = fs.createWriteStream(filePath);
            let uploadedBytes = 0;

            const totalBytes = parseInt(req.headers['content-length'], 10);
            if (!totalBytes || isNaN(totalBytes)) {
              console.warn('Impossible de déterminer la taille totale du fichier.');
            }

            part.file.on('data', (chunk) => {
              uploadedBytes += chunk.length;
              const progress = totalBytes
                ? Math.round((uploadedBytes / totalBytes) * 100)
                : null;

              if (progress !== null) {
                fastify.io.emit('progress', {
                  stage: 'upload',
                  progress,
                });
              }
            });

            await new Promise((resolve, reject) => {
              part.file
                .pipe(writeStream)
                .on('finish', resolve)
                .on('error', reject);
            });

            videoTempPath = filePath;

            fastify.io.emit('progress', {
              stage: 'upload',
              progress: 100,
            });

          } else if (mimeType.startsWith('image/') && imageExtensions.test(extension)) {
            const filePath = path.join(imageDir, `${Date.now()}${extension}`);
            const writeStream = fs.createWriteStream(filePath);

            await new Promise((resolve, reject) => {
              part.file
                .pipe(writeStream)
                .on('finish', resolve)
                .on('error', reject);
            });

            data.imageTempPath = filePath;
            data.imageTempExt = extension;
          } else {
            console.warn(
              `Fichier ignoré : ${part.filename}, Type MIME : ${mimeType}, Extension : ${extension}`
            );
          }
        }
      } catch (err) {
        console.error(`Erreur lors du traitement de la partie "${part.fieldname}":`, err.message);
        continue;
      }
    }

    console.log('[addVideo] Données reçues (multipart brut) :', data);
    const bodySaisonId =
      req.body?.SaisonID ??
      req.body?.saisonID ??
      req.body?.saisonId;
    if (data.SaisonID === undefined && bodySaisonId !== undefined) {
      data.SaisonID = bodySaisonId;
      console.log("[addVideo] SaisonID récupéré depuis req.body :", bodySaisonId);
    }

    // 1) Si ce n’est PAS du multipart, récupérer le body JSON (fallback)
    if (!/multipart\/form-data/i.test(req.headers['content-type'] || '')) {
      Object.assign(data, req.body || {});
    }

    // 2) Normaliser les variantes possibles de l’ID utilisateur
    const rawUserId =
      data.utilisateurID ??
      data.UtilisateurID ??
      data.utilisateurId ??
      data.userId ??
      data.userID;

    // 3) Nettoyage + casting
    const utilisateurID =
      rawUserId === undefined || rawUserId === null
        ? undefined
        : Number(String(rawUserId).trim());

    // 4) Validation robuste
    if (!Number.isFinite(utilisateurID) || utilisateurID <= 0) {
      return reply.code(400).send({ error: "Le utilisateurID est obligatoire et doit être un entier > 0." });
    }

    // 5) Conserver pour la suite
    data.utilisateurID = utilisateurID;

    console.log('[addVideo] Payload reçu (champs texte) :', { ...data });

















    if (!data.titre) {
      return reply.code(400).send({ error: 'Le titre est obligatoire.' });
    }

    if (!videoTempPath) {
      return reply.code(400).send({ error: 'Aucun fichier vidéo fourni.' });
    }

    data.genres = data.genres ? JSON.parse(data.genres) : [];
    const rawSaisonId =
      data.SaisonID ??
      data.saisonID ??
      data.saisonId;
    const rawSaisonStr = rawSaisonId === undefined || rawSaisonId === null ? "" : String(rawSaisonId).trim();
    data.SaisonID = rawSaisonStr === "" ? null : parseInt(rawSaisonStr, 10);
    console.log("[addVideo] SaisonID normalisé :", {
      raw: rawSaisonId,
      normalized: data.SaisonID,
    });

    let videoFileSize = "no-size";
    try {
      videoFileSize = String(fs.statSync(videoTempPath).size || "no-size");
    } catch (err) {
      console.warn("Taille du fichier vidéo indisponible :", err.message);
    }

    const dedupeKey = [
      data.utilisateurID ?? "anon",
      data.videoOriginalName ?? path.basename(videoTempPath || "no-file"),
      videoFileSize,
    ].join("|");

    const dedupeResult = isDuplicateAddVideo(
      dedupeKey,
      { saisonId: data.SaisonID },
      ADDVIDEO_DEDUPE_MS
    );
    if (data.SaisonID == null && dedupeResult.saisonId != null) {
      data.SaisonID = parseInt(dedupeResult.saisonId, 10);
      console.log("[addVideo] SaisonID récupéré du cache dedupe :", data.SaisonID);
    }

    if (dedupeResult.duplicate) {
      cleanupAddVideoTemp([videoTempPath, data.imageTempPath, hlsDir, imageDir, subtitlesDir]);
      console.warn("[addVideo] Doublon détecté, requête ignorée :", dedupeKey);
      return reply.send({ ok: true, deduped: true });
    }

    if (!videoTempPath || !fs.existsSync(videoTempPath)) {
      cleanupAddVideoTemp([videoTempPath, data.imageTempPath, hlsDir, imageDir, subtitlesDir]);
      return reply.code(500).send({ error: "Fichier vidéo temporaire introuvable." });
    }

    const videoDuration = await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoTempPath, (err, metadata) => {
        if (err) {
          console.error("Erreur lors de l'analyse des métadonnées :", err.message);
          return reject(err);
        }
        const duration = metadata.format.duration || 0;
        console.log(`Durée totale de la vidéo : ${duration} secondes.`);
        resolve(duration);
      });
    });

    const timemarkToSeconds = (timemark) => {
      if (!timemark) return 0;
      const parts = timemark.split(':'); // Divise en [hh, mm, ss]
      const seconds = parseFloat(parts.pop()); // Récupère les secondes (ss.ss)
      const minutes = parseInt(parts.pop() || '0', 10); // Récupère les minutes (mm)
      const hours = parseInt(parts.pop() || '0', 10); // Récupère les heures (hh)
      return seconds + minutes * 60 + hours * 3600;
    };

    // Étape 1 : Extraction des sous-titres avant réencodage
    console.log("Début de l'extraction des sous-titres...");
    console.log("Analyse des flux de sous-titres...");
    const subtitleInfos = [];
    let subtitleCount = 0;
    let subtitleStreams = [];
    await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoTempPath, (err, metadata) => {
        if (err) {
          console.error("Erreur lors de l'analyse des métadonnées :", err.message);
          reject(err);
        } else {
          // Compter les flux de type "subtitle"
          subtitleStreams = metadata.streams.filter((stream) => stream.codec_type === 'subtitle');
          subtitleCount = subtitleStreams.length;
          console.log(`Nombre de sous-titres détectés : ${subtitleCount}`);
          resolve();
        }
      });
    });

    if (subtitleCount > 0) {
      for (let i = 0; i < subtitleCount; i++) {
        const stream = subtitleStreams[i];
        const langTag = normalizeLangTag(stream?.tags?.language);
        const baseName = langTag ? `${langTag}_${i + 1}` : `subtitle_${i + 1}`;
        const subtitleFilename = `${baseName}.vtt`;
        const subtitleLabel =
          (stream?.tags?.title || stream?.tags?.language || `Subtitle ${i + 1}`)
            .toString()
            .trim();
        const subtitlePath = path.join(subtitlesDir, subtitleFilename);
        try {
          await new Promise((resolve, reject) => {
            ffmpeg(videoTempPath)
              .outputOptions([`-map 0:s:${i}`, '-c:s webvtt'])
              .output(subtitlePath)
              .on('end', () => {
                console.log(`Sous-titre ${i + 1} extrait avec succès.`);
                subtitleInfos.push({
                  tempPath: subtitlePath,
                  filename: subtitleFilename,
                  label: subtitleLabel,
                });
                resolve();
              })
              .on('error', (err) => {
                console.warn(`Erreur lors de l'extraction du sous-titre ${i + 1} :`, err.message);
                reject(err);
              })
              .run();
          });
        } catch (err) {
          console.warn(`Le sous-titre ${i + 1} n'a pas pu être extrait.`);
        }
      }
    } else {
      console.warn("Aucun sous-titre détecté.");
    }

    // Étape 3 : Analyse des métadonnées
    console.log("Début de l'analyse des métadonnées...");

    const metadata = await new Promise((resolve, reject) =>
      ffmpeg.ffprobe(videoTempPath, (err, metadata) => {
        if (err) {
          console.error('Erreur lors de l’analyse des métadonnées :', err.message);
          detailedErrors.push({
            resolution: 'N/A',
            errorMessage: `Erreur lors de l’analyse des métadonnées : ${err.message}`,
            code: 'Metadata',
          });
        } else {
          // console.log('Métadonnées du fichier :', metadata);

          resolve(metadata);
        }
      })
    );

    function selectAudioTrack(metadata, preferredTags) {
      if (!metadata || !metadata.streams) {
        throw new Error("Métadonnées invalides ou streams manquants");
      }

      // Filtrer uniquement les pistes audio
      const audioStreams = metadata.streams.filter((stream) => stream.codec_type === "audio");

      // Parcourir les préférences
      for (const tag of preferredTags) {
        const matchedStream = audioStreams.find((stream) => {
          const language = stream.tags?.language?.toLowerCase() || "";
          const title = stream.tags?.title?.toLowerCase() || "";
          const languageMatch = language === tag.language.toLowerCase();
          const titleMatch = tag.description ? title.includes(tag.description.toLowerCase()) : true;
          return languageMatch && titleMatch;
        });

        if (matchedStream) {
          console.log("Piste audio sélectionnée :", matchedStream.index, matchedStream.tags);
          return matchedStream.index; // Retourne l'index de la piste audio correspondante
        }
      }

      // Si aucune correspondance précise n'est trouvée, retourner la première piste audio
      if (audioStreams.length > 0) {
        console.warn("Aucune correspondance précise trouvée. Utilisation de la première piste audio par défaut.");
        return audioStreams[0].index;
      }

      console.error("Aucune piste audio disponible dans le fichier.");
      return null;
    }

    // Liste des langues préférées (ordre de préférence)
    const preferredTags = [
      { language: "jap" },
      { language: "jpn" },
      { language: "fra", description: "VFF" }, // Français de France en priorité
      { language: "fre", description: "VFF" },
      { language: "fre", description: "FRE" },
      { language: "fra", description: "VFQ" },
      { language: "fre", description: "VFQ" },
      { language: "fra" },
      { language: "fre" },
    ];

    // Sélectionne l'index de la piste audio
    const audioTrackIndex = selectAudioTrack(metadata, preferredTags);

    if (audioTrackIndex === null) {
      throw new Error("Aucune piste audio disponible");
    }

    // Ajoute l'option pour sélectionner la piste audio
    const audioStreamOption = `-map 0:${audioTrackIndex}`;

    // Détermine l'index de la piste vidéo (généralement 0 si une seule vidéo)
    const videoStreamIndex = metadata.streams.findIndex((stream) => stream.codec_type === "video");

    if (videoStreamIndex === -1) {
      throw new Error("Aucun flux vidéo trouvé dans le fichier source");
    }
    // Ajoute l'option pour sélectionner la piste video
    const videoStreamOption = `-map 0:${videoStreamIndex}`;

    if (Math.abs(audioStreamOption.duration - videoStreamOption.duration) > 2) {
      console.warn("Des désynchronisations potentielles entre l'audio et la vidéo ont été détectées.");
    }

    const { width: originalWidth } = metadata.streams.find((stream) => stream.codec_type === 'video') || {};
    console.log(`Largeur d'origine détectée : ${originalWidth}px`);

    const resolutions = [
      { label: '240p', width: 426, bitrate: 500 },
      { label: '360p', width: 640, bitrate: 1000 },
      { label: '480p', width: 854, bitrate: 1500 },
      { label: '720p', width: 1280, bitrate: 4500 },
      { label: '1080p', width: 1920, bitrate: 12000 },
      { label: '4K', width: 3840, bitrate: 25000 },
    ].filter((res) => res.width <= originalWidth);
    console.log(`Résolutions filtrées : ${resolutions.map((res) => res.label).join(", ")}`);

    // Mise en place de la génération des log d'erreur
    const generateErrorLog = (title, errorDetails) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, '');
      const errorFolder = path.join(errorDir, `${sanitizedTitle}_${timestamp}`);
      fs.mkdirSync(errorFolder, { recursive: true });
      const errorLogPath = path.join(errorFolder, `${sanitizedTitle}_${timestamp}.txt`);
      fs.writeFileSync(errorLogPath, errorDetails);
      fs.renameSync(videoTempPath, path.join(errorFolder, path.basename(videoTempPath)));
      return { errorLogPath, errorFolder };
    };

    // Étape 4 et 5 : Conversion HLS + master.m3u8
    console.log("Début de la conversion en HLS...");

    const playlistPaths = [];
    let detailedErrors = []; // Stocker les erreurs pour chaque résolution

    for (const res of resolutions) {
      console.log(`Traitement de la résolution ${res.label}... de ${data.titre}`);
      const resolutionDir = path.join(hlsDir, res.label);
      fs.mkdirSync(resolutionDir, { recursive: true });
      const resolutionPlaylist = path.join(resolutionDir, `playlist.m3u8`);

      try {
        await new Promise((resolve, reject) => {
          if (!fs.existsSync(videoTempPath)) {
            const errorMsg = "Le fichier vidéo source est introuvable.";
            console.error(errorMsg);
            return reject(new Error(errorMsg));
          }

          ffmpeg(videoTempPath)
            .outputOptions([
              videoStreamOption,
              `-vf scale=w=${res.width}:h=-2`,
              `-crf 23`,
              `-maxrate ${res.bitrate}k`,
              `-bufsize 2M`,
              `-hls_time 4`,
              `-hls_playlist_type vod`,
              `-preset veryfast`,
              `-profile:v high`,
              `-pix_fmt yuv420p`,
              audioStreamOption,
              `-c:a aac`,       // Encode l'audio en AAC
              `-ac 2`,          // Force la stéréo (2 canaux)
              `-ar 48000`,      // Échantillonnage audio à 48kHz
              `-b:a 192k`       // Bitrate audio
            ])
            .output(resolutionPlaylist)
            .on('progress', (progress) => {
              const timemarkInSeconds = timemarkToSeconds(progress.timemark);
              if (!videoDuration || videoDuration <= 0) {
                console.error("Durée de la vidéo invalide :", videoDuration);
                return;
              }

              let percent = Math.round((timemarkInSeconds / videoDuration) * 100);
              percent = isNaN(percent) || percent < 0 || percent > 100 ? 25 : percent;

              fastify.io.emit('progress', {
                stage: 'conversion',
                resolution: res.label,
                progress: percent,
              });
            })
            .on('end', resolve)
            .on('error', (err) => {
              console.error(`Erreur lors de la conversion ${res.label} :`, err.message);
              detailedErrors.push({
                resolution: res.label,
                errorMessage: err.message,
                code: err.code || 'N/A',
              });
              reject(err);
            })
            .run();
        });

        playlistPaths.push({
          resolutionPlaylist: path.relative(hlsDir, resolutionPlaylist),
          bitrate: res.bitrate,
          width: Math.round(res.width),
          height: Math.round(res.width * 9 / 16),
        });
      } catch (err) {
        console.warn(`Échec de la conversion pour la résolution ${res.label}. Passer à la suivante.`);
        continue;
      }
    }

    if (detailedErrors.length > 0) {
      const errorLog = detailedErrors
        .map(
          (err) =>
            `Résolution : ${err.resolution}\nErreur : ${err.errorMessage}\nCode de sortie : ${err.code}\n`
        )
        .join('\n');

      const { errorLogPath } = generateErrorLog(data.titre || 'VideoError', errorLog);
      return reply.code(500).send({
        error: 'Une ou plusieurs conversions ont échoué.',
        logPath: errorLogPath,
      });
    }

    if (playlistPaths.length === 0) {
      console.error("Échec de la conversion pour toutes les résolutions.");
      const { errorLogPath } = generateErrorLog(data.titre || 'VideoError', "Aucune conversion réussie.");
      return reply.code(500).send({
        error: 'Toutes les conversions ont échoué.',
        logPath: errorLogPath,
      });
    }

    console.log("Conversion HLS terminée pour toutes les résolutions.");

    fs.unlinkSync(videoTempPath);
    console.log("Fichier vidéo temporaire supprimé après conversion en HLS.");

    const masterPlaylistPath = path.join(hlsDir, 'master.m3u8');
    const masterPlaylistContent = `#EXTM3U\n\n` +
      playlistPaths.map(({ resolutionPlaylist, bitrate, width, height }) =>
        `#EXT-X-STREAM-INF:BANDWIDTH=${bitrate * 1000},RESOLUTION=${width}x${height}\n${resolutionPlaylist}`
      ).join('\n');

    fs.writeFileSync(masterPlaylistPath, masterPlaylistContent);
    console.log("Fichier master.m3u8 généré avec succès.");


    // Étape 6 et 7 : Enregistrement et nettoyage
    const cachedEntry = addVideoDedupeCache.get(dedupeKey);
    if (data.SaisonID == null && cachedEntry?.saisonId != null) {
      data.SaisonID = parseInt(cachedEntry.saisonId, 10);
      console.log("[addVideo] SaisonID récupéré juste avant DB :", data.SaisonID);
    }

    console.log("Enregistrement des informations vidéo dans la base de données...");
    const video = await prisma.video.create({
      data: {
        Titre: data.titre,
        Resumer: data.resumer || null, // Inclure le résumé
        CheminAcces: path.join("uploads", "video", "pending", "master.m3u8"),
        CheminImage: "uploads/images/default.png",
        EtatID: 1,
        SaisonID: data.SaisonID || null, // Inclure la saison

        // Identifie quand et qui à ajouter une vidéo
        UtilisateurID: parseInt(data.utilisateurID, 10),
      },
    });

    const finalVideoDir = path.join(videoRoot, String(video.VideoID));
    const finalHlsDir = path.join(finalVideoDir, "hls");
    const finalSubtitleDir = path.join(finalVideoDir, "sousTitre");
    const finalAfficheDir = path.join(finalVideoDir, "affiche");

    fs.mkdirSync(finalVideoDir, { recursive: true });
    fs.renameSync(hlsDir, finalHlsDir);

    const relativeMasterPlaylistPath = path.join(
      "uploads",
      "video",
      String(video.VideoID),
      "hls",
      "master.m3u8"
    );

    const finalSubtitlePaths = [];
    if (subtitleInfos.length > 0) {
      fs.mkdirSync(finalSubtitleDir, { recursive: true });
      for (const info of subtitleInfos) {
        const finalSubtitlePath = path.join(finalSubtitleDir, info.filename);
        fs.renameSync(info.tempPath, finalSubtitlePath);
        finalSubtitlePaths.push({
          label: info.label,
          path: path.join(
            "uploads",
            "video",
            String(video.VideoID),
            "sousTitre",
            info.filename
          ),
        });
      }
    }

    let finalImagePath = "uploads/images/default.png";
    if (data.imageTempPath) {
      fs.mkdirSync(finalAfficheDir, { recursive: true });
      const afficheExt = data.imageTempExt || path.extname(data.imageTempPath) || ".png";
      const afficheFilename = `affiche${afficheExt}`;
      const finalAffichePath = path.join(finalAfficheDir, afficheFilename);
      fs.renameSync(data.imageTempPath, finalAffichePath);
      finalImagePath = path.join(
        "uploads",
        "video",
        String(video.VideoID),
        "affiche",
        afficheFilename
      );
    }

    const updatedVideo = await prisma.video.update({
      where: { VideoID: video.VideoID },
      data: {
        CheminAcces: relativeMasterPlaylistPath,
        CheminImage: finalImagePath,
      },
    });

    if (data.genres) {
      await Promise.all(data.genres.map(async (genreId) => {
        await prisma.videoGenre.create({
          data: { VideoID: video.VideoID, GenreID: parseInt(genreId, 10) },
        });
      }));
    }

    if (finalSubtitlePaths.length > 0) {
      await Promise.all(
        finalSubtitlePaths.map(async (subtitle, index) => {
          await prisma.videoSubtitle.create({
            data: {
              Label: subtitle.label || `Subtitle ${index + 1}`,
              CheminSubtitle: subtitle.path,
              VideoID: video.VideoID,
            },
          });
        })
      );
      console.log("Sous-titres multiples ajoutés dans la base de données.");
    }

    console.log("Vidéo ajoutée avec succès à la base de données :", updatedVideo);
    reply.send({ message: 'Vidéo ajoutée avec succès.', video: updatedVideo });
  } catch (err) {
    console.error(err);
    reply.code(500).send({ error: 'Erreur lors du traitement de la vidéo.' });
  }
};

// Génére un film random
export const getRandomFilm = async (req, reply) => {
  try {
    const film = await prisma.video.findFirst({
      where: { SaisonID: null },
      orderBy: { VideoID: 'desc' },
      skip: Math.floor(Math.random() * await prisma.video.count({ where: { SaisonID: null } }))
    });

    if (!film) return reply.status(404).send({ error: "Aucun film trouvé." });
    reply.send(film);
  } catch (error) {
    console.error("Erreur lors de la récupération d'un film aléatoire :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération du film." });
  }
};

// Génére une série random
export const getRandomSeriesFirstEpisode = async (req, reply) => {
  try {
    const series = await prisma.series.findFirst({
      orderBy: { SeriesID: 'desc' },
      skip: Math.floor(Math.random() * await prisma.series.count()),
      include: {
        Saisons: {
          orderBy: { Numero: 'asc' },
          take: 1,
          include: {
            Episodes: {
              orderBy: { Titre: 'asc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!series || !series.Saisons[0]?.Episodes[0]) {
      return reply.status(404).send({ error: "Aucune série avec épisode trouvé." });
    }

    reply.send(series.Saisons[0].Episodes[0]);
  } catch (error) {
    console.error("Erreur lors de la récupération de l'épisode aléatoire :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération de l'épisode." });
  }
};

// Génére un film ou une série random
export const getRandomMedia = async (req, reply) => {
  try {
    const random = Math.random() > 0.5;
    if (random) {
      await getRandomFilm(req, reply);
    } else {
      await getRandomSeriesFirstEpisode(req, reply);
    }
  } catch (error) {
    console.error("Erreur lors de la récupération d'un média aléatoire :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération du média." });
  }
};

// Mise à jour du titre d'une vidéo
export const updateVideoTitle = async (request, reply) => {
  const { id } = request.params;
  const { Titre } = request.body;

  const videoId = parseInt(id, 10);
  const newTitle = (Titre ?? "").trim();

  if (!newTitle) {
    return reply.status(400).send({ error: "Le titre ne peut pas être vide." });
  }

  // ✅ Auth obligatoire (évite UtilisateurID=0 et logs pourris)
  const userId = request.user?.userId;
  if (!userId) {
    return reply.status(401).send({ error: "Non authentifié." });
  }
  // en tout début de updateVideoTitle
  const reqId = request.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  console.log(
    `[updateVideoTitle] reqId=${reqId} method=${request.method} url=${request.url} videoId=${id} userId=${request.user?.userId}`
  );

  try {
    const userId = request.user?.userId;
    if (!userId || !Number.isFinite(Number(userId))) {
      return reply.code(401).send({ error: "Non autorisé." });
    }

    const before = await prisma.video.findUnique({
      where: { VideoID: videoId },
      select: {
        Titre: true,
        SaisonID: true,
        Saison: { select: { SeriesID: true } },
      },
    });
    if (!before) return reply.code(404).send({ error: "Vidéo introuvable." });

    const oldTitle = (before.Titre ?? "").trim();

    // ✅ Anti-doublon absolu : si pas de changement => pas d'update, pas de log
    if (oldTitle === newTitle) {
      return reply.send({ ok: true, unchanged: true, VideoID: videoId, Titre: before.Titre });
    }

    const updatedVideo = await prisma.video.update({
      where: { VideoID: videoId },
      data: { Titre: newTitle },
    });

    // ✅ Log complet : VideoID + (SaisonID/SeriesID si épisode)

    await createLog({
      request,
      UtilisateurID: Number(userId),
      ActionNom: "video_update",
      VideoID: videoId,
      SaisonID: before.SaisonID ?? null,
      SeriesID: before.Saison?.SeriesID ?? null,
      Champ: "Titre",
      AncienneValeur: before.Titre ?? null,
      NouvelleValeur: Titre,
      DedupeMs: 2000,
    });

    return reply.send(updatedVideo);
  } catch (error) {
    console.error("Erreur updateVideoTitle:", error);
    return reply.status(500).send({ error: "Erreur interne du serveur." });
  }
};

// Mise à jour du Resumer d'une vidéo
export const updateVideoResumer = async (request, reply) => {
  const { id } = request.params;
  const { Resumer } = request.body;

  if (!Resumer || Resumer.trim() === "") {
    return reply.status(400).send({ error: "Le Resumer ne peut pas être vide." });
  }

  try {
    const videoId = parseInt(id, 10);

    const userId = request.user?.userId;
    if (!userId || !Number.isFinite(Number(userId))) {
      return reply.code(401).send({ error: "Non autorisé." });
    }

    const before = await prisma.video.findUnique({
      where: { VideoID: videoId },
      select: {
        Resumer: true,
        SaisonID: true,
        Saison: { select: { SeriesID: true } },
      },
    });
    if (!before) return reply.code(404).send({ error: "Vidéo introuvable." });

    const updatedVideo = await prisma.video.update({
      where: { VideoID: videoId },
      data: { Resumer },
    });

    await createLog({
      request,
      UtilisateurID: Number(userId),
      ActionNom: "video_update",
      VideoID: videoId,
      SaisonID: before.SaisonID ?? null,
      SeriesID: before.Saison?.SeriesID ?? null,
      Champ: "Resumer",
      AncienneValeur: before.Resumer ?? null,
      NouvelleValeur: Resumer,
      DedupeMs: 2000,
    });

    return reply.send(updatedVideo);
  } catch (error) {
    console.error("Erreur lors de la mise à jour du Resumer de la vidéo :", error);
    return reply.status(500).send({ error: "Erreur interne du serveur." });
  }
};

// Recherche rapide FILMS (SaisonID null), par titre, limite réglable
export const quickSearchVideos = async (request, reply) => {
  try {
    const q = (request.query.q || request.query.search || "").toString().trim().toLowerCase();
    const limit = Math.min(parseInt(request.query.limit || "100", 10) || 100, 200); // cap 200

    const where = q
      ? {
        AND: [
          { SaisonID: null },
          { Titre: { contains: q } }, // match par Titre
        ],
      }
      : { SaisonID: null };

    const rows = await prisma.video.findMany({
      where,
      orderBy: { Titre: "asc" }, // tri A→Z pour lisibilité
      take: limit,
      select: {
        VideoID: true,
        Titre: true,
        CheminImage: true,
      },
    });

    const items = rows.map((v) => ({
      id: v.VideoID,
      titre: v.Titre,
      image: v.CheminImage || null,
    }));

    return reply.send({ items, total: items.length });
  } catch (err) {
    console.error("quickSearchVideos error:", err);
    return reply.code(500).send({ error: "Erreur de recherche." });
  }
};

// GET /api/videos/:id/genres
export const getVideoGenres = async (request, reply) => {
  const { id } = request.params;
  try {
    const links = await prisma.videoGenre.findMany({
      where: { VideoID: parseInt(id, 10) },
      include: { Genre: true },
      orderBy: { VideoGenreID: "asc" },
    });
    const genres = links.map((l) => ({ GenreID: l.GenreID, Nom: l.Genre.Nom }));
    return reply.send(genres);
  } catch (e) {
    console.error("getVideoGenres error:", e);
    return reply
      .code(500)
      .send({ error: "Erreur lors de la récupération des genres de la vidéo." });
  }
};

// PUT /api/videos/:id/genres
export const updateVideoGenres = async (request, reply) => {
  try {
    const { id } = request.params;
    let { GenreIDs } = request.body;

    // Sécurisation basique des entrées
    if (!Array.isArray(GenreIDs)) GenreIDs = [];
    const videoId = parseInt(id, 10);
    const uniqueIds = [...new Set(GenreIDs.map((g) => parseInt(g, 10)).filter(Number.isInteger))];

    // Vérifie que la vidéo existe
    const userId = request.user?.userId;
    if (!userId || !Number.isFinite(Number(userId))) {
      return reply.code(401).send({ error: "Non autorisé." });
    }

    const existing = await prisma.video.findUnique({
      where: { VideoID: videoId },
      select: { VideoID: true, SaisonID: true, Saison: { select: { SeriesID: true } } },
    });
    if (!existing) return reply.code(404).send({ error: "Vidéo introuvable." });

    const beforeLinks = await prisma.videoGenre.findMany({
      where: { VideoID: videoId },
      select: { GenreID: true },
    });
    const beforeIds = [...new Set(beforeLinks.map(x => x.GenreID))];

    // On remplace entièrement les liaisons: deleteMany puis createMany
    await prisma.videoGenre.deleteMany({ where: { VideoID: videoId } });
    if (uniqueIds.length) {
      await prisma.videoGenre.createMany({
        data: uniqueIds.map((GenreID) => ({ VideoID: videoId, GenreID })),
        skipDuplicates: true,
      });
    }

    // Retourne l’état courant (IDs + labels)
    const updated = await prisma.video.findUnique({
      where: { VideoID: videoId },
      include: { VideoGenres: { include: { Genre: true } } },
    });

    await createLog({
      request,
      UtilisateurID: Number(userId),
      ActionNom: "video_update",
      VideoID: videoId,
      SaisonID: existing.SaisonID ?? null,
      SeriesID: existing.Saison?.SeriesID ?? null,
      Champ: "GenreIDs",
      AncienneValeur: JSON.stringify(beforeIds),
      NouvelleValeur: JSON.stringify(uniqueIds),
      Meta: {
        removed: beforeIds.filter(x => !uniqueIds.includes(x)),
        added: uniqueIds.filter(x => !beforeIds.includes(x)),
      },
      DedupeMs: 2000,
    });

    return reply.send({
      VideoID: updated.VideoID,
      Genres: updated.VideoGenres.map((vg) => ({ GenreID: vg.GenreID, Nom: vg.Genre.Nom })),
    });
  } catch (err) {
    console.error("updateVideoGenres error:", err);
    return reply.code(500).send({ error: "Erreur lors de la mise à jour des genres de la vidéo." });
  }
};

// Active ou désactive le flag Premium sur une vidéo
export const updateVideoPremium = async (request, reply) => {
  try {
    const { id } = request.params;           // ID de la vidéo dans l'URL
    const { Premium } = request.body;        // booléen attendu dans le body
    const { userId } = request.user;         // injecté par authMiddleware

    // Validation basique du body
    if (typeof Premium !== "boolean") {
      return reply.code(400).send({ error: "Le champ 'Premium' doit être un booléen." });
    }

    // Vérifier le grade de l'utilisateur (Admin / SuperAdmin uniquement)
    const user = await prisma.utilisateur.findUnique({
      where: { UtilisateurID: userId },
      select: { GradeID: true },
    });

    if (!user || (user.GradeID !== 1 && user.GradeID !== 2)) {
      return reply.code(403).send({ error: "Accès réservé aux administrateurs." });
    }

    const videoId = parseInt(id, 10);
    if (Number.isNaN(videoId)) {
      return reply.code(400).send({ error: "ID de vidéo invalide." });
    }

    const before = await prisma.video.findUnique({
      where: { VideoID: videoId },
      select: {
        Premium: true,
        SaisonID: true,
        Saison: { select: { SeriesID: true } },
      },
    });
    if (!before) return reply.code(404).send({ error: "Vidéo introuvable." });

    // Mise à jour du flag
    const updated = await prisma.video.update({
      where: { VideoID: videoId },
      data: { Premium },
      select: {
        VideoID: true,
        Premium: true,
      },
    });

    await createLog({
      request,
      UtilisateurID: userId,
      ActionNom: "video_update",
      VideoID: videoId,
      SaisonID: before.SaisonID ?? null,
      SeriesID: before.Saison?.SeriesID ?? null,
      Champ: "Premium",
      AncienneValeur: String(before.Premium),
      NouvelleValeur: String(Premium),
      DedupeMs: 2000,
    });

    return reply.send(updated);
  } catch (err) {
    console.error("updateVideoPremium error:", err);
    return reply.code(500).send({ error: "Erreur lors de la mise à jour du statut premium de la vidéo." });
  }
};
