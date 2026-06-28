// backend/routes/logRoutes.js
import {
  getPreviousMusiquePlay,
  logMusiqueFirstPlay,
  logVideoFirstPlay,
  logVideoResumePlay,
} from "../controllers/logController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function logRoutes(fastify) {
  fastify.post("/video-first-play", { preHandler: authMiddleware }, logVideoFirstPlay);
  fastify.post("/video-resume-play", { preHandler: authMiddleware }, logVideoResumePlay);
  fastify.post("/musique-first-play", { preHandler: authMiddleware }, logMusiqueFirstPlay);
  fastify.get("/musique-previous-play", { preHandler: authMiddleware }, getPreviousMusiquePlay);
}
