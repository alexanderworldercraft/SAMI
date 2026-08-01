import { startServer } from "./startServer.js";

export async function runServerProcess(options, {
  start = startServer,
  processRef = process,
  logger = console,
} = {}) {
  let server = null;
  let startupPromise = null;
  let shutdownPromise = null;
  let shutdownRequested = false;

  const removeSignalListeners = () => {
    processRef.removeListener("SIGINT", onSigint);
    processRef.removeListener("SIGTERM", onSigterm);
  };

  const shutdown = (signal) => {
    shutdownRequested = true;
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      logger.info(`Signal ${signal} reçu, arrêt propre de SAMI...`);
      const startedServer = server || await startupPromise;
      await startedServer?.close();
      processRef.exitCode = 0;
    })().catch((error) => {
      logger.error("Erreur pendant l'arrêt du serveur :", error);
      processRef.exitCode = 1;
    }).finally(removeSignalListeners);
    return shutdownPromise;
  };
  const onSigint = () => void shutdown("SIGINT");
  const onSigterm = () => void shutdown("SIGTERM");
  processRef.once("SIGINT", onSigint);
  processRef.once("SIGTERM", onSigterm);

  try {
    startupPromise = start(options);
    server = await startupPromise;
    server.server?.once?.("close", removeSignalListeners);
    if (shutdownRequested) {
      await shutdownPromise;
    }
    return server;
  } catch (error) {
    removeSignalListeners();
    throw error;
  }
}
