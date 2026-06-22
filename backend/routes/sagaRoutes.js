import {
  addSagaContent,
  createSaga,
  deleteSagaImage,
  getAdminSagas,
  getDeletedSagas,
  getSagaAdminDetails,
  getSagaById,
  getSagas,
  getSagasForContent,
  permanentlyDeleteSaga,
  removeSagaContent,
  restoreSaga,
  softDeleteSaga,
  updateSaga,
  updateSagaContentOrder,
  updateSagaImage,
} from "../controllers/sagaController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
  fastify.get("/", getSagas);
  fastify.get("/admin", { preHandler: authMiddleware }, getAdminSagas);
  fastify.get("/admin/deleted", { preHandler: authMiddleware }, getDeletedSagas);
  fastify.get("/content/video/:videoId", { preHandler: authMiddleware }, getSagasForContent);
  fastify.get("/:id", { preHandler: authMiddleware }, getSagaById);
  fastify.get("/:id/admin", { preHandler: authMiddleware }, getSagaAdminDetails);

  fastify.post("/", { preHandler: authMiddleware }, createSaga);
  fastify.post("/:id/contents", { preHandler: authMiddleware }, addSagaContent);

  fastify.put("/:id", { preHandler: authMiddleware }, updateSaga);
  fastify.put("/:id/image", { preHandler: authMiddleware }, updateSagaImage);
  fastify.put("/:id/contents/order", { preHandler: authMiddleware }, updateSagaContentOrder);
  fastify.put("/:id/restore", { preHandler: authMiddleware }, restoreSaga);

  fastify.delete("/:id/image", { preHandler: authMiddleware }, deleteSagaImage);
  fastify.delete("/:id/contents/:contentId", { preHandler: authMiddleware }, removeSagaContent);
  fastify.delete("/:id/permanent", { preHandler: authMiddleware }, permanentlyDeleteSaga);
  fastify.delete("/:id", { preHandler: authMiddleware }, softDeleteSaga);
}
