import fs from 'fs';
import path from 'path';
import { prisma } from "../services/db.js";
import { subDays } from "date-fns";
import { createLog } from "./logController.js";
import { isContentPreviewActive } from "./appSettingController.js";
import { ensureAdmin, ensureSuperAdmin } from "../services/authz.js";
import { ETAT, MULTIPART_LIMITS } from "../constants.js";
import { isTruthyValue, parsePositiveInt } from "../utils/requestParsing.js";
import { isMultipartFileTooLargeError, sendMultipartFileTooLarge } from "../utils/multipartErrors.js";
import {
  VIDEO_ROOT,
  removeStoredPath,
  resolveUploadPath,
} from "../services/video/videoPaths.js";
import {
  generateVideoPreviewFramesFromMaster,
  getExistingPreviewFrames,
} from "../services/video/videoPreviewService.js";
import {
  attachWatchStatus,
  countWatchedEpisodesAfterReset,
  getSeriesResetMap,
  getUserIdFromRequest,
} from "../services/video/videoWatchStatusService.js";
import {
  canAccessPremium,
  isVideoPremium,
} from "../services/video/videoAccess.js";
import {
  attachFavoriteStatus,
  getFavoriteKeysForItems,
} from "../services/favoriteContentService.js";

export {
  getAdditionsByDate,
  getAdditionsForDate,
} from "./videoCalendarController.js";
export {
  deleteVideoProgress,
  getResumeProgressOverview,
  getVideoProgress,
  upsertVideoProgress,
} from "./videoProgressController.js";
export { addVideo } from "./videoUploadController.js";

const ACTIVE_ETAT_ID = ETAT.ACTIVE;
const DELETED_ETAT_ID = ETAT.DELETED;

const isTruthyQueryValue = isTruthyValue;

const ensureVideoAdmin = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  return admin?.userId || null;
};

const ensureVideoSuperAdmin = async (request, reply) => {
  const admin = await ensureSuperAdmin(request, reply);
  return admin?.userId || null;
};

const mapLinkedPeople = (links, roleField) =>
  links
    .filter((link) => link[roleField])
    .map((link) => ({
      PersonneID: link.PersonneID,
      Prenom: link.Personne.Prenom,
      Nom: link.Personne.Nom,
      Surnom: link.Personne.Surnom,
      CheminImage: link.Personne.CheminImage,
    }));

export const getVideoPreviewFrames = async (request, reply) => {
  const videoId = parsePositiveInt(request.params?.id);

  if (!videoId) {
    return reply.status(400).send({ error: "VideoID invalide." });
  }

  try {
    const previewEnabled = await isContentPreviewActive();
    if (!previewEnabled) {
      return reply.status(403).send({ error: "La prévisualisation vidéo est désactivée." });
    }

    const video = await prisma.video.findFirst({
      where: {
        VideoID: videoId,
        EtatID: ACTIVE_ETAT_ID,
      },
      select: {
        VideoID: true,
        Titre: true,
        CheminAcces: true,
      },
    });

    if (!video) {
      return reply.status(404).send({ error: "Vidéo introuvable." });
    }

    const existingFrames = getExistingPreviewFrames(videoId);
    if (existingFrames.length > 0) {
      return reply.send({
        videoId,
        title: video.Titre,
        frames: existingFrames,
        cached: true,
      });
    }

    const masterPlaylistPath = resolveUploadPath(video.CheminAcces);
    const frames = await generateVideoPreviewFramesFromMaster({ videoId, masterPlaylistPath });

    return reply.send({
      videoId,
      title: video.Titre,
      frames,
    });
  } catch (error) {
    console.error("Erreur lors de la génération de l'aperçu vidéo :", error);
    return reply.status(500).send({ error: "Erreur lors de la génération de l'aperçu vidéo." });
  }
};

// MAJ du status de films ou série
export const moveVideoToSeason = async (request, reply) => {
  const userId = await ensureVideoAdmin(request, reply);
  if (!userId) return;

  const { videoId, SaisonID } = request.body || {};
  const parsedVideoId = parsePositiveInt(videoId);
  const hasTargetSeason = SaisonID !== undefined && SaisonID !== null && SaisonID !== "";
  const parsedSeasonId = hasTargetSeason ? parsePositiveInt(SaisonID) : null;

  if (!parsedVideoId || (hasTargetSeason && !parsedSeasonId)) {
    return reply.status(400).send({ error: "VideoID ou SaisonID invalide." });
  }

  try {
    const updatedVideo = await prisma.video.update({
      where: { VideoID: parsedVideoId },
      data: { SaisonID: parsedSeasonId },
    });

    return reply.send({
      message: parsedSeasonId
        ? "Vidéo déplacée dans la saison."
        : "Vidéo retirée de la série.",
      updatedVideo,
    });
  } catch (error) {
    console.error("Erreur lors du changement de saison :", error);
    return reply.status(500).send({ error: "Erreur lors du changement de saison." });
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
      where: { SaisonID: null, EtatID: ACTIVE_ETAT_ID },
      include: { VideoGenres: { include: { Genre: true } } },
    });

    // Récupérer les séries
    const allSeries = await prisma.series.findMany({
      include: {
        SeriesGenres: { include: { Genre: true } },
        Saisons: {
          include: {
            Episodes: {
              where: { EtatID: ACTIVE_ETAT_ID },
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
      where: { VideoID: { not: Number(id) }, SaisonID: null, EtatID: ACTIVE_ETAT_ID }, // Exclure le film/série actuel
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
              where: { EtatID: ACTIVE_ETAT_ID },
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
          where: { VideoID: { in: Array.from(watchedVideoIds) }, EtatID: ACTIVE_ETAT_ID },
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
      where: { SaisonID: null, EtatID: ACTIVE_ETAT_ID },
      include: { VideoGenres: { include: { Genre: true } } },
    });

    const allSeries = await prisma.series.findMany({
      include: {
        SeriesGenres: { include: { Genre: true } },
        Saisons: {
          include: {
            Episodes: {
              where: { EtatID: ACTIVE_ETAT_ID },
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
    const count = await prisma.video.count({ where: { EtatID: ACTIVE_ETAT_ID } }); // Compte le nombre total de vidéos actives
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
        EtatID: ACTIVE_ETAT_ID,
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
  // ⬇️ NOUVEAU: on supporte sort= 'az' | 'za' | 'recent' | 'ancien' | 'most' | 'least' | 'trending'
  // - rétro-compatibilité: si 'sort' est absent, on garde 'order' (asc/desc) pour A-Z / Z-A
  const {
    page = 1,
    order = "asc",
    genres = "",
    search = "",
    sort: rawSort, // <-- nouveau
    ongoing: rawOngoing,
    hideWatched: rawHideWatched,
    hidePremium: rawHidePremium,
    newOnly: rawNewOnly,
    favorites: rawFavorites,
  } = request.query;

  const take = 40; // Nombre d'éléments par page
  const skip = (page - 1) * take;

  // Normalise le paramètre sort
  const sort = (rawSort || "").toLowerCase();
  const isSortProvided = ["az", "za", "recent", "ancien", "most", "least", "trending"].includes(sort);
  const isTrendingSort = sort === "trending";
  const isWatchSort = sort === "most" || sort === "least" || isTrendingSort;
  const isOngoingRequested = isTruthyQueryValue(rawOngoing);
  const shouldHideWatched = isTruthyQueryValue(rawHideWatched);
  const shouldHidePremium = isTruthyQueryValue(rawHidePremium);
  const shouldListNewOnly = isTruthyQueryValue(rawNewOnly);
  const shouldListFavoritesOnly = isTruthyQueryValue(rawFavorites);
  const newEpisodeThreshold = subDays(new Date(), 30);

  // Fonction utilitaire: date sûre => number (epoch). Null/undefined => 0 (considéré comme "très ancien")
  const safeEpoch = (d) => {
    try {
      const t = d ? new Date(d).getTime() : 0;
      return Number.isFinite(t) ? t : 0;
    } catch (_) {
      return 0;
    }
  };

  const rawGenreIds = genres
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value !== 0);
  const genreIds = [...new Set(rawGenreIds.filter((id) => id > 0))];
  const excludedGenreIds = [
    ...new Set(rawGenreIds.filter((id) => id < 0).map((id) => Math.abs(id))),
  ].filter((id) => !genreIds.includes(id));

  const searchCondition = search
    ? {
      OR: [
        { Titre: { contains: search.toLowerCase() } },
        { Resumer: { contains: search.toLowerCase() } },
      ],
    }
    : {};

  const videoGenreFilters = [
    ...genreIds.map((id) => ({
      VideoGenres: { some: { GenreID: id } },
    })),
    ...excludedGenreIds.map((id) => ({
      VideoGenres: { none: { GenreID: id } },
    })),
  ];
  const seriesGenreFilters = [
    ...genreIds.map((id) => ({
      SeriesGenres: { some: { GenreID: id } },
    })),
    ...excludedGenreIds.map((id) => ({
      SeriesGenres: { none: { GenreID: id } },
    })),
  ];

  const genreCondition = videoGenreFilters.length > 0 ? { AND: videoGenreFilters } : {};

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
        AND: [{ SaisonID: null }, { EtatID: ACTIVE_ETAT_ID }, genreCondition, searchCondition],
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
          seriesGenreFilters.length > 0
            ? { AND: seriesGenreFilters }
            : {},
          searchCondition,
        ],
      },
      orderBy: orderBySeries,
      include: {
        SeriesGenres: { include: { Genre: true } },
        Saisons: {
          include: {
            Episodes: {
              where: { EtatID: ACTIVE_ETAT_ID },
              select: {
                VideoID: true,
                Titre: true,
                CreateDate: true,
              },
              orderBy: { Titre: "asc" },
            },
          },
          orderBy: { Numero: "asc" },
        },
      },
    });

    // Formatage des séries (avec premier épisode + genres)
    const seriesWithFirstVideo = series.map((serie) => {
      const firstSeason = serie.Saisons[0];
      const firstVideo = firstSeason?.Episodes[0];
      const latestEpisodeDate = serie.Saisons.reduce((latest, saison) => {
        saison.Episodes.forEach((episode) => {
          if (safeEpoch(episode.CreateDate) > safeEpoch(latest)) {
            latest = episode.CreateDate;
          }
        });
        return latest;
      }, null);
      const recentSortDate =
        safeEpoch(latestEpisodeDate) > safeEpoch(serie.CreateDate)
          ? latestEpisodeDate
          : serie.CreateDate;

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
        LatestEpisodeDate: latestEpisodeDate ?? null,
        RecentSortDate: recentSortDate ?? null,
        HasNewEpisode:
          latestEpisodeDate != null &&
          safeEpoch(latestEpisodeDate) >= safeEpoch(newEpisodeThreshold),
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
                  ...(isTrendingSort ? { DateAction: { gte: newEpisodeThreshold } } : {}),
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
                  ...(isTrendingSort ? { DateAction: { gte: newEpisodeThreshold } } : {}),
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
    const userId = getUserIdFromRequest(request);

    // ---- ONGOING SERIES (filtre global) ----
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

    // ---- OPTIONS SUPPLEMENTAIRES (filtres globaux avant pagination) ----
    if (shouldHidePremium) {
      allItems = allItems.filter((item) => !item.Premium);
    }

    if (shouldListNewOnly) {
      allItems = allItems.filter(
        (item) => safeEpoch(item.RecentSortDate || item.LatestEpisodeDate || item.CreateDate) >= safeEpoch(newEpisodeThreshold)
      );
    }

    if (shouldListFavoritesOnly) {
      if (!userId) {
        return reply.send({ items: [], totalItems: 0, totalPages: 0 });
      }

      const favoriteKeys = await getFavoriteKeysForItems(userId, allItems);
      allItems = allItems
        .filter((item) => favoriteKeys.has(`${item.type}:${item.id}`))
        .map((item) => ({ ...item, IsFavorite: true }));
    }

    if (shouldHideWatched && userId) {
      allItems = await attachWatchStatus(allItems, userId);
      allItems = allItems.filter((item) => {
        if (item.type === "video") return !item.Watched;
        if (item.type === "series") return !item.WatchedAll;
        return true;
      });
    }

    // ---- TRI ----
    // sort a priorité si fourni, sinon on retombe sur order asc/desc (titre)
    let sorted;
    if (sort === "az") {
      sorted = allItems.sort((a, b) => a.Titre.localeCompare(b.Titre));
    } else if (sort === "za") {
      sorted = allItems.sort((a, b) => b.Titre.localeCompare(a.Titre));
    } else if (sort === "recent") {
      // Récent → Ancien. Pour les séries, un épisode ajouté récemment remonte la série.
      sorted = allItems.sort(
        (a, b) =>
          safeEpoch(b.RecentSortDate || b.CreateDate) -
            safeEpoch(a.RecentSortDate || a.CreateDate) ||
          a.Titre.localeCompare(b.Titre)
      );
    } else if (sort === "ancien") {
      // Ancien → Récent (dates nulles = très anciennes => en haut)
      sorted = allItems.sort((a, b) => safeEpoch(a.CreateDate) - safeEpoch(b.CreateDate));
    } else if (sort === "most") {
      sorted = allItems.sort(
        (a, b) => getWatchScore(b) - getWatchScore(a) || a.Titre.localeCompare(b.Titre)
      );
    } else if (sort === "trending") {
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
    const itemsWithFavorite = userId
      ? await attachFavoriteStatus(paginatedItems, userId)
      : paginatedItems;

    const itemsWithWatch = userId
      ? await attachWatchStatus(itemsWithFavorite, userId)
      : itemsWithFavorite;

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

export const getAdminVideos = async (request, reply) => {
  const userId = await ensureVideoAdmin(request, reply);
  if (!userId) return;

  try {
    const videos = await prisma.video.findMany({
      where: { EtatID: ACTIVE_ETAT_ID },
      orderBy: { VideoID: "desc" },
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
              },
            },
          },
        },
      },
    });

    return reply.send(
      videos.map((video) => ({
        VideoID: video.VideoID,
        Titre: video.Titre,
        CheminImage: video.CheminImage,
        SaisonID: video.SaisonID,
        type: video.SaisonID ? "episode" : "film",
        SaisonNumero: video.Saison?.Numero ?? null,
        SeriesID: video.Saison?.Series?.SeriesID ?? null,
        SeriesTitre: video.Saison?.Series?.Titre ?? null,
      }))
    );
  } catch (error) {
    console.error("Erreur lors de la récupération admin des vidéos :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des vidéos." });
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
      where: { SaisonID: null, EtatID: ACTIVE_ETAT_ID },
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
            Episodes: { where: { EtatID: ACTIVE_ETAT_ID }, take: 1, orderBy: { Titre: "asc" } },
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


// Récupérer les détails d'une vidéo
export const getVideoDetails = async (request, reply) => {
  const videoId = parsePositiveInt(request.params?.id);
  if (!videoId) {
    return reply.status(400).send({ error: "VideoID invalide." });
  }

  try {
    // 1) Récupérer la vidéo avec les infos nécessaires
    const video = await prisma.video.findUnique({
      where: { VideoID: videoId },
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
        VideoSubtitles: {
          orderBy: { Label: "asc" },
        },
      },
    });

    if (!video) {
      return reply.status(404).send({ error: "Vidéo non trouvée." });
    }

    if (video.EtatID === DELETED_ETAT_ID) {
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
      // Le token est valide, mais l'utilisateur n'existe plus en base.
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



    const seriesId = video.Saison?.Series?.SeriesID;
    const [videoLinks, seriesLinks, favoriteKeys] = await Promise.all([
      prisma.videoPersonne.findMany({
        where: { VideoID: videoId },
        include: { Personne: true },
      }),
      seriesId
        ? prisma.seriesPersonne.findMany({
            where: { SeriesID: seriesId },
            include: { Personne: true },
          })
        : [],
      getFavoriteKeysForItems(
        userId,
        [
          { type: "video", id: video.VideoID },
          seriesId ? { type: "series", id: seriesId } : null,
        ].filter(Boolean)
      ),
    ]);

    const videoActeurs = mapLinkedPeople(videoLinks, "EstActeur");
    const videoRealisateurs = mapLinkedPeople(videoLinks, "EstRealisateur");
    const seriesActeurs = mapLinkedPeople(seriesLinks, "EstActeur");
    const seriesRealisateurs = mapLinkedPeople(seriesLinks, "EstRealisateur");

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

      return reply.send({
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
          Acteurs: videoActeurs,
          Realisateurs: videoRealisateurs,
          IsFavorite: favoriteKeys.has(`video:${video.VideoID}`),
        },
        series: {
          SeriesID: series.SeriesID,
          Titre: series.Titre,
          Resumer: series.Resumer,
          Saisons: saisons,
          Premium: !!series.Premium,
          CheminImage: series.CheminImage,
          Acteurs: seriesActeurs,
          Realisateurs: seriesRealisateurs,
          IsFavorite: favoriteKeys.has(`series:${series.SeriesID}`),
        },
      });
    } else {
      return reply.send({
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
          Acteurs: videoActeurs,
          Realisateurs: videoRealisateurs,
          IsFavorite: favoriteKeys.has(`video:${video.VideoID}`),
        },
      });
    }
  } catch (error) {
    console.error("Erreur lors de la récupération des détails de la vidéo :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération de la vidéo." });
  }
};

// PUT /api/videos/:id/image
export const updateVideoImage = async (request, reply) => {
  try {
    const { id } = request.params;
    const userId = await ensureVideoAdmin(request, reply);
    if (!userId) return;
    const parts = request.parts({ limits: { fileSize: MULTIPART_LIMITS.IMAGE_FILE_SIZE } });

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
        const filename = path.basename(part.filename || "");
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
      if (
        !oldVideo.CheminImage.includes("default") &&
        oldVideo.CheminImage.startsWith(path.join("uploads", "video", String(videoId), "affiche"))
      ) {
        removeStoredPath(oldVideo.CheminImage);
        console.log(`Ancienne image supprimée : ${oldVideo.CheminImage}`);
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

    reply.send(updated);
  } catch (error) {
    if (isMultipartFileTooLargeError(error)) return sendMultipartFileTooLarge(reply);
    console.error("❌ Erreur updateVideoImage:", error);
    reply.code(500).send({ error: "Erreur lors de la mise à jour de l'image." });
  }
};

// DELETE /api/videos/:id/image
export const deleteVideoImage = async (request, reply) => {
  const videoId = parseInt(request.params.id, 10);
  const userId = await ensureVideoAdmin(request, reply);
  if (!userId) return;

  if (!Number.isInteger(videoId)) {
    return reply.status(400).send({ error: "VideoID invalide." });
  }

  try {
    const oldVideo = await prisma.video.findUnique({
      where: { VideoID: videoId },
      select: {
        CheminImage: true,
        SaisonID: true,
        Saison: { select: { SeriesID: true } },
      },
    });

    if (!oldVideo) {
      return reply.status(404).send({ error: "Vidéo introuvable." });
    }

    removeStoredPath(oldVideo.CheminImage);

    const updated = await prisma.video.update({
      where: { VideoID: videoId },
      data: { CheminImage: null },
      select: { CheminImage: true },
    });

    await createLog({
      request,
      UtilisateurID: userId,
      ActionNom: "video_update",
      VideoID: videoId,
      SaisonID: oldVideo.SaisonID ?? null,
      SeriesID: oldVideo.Saison?.SeriesID ?? null,
      Champ: "CheminImage",
      AncienneValeur: oldVideo.CheminImage ?? null,
      NouvelleValeur: null,
      DedupeMs: 2000,
    });

    return reply.send({ ok: true, ...updated });
  } catch (error) {
    console.error("Erreur lors de la suppression de l'image de la vidéo :", error);
    return reply.status(500).send({ error: "Erreur lors de la suppression de l'image de la vidéo." });
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
  const userId = await ensureVideoAdmin(request, reply);
  if (!userId) return;

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
        UtilisateurID: userId,
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

// Génére un film random
export const getRandomFilm = async (req, reply) => {
  try {
    const where = { SaisonID: null, EtatID: ACTIVE_ETAT_ID };
    const film = await prisma.video.findFirst({
      where,
      orderBy: { VideoID: 'desc' },
      skip: Math.floor(Math.random() * await prisma.video.count({ where }))
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
              where: { EtatID: ACTIVE_ETAT_ID },
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

  // en tout début de updateVideoTitle
  const reqId = request.id ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  console.log(
    `[updateVideoTitle] reqId=${reqId} method=${request.method} url=${request.url} videoId=${id} userId=${request.user?.userId}`
  );

  try {
    const userId = await ensureVideoAdmin(request, reply);
    if (!userId) return;

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
  const Resumer = typeof request.body?.Resumer === "string" ? request.body.Resumer : "";

  if (Resumer.length > 65535) {
    return reply.status(400).send({ error: "Le Resumer est trop long." });
  }

  try {
    const videoId = parseInt(id, 10);

    const userId = await ensureVideoAdmin(request, reply);
    if (!userId) return;

    const before = await prisma.video.findUnique({
      where: { VideoID: videoId },
      select: {
        Resumer: true,
        SaisonID: true,
        Saison: { select: { SeriesID: true } },
      },
    });
    if (!before) return reply.code(404).send({ error: "Vidéo introuvable." });

    if ((before.Resumer ?? "").trim() === (Resumer ?? "").trim()) {
      return reply.send({ ok: true, unchanged: true, Resumer });
    }

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
          { EtatID: ACTIVE_ETAT_ID },
          { Titre: { contains: q } }, // match par Titre
        ],
      }
      : { SaisonID: null, EtatID: ACTIVE_ETAT_ID };

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

    const userId = await ensureVideoAdmin(request, reply);
    if (!userId) return;

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
    const userId = await ensureVideoAdmin(request, reply);
    if (!userId) return;

    const { id } = request.params;           // ID de la vidéo dans l'URL
    const { Premium } = request.body;        // booléen attendu dans le body

    // Validation basique du body
    if (typeof Premium !== "boolean") {
      return reply.code(400).send({ error: "Le champ 'Premium' doit être un booléen." });
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

export const softDeleteVideo = async (request, reply) => {
  const videoId = parseInt(request.params.id, 10);
  const userId = await ensureVideoAdmin(request, reply);
  if (!userId) return;

  if (!Number.isInteger(videoId)) {
    return reply.status(400).send({ error: "VideoID invalide." });
  }

  try {
    const video = await prisma.video.findUnique({
      where: { VideoID: videoId },
      select: {
        VideoID: true,
        Titre: true,
        EtatID: true,
        SaisonID: true,
        Saison: {
          select: {
            Numero: true,
            SeriesID: true,
            Series: { select: { Titre: true } },
          },
        },
      },
    });

    if (!video) {
      return reply.status(404).send({ error: "Vidéo introuvable." });
    }

    if (video.EtatID === DELETED_ETAT_ID) {
      return reply.send({ ok: true, unchanged: true, video: { VideoID: video.VideoID, Titre: video.Titre } });
    }

    await prisma.video.update({
      where: { VideoID: videoId },
      data: { EtatID: DELETED_ETAT_ID },
    });

    await prisma.genreFeaturedContent.updateMany({
      where: { VideoID: videoId },
      data: { VideoID: null },
    });

    await prisma.userVideoProgress.deleteMany({ where: { VideoID: videoId } });

    await createLog({
      request,
      UtilisateurID: userId,
      ActionNom: "video_soft_delete",
      VideoID: videoId,
      SaisonID: video.SaisonID ?? null,
      SeriesID: video.Saison?.SeriesID ?? null,
      Champ: "EtatID",
      AncienneValeur: String(video.EtatID),
      NouvelleValeur: String(DELETED_ETAT_ID),
      Meta: {
        VideoID: video.VideoID,
        Titre: video.Titre,
        SaisonNumero: video.Saison?.Numero ?? null,
        SeriesTitre: video.Saison?.Series?.Titre ?? null,
      },
    });

    return reply.send({
      ok: true,
      video: {
        VideoID: video.VideoID,
        Titre: video.Titre,
        EtatID: DELETED_ETAT_ID,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la suppression logique de la vidéo :", error);
    return reply.status(500).send({ error: "Erreur lors de la suppression de la vidéo." });
  }
};

export const restoreVideo = async (request, reply) => {
  const videoId = parseInt(request.params.id, 10);
  const userId = await ensureVideoSuperAdmin(request, reply);
  if (!userId) return;

  if (!Number.isInteger(videoId)) {
    return reply.status(400).send({ error: "VideoID invalide." });
  }

  try {
    const video = await prisma.video.findUnique({
      where: { VideoID: videoId },
      select: {
        VideoID: true,
        Titre: true,
        EtatID: true,
        SaisonID: true,
        Saison: { select: { SeriesID: true } },
      },
    });

    if (!video) {
      return reply.status(404).send({ error: "Vidéo introuvable." });
    }

    if (video.EtatID === ACTIVE_ETAT_ID) {
      return reply.send({ ok: true, unchanged: true, video });
    }

    const restored = await prisma.video.update({
      where: { VideoID: videoId },
      data: { EtatID: ACTIVE_ETAT_ID },
      select: { VideoID: true, Titre: true, EtatID: true },
    });

    await createLog({
      request,
      UtilisateurID: userId,
      ActionNom: "video_restore",
      VideoID: videoId,
      SaisonID: video.SaisonID ?? null,
      SeriesID: video.Saison?.SeriesID ?? null,
      Champ: "EtatID",
      AncienneValeur: String(video.EtatID),
      NouvelleValeur: String(ACTIVE_ETAT_ID),
    });

    return reply.send({ ok: true, video: restored });
  } catch (error) {
    console.error("Erreur lors de la restauration de la vidéo :", error);
    return reply.status(500).send({ error: "Erreur lors de la restauration de la vidéo." });
  }
};

export const getDeletedVideos = async (request, reply) => {
  const userId = await ensureVideoSuperAdmin(request, reply);
  if (!userId) return;

  try {
    const videos = await prisma.video.findMany({
      where: { EtatID: DELETED_ETAT_ID },
      orderBy: { VideoID: "desc" },
      select: {
        VideoID: true,
        Titre: true,
        CheminImage: true,
        EtatID: true,
        SaisonID: true,
        Saison: {
          select: {
            Numero: true,
            Series: {
              select: {
                SeriesID: true,
                Titre: true,
              },
            },
          },
        },
      },
    });

    return reply.send(
      videos.map((video) => ({
        VideoID: video.VideoID,
        Titre: video.Titre,
        CheminImage: video.CheminImage,
        EtatID: video.EtatID,
        SaisonID: video.SaisonID,
        type: video.SaisonID ? "episode" : "film",
        SaisonNumero: video.Saison?.Numero ?? null,
        SeriesID: video.Saison?.Series?.SeriesID ?? null,
        SeriesTitre: video.Saison?.Series?.Titre ?? null,
      }))
    );
  } catch (error) {
    console.error("Erreur lors de la récupération des vidéos supprimées :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des vidéos supprimées." });
  }
};

export const deleteVideo = async (request, reply) => {
  const videoId = parseInt(request.params.id, 10);
  const userId = await ensureVideoSuperAdmin(request, reply);
  if (!userId) return;

  if (!Number.isInteger(videoId)) {
    return reply.status(400).send({ error: "VideoID invalide." });
  }

  try {
    const video = await prisma.video.findUnique({
      where: { VideoID: videoId },
      select: {
        VideoID: true,
        Titre: true,
        CheminAcces: true,
        CheminImage: true,
        EtatID: true,
        SaisonID: true,
        Saison: {
          select: {
            Numero: true,
            SeriesID: true,
            Series: { select: { Titre: true } },
          },
        },
        VideoSubtitles: {
          select: {
            CheminSubtitle: true,
          },
        },
      },
    });

    if (!video) {
      return reply.status(404).send({ error: "Vidéo introuvable." });
    }

    await prisma.$transaction(async (tx) => {
      const linkedLogs = await tx.log.findMany({
        where: { VideoID: videoId },
        select: {
          LogID: true,
          AncienneValeur: true,
          Meta: true,
        },
      });

      await Promise.all(
        linkedLogs.map((log) => {
          const previousMeta =
            log.Meta && typeof log.Meta === "object" && !Array.isArray(log.Meta)
              ? log.Meta
              : {};

          return tx.log.update({
            where: { LogID: log.LogID },
            data: {
              VideoID: null,
              AncienneValeur: log.AncienneValeur ?? video.Titre,
              Meta: {
                ...previousMeta,
                deletedVideoId: video.VideoID,
                deletedVideoTitle: video.Titre,
                previousAncienneValeur: log.AncienneValeur ?? null,
                deletedSaisonId: video.SaisonID ?? null,
                deletedSaisonNumero: video.Saison?.Numero ?? null,
                deletedSeriesId: video.Saison?.SeriesID ?? null,
                deletedSeriesTitre: video.Saison?.Series?.Titre ?? null,
                deletedAt: new Date().toISOString(),
              },
            },
          });
        })
      );

      await tx.genreFeaturedContent.updateMany({
        where: { VideoID: videoId },
        data: { VideoID: null },
      });
      await tx.videoGenre.deleteMany({ where: { VideoID: videoId } });
      await tx.videoPersonne.deleteMany({ where: { VideoID: videoId } });
      await tx.userVideoProgress.deleteMany({ where: { VideoID: videoId } });
      await tx.videoSubtitle.deleteMany({ where: { VideoID: videoId } });
      await tx.video.delete({ where: { VideoID: videoId } });
    });

    const videoFolder = path.join("uploads", "video", String(videoId));
    removeStoredPath(videoFolder, { recursive: true });
    removeStoredPath(path.join("uploads", "previews", String(videoId)), { recursive: true });
    removeStoredPath(video.CheminAcces);
    removeStoredPath(video.CheminImage);
    video.VideoSubtitles.forEach((subtitle) => removeStoredPath(subtitle.CheminSubtitle));

    await createLog({
      request,
      UtilisateurID: userId,
      ActionNom: "video_delete",
      SaisonID: video.SaisonID ?? null,
      SeriesID: video.Saison?.SeriesID ?? null,
      Champ: "Video",
      AncienneValeur: JSON.stringify({
        VideoID: video.VideoID,
        Titre: video.Titre,
        SaisonID: video.SaisonID,
        SaisonNumero: video.Saison?.Numero ?? null,
        SeriesID: video.Saison?.SeriesID ?? null,
        SeriesTitre: video.Saison?.Series?.Titre ?? null,
      }),
      NouvelleValeur: null,
    });

    return reply.send({
      ok: true,
      video: {
        VideoID: video.VideoID,
        Titre: video.Titre,
      },
    });
  } catch (error) {
    console.error("Erreur lors de la suppression de la vidéo :", error);
    return reply.status(500).send({ error: "Erreur lors de la suppression de la vidéo." });
  }
};
