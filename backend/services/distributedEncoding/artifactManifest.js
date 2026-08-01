import fs from "fs";
import path from "path";

import {
  normalizeVideoTransferRelativePath,
  sha256File,
  sha256String,
  stableStringify,
} from "../videoTransferSecurity.js";
import { distributedEncodingError } from "./error.js";

export const DISTRIBUTED_ARTIFACT_MANIFEST_VERSION = 1;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const SAFE_TASK_KEY_PATTERN = /^(?:video-[A-Za-z0-9_-]+|audio-[0-9]+)$/;
const ALLOWED_EXTENSIONS = new Set([
  ".m3u8",
  ".ts",
  ".m4s",
  ".mp4",
  ".aac",
]);
const MAX_TASK_FILES = 50_000;
const MAX_TASK_BYTES = 100 * 1024 * 1024 * 1024;

const requireUuid = (value, field) => {
  const normalized = String(value || "").toLowerCase();
  if (!UUID_PATTERN.test(normalized)) {
    throw distributedEncodingError(
      `${field} est invalide.`,
      "INVALID_DISTRIBUTED_ARTIFACT_MANIFEST"
    );
  }
  return normalized;
};

const requireHash = (value, field) => {
  const normalized = String(value || "").toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw distributedEncodingError(
      `${field} doit être une empreinte SHA-256.`,
      "INVALID_DISTRIBUTED_ARTIFACT_MANIFEST"
    );
  }
  return normalized;
};

const normalizeSize = (value, field) => {
  const normalized = String(value ?? "");
  if (!/^(?:0|[1-9][0-9]*)$/.test(normalized)) {
    throw distributedEncodingError(
      `${field} doit être une taille positive ou nulle.`,
      "INVALID_DISTRIBUTED_ARTIFACT_MANIFEST"
    );
  }
  const numeric = Number(normalized);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw distributedEncodingError(
      `${field} dépasse la taille sûre autorisée.`,
      "INVALID_DISTRIBUTED_ARTIFACT_MANIFEST"
    );
  }
  return { value: normalized, numeric };
};

export const taskOutputPrefix = (taskKey) => {
  const normalized = String(taskKey || "");
  if (!SAFE_TASK_KEY_PATTERN.test(normalized)) {
    throw distributedEncodingError(
      "La clé de tâche est invalide.",
      "INVALID_DISTRIBUTED_TASK_KEY"
    );
  }
  if (normalized.startsWith("video-")) {
    return `hls/${normalized.slice("video-".length)}/`;
  }
  return `hls/audio/${normalized.slice("audio-".length)}/`;
};

export function validateDistributedArtifactManifest(manifest, {
  expectedJobId,
  expectedTaskId,
  expectedAttemptId,
  expectedTaskKey,
  expectedLeaseGeneration,
  expectedSourceSha256,
  expectedPlanHash,
} = {}) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw distributedEncodingError(
      "Le manifeste d'artefacts doit être un objet.",
      "INVALID_DISTRIBUTED_ARTIFACT_MANIFEST"
    );
  }
  if (Number(manifest.version) !== DISTRIBUTED_ARTIFACT_MANIFEST_VERSION) {
    throw distributedEncodingError(
      "La version du manifeste d'artefacts n'est pas supportée.",
      "UNSUPPORTED_DISTRIBUTED_ARTIFACT_MANIFEST"
    );
  }

  const jobId = requireUuid(manifest.jobId, "jobId");
  const taskId = requireUuid(manifest.taskId, "taskId");
  const attemptId = requireUuid(manifest.attemptId, "attemptId");
  const taskKey = String(manifest.taskKey || "");
  const prefix = taskOutputPrefix(taskKey);
  const leaseGeneration = Number(manifest.leaseGeneration);
  if (!Number.isSafeInteger(leaseGeneration) || leaseGeneration <= 0) {
    throw distributedEncodingError(
      "leaseGeneration est invalide.",
      "INVALID_DISTRIBUTED_ARTIFACT_MANIFEST"
    );
  }
  const sourceSha256 = requireHash(manifest.sourceSha256, "sourceSha256");
  const planHash = requireHash(manifest.planHash, "planHash");

  const exactExpectations = [
    [expectedJobId, jobId, "jobId"],
    [expectedTaskId, taskId, "taskId"],
    [expectedAttemptId, attemptId, "attemptId"],
    [expectedTaskKey, taskKey, "taskKey"],
    [expectedLeaseGeneration, leaseGeneration, "leaseGeneration"],
    [expectedSourceSha256, sourceSha256, "sourceSha256"],
    [expectedPlanHash, planHash, "planHash"],
  ];
  for (const [expected, actual, field] of exactExpectations) {
    if (expected !== undefined && String(expected).toLowerCase() !== String(actual).toLowerCase()) {
      throw distributedEncodingError(
        `Le champ ${field} ne correspond pas à la tâche attribuée.`,
        "DISTRIBUTED_ARTIFACT_SCOPE_MISMATCH",
        409
      );
    }
  }

  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw distributedEncodingError(
      "Le manifeste d'artefacts doit contenir des fichiers.",
      "INVALID_DISTRIBUTED_ARTIFACT_MANIFEST"
    );
  }
  if (manifest.files.length > MAX_TASK_FILES) {
    throw distributedEncodingError(
      "Le manifeste contient trop de fichiers.",
      "DISTRIBUTED_ARTIFACT_FILE_LIMIT"
    );
  }

  const seenPaths = new Set();
  let totalBytes = 0;
  const files = manifest.files.map((file, index) => {
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      throw distributedEncodingError(
        `files[${index}] est invalide.`,
        "INVALID_DISTRIBUTED_ARTIFACT_MANIFEST"
      );
    }
    const relativePath = normalizeVideoTransferRelativePath(file.relativePath);
    if (!relativePath.startsWith(prefix)) {
      throw distributedEncodingError(
        `Le fichier ${relativePath} sort du périmètre ${prefix}.`,
        "DISTRIBUTED_ARTIFACT_SCOPE_MISMATCH"
      );
    }
    const extension = path.posix.extname(relativePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw distributedEncodingError(
        `L'extension de ${relativePath} n'est pas autorisée.`,
        "INVALID_DISTRIBUTED_ARTIFACT_EXTENSION"
      );
    }
    const collisionKey = relativePath.toLocaleLowerCase("en-US");
    if (seenPaths.has(collisionKey)) {
      throw distributedEncodingError(
        `Le chemin ${relativePath} est dupliqué.`,
        "DUPLICATE_DISTRIBUTED_ARTIFACT_PATH"
      );
    }
    seenPaths.add(collisionKey);
    const size = normalizeSize(file.size, `files[${index}].size`);
    totalBytes += size.numeric;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_TASK_BYTES) {
      throw distributedEncodingError(
        "La taille totale des artefacts dépasse la limite.",
        "DISTRIBUTED_ARTIFACT_SIZE_LIMIT"
      );
    }
    return {
      relativePath,
      size: size.value,
      sha256: requireHash(file.sha256, `files[${index}].sha256`),
    };
  });

  const requiredPlaylist = `${prefix}playlist.m3u8`;
  if (!seenPaths.has(requiredPlaylist.toLocaleLowerCase("en-US"))) {
    throw distributedEncodingError(
      `La playlist ${requiredPlaylist} est absente.`,
      "DISTRIBUTED_ARTIFACT_PLAYLIST_MISSING"
    );
  }

  return {
    version: DISTRIBUTED_ARTIFACT_MANIFEST_VERSION,
    jobId,
    taskId,
    attemptId,
    taskKey,
    leaseGeneration,
    sourceSha256,
    planHash,
    files,
    totalBytes: String(totalBytes),
  };
}

const walkFiles = async (root, current = root) => {
  const entries = await fs.promises.readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      throw distributedEncodingError(
        "Un lien symbolique a été détecté dans les artefacts.",
        "DISTRIBUTED_ARTIFACT_SYMLINK"
      );
    }
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(root, absolutePath)));
      continue;
    }
    if (!entry.isFile()) {
      throw distributedEncodingError(
        "Un type de fichier non supporté a été détecté.",
        "DISTRIBUTED_ARTIFACT_FILE_TYPE"
      );
    }
    files.push(absolutePath);
  }
  return files;
};

export async function buildDistributedArtifactManifest({
  root,
  jobId,
  taskId,
  attemptId,
  taskKey,
  leaseGeneration,
  sourceSha256,
  planHash,
}) {
  const absoluteFiles = await walkFiles(root);
  const files = await Promise.all(
    absoluteFiles.map(async (absolutePath) => {
      const stats = await fs.promises.stat(absolutePath);
      return {
        relativePath: path.relative(root, absolutePath).split(path.sep).join("/"),
        size: String(stats.size),
        sha256: await sha256File(absolutePath),
      };
    })
  );
  files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const manifest = validateDistributedArtifactManifest({
    version: DISTRIBUTED_ARTIFACT_MANIFEST_VERSION,
    jobId,
    taskId,
    attemptId,
    taskKey,
    leaseGeneration,
    sourceSha256,
    planHash,
    files,
  });

  return {
    manifest,
    manifestHash: sha256String(stableStringify(manifest)),
  };
}
