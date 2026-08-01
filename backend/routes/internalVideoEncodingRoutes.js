import {
  claimInternalVideoEncodingTask,
  completeInternalVideoEncodingTask,
  failInternalVideoEncodingTask,
  getInternalVideoEncodingSource,
  heartbeatInternalVideoEncodingWorker,
  registerInternalVideoEncodingArtifacts,
  releaseInternalVideoEncodingTask,
  renewInternalVideoEncodingTask,
  uploadInternalVideoEncodingArtifact,
} from "../controllers/internalVideoEncodingController.js";
import {
  internalDistributedEncodingBodyIntegrity,
  internalDistributedEncodingRawAuth,
} from "../middlewares/internalDistributedEncodingAuth.js";

const protectedRoute = {
  onRequest: internalDistributedEncodingRawAuth,
  preHandler: internalDistributedEncodingBodyIntegrity,
};
const ARTIFACT_MANIFEST_BODY_LIMIT = 8 * 1024 * 1024;

export default async function internalVideoEncodingRoutes(fastify) {
  fastify.post(
    "/workers/heartbeat",
    protectedRoute,
    heartbeatInternalVideoEncodingWorker
  );
  fastify.post(
    "/tasks/claim",
    protectedRoute,
    claimInternalVideoEncodingTask
  );
  fastify.post(
    "/tasks/:taskId/renew",
    protectedRoute,
    renewInternalVideoEncodingTask
  );
  fastify.get(
    "/jobs/:jobId/source",
    protectedRoute,
    getInternalVideoEncodingSource
  );
  fastify.post(
    "/tasks/:taskId/artifacts",
    { ...protectedRoute, bodyLimit: ARTIFACT_MANIFEST_BODY_LIMIT },
    registerInternalVideoEncodingArtifacts
  );
  fastify.put(
    "/tasks/:taskId/artifacts/:fileId",
    {
      onRequest: [
        internalDistributedEncodingRawAuth,
        uploadInternalVideoEncodingArtifact,
      ],
    },
    async (_request, reply) => {
      if (!reply.sent) {
        return reply.status(500).send({
          error: "Le flux d'artefact n'a pas été traité.",
        });
      }
    }
  );
  fastify.post(
    "/tasks/:taskId/complete",
    protectedRoute,
    completeInternalVideoEncodingTask
  );
  fastify.post(
    "/tasks/:taskId/fail",
    protectedRoute,
    failInternalVideoEncodingTask
  );
  fastify.post(
    "/tasks/:taskId/release",
    protectedRoute,
    releaseInternalVideoEncodingTask
  );
}
