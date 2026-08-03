import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";

import { prisma } from "../services/db.js";
import { deactivateExpiredAdminMessages } from "../services/adminMessageService.js";
import { createDatabaseBackup } from "../services/databaseBackupService.js";
import { rotateGenreFeaturedContent } from "../services/genreFeaturedContentService.js";
import { recoverInterruptedExportJobs } from "../services/videoExportJobService.js";
import {
  cleanupExpiredVideoTransferStaging,
  recoverInterruptedImports,
  restoreVideoTransferBlockReservations,
} from "../services/videoImportTransferService.js";
import { getInstanceRole } from "../services/videoTransferConfig.js";
import { reconcileVideoTransferLogs } from "../services/videoTransferLogReconciliation.js";
import {
  isDistributedEncodingEnvironmentEnabled,
} from "../services/distributedEncoding/config.js";
import { runDistributedEncodingMaintenance } from "../services/distributedEncoding/maintenanceService.js";
import { reconcileDistributedEncodingLogs } from "../services/distributedEncoding/logReconciliation.js";
import { startPrimaryDistributedEncodingRuntime } from "../services/distributedEncoding/primaryRuntime.js";
import { startDistributedEncodingWorkerRuntime } from "../services/distributedEncoding/workerRuntime.js";
import { createServer } from "./createServer.js";
import {
  buildBackupCronExpression,
  formatServerStartupBanner,
  getServerStartupInfo,
  parseServerPort,
} from "./serverConfig.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_KEEP_ALIVE_MS = 7 * 60 * 60 * 1000;
const DISTRIBUTED_ENCODING_MAINTENANCE_MS = 15 * 1000;
let videoTransferMaintenancePromise = null;
let distributedEncodingMaintenancePromise = null;

async function runVideoTransferMaintenance({ startup = false } = {}) {
  const role = getInstanceRole();
  if (!["clone", "primary"].includes(role)) return null;

  try {
    if (role === "clone") {
      const recovered = await recoverInterruptedExportJobs();
      const logs = await reconcileVideoTransferLogs();
      if (recovered > 0) {
        console.info(
          `${recovered} export(s) vidéo interrompu(s) replacé(s) dans la file.`
        );
      }
      if (logs.created > 0 || logs.failed > 0) {
        console.info("Réconciliation des Actions de transfert terminée.", logs);
      }
      return { role, recovered, logs };
    }

    const reservations = startup
      ? await restoreVideoTransferBlockReservations()
      : { restored: 0, removed: 0 };
    const recovery = startup
      ? await recoverInterruptedImports()
      : { recovered: 0, failed: 0 };
    const cleanup = await cleanupExpiredVideoTransferStaging();
    const logs = await reconcileVideoTransferLogs();
    if (
      reservations.restored > 0
      || reservations.removed > 0
      || recovery.recovered > 0
      || recovery.failed > 0
      || cleanup.cancelled > 0
      || cleanup.stagingRemoved > 0
      || logs.created > 0
      || logs.failed > 0
    ) {
      console.info("Maintenance des transferts vidéo terminée.", {
        recovery,
        reservations,
        cleanup,
        logs,
      });
    }
    return { role, reservations, recovery, cleanup, logs };
  } catch (error) {
    console.error(
      `[video-transfer-maintenance:${role}]`,
      error?.message || error
    );
    if (startup && role === "primary") throw error;
    return { role, error };
  }
}

async function maintainVideoTransfers(options = {}) {
  if (videoTransferMaintenancePromise) {
    return videoTransferMaintenancePromise;
  }

  const maintenance = runVideoTransferMaintenance(options);
  videoTransferMaintenancePromise = maintenance;
  try {
    return await maintenance;
  } finally {
    if (videoTransferMaintenancePromise === maintenance) {
      videoTransferMaintenancePromise = null;
    }
  }
}

async function maintainDistributedEncoding(options = {}) {
  if (
    !isDistributedEncodingEnvironmentEnabled()
    || getInstanceRole() !== "primary"
  ) {
    return null;
  }
  if (distributedEncodingMaintenancePromise) {
    return distributedEncodingMaintenancePromise;
  }

  const maintenance = (async () => {
    const result = await runDistributedEncodingMaintenance(options);
    if (!options.cleanup) return result;
    if (
      result.retention?.artifactsDeleted > 0
      || result.retention?.jobsDeleted > 0
    ) {
      console.info(
        "Rétention de l'encodage distribué appliquée.",
        result.retention
      );
    }
    const logs = await reconcileDistributedEncodingLogs();
    if (logs.created > 0 || logs.failed > 0) {
      console.info("Réconciliation des Actions d'encodage distribué terminée.", logs);
    }
    return { ...result, logs };
  })();
  distributedEncodingMaintenancePromise = maintenance;
  try {
    return await maintenance;
  } finally {
    if (distributedEncodingMaintenancePromise === maintenance) {
      distributedEncodingMaintenancePromise = null;
    }
  }
}

function registerDistributedEncodingRuntime(server) {
  let runtime = null;

  server.addHook("onClose", async () => {
    await runtime?.stop?.();
    runtime = null;
  });

  return async function startDistributedEncoding() {
    if (!isDistributedEncodingEnvironmentEnabled()) return null;

    const role = getInstanceRole();
    if (role === "primary") {
      await maintainDistributedEncoding({ cleanup: true });
      runtime = await startPrimaryDistributedEncodingRuntime();
    } else if (role === "clone") {
      runtime = startDistributedEncodingWorkerRuntime();
      await runtime.ready;
    } else {
      throw new Error(
        "SAMI_INSTANCE_ROLE doit valoir primary ou clone pour l'encodage distribué."
      );
    }

    console.info(
      `Runtime d'encodage distribué démarré pour ${role}.`
    );
    return runtime;
  };
}

export function loadTlsCredentials() {
  console.info("Lecture des certificats SSL...");
  const credentials = {
    key: fs.readFileSync(path.join(backendRoot, "ssl/private.key")),
    cert: fs.readFileSync(path.join(backendRoot, "ssl/certificate.crt")),
  };
  console.info("Certificats SSL chargés.");

  return credentials;
}

async function pingDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.info("Ping base de données réussi.");
    return true;
  } catch (error) {
    console.error("Échec du ping base de données :", error.message);
    return false;
  }
}

function registerBackgroundJobs(server) {
  const backupCronExpression = buildBackupCronExpression(
    process.env.BACKUP_DAY_OF_WEEK || "0",
    process.env.BACKUP_TIME || "00:00"
  );

  const backupDatabase = async () => {
    try {
      const backup = await createDatabaseBackup({ kind: "auto" });
      console.info(`Sauvegarde créée avec succès : ${backup.filePath}`);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde :", error);
    }
  };

  let keepAliveTimer = null;
  let distributedEncodingTimer = null;
  let scheduledTasks = [];

  server.addHook("onClose", async () => {
    if (keepAliveTimer) clearInterval(keepAliveTimer);
    if (distributedEncodingTimer) clearInterval(distributedEncodingTimer);
    scheduledTasks.forEach((task) => task.stop());
    await Promise.allSettled(
      [videoTransferMaintenancePromise, distributedEncodingMaintenancePromise]
        .filter(Boolean)
    );
  });

  return function startBackgroundJobs() {
    if (keepAliveTimer) return;

    keepAliveTimer = setInterval(pingDatabase, DATABASE_KEEP_ALIVE_MS);
    keepAliveTimer.unref?.();
    scheduledTasks = [
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
    if (["clone", "primary"].includes(getInstanceRole())) {
      scheduledTasks.push(
        cron.schedule("17 * * * *", () => maintainVideoTransfers())
      );
    }
    if (
      isDistributedEncodingEnvironmentEnabled()
      && getInstanceRole() === "primary"
    ) {
      distributedEncodingTimer = setInterval(
        () => maintainDistributedEncoding().catch((error) => {
          console.error("[distributed-encoding:maintenance]", error);
        }),
        DISTRIBUTED_ENCODING_MAINTENANCE_MS
      );
      distributedEncodingTimer.unref?.();
      scheduledTasks.push(
        cron.schedule("11 * * * *", () =>
          maintainDistributedEncoding({ cleanup: true }).catch((error) => {
            console.error("[distributed-encoding:cleanup]", error);
          })
        )
      );
    }
  };
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
    const startBackgroundJobs = registerBackgroundJobs(server);
    const startDistributedEncoding = registerDistributedEncodingRuntime(server);
    console.info(formatServerStartupBanner(startupInfo));
    await pingDatabase();
    await maintainVideoTransfers({ startup: true });
    await server.listen({ port, host });
    await startDistributedEncoding();
    startBackgroundJobs();
    console.info("Serveur démarré avec succès.");
    return server;
  } catch (error) {
    await server.close().catch(() => {});
    throw error;
  }
}
