import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleMedia } from "./media.mjs";
import { checkRuntime } from "./runtime.mjs";
import { sanitizeError } from "./network.mjs";
import { uploadToSami } from "./upload.mjs";
import { NativeDecoder, encodeMessage } from "./nativeProtocol.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const controller = new AbortController();
let active = false; let closed = false;
const send = (message) => { if (!closed) process.stdout.write(encodeMessage(message)); };
const config = () => {
  if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Node.js 22 ou plus récent est nécessaire. Relancez l’installateur avec cette version.");
  const file = path.join(root, "config.json");
  try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {}; }
  catch { throw new Error("companion/config.json n’est pas un JSON valide."); }
};
async function handle(message) {
  if (message.action === "cancel") { controller.abort(); return; }
  if (active) throw new Error("Une opération est déjà en cours sur cette connexion.");
  active = true;
  try {
    const settings = config();
    if (message.action === "ping") return send({ ok: true, version: "0.1.4", node: process.version, ...checkRuntime(settings) });
    if (!["download", "import"].includes(message.action)) throw new Error("Action inconnue.");
    const startedAt = Date.now(); let lastProgressAt = 0;
    const progress = ({ stage = "assembly", time } = {}) => {
      if (Date.now() - lastProgressAt < 1000) return;
      lastProgressAt = Date.now();
      send({ type: "progress", stage, time, elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000) });
    };
    send({ type: "progress", stage: "starting", elapsedSeconds: 0 });
    if (message.action === "download") {
      const outputPath = await assembleMedia(message.candidate, { config: settings, title: message.title, onProgress: progress, signal: controller.signal });
      return send({ ok: true, outputPath });
    }
    if (!message.apiBaseUrl || !message.accessToken || !message.metadata?.titre) throw new Error("Import incomplet : instance, authentification et titre sont nécessaires.");
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sami-companion-"));
    try {
      const filePath = await assembleMedia(message.candidate, { config: settings, outputDirectory: temporary,
        title: message.metadata.titre, onProgress: progress, signal: controller.signal });
      send({ type: "progress", stage: "uploading", elapsedSeconds: Math.floor((Date.now() - startedAt) / 1000) });
      const result = await uploadToSami({ apiBaseUrl: message.apiBaseUrl, accessToken: message.accessToken, filePath,
        metadata: message.metadata, allowUnauthorizedTls: settings.allowUnauthorizedTls === true, signal: controller.signal });
      send({ ok: true, result });
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  } finally { active = false; }
}
const decoder = new NativeDecoder((message) => {
  handle(message).catch((error) => send({ ok: false, error: controller.signal.aborted ? "Opération annulée. Si l’envoi avait commencé, vérifiez SAMI avant de relancer." : sanitizeError(error.message) }));
});
process.stdin.on("data", (chunk) => {
  try { decoder.push(chunk); }
  catch (error) { send({ ok: false, error: error.message }); controller.abort(); process.stdin.destroy(); }
});
process.stdin.on("end", () => { closed = true; controller.abort(); });
process.stdout.on("error", () => { closed = true; controller.abort(); });
process.on("SIGTERM", () => { closed = true; controller.abort(); });
