import {
  addUniverseContent,
  addUniverseSaga,
  createUniverse,
  getAdminUniverses,
  getDeletedUniverses,
  getUniverseAdminCatalog,
  getUniverseAdminDetails,
  getUniverses,
  permanentlyDeleteUniverse,
  removeUniverseContent,
  removeUniverseSaga,
  restoreUniverse,
  softDeleteUniverse,
  updateUniverse,
  updateUniverseItemsOrder,
  updateUniverseSagaOrder,
} from "../controllers/universeController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
  fastify.get("/", getUniverses);
  fastify.get("/admin", { preHandler: authMiddleware }, getAdminUniverses);
  fastify.get("/admin/catalog", { preHandler: authMiddleware }, getUniverseAdminCatalog);
  fastify.get("/admin/deleted", { preHandler: authMiddleware }, getDeletedUniverses);
  fastify.get("/:id/admin", { preHandler: authMiddleware }, getUniverseAdminDetails);

  fastify.post("/", { preHandler: authMiddleware }, createUniverse);
  fastify.post("/:id/contents", { preHandler: authMiddleware }, addUniverseContent);
  fastify.post("/:id/sagas", { preHandler: authMiddleware }, addUniverseSaga);

  fastify.put("/:id", { preHandler: authMiddleware }, updateUniverse);
  fastify.put("/:id/items/order", { preHandler: authMiddleware }, updateUniverseItemsOrder);
  fastify.put("/:id/sagas/order", { preHandler: authMiddleware }, updateUniverseSagaOrder);
  fastify.put("/:id/restore", { preHandler: authMiddleware }, restoreUniverse);

  fastify.delete("/:id/contents/:universeContentId", { preHandler: authMiddleware }, removeUniverseContent);
  fastify.delete("/:id/sagas/:universeSagaId", { preHandler: authMiddleware }, removeUniverseSaga);
  fastify.delete("/:id/permanent", { preHandler: authMiddleware }, permanentlyDeleteUniverse);
  fastify.delete("/:id", { preHandler: authMiddleware }, softDeleteUniverse);
}
