import {
  claimInternalAiSubtitleJob,
  completeInternalAiSubtitleJob,
  failInternalAiSubtitleJob,
  getInternalAiSubtitleSource,
  heartbeatInternalAiSubtitleWorker,
  renewInternalAiSubtitleJob,
} from "../controllers/internalAiSubtitleController.js";
import {
  internalAiSubtitleBodyIntegrity,
  internalAiSubtitleRawAuth,
} from "../middlewares/internalAiSubtitleAuth.js";

const protectedRoute = {
  onRequest: internalAiSubtitleRawAuth,
  preHandler: internalAiSubtitleBodyIntegrity,
};

export default async function internalAiSubtitleRoutes(fastify) {
  fastify.post("/workers/heartbeat", protectedRoute, heartbeatInternalAiSubtitleWorker);
  fastify.post("/jobs/claim", protectedRoute, claimInternalAiSubtitleJob);
  fastify.post("/jobs/:jobId/renew", protectedRoute, renewInternalAiSubtitleJob);
  fastify.post("/jobs/:jobId/fail", protectedRoute, failInternalAiSubtitleJob);
  fastify.post(
    "/jobs/:jobId/complete",
    { ...protectedRoute, bodyLimit: 24 * 1024 * 1024 },
    completeInternalAiSubtitleJob
  );
  fastify.get("/jobs/:jobId/source", protectedRoute, getInternalAiSubtitleSource);
}
