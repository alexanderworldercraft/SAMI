import {
  cancelInternalVideoTransfer,
  createInternalVideoTransferSession,
  finalizeInternalVideoTransfer,
  getInternalCapabilities,
  getInternalGenres,
  getInternalSeries,
  getInternalSeriesSeasons,
  getInternalVideoTransferStatus,
  uploadInternalVideoTransferFile,
  verifyInternalVideoTransfer,
} from "../controllers/internalVideoTransferController.js";
import {
  internalVideoTransferBodyIntegrity,
  internalVideoTransferRawAuth,
} from "../middlewares/internalVideoTransferAuth.js";

const SESSION_BODY_LIMIT = 32 * 1024 * 1024;

export default async function internalVideoTransferRoutes(fastify) {
  const protectedRoute = {
    onRequest: internalVideoTransferRawAuth,
    preHandler: internalVideoTransferBodyIntegrity,
  };
  fastify.get("/capabilities", protectedRoute, getInternalCapabilities);
  fastify.get("/catalog/genres", protectedRoute, getInternalGenres);
  fastify.get("/catalog/series", protectedRoute, getInternalSeries);
  fastify.get(
    "/catalog/series/:seriesId/seasons",
    protectedRoute,
    getInternalSeriesSeasons
  );
  fastify.post(
    "/sessions",
    { ...protectedRoute, bodyLimit: SESSION_BODY_LIMIT },
    createInternalVideoTransferSession
  );
  fastify.get("/sessions/:transferId", protectedRoute, getInternalVideoTransferStatus);
  fastify.put(
    "/sessions/:transferId/files/:fileId",
    {
      onRequest: [
        internalVideoTransferRawAuth,
        uploadInternalVideoTransferFile,
      ],
    },
    async (_request, reply) => {
      if (!reply.sent) {
        return reply.status(500).send({
          error: "Le flux de transfert n'a pas été traité.",
        });
      }
    }
  );
  fastify.post(
    "/sessions/:transferId/verify",
    protectedRoute,
    verifyInternalVideoTransfer
  );
  fastify.post(
    "/sessions/:transferId/finalize",
    protectedRoute,
    finalizeInternalVideoTransfer
  );
  fastify.post(
    "/sessions/:transferId/cancel",
    protectedRoute,
    cancelInternalVideoTransfer
  );
}
