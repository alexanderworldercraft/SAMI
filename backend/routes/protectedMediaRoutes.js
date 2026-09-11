import { protectedMediaController } from "../controllers/protectedMediaController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { mediaAuthMiddleware } from "../middlewares/mediaAuthMiddleware.js";

export default async function protectedMediaRoutes(fastify) {
  fastify.get("/videos/:videoId/master.m3u8", { preHandler: mediaAuthMiddleware }, protectedMediaController.master);
  fastify.get("/videos/:videoId/files/*", { preHandler: mediaAuthMiddleware }, protectedMediaController.file);
  fastify.get("/videos/:videoId/subtitles/:subtitleId", { preHandler: mediaAuthMiddleware }, protectedMediaController.subtitle);
  fastify.get("/music/:musicId/file", { preHandler: authMiddleware }, protectedMediaController.music);
}
