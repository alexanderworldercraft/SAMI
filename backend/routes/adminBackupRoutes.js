import { createManualBackup } from "../controllers/adminBackupController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

export default async function (fastify) {
  fastify.post("/manual", { preHandler: authMiddleware }, createManualBackup);
}
