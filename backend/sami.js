import { runServerProcess } from "./server/runServerProcess.js";

runServerProcess({ host: "0.0.0.0", tls: true }).catch((error) => {
  console.error("Impossible de démarrer le serveur SAMI avec TLS :", error);
  process.exitCode = 1;
});
