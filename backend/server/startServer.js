import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";

import { prisma } from "../services/db.js";
import { deactivateExpiredAdminMessages } from "../services/adminMessageService.js";
import { createDatabaseBackup } from "../services/databaseBackupService.js";
import { rotateGenreFeaturedContent } from "../services/genreFeaturedContentService.js";
import { createServer } from "./createServer.js";
import {
  buildBackupCronExpression,
  formatServerStartupBanner,
  getServerStartupInfo,
  parseServerPort,
} from "./serverConfig.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_KEEP_ALIVE_MS = 7 * 60 * 60 * 1000;

export function loadTlsCredentials() {
  console.info("Lecture des certificats SSL...");
  const credentials = {
    key: fs.readFileSync(path.join(backendRoot, "ssl/private.key")),
    cert: fs.readFileSync(path.join(backendRoot, "ssl/certificate.crt")),
  };
  console.info("Certificats SSL chargés.");

  return credentials;
}

function registerBackgroundJobs(server) {
  const backupCronExpression = buildBackupCronExpression(
    process.env.BACKUP_DAY_OF_WEEK || "0",
    process.env.BACKUP_TIME || "00:00"
  );

  const keepDatabaseAlive = async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      console.info("Ping base de données réussi.");
      return true;
    } catch (error) {
      console.error("Échec du ping base de données :", error.message);
      return false;
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
    cron.schedule("* * * * *", async () => {
      try {
        const result = await deactivateExpiredAdminMessages();
        if (result.count > 0) {
          console.info(`${result.count} message général expiré automatiquement.`);
        }
      } catch (error) {
        console.error("Erreur lors de l'expiration du message général :", error);
      }
    }),
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

  return { pingDatabase: keepDatabaseAlive };
}

export async function startServer({
  host,
  tls = false,
  trustProxy = false,
  appName = process.env.APP_NAME || "SAMI",
} = {}) {
  const port = parseServerPort(process.env.PORTS);
  const https = tls ? loadTlsCredentials() : undefined;
  const server = createServer({ https, trustProxy });
  const startupInfo = getServerStartupInfo({
    appName,
    publicUrl: process.env.PUBLIC_URL,
    publicHost: process.env.PUBLIC_HOST,
    port,
    listenHost: host,
    tls,
  });

  try {
    const { pingDatabase } = registerBackgroundJobs(server);
    console.info(formatServerStartupBanner(startupInfo));
    await server.listen({ port, host });
    console.info("Serveur démarré avec succès.");
    await pingDatabase();
    return server;
  } catch (error) {
    await server.close().catch(() => {});
    throw error;
  }
}
