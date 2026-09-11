import crypto from "crypto";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";

import { stableStringify } from "../videoTransferSecurity.js";
import { assertAiDubbingConfig } from "./config.js";
import { sha256File } from "./sourceService.js";

const FILE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,119}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ALLOWED_KINDS = new Set([
  "audio",
  "profile-manifest",
  "profile-reference",
  "voice-sample",
]);
const MAX_FILES = 100;
const MAX_ARTIFACT_SIZE = 8 * 1024 * 1024 * 1024;

const requireSafeFile = (entry) => {
  const id = String(entry?.id || "");
  const kind = String(entry?.kind || "");
  const size = Number(entry?.size);
  const sha256 = String(entry?.sha256 || "").toLowerCase();
  if (!FILE_ID_PATTERN.test(id) || !ALLOWED_KINDS.has(kind)) {
    throw new TypeError("Le manifeste de sortie contient un fichier non autorisé.");
  }
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_ARTIFACT_SIZE) {
    throw new TypeError("La taille d'un artefact de doublage est invalide.");
  }
  if (!SHA256_PATTERN.test(sha256)) {
    throw new TypeError("L'empreinte d'un artefact de doublage est invalide.");
  }
  const speaker = entry?.speaker == null ? null : String(entry.speaker).slice(0, 120);
  return { id, kind, size, sha256, ...(speaker ? { speaker } : {}) };
};

export function validateAiDubbingArtifactManifest(manifest, expectedPhase) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.files)) {
    throw new TypeError("Le manifeste de sortie de doublage est invalide.");
  }
  const phase = String(manifest.phase || "");
  if (!new Set(["preview", "full"]).has(phase) || phase !== expectedPhase) {
    throw new TypeError("La phase du manifeste de sortie ne correspond pas au job.");
  }
  if (manifest.files.length < 1 || manifest.files.length > MAX_FILES) {
    throw new TypeError("Le nombre d'artefacts de doublage est invalide.");
  }
  const files = manifest.files.map(requireSafeFile);
  if (new Set(files.map((entry) => entry.id)).size !== files.length) {
    throw new TypeError("Le manifeste de doublage contient des identifiants dupliqués.");
  }
  if (files.filter((entry) => entry.kind === "audio").length !== 1) {
    throw new TypeError("Le manifeste de doublage doit contenir exactement une piste audio.");
  }
  if (phase === "preview") {
    if (files.filter((entry) => entry.kind === "profile-manifest").length !== 1) {
      throw new TypeError("L'aperçu doit contenir exactement un manifeste vocal.");
    }
    const references = files.filter((entry) => entry.kind === "profile-reference");
    const samples = files.filter((entry) => entry.kind === "voice-sample");
    if (!references.length || references.length !== samples.length) {
      throw new TypeError("L'aperçu doit fournir une référence et un échantillon par voix.");
    }
  } else if (files.some((entry) => entry.kind !== "audio")) {
    throw new TypeError("La sortie complète ne doit renvoyer que la piste audio.");
  }
  const normalized = { schemaVersion: 1, phase, files };
  return {
    manifest: normalized,
    hash: crypto.createHash("sha256").update(stableStringify(normalized)).digest("hex"),
  };
}

const incomingRoot = (job, config = assertAiDubbingConfig()) => {
  const root = path.resolve(
    config.incomingRoot,
    String(job.AiDubbingJobID),
    String(job.LeaseGeneration)
  );
  const prefix = `${path.resolve(config.incomingRoot)}${path.sep}`;
  if (!root.startsWith(prefix)) throw new TypeError("Espace entrant de doublage invalide.");
  return root;
};

const artifactEntry = (job, fileId) => {
  const id = String(fileId || "");
  if (!FILE_ID_PATTERN.test(id)) throw new TypeError("Identifiant d'artefact invalide.");
  const entry = Array.isArray(job.ArtifactManifest?.files)
    ? job.ArtifactManifest.files.find((item) => item?.id === id)
    : null;
  if (!entry) {
    const error = new Error("Cet artefact n'est pas déclaré dans le manifeste actif.");
    error.statusCode = 404;
    throw error;
  }
  return entry;
};

export async function receiveAiDubbingArtifact({
  job,
  fileId,
  stream,
  declaredBodySha256,
  declaredContentLength,
  config,
} = {}) {
  const entry = artifactEntry(job, fileId);
  if (
    Number(declaredContentLength) !== Number(entry.size)
    || String(declaredBodySha256 || "").toLowerCase() !== String(entry.sha256)
  ) {
    const error = new Error("Les métadonnées signées de l'artefact ne correspondent pas au manifeste.");
    error.statusCode = 409;
    throw error;
  }
  const root = incomingRoot(job, config);
  await fs.promises.mkdir(root, { recursive: true, mode: 0o700 });
  const destination = path.join(root, entry.id);
  const partial = `${destination}.partial`;
  await fs.promises.rm(partial, { force: true });
  try {
    await pipeline(stream, fs.createWriteStream(partial, { mode: 0o600 }));
    const stats = await fs.promises.stat(partial);
    if (stats.size !== Number(entry.size) || await sha256File(partial) !== entry.sha256) {
      const error = new Error("L'artefact reçu ne correspond pas à son empreinte.");
      error.statusCode = 409;
      throw error;
    }
    await fs.promises.rename(partial, destination);
    return { id: entry.id, size: stats.size, sha256: entry.sha256 };
  } catch (error) {
    await fs.promises.rm(partial, { force: true }).catch(() => {});
    throw error;
  }
}

export async function resolveUploadedAiDubbingArtifacts(job, config) {
  const root = incomingRoot(job, config);
  const files = {};
  for (const entry of job.ArtifactManifest?.files || []) {
    const absolutePath = path.join(root, entry.id);
    if (!fs.existsSync(absolutePath)) throw new Error(`L'artefact ${entry.id} n'a pas été envoyé.`);
    const stats = await fs.promises.stat(absolutePath);
    if (stats.size !== Number(entry.size) || await sha256File(absolutePath) !== entry.sha256) {
      throw new Error(`L'artefact ${entry.id} a changé après son transfert.`);
    }
    files[entry.id] = { ...entry, absolutePath };
  }
  return files;
}

export const cleanupAiDubbingArtifacts = async (job, config) => {
  await fs.promises.rm(incomingRoot(job, config), { recursive: true, force: true });
};
