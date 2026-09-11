import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DIAGNOSTIC_AUDIO_NAMES, validateDiagnosticAudio } from "./diagnosticAudio.js";

export const DIAGNOSTIC_BODY_LIMIT = 16 * 1024 * 1024;
const MAX_BYTES = 8 * 1024 * 1024;
const FAILURE_NAME = /^failure-[a-f0-9-]{36}$/;
const ALLOWED = new Set(["error.json", "manifest.json", "input-profile.json", "previous-profile.json",
  "quality-failure.json", "generation-attempt.json", "diarization.json", "sortformer.json", ...DIAGNOSTIC_AUDIO_NAMES]);
const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const invalid = message => Object.assign(new Error(message), { statusCode: 400 });

function decodeFile(file) {
  if (DIAGNOSTIC_AUDIO_NAMES.includes(file.name)) {
    if (file.encoding !== "base64" || file.content.length > 965464) throw invalid("Encodage audio interdit.");
    const bytes = Buffer.from(file.content, "base64");
    if (bytes.toString("base64") !== file.content) throw invalid("Audio base64 invalide.");
    return validateDiagnosticAudio(bytes);
  }
  if (file.encoding != null) throw invalid("Encodage JSON interdit.");
  try { JSON.parse(file.content); } catch { throw invalid("Diagnostic JSON illisible."); }
  return Buffer.from(file.content, "utf8");
}

function validate(payload) {
  if (!payload || !FAILURE_NAME.test(payload.id) || !Array.isArray(payload.files)
      || payload.files.length < 1 || payload.files.length > ALLOWED.size) throw invalid("Diagnostic invalide.");
  const names = new Set();
  let bytes = 0;
  for (const file of payload.files) {
    if (!file || !ALLOWED.has(file.name) || names.has(file.name) || typeof file.content !== "string") {
      throw invalid("Fichier de diagnostic interdit ou dupliqué.");
    }
    names.add(file.name);
    const decoded = decodeFile(file);
    bytes += decoded.length;
    if (bytes > MAX_BYTES) throw invalid("Diagnostic supérieur à 8 Mio.");
    if (hash(decoded) !== file.sha256) throw invalid("Empreinte du diagnostic invalide.");
  }
  if (!names.has("error.json")) throw invalid("Rapport d'erreur absent.");
  return hash(JSON.stringify(payload.files.map(f => [f.name, f.sha256]).sort((a, b) => a[0].localeCompare(b[0]))));
}

// L'identité du clone provient uniquement de l'authentification signée.
// Aucun bail actif exigé : les rapports doivent survivre à un job expiré/supprimé.
export async function receiveAiDubbingDiagnostic({ config, workerId, payload }) {
  if (config.role !== "PRIMARY" || !workerId) throw Object.assign(new Error("Primary authentifié requis."), { statusCode: 403 });
  const digest = validate(payload);
  const root = path.join(config.root, "diagnostics", "clones", hash(String(workerId)));
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const destination = path.join(root, payload.id);
  const receiptPath = path.join(destination, "_receipt.json");
  const existing = await fs.readFile(receiptPath, "utf8").then(JSON.parse).catch(e => {
    if (e.code === "ENOENT") return null;
    throw e;
  });
  if (existing) {
    if (existing.sha256 !== digest) throw Object.assign(new Error("Diagnostic déjà reçu avec un contenu différent."), { statusCode: 409 });
    return { id: payload.id, received: true, sha256: digest };
  }
  const staging = await fs.mkdtemp(path.join(root, ".incoming-"));
  try {
    for (const file of payload.files) {
      await fs.writeFile(path.join(staging, file.name), decodeFile(file), { mode: 0o600, flag: "wx" });
    }
    await fs.writeFile(path.join(staging, "_receipt.json"), JSON.stringify({
      workerId, sha256: digest, receivedAt: new Date().toISOString(),
    }), { mode: 0o600, flag: "wx" });
    try { await fs.rename(staging, destination); }
    catch (error) {
      if (!["EEXIST", "ENOTEMPTY"].includes(error.code)) throw error;
      const concurrent = JSON.parse(await fs.readFile(receiptPath, "utf8"));
      if (concurrent.sha256 !== digest) throw Object.assign(new Error("Diagnostic concurrent différent."), { statusCode: 409 });
    }
  } finally { await fs.rm(staging, { recursive: true, force: true }); }
  const archives = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !FAILURE_NAME.test(entry.name)) continue;
    const absolute = path.join(root, entry.name);
    archives.push({ absolute, time: (await fs.stat(absolute)).mtimeMs });
  }
  archives.sort((a, b) => a.absolute === destination ? -1 : b.absolute === destination ? 1 : b.time - a.time);
  for (const archive of archives.slice(10)) await fs.rm(archive.absolute, { recursive: true, force: true });
  return { id: payload.id, received: true, sha256: digest };
}

// Scan des dix archives locales : aucune opération sur les jobs ou les générations.
export async function flushAiDubbingDiagnostics({ config, send, signal }) {
  const root = path.join(config.root, "diagnostics");
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(e => {
    if (e.code === "ENOENT") return [];
    throw e;
  });
  const errors = [];
  let attempts = 0;
  const ordered = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !FAILURE_NAME.test(entry.name)) continue;
    const lastAttempt = await fs.stat(path.join(root, entry.name, ".transfer-attempt.json")).catch(() => null);
    ordered.push({ entry, time: lastAttempt?.mtimeMs || 0 });
  }
  ordered.sort((a, b) => a.time - b.time);
  for (const { entry } of ordered) {
    if (!entry.isDirectory() || !FAILURE_NAME.test(entry.name) || signal?.aborted) continue;
    const directory = path.join(root, entry.name);
    const marker = path.join(directory, ".transferred.json");
    const primary = config.primaryBaseUrl?.origin || String(config.primaryBaseUrl || "");
    const previous = await fs.readFile(marker, "utf8").then(JSON.parse).catch(() => null);
    if (previous?.primary === primary) continue;
    if (attempts++ >= 2) break;
    try {
      await fs.writeFile(path.join(directory, ".transfer-attempt.json"), JSON.stringify({ attemptedAt: new Date().toISOString() }), { mode: 0o600 });
      const files = [];
      let bytes = 0;
      for (const name of ALLOWED) {
        const file = path.join(directory, name);
        const stat = await fs.lstat(file).catch(e => { if (e.code === "ENOENT") return null; throw e; });
        if (!stat) continue;
        if (!stat.isFile() || stat.isSymbolicLink()) throw invalid("Lien de diagnostic interdit.");
        bytes += stat.size;
        if (bytes > MAX_BYTES) throw invalid("Diagnostic supérieur à 8 Mio ; copie locale conservée.");
        const content = await fs.readFile(file);
        const audio = DIAGNOSTIC_AUDIO_NAMES.includes(name);
        files.push({ name, content: content.toString(audio ? "base64" : "utf8"),
          ...(audio ? { encoding: "base64" } : {}), sha256: hash(content) });
      }
      const payload = { id: entry.name, files };
      const digest = validate(payload);
      if (Buffer.byteLength(JSON.stringify(payload)) > DIAGNOSTIC_BODY_LIMIT) throw invalid("Enveloppe du diagnostic trop volumineuse.");
      const ack = await send(payload, { signal });
      if (ack?.received !== true || ack.id !== payload.id || ack.sha256 !== digest) throw new Error("Accusé de réception invalide.");
      await fs.writeFile(marker, JSON.stringify({ primary, transferredAt: new Date().toISOString(), sha256: digest }), { mode: 0o600 });
    } catch (error) { errors.push({ id: entry.name, message: String(error.message || error) }); }
  }
  return { attempts: Math.min(attempts, 2), errors };
}
