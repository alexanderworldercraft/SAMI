import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";

import { sha256File } from "../videoTransferSecurity.js";
import { getDistributedEncodingConfig } from "./config.js";
import { distributedEncodingError } from "./error.js";
import { openRemoteEncodingSource } from "./workerClient.js";

const DEFAULT_CACHE_MAX_BYTES = 50 * 1024 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;
const pinnedEntries = new Map();

const normalizeSha = (value) => {
  const normalized = String(value || "").toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) {
    throw distributedEncodingError(
      "Le hash de la source à mettre en cache est invalide.",
      "INVALID_DISTRIBUTED_SOURCE_HASH",
      500
    );
  }
  return normalized;
};

const safeExtension = (originalName) => {
  const extension = path.extname(String(originalName || "")).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ".bin";
};

const getCacheLimit = (config) => {
  const configured = Number(config.cacheMaxBytes);
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_CACHE_MAX_BYTES;
};

const cacheEntryPaths = ({ sha256, originalName }) => {
  const config = getDistributedEncodingConfig();
  const digest = normalizeSha(sha256);
  const root = path.join(config.cacheRoot, digest);
  return {
    digest,
    root,
    sourcePath: path.join(root, `source${safeExtension(originalName)}`),
    partialPath: path.join(root, "source.part"),
  };
};

const directorySize = async (root) => {
  let total = 0;
  const entries = await fs.promises.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) total += await directorySize(target);
    else if (entry.isFile()) total += (await fs.promises.stat(target)).size;
  }
  return total;
};

const listCacheEntries = async () => {
  const config = getDistributedEncodingConfig();
  await fs.promises.mkdir(config.cacheRoot, { recursive: true });
  const entries = await fs.promises.readdir(config.cacheRoot, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !SHA256_PATTERN.test(entry.name)) continue;
    const root = path.join(config.cacheRoot, entry.name);
    const stats = await fs.promises.stat(root);
    result.push({
      sha256: entry.name.toLowerCase(),
      root,
      size: await directorySize(root),
      touchedAt: stats.mtimeMs,
      pinned: (pinnedEntries.get(entry.name.toLowerCase()) || 0) > 0,
    });
  }
  return result;
};

export async function enforceDistributedCacheLimit({ requiredBytes = 0 } = {}) {
  const config = getDistributedEncodingConfig();
  const maxBytes = getCacheLimit(config);
  const entries = await listCacheEntries();
  let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  const candidates = entries
    .filter((entry) => !entry.pinned)
    .sort((left, right) => left.touchedAt - right.touchedAt);

  for (const candidate of candidates) {
    if (totalBytes + requiredBytes <= maxBytes) break;
    await fs.promises.rm(candidate.root, { recursive: true, force: true });
    totalBytes -= candidate.size;
  }

  if (totalBytes + requiredBytes > maxBytes) {
    throw distributedEncodingError(
      "Le cache vidéo de 50 Go ne dispose pas d'assez d'espace libre.",
      "DISTRIBUTED_ENCODING_CACHE_FULL",
      507,
      { retryable: true }
    );
  }
  return { totalBytes, maxBytes };
}

export async function ensureDistributedSourceCached({
  jobId,
  sha256,
  size,
  originalName,
  taskId,
  leaseToken,
  leaseGeneration,
  signal,
}) {
  const expectedSize = Number(size);
  if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) {
    throw distributedEncodingError(
      "La taille de la source est invalide.",
      "INVALID_DISTRIBUTED_SOURCE_SIZE",
      500
    );
  }
  const paths = cacheEntryPaths({ sha256, originalName });
  await fs.promises.mkdir(paths.root, { recursive: true });

  const existing = await fs.promises.stat(paths.sourcePath).catch(() => null);
  if (existing?.isFile() && existing.size === expectedSize) {
    const digest = await sha256File(paths.sourcePath);
    if (digest === paths.digest) {
      const now = new Date();
      await fs.promises.utimes(paths.root, now, now).catch(() => {});
      return { sourcePath: paths.sourcePath, cacheHit: true };
    }
    await fs.promises.rm(paths.sourcePath, { force: true });
  }

  let offset = (await fs.promises.stat(paths.partialPath).catch(() => null))?.size || 0;
  if (offset > expectedSize) {
    await fs.promises.rm(paths.partialPath, { force: true });
    offset = 0;
  }
  await enforceDistributedCacheLimit({ requiredBytes: expectedSize - offset });

  if (offset < expectedSize) {
    const remote = await openRemoteEncodingSource({
      jobId,
      taskId,
      leaseToken,
      leaseGeneration,
      offset,
      signal,
    });
    if (remote.etag !== paths.digest || remote.totalSize !== expectedSize) {
      remote.stream.destroy();
      throw distributedEncodingError(
        "La source distante ne correspond pas à la tâche attribuée.",
        "DISTRIBUTED_SOURCE_IDENTITY_MISMATCH",
        409
      );
    }
    await pipeline(
      remote.stream,
      fs.createWriteStream(paths.partialPath, { flags: offset > 0 ? "a" : "w" }),
      { signal }
    );
  }
  const downloaded = await fs.promises.stat(paths.partialPath);
  if (downloaded.size !== expectedSize) {
    throw distributedEncodingError(
      "Le téléchargement de la source est incomplet.",
      "DISTRIBUTED_SOURCE_DOWNLOAD_INCOMPLETE",
      502,
      { retryable: true }
    );
  }
  const digest = await sha256File(paths.partialPath);
  if (digest !== paths.digest) {
    await fs.promises.rm(paths.partialPath, { force: true });
    throw distributedEncodingError(
      "L'empreinte de la source téléchargée est invalide.",
      "DISTRIBUTED_SOURCE_DIGEST_MISMATCH",
      502,
      { retryable: true }
    );
  }
  await fs.promises.rename(paths.partialPath, paths.sourcePath);
  await enforceDistributedCacheLimit();
  return { sourcePath: paths.sourcePath, cacheHit: false };
}

export const pinDistributedSource = (sha256) => {
  const digest = normalizeSha(sha256);
  pinnedEntries.set(digest, (pinnedEntries.get(digest) || 0) + 1);
};

export const unpinDistributedSource = (sha256) => {
  const digest = normalizeSha(sha256);
  const next = Math.max(0, (pinnedEntries.get(digest) || 0) - 1);
  if (next === 0) pinnedEntries.delete(digest);
  else pinnedEntries.set(digest, next);
};

export async function purgeDistributedSourceCache(sha256) {
  const digest = normalizeSha(sha256);
  if ((pinnedEntries.get(digest) || 0) > 0) return false;
  const config = getDistributedEncodingConfig();
  await fs.promises.rm(path.join(config.cacheRoot, digest), {
    recursive: true,
    force: true,
  });
  return true;
}
