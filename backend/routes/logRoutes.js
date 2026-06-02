// backend/routes/logRoutes.js
import { logVideoFirstPlay, logVideoResumePlay } from "../controllers/logController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function logRoutes(fastify) {
  fastify.post("/video-first-play", { preHandler: authMiddleware }, logVideoFirstPlay);
  fastify.post("/video-resume-play", { preHandler: authMiddleware }, logVideoResumePlay);
}
