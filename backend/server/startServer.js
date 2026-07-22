import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";

import { prisma } from "../services/db.js";
import { createDatabaseBackup } from "../services/databaseBackupService.js";
import { rotateGenreFeaturedContent } from "../services/genreFeaturedContentService.js";
import { createServer } from "./createServer.js";
import {
  buildBackupCronExpression,
  parseServerPort,
} from "./serverConfig.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_KEEP_ALIVE_MS = 7 * 60 * 60 * 1000;

export function loadTlsCredentials() {
  return {
    key: fs.readFileSync(path.join(backendRoot, "ssl/private.key")),
    cert: fs.readFileSync(path.join(backendRoot, "ssl/certificate.crt")),
  };
}

function registerBackgroundJobs(server) {
  const backupCronExpression = buildBackupCronExpression(
    process.env.BACKUP_DAY_OF_WEEK || "0",
    process.env.BACKUP_TIME || "00:00"
  );

  const keepDatabaseAlive = async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.info("Ping à la base de données réussi");
    } catch (error) {
      console.error("Erreur lors du ping de la base de données :", error);
    }
  };

  const backupDatabase = async () => {
    try {
      const backup = await createDatabaseBackup({ kind: "auto" });
      console.info(`Sauvegarde créée avec succès : ${backup.filePath}`);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde :", error);
    }
  };

  const keepAliveTimer = setInterval(keepDatabaseAlive, DATABASE_KEEP_ALIVE_MS);
  keepAliveTimer.unref?.();

  const scheduledTasks = [
    cron.schedule(backupCronExpression, backupDatabase),
    cron.schedule("0 9 * * 1", async () => {
      console.info("Démarrage de la rotation hebdomadaire des contenus à la une");
      try {
        const result = await rotateGenreFeaturedContent();
        console.info(
          `Rotation des contenus à la une terminée pour ${result.genres.length} genres.`
        );
      } catch (error) {
        console.error("Erreur lors de la rotation des contenus à la une :", error);
      }
    }),
  ];

  server.addHook("onClose", async () => {
    clearInterval(keepAliveTimer);
    scheduledTasks.forEach((task) => task.stop());
  });
}

export async function startServer({ host, tls = false, trustProxy = false } = {}) {
  const port = parseServerPort(process.env.PORTS);
  const https = tls ? loadTlsCredentials() : undefined;
  const server = createServer({ https, trustProxy });

  try {
    registerBackgroundJobs(server);
    await server.listen({ port, host });

    const protocol = tls ? "https" : "http";
    const publicAddress = process.env.PUBLIC_URL || `${protocol}://${host}:${port}`;
    console.info(`Serveur SAMI démarré sur ${publicAddress}`);
    return server;
  } catch (error) {
    await server.close().catch(() => {});
    throw error;
  }
}
