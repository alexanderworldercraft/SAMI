import {
  addVoiceSpeaker,
  approveFinal,
  approvePreview,
  deleteDubbing,
  getAdminAiDubbingJobs,
  getAiDubbingConfiguration,
  getAiDubbingPreview,
  getAiDubbingVoiceSample,
  regenerateVoiceProfile,
  rejectDubbing,
  requestAiDubbingPreview,
  reviewVoiceProfile,
  retryDubbingAnalysis,
} from "../controllers/aiDubbingController.js";
import { aiFeatureAccessMiddleware } from "../middlewares/aiFeatureAccessMiddleware.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const protectedRoute = { preHandler: [authMiddleware, aiFeatureAccessMiddleware] };

export default async function aiDubbingRoutes(fastify) {
  fastify.get("/config", protectedRoute, getAiDubbingConfiguration);
  fastify.get("/jobs", protectedRoute, getAdminAiDubbingJobs);
  fastify.get("/jobs/:jobId/preview", protectedRoute, getAiDubbingPreview);
  fastify.get("/jobs/:jobId/voice-samples/:speaker", protectedRoute, getAiDubbingVoiceSample);
  fastify.post("/videos/:videoId/requests", protectedRoute, requestAiDubbingPreview);
  fastify.post("/jobs/:jobId/approve-preview", protectedRoute, approvePreview);
  fastify.post("/jobs/:jobId/voice-profiles/:speaker/review", protectedRoute, reviewVoiceProfile);
  fastify.post("/jobs/:jobId/voice-profiles/:speaker/regenerate", protectedRoute, regenerateVoiceProfile);
  fastify.post("/jobs/:jobId/speakers", protectedRoute, addVoiceSpeaker);
  fastify.post("/jobs/:jobId/retry", protectedRoute, retryDubbingAnalysis);
  fastify.post("/jobs/:jobId/reject", protectedRoute, rejectDubbing);
  fastify.post("/jobs/:jobId/approve-final", protectedRoute, approveFinal);
  fastify.delete("/jobs/:jobId", protectedRoute, deleteDubbing);
}
