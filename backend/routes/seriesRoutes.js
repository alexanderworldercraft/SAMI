import {
    createSeries,
    deleteSeries,
    deleteSaison,
    getSeriesById,
    updateSerieTitle,
    updateSerieResumer,
    addSaison,
    getAllSeries,
    getSeasonsBySeriesId,
    updateSerieImage,
    getSerieGenres,
    updateSerieGenres,
    updateSeriePremium,
    updateSaison,
    resetSeriesWatchStatus
} from "../controllers/seriesController.js";

import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
    fastify.get("/", getAllSeries);
    fastify.get("/:id/saisons", getSeasonsBySeriesId);
    fastify.get("/:id/genres", getSerieGenres);
    fastify.get("/:id", getSeriesById);

    fastify.post("/", createSeries); // Route pour créer une série
    fastify.post("/:id/saisons", addSaison); // Ajouter une saison à une série

    fastify.delete("/saisons/:saisonId", { preHandler: authMiddleware }, deleteSaison);
    fastify.delete("/:id", { preHandler: authMiddleware }, deleteSeries);

    fastify.put("/saisons/:saisonId", { preHandler: authMiddleware }, updateSaison);
    fastify.put("/:id/title", { preHandler: authMiddleware }, updateSerieTitle); // Mise à jour du titre de la série
    fastify.put("/:id/resumer", { preHandler: authMiddleware }, updateSerieResumer); // Mise à jour du résumer de la série
    fastify.put("/:id/image", { preHandler: authMiddleware }, updateSerieImage); // ⬅️ nouvelle route (multipart)
    fastify.put("/:id/genres", { preHandler: authMiddleware }, updateSerieGenres);
    fastify.put("/:id/premium", { preHandler: authMiddleware }, updateSeriePremium);
    fastify.put("/:id/watch-reset", { preHandler: authMiddleware }, resetSeriesWatchStatus);
}
