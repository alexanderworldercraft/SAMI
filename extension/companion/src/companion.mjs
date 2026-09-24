import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleMedia } from "./media.mjs";
import { uploadToSami } from "./upload.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "config.json");
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
const trace = (message) => process.stderr.write(`[${new Date().toISOString()}] ${message}\n`);
const send = (message) => {
  const payload = Buffer.from(JSON.stringify(message)); const header = Buffer.alloc(4); header.writeUInt32LE(payload.length, 0);
  process.stdout.write(Buffer.concat([header, payload]));
  trace(`Réponse envoyée (${payload.length} octets).`);
};
let buffer = Buffer.alloc(0);
async function handle(message) {
  if (message.action === "ping") return send({ ok: true, version: "0.1.0" });
  if (message.action === "download") {
    const outputPath = await assembleMedia(message.candidate, { config, title: message.title });
    return send({ ok: true, outputPath });
  }
  if (message.action === "import") {
    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "sami-companion-"));
    try {
      const filePath = await assembleMedia(message.candidate, { config, outputDirectory: tempDirectory, title: message.metadata?.titre });
      const result = await uploadToSami({ apiBaseUrl: message.apiBaseUrl, accessToken: message.accessToken, filePath, metadata: message.metadata || {}, allowUnauthorizedTls: config.allowUnauthorizedTls === true });
      return send({ ok: true, result });
    } finally { fs.rmSync(tempDirectory, { recursive: true, force: true }); }
  }
  throw new Error("Action inconnue.");
}
process.stdin.on("data", (chunk) => {
  trace(`Données reçues (${chunk.length} octets).`);
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= 4) {
    const length = buffer.readUInt32LE(0); if (buffer.length < length + 4) break;
    const payload = buffer.subarray(4, length + 4); buffer = buffer.subarray(length + 4);
    let message; try { message = JSON.parse(payload.toString("utf8")); } catch { send({ ok: false, error: "Message JSON invalide." }); continue; }
    handle(message).catch((error) => send({ ok: false, error: error.message }));
  }
});
process.stdin.on("end", () => trace("Entrée standard fermée."));
process.on("uncaughtException", (error) => { trace(`Erreur non interceptée : ${error.stack || error.message}`); process.exit(1); });
process.on("unhandledRejection", (error) => { trace(`Promesse rejetée : ${error?.stack || error}`); process.exit(1); });
trace(`Compagnon démarré avec Node ${process.version}.`);
