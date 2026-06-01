import { importVideo } from "../controllers/importController.js";

export default async function (fastify) {
  fastify.post("/video", importVideo);
}
