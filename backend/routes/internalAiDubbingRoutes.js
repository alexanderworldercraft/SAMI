import {
  claimInternalAiDubbingJob,
  completeInternalAiDubbingJob,
  failInternalAiDubbingJob,
  getInternalAiDubbingAsset,
  heartbeatInternalAiDubbingWorker,
  registerInternalAiDubbingArtifacts,
  renewInternalAiDubbingJob,
  uploadInternalAiDubbingArtifact,
  receiveInternalAiDubbingDiagnostic,
} from "../controllers/internalAiDubbingController.js";
import {
  internalAiDubbingBodyIntegrity,
  internalAiDubbingRawAuth,
} from "../middlewares/internalAiDubbingAuth.js";
import { DIAGNOSTIC_BODY_LIMIT } from "../services/aiDubbing/diagnosticTransfer.js";

const protectedRoute = {
  onRequest: internalAiDubbingRawAuth,
  preHandler: internalAiDubbingBodyIntegrity,
};

export default async function internalAiDubbingRoutes(fastify) {
  fastify.post("/diagnostics", { ...protectedRoute, bodyLimit: DIAGNOSTIC_BODY_LIMIT }, receiveInternalAiDubbingDiagnostic);
  fastify.post("/workers/heartbeat", protectedRoute, heartbeatInternalAiDubbingWorker);
  fastify.post("/jobs/claim", protectedRoute, claimInternalAiDubbingJob);
  fastify.post("/jobs/:jobId/renew", protectedRoute, renewInternalAiDubbingJob);
  fastify.post("/jobs/:jobId/fail", protectedRoute, failInternalAiDubbingJob);
  fastify.get("/jobs/:jobId/assets/:fileId", protectedRoute, getInternalAiDubbingAsset);
  fastify.post(
    "/jobs/:jobId/artifacts",
    { ...protectedRoute, bodyLimit: 1024 * 1024 },
    registerInternalAiDubbingArtifacts
  );
  fastify.put(
    "/jobs/:jobId/artifacts/:fileId",
    { onRequest: [internalAiDubbingRawAuth, uploadInternalAiDubbingArtifact] },
    async (_request, reply) => {
      if (!reply.sent) return reply.status(500).send({ error: "Le flux de doublage n'a pas été traité." });
    }
  );
  fastify.post(
    "/jobs/:jobId/complete",
    { ...protectedRoute, bodyLimit: 4 * 1024 * 1024 },
    completeInternalAiDubbingJob
  );
}
