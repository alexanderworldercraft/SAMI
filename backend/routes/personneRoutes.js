// backend/routes/personneRoutes.js
import {
  createPersonne,
  bulkLinkPeople,
  deletePersonnePhoto,
  getAdminPeople,
  getDeletedPeople,
  getPersonDuplicateCandidates,
  mergePersonDuplicates,
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
  reviewPersonDuplicate,
  softDeletePersonne,
} from "../controllers/personneController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
  // CRUD minimal
  fastify.post("/", { preHandler: authMiddleware }, createPersonne);           // multipart
  fastify.post("/bulk-link", { preHandler: authMiddleware }, bulkLinkPeople);
  fastify.get("/admin", { preHandler: authMiddleware }, getAdminPeople);
  fastify.get("/admin/deleted", { preHandler: authMiddleware }, getDeletedPeople);
  fastify.get("/admin/duplicates", { preHandler: authMiddleware }, getPersonDuplicateCandidates);
  fastify.put("/admin/duplicates/review", { preHandler: authMiddleware }, reviewPersonDuplicate);
  fastify.post("/admin/duplicates/merge", { preHandler: authMiddleware }, mergePersonDuplicates);
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
