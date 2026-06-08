import { 
  // GET
  getAllGenres, 
  getGenres, 
  getFeaturedGenres,

  // POST
  addAdminGenre,
  addGenre, 
  addGenreUtilisateur,
  refreshFeaturedGenres,

  // PUT
  updateGenre,
  updateGenreUtilisateur,

  // DELETE
  deleteGenre,
} from "../controllers/genreController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
  // GET
  fastify.get("/", getAllGenres); // Récupère la liste des genres
  fastify.get("/featured", getFeaturedGenres);
  fastify.get("/:id", getGenres); // Récupère la liste des genres préfèrer de l'utilisateur

  //POST
  fastify.post("/", addGenre); // Ajoute un nouveau genre
  fastify.post("/admin", { preHandler: authMiddleware }, addAdminGenre);
  fastify.post("/featured/refresh", { preHandler: authMiddleware }, refreshFeaturedGenres);
  fastify.post("/:id", addGenreUtilisateur); // Ajoute un nouveau genre à l'utilisateur

  // PUT
  fastify.put("/admin/:id", { preHandler: authMiddleware }, updateGenre);
  fastify.put("/:id", updateGenreUtilisateur); // Mettre à jour les genre de l'utilisateur

  // DELETE
  fastify.delete("/admin/:id", { preHandler: authMiddleware }, deleteGenre);
}
