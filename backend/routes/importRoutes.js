import { importVideo } from "../controllers/importController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
  fastify.post("/video", { preHandler: authMiddleware }, importVideo);
}
