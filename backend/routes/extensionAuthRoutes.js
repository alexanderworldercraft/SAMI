import { extensionAuthController } from "../controllers/extensionAuthController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { extensionAuthMiddleware } from "../middlewares/extensionAuthMiddleware.js";

export default async function extensionAuthRoutes(fastify) {
  fastify.post("/authorize", { preHandler: authMiddleware }, extensionAuthController.authorize);
  fastify.post("/token", extensionAuthController.token);
  fastify.get("/me", { preHandler: extensionAuthMiddleware }, extensionAuthController.me);
  fastify.post("/revoke", { preHandler: extensionAuthMiddleware }, extensionAuthController.revoke);
}
