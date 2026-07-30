import {
  authorizeVideoExport,
  cancelVideoExport,
  getPrimarySeriesSeasons,
  getVideoExportConfig,
  getVideoExportForVideo,
  getVideoExportStatus,
  resumeVideoExport,
  startVideoExport,
} from "../controllers/videoExportController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { videoExportAuthorizationRateLimit } from "../middlewares/rateLimitMiddleware.js";

export default async function videoExportRoutes(fastify) {
  fastify.get("/config", { preHandler: authMiddleware }, getVideoExportConfig);
  fastify.post(
    "/:videoId/authorize",
    { preHandler: [authMiddleware, videoExportAuthorizationRateLimit] },
    authorizeVideoExport
  );
  fastify.get(
    "/catalog/series/:seriesId/seasons",
    { preHandler: authMiddleware },
    getPrimarySeriesSeasons
  );
  fastify.get("/video/:videoId", { preHandler: authMiddleware }, getVideoExportForVideo);
  fastify.post("/:videoId", { preHandler: authMiddleware }, startVideoExport);
  fastify.get("/:transferId", { preHandler: authMiddleware }, getVideoExportStatus);
  fastify.get("/:transferId/status", { preHandler: authMiddleware }, getVideoExportStatus);
  fastify.post(
    "/:transferId/resume",
    { preHandler: [authMiddleware, videoExportAuthorizationRateLimit] },
    resumeVideoExport
  );
  fastify.post("/:transferId/cancel", { preHandler: authMiddleware }, cancelVideoExport);
}
