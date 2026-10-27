import {
  getContentPreviewSetting,
  getMultiAudioSetting,
  getPreviewLiveSetting,
  getFakePremiumApiSetting,
  updateFakePremiumApiSetting,
  updateContentPreviewSetting,
  updateMultiAudioSetting,
  updatePreviewLiveSetting,
} from "../controllers/appSettingController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
  fastify.get("/fake-premium", { preHandler: authMiddleware }, getFakePremiumApiSetting);
  fastify.put("/fake-premium", { preHandler: authMiddleware }, updateFakePremiumApiSetting);
  fastify.get("/content-preview", getContentPreviewSetting);
  fastify.put("/content-preview", { preHandler: authMiddleware }, updateContentPreviewSetting);
  fastify.get("/preview-live", getPreviewLiveSetting);
  fastify.put("/preview-live", { preHandler: authMiddleware }, updatePreviewLiveSetting);
  fastify.get("/multi-audio", getMultiAudioSetting);
  fastify.put("/multi-audio", { preHandler: authMiddleware }, updateMultiAudioSetting);
}
