import {
  getContentPreviewSetting,
  getPreviewLiveSetting,
  updateContentPreviewSetting,
  updatePreviewLiveSetting,
} from "../controllers/appSettingController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
  fastify.get("/content-preview", getContentPreviewSetting);
  fastify.put("/content-preview", { preHandler: authMiddleware }, updateContentPreviewSetting);
  fastify.get("/preview-live", getPreviewLiveSetting);
  fastify.put("/preview-live", { preHandler: authMiddleware }, updatePreviewLiveSetting);
}
