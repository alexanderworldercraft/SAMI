import { 
  updateVideoTitle, 
  updateVideoResumer,
  getTotalSeries, 
  getTotalFilms, 
  getTotalVideos, 
  getVideosAndSeries, 
  addVideo, 
  getVideoDetails, 
  addEpisode, 
  getRandomFilm, 
  getRandomSeriesFirstEpisode, 
  getRandomMedia,
  getRecommandationsParGenres,
  getPersonalizedRecommendations,
  getRecommandation1,
  moveVideoToSeason,
  getAdditionsByDate,
  updateVideoImage,
  deleteVideoImage,
  getAdditionsForDate,
  quickSearchVideos,
  getVideoGenres,
  updateVideoGenres,
  updateVideoPremium,
  getMostWatchedLast30Days,
  getVideoProgress,
  upsertVideoProgress,
  deleteVideoProgress,
  getResumeProgressOverview,
  getAdminVideos,
  getDeletedVideos,
  restoreVideo,
  softDeleteVideo,
  deleteVideo,
  getVideoPreviewFrames,
  getVideoPreviewLive
} from "../controllers/videoController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
  fastify.post("/episodes", { preHandler: authMiddleware }, addEpisode); // Ajouter un épisode
  fastify.post("/add", { preHandler: authMiddleware }, async (req, reply) => addVideo(req, reply, fastify));
  fastify.post("/", { preHandler: authMiddleware }, async (req, reply) => addVideo(req, reply, fastify));

  fastify.get("/", getVideosAndSeries);
  fastify.get("/admin", { preHandler: authMiddleware }, getAdminVideos);
  fastify.get("/admin/deleted", { preHandler: authMiddleware }, getDeletedVideos);
  fastify.get("/:id/genres", getVideoGenres);
  fastify.get("/:id/preview-frames", getVideoPreviewFrames);
  fastify.get("/:id/preview-live", getVideoPreviewLive);
  fastify.get("/:id", { preHandler: authMiddleware }, getVideoDetails);
  fastify.get("/random-film", getRandomFilm);
  fastify.get("/random-series", getRandomSeriesFirstEpisode);
  fastify.get("/random-media", getRandomMedia);
  fastify.get("/total", getTotalVideos);
  fastify.get("/totalfilms", getTotalFilms);
  fastify.get("/totalseries", getTotalSeries);
  fastify.get("/recommandation/:id", getRecommandationsParGenres);
  fastify.get("/recommandation-personalisee/:id", { preHandler: authMiddleware }, getPersonalizedRecommendations);
  fastify.get("/recommandation/1/:genre", getRecommandation1);
  fastify.get("/recommandation/2/:genre", getRecommandation1);
  fastify.get("/recommandation/3/:genre", getRecommandation1);
  fastify.get("/recommandation/4/:genre", getRecommandation1);
  fastify.get("/recommandation/5/:genre", getRecommandation1);
  fastify.get("/calendar/added-by-date", getAdditionsByDate); // ?year=2025&month=6
  fastify.get("/calendar/items-by-day", getAdditionsForDate); // ?date=2025-06-14
  fastify.get("/search", quickSearchVideos); // ⬅️ nouveau endpoint de recherche films
  fastify.get("/popular-30-days", getMostWatchedLast30Days);
  fastify.get("/progress/resume", { preHandler: authMiddleware }, getResumeProgressOverview);
  fastify.get("/:id/progress", { preHandler: authMiddleware }, getVideoProgress);


  fastify.put("/:id/title", { preHandler: authMiddleware }, updateVideoTitle);
  fastify.put("/:id/resumer", { preHandler: authMiddleware }, updateVideoResumer);
  fastify.put("/move-to-season", { preHandler: authMiddleware }, moveVideoToSeason);
  fastify.put("/:id/image", { preHandler: authMiddleware }, updateVideoImage); // ⬅️ nouveau (multipart)
  fastify.put("/:id/genres", { preHandler: authMiddleware }, updateVideoGenres);
  fastify.put("/:id/premium", { preHandler: authMiddleware }, updateVideoPremium);
  fastify.put("/:id/restore", { preHandler: authMiddleware }, restoreVideo);
  fastify.put("/:id/progress", { preHandler: authMiddleware }, upsertVideoProgress);
  fastify.delete("/:id/progress", { preHandler: authMiddleware }, deleteVideoProgress);
  fastify.delete("/:id/image", { preHandler: authMiddleware }, deleteVideoImage);
  fastify.delete("/:id/permanent", { preHandler: authMiddleware }, deleteVideo);
  fastify.delete("/:id", { preHandler: authMiddleware }, softDeleteVideo);
}
