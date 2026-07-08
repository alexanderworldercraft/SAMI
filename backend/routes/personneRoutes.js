// backend/routes/personneRoutes.js
import {
  createPersonne,
  updatePersonnePhoto,
  searchPeople,
  linkPersonne,
  unlinkPersonne,
  getPeopleForVideo,
  getPersonDetails,  
  getPeopleForSeries
} from "../controllers/personneController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
  // CRUD minimal
  fastify.post("/", { preHandler: authMiddleware }, createPersonne);           // multipart
  fastify.put("/:id/photo", { preHandler: authMiddleware }, updatePersonnePhoto); // multipart
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
