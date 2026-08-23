import {
  deleteAdminGeneratedAiSubtitle,
  getAdminGeneratedAiSubtitle,
  getAdminGeneratedAiSubtitles,
  getAdminVideosWithoutFrenchSubtitles,
  getAiSubtitleConfiguration,
  getVideoAiSubtitles,
  recreateAdminGeneratedAiSubtitle,
  requestAiSubtitle,
  updateAdminGeneratedAiSubtitleSegments,
  updateAdminGeneratedAiSubtitleText,
  updateAiSubtitleConfiguration,
} from "../controllers/aiSubtitleController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const protectedRoute = { preHandler: authMiddleware };

export default async function aiSubtitleRoutes(fastify) {
  fastify.get("/config", protectedRoute, getAiSubtitleConfiguration);
  fastify.put("/config", protectedRoute, updateAiSubtitleConfiguration);
  fastify.get("/admin/videos-without-french", protectedRoute, getAdminVideosWithoutFrenchSubtitles);
  fastify.get("/admin/generated", protectedRoute, getAdminGeneratedAiSubtitles);
  fastify.get("/admin/subtitles/:subtitleId", protectedRoute, getAdminGeneratedAiSubtitle);
  fastify.put("/admin/subtitles/:subtitleId/text", protectedRoute, updateAdminGeneratedAiSubtitleText);
  fastify.put("/admin/subtitles/:subtitleId/segments", protectedRoute, updateAdminGeneratedAiSubtitleSegments);
  fastify.delete("/admin/subtitles/:subtitleId", protectedRoute, deleteAdminGeneratedAiSubtitle);
  fastify.post("/admin/subtitles/:subtitleId/recreate", protectedRoute, recreateAdminGeneratedAiSubtitle);
  fastify.get("/videos/:videoId", protectedRoute, getVideoAiSubtitles);
  fastify.post("/videos/:videoId/requests", protectedRoute, requestAiSubtitle);
}
