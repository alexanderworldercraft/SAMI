import { startServer } from "./server/startServer.js";

startServer({ host: "127.0.0.1", trustProxy: true }).catch((error) => {
  console.error("Impossible de démarrer le serveur SAMI derrière le reverse proxy :", error);
  process.exitCode = 1;
});
