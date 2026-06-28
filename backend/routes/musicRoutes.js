import {
  createAlbum,
  createMusique,
  createMusicGenre,
  deleteAlbum,
  deleteMusique,
  deleteMusicGenre,
  getAdminAlbums,
  getAdminMusiques,
  getAlbums,
  getDeletedAlbums,
  getDeletedMusiques,
  getMusicGenres,
  getMusiques,
  restoreAlbum,
  restoreMusique,
  softDeleteAlbum,
  softDeleteMusique,
  updateAlbum,
  updateMusique,
  updateMusicGenre,
} from "../controllers/musicController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
  fastify.get("/musiques", getMusiques);
  fastify.get("/albums", getAlbums);
  fastify.get("/genres", getMusicGenres);

  fastify.get("/admin/musiques", { preHandler: authMiddleware }, getAdminMusiques);
  fastify.get("/admin/albums", { preHandler: authMiddleware }, getAdminAlbums);
  fastify.get("/admin/musiques/deleted", { preHandler: authMiddleware }, getDeletedMusiques);
  fastify.get("/admin/albums/deleted", { preHandler: authMiddleware }, getDeletedAlbums);

  fastify.post("/musiques", { preHandler: authMiddleware }, createMusique);
  fastify.post("/albums", { preHandler: authMiddleware }, createAlbum);
  fastify.post("/genres", { preHandler: authMiddleware }, createMusicGenre);

  fastify.put("/musiques/:id", { preHandler: authMiddleware }, updateMusique);
  fastify.put("/albums/:id", { preHandler: authMiddleware }, updateAlbum);
  fastify.put("/genres/:id", { preHandler: authMiddleware }, updateMusicGenre);
  fastify.put("/musiques/:id/restore", { preHandler: authMiddleware }, restoreMusique);
  fastify.put("/albums/:id/restore", { preHandler: authMiddleware }, restoreAlbum);

  fastify.delete("/musiques/:id/permanent", { preHandler: authMiddleware }, deleteMusique);
  fastify.delete("/albums/:id/permanent", { preHandler: authMiddleware }, deleteAlbum);
  fastify.delete("/musiques/:id", { preHandler: authMiddleware }, softDeleteMusique);
  fastify.delete("/albums/:id", { preHandler: authMiddleware }, softDeleteAlbum);
  fastify.delete("/genres/:id", { preHandler: authMiddleware }, deleteMusicGenre);
}
