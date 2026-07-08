import { 
  // GET
  getAllGenres, 
  getGenres, 
  getFeaturedGenres,
  getHomepageDefaultGenres,

  // POST
  addAdminGenre,
  addGenre, 
  addGenreUtilisateur,
  refreshFeaturedGenres,

  // PUT
  updateGenre,
  updateHomepageDefaultGenres,
  updateGenreUtilisateur,

  // DELETE
  deleteGenre,
} from "../controllers/genreController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
  // GET
  fastify.get("/", getAllGenres); // Récupère la liste des genres
  fastify.get("/featured", getFeaturedGenres);
  fastify.get("/homepage-defaults", getHomepageDefaultGenres);
  fastify.get("/:id", getGenres); // Récupère la liste des genres préfèrer de l'utilisateur

  //POST
  fastify.post("/", { preHandler: authMiddleware }, addGenre); // Ajoute un nouveau genre
  fastify.post("/admin", { preHandler: authMiddleware }, addAdminGenre);
  fastify.post("/featured/refresh", { preHandler: authMiddleware }, refreshFeaturedGenres);
  fastify.post("/:id", { preHandler: authMiddleware }, addGenreUtilisateur); // Ajoute un nouveau genre à l'utilisateur

  // PUT
  fastify.put("/homepage-defaults", { preHandler: authMiddleware }, updateHomepageDefaultGenres);
  fastify.put("/admin/:id", { preHandler: authMiddleware }, updateGenre);
  fastify.put("/:id", { preHandler: authMiddleware }, updateGenreUtilisateur); // Mettre à jour les genre de l'utilisateur

  // DELETE
  fastify.delete("/admin/:id", { preHandler: authMiddleware }, deleteGenre);
}
