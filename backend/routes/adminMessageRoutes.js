import {
  getActiveAdminMessage,
  getAdminMessage,
  toggleAdminMessage,
  updateAdminMessage,
} from "../controllers/adminMessageController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
  // GET
  fastify.get("/active", getActiveAdminMessage);
  fastify.get("/", { preHandler: authMiddleware }, getAdminMessage);

  // PUT
  fastify.put("/", { preHandler: authMiddleware }, updateAdminMessage);
  fastify.put("/toggle", { preHandler: authMiddleware }, toggleAdminMessage);
}
