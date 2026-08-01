import {
  cancelVideoEncodingJob,
  createVideoEncodingJob,
  createVideoEncodingWorker,
  getVideoEncodingConfig,
  getVideoEncodingJob,
  getVideoEncodingJobs,
  getVideoEncodingWorkers,
  removeVideoEncodingWorker,
  resumeVideoEncodingJob,
  updateVideoEncodingConfig,
  updateVideoEncodingWorker,
} from "../controllers/videoEncodingController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const protectedRoute = { preHandler: authMiddleware };

export default async function videoEncodingRoutes(fastify) {
  fastify.get("/config", protectedRoute, getVideoEncodingConfig);
  fastify.put("/config", protectedRoute, updateVideoEncodingConfig);

  fastify.get("/workers", protectedRoute, getVideoEncodingWorkers);
  fastify.post("/workers", protectedRoute, createVideoEncodingWorker);
  fastify.patch(
    "/workers/:workerId",
    protectedRoute,
    updateVideoEncodingWorker
  );
  fastify.delete(
    "/workers/:workerId",
    protectedRoute,
    removeVideoEncodingWorker
  );

  fastify.post("/jobs", protectedRoute, createVideoEncodingJob);
  fastify.get("/jobs", protectedRoute, getVideoEncodingJobs);
  fastify.get("/jobs/:jobId", protectedRoute, getVideoEncodingJob);
  fastify.post(
    "/jobs/:jobId/resume",
    protectedRoute,
    resumeVideoEncodingJob
  );
  fastify.post(
    "/jobs/:jobId/cancel",
    protectedRoute,
    cancelVideoEncodingJob
  );
}
