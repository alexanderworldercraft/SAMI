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

export default async function (fastify) {
  // CRUD minimal
  fastify.post("/", createPersonne);           // multipart
  fastify.put("/:id/photo", updatePersonnePhoto); // multipart
  fastify.get("/", searchPeople);

  // Détails personne
  fastify.get("/:id", getPersonDetails);
  
  // Liaison / Déliaison
  fastify.post("/:id/link", linkPersonne);
  fastify.delete("/:id/unlink", unlinkPersonne);

  // Récup associations
  fastify.get("/video/:id", getPeopleForVideo);
  fastify.get("/series/:id", getPeopleForSeries);
}
