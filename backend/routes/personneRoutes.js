// backend/routes/personneRoutes.js
import {
  createPersonne,
  deletePersonnePhoto,
  getAdminPeople,
  getDeletedPeople,
  updatePersonnePhoto,
  updatePersonne,
  searchPeople,
  linkPersonne,
  unlinkPersonne,
  getPeopleForVideo,
  getPersonDetails,  
  getPeopleForSeries,
  permanentlyDeletePersonne,
  restorePersonne,
  softDeletePersonne,
} from "../controllers/personneController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
  // CRUD minimal
  fastify.post("/", { preHandler: authMiddleware }, createPersonne);           // multipart
  fastify.get("/admin", { preHandler: authMiddleware }, getAdminPeople);
  fastify.get("/admin/deleted", { preHandler: authMiddleware }, getDeletedPeople);
  fastify.put("/:id", { preHandler: authMiddleware }, updatePersonne);
  fastify.put("/:id/photo", { preHandler: authMiddleware }, updatePersonnePhoto); // multipart
  fastify.put("/:id/restore", { preHandler: authMiddleware }, restorePersonne);
  fastify.delete("/:id/photo", { preHandler: authMiddleware }, deletePersonnePhoto);
  fastify.delete("/:id/permanent", { preHandler: authMiddleware }, permanentlyDeletePersonne);
  fastify.delete("/:id", { preHandler: authMiddleware }, softDeletePersonne);
  fastify.get("/", searchPeople);

  // Détails personne
  fastify.get("/:id", getPersonDetails);
  
  // Liaison / Déliaison
  fastify.post("/:id/link", { preHandler: authMiddleware }, linkPersonne);
  fastify.delete("/:id/unlink", { preHandler: authMiddleware }, unlinkPersonne);

  // Récup associations
  fastify.get("/video/:id", getPeopleForVideo);
  fastify.get("/series/:id", getPeopleForSeries);
}
