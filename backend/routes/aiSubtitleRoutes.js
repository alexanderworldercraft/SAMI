import {
  getAdminVideosWithoutFrenchSubtitles,
  getAiSubtitleConfiguration,
  getVideoAiSubtitles,
  requestAiSubtitle,
  updateAiSubtitleConfiguration,
} from "../controllers/aiSubtitleController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const protectedRoute = { preHandler: authMiddleware };

export default async function aiSubtitleRoutes(fastify) {
  fastify.get("/config", protectedRoute, getAiSubtitleConfiguration);
  fastify.put("/config", protectedRoute, updateAiSubtitleConfiguration);
  fastify.get("/admin/videos-without-french", protectedRoute, getAdminVideosWithoutFrenchSubtitles);
  fastify.get("/videos/:videoId", protectedRoute, getVideoAiSubtitles);
  fastify.post("/videos/:videoId/requests", protectedRoute, requestAiSubtitle);
}
