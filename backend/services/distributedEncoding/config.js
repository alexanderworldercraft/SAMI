import path from "path";
import { fileURLToPath } from "url";
import { validateVideoTransferConfig } from "../videoTransferSecurity.js";
import {
  DISTRIBUTED_ENCODING_ARTIFACT_RETENTION_DAYS,
  DISTRIBUTED_ENCODING_HEARTBEAT_INTERVAL_MS,
  DISTRIBUTED_ENCODING_CACHE_MAX_BYTES,
  DISTRIBUTED_ENCODING_FAILED_CACHE_TTL_MS,
  DISTRIBUTED_ENCODING_FAILURE_CACHE_TTL_MS,
  DISTRIBUTED_ENCODING_JOB_RETENTION_DAYS,
  DISTRIBUTED_ENCODING_LEASE_DURATION_MS,
  DISTRIBUTED_ENCODING_LEASE_RENEW_INTERVAL_MS,
  DISTRIBUTED_ENCODING_MAX_SLOTS,
  DISTRIBUTED_ENCODING_OFFLINE_AFTER_MS,
  DISTRIBUTED_ENCODING_PIPELINE_VERSION,
  DISTRIBUTED_ENCODING_PRIMARY_FALLBACK_AFTER_MS,
  DISTRIBUTED_ENCODING_PRIMARY_MAX_NOMINAL_HEIGHT,
  DISTRIBUTED_ENCODING_PROTOCOL_VERSION,
  DISTRIBUTED_ENCODING_RETRY_BACKOFF_MS,
  ENCODING_WORKER_ROLE,
} from "./constants.js";

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

export const DISTRIBUTED_ENCODING_SIGNATURE_DOMAIN =
  "SAMI-DISTRIBUTED-ENCODING-V1";

const MAX_RETENTION_DAYS = 3_650;
const parseRetentionDays = (value, fallback, variableName) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return fallback;

  const days = Number(normalized);
  if (!Number.isInteger(days) || days < 1 || days > MAX_RETENTION_DAYS) {
    throw new Error(
      `${variableName} doit être un entier compris entre 1 et ${MAX_RETENTION_DAYS}.`
    );
  }
  return days;
};

export const DISTRIBUTED_ENCODING_SOURCE_ROOT = path.join(
  backendRoot,
  "var",
  "video-encoding",
  "sources"
);
export const DISTRIBUTED_ENCODING_CACHE_ROOT = path.join(
  backendRoot,
  "var",
  "video-encoding-cache"
);
export const DISTRIBUTED_ENCODING_STAGING_ROOT = path.join(
  backendRoot,
  "uploads",
  "video",
  ".encoding"
);

// Exposés ici aussi pour que les consommateurs de configuration n'aient pas à
// dupliquer les valeurs du protocole.
export {
  DISTRIBUTED_ENCODING_CACHE_MAX_BYTES,
  DISTRIBUTED_ENCODING_FAILED_CACHE_TTL_MS,
  DISTRIBUTED_ENCODING_FAILURE_CACHE_TTL_MS,
  DISTRIBUTED_ENCODING_HEARTBEAT_INTERVAL_MS,
  DISTRIBUTED_ENCODING_LEASE_DURATION_MS,
  DISTRIBUTED_ENCODING_LEASE_RENEW_INTERVAL_MS,
  DISTRIBUTED_ENCODING_MAX_SLOTS,
  DISTRIBUTED_ENCODING_OFFLINE_AFTER_MS,
  DISTRIBUTED_ENCODING_PRIMARY_FALLBACK_AFTER_MS,
  DISTRIBUTED_ENCODING_PRIMARY_MAX_NOMINAL_HEIGHT,
  DISTRIBUTED_ENCODING_PROTOCOL_VERSION,
  DISTRIBUTED_ENCODING_RETRY_BACKOFF_MS,
  DISTRIBUTED_ENCODING_PIPELINE_VERSION,
};

const ENABLED_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);

export const isDistributedEncodingEnvironmentEnabled = (
  env = process.env
) => ENABLED_VALUES.has(
  String(env.SAMI_DISTRIBUTED_ENCODING_ENABLED || "").trim().toLowerCase()
);

const resolveConfiguredRoot = (value, fallback) => {
  const configured = String(value || "").trim();
  return configured ? path.resolve(configured) : fallback;
};

export function getDistributedEncodingConfig(env = process.env) {
  const transferConfig = validateVideoTransferConfig(env);
  const role = transferConfig.isPrimary
    ? ENCODING_WORKER_ROLE.PRIMARY
    : ENCODING_WORKER_ROLE.CLONE;

  return Object.freeze({
    enabled: isDistributedEncodingEnvironmentEnabled(env),
    role,
    instanceId: transferConfig.instanceId,
    sharedSecret: transferConfig.sharedSecret,
    primaryBaseUrl: transferConfig.primaryBaseUrl
      ? new URL(transferConfig.primaryBaseUrl)
      : null,
    protocolVersion: DISTRIBUTED_ENCODING_PROTOCOL_VERSION,
    pipelineVersion: String(
      env.SAMI_DISTRIBUTED_ENCODING_PIPELINE_VERSION
      || DISTRIBUTED_ENCODING_PIPELINE_VERSION
    ).trim(),
    sourceRoot: resolveConfiguredRoot(
      env.SAMI_DISTRIBUTED_ENCODING_SOURCE_ROOT,
      DISTRIBUTED_ENCODING_SOURCE_ROOT
    ),
    cacheRoot: resolveConfiguredRoot(
      env.SAMI_DISTRIBUTED_ENCODING_CACHE_ROOT,
      DISTRIBUTED_ENCODING_CACHE_ROOT
    ),
    stagingRoot: resolveConfiguredRoot(
      env.SAMI_DISTRIBUTED_ENCODING_STAGING_ROOT,
      DISTRIBUTED_ENCODING_STAGING_ROOT
    ),
    heartbeatIntervalMs: DISTRIBUTED_ENCODING_HEARTBEAT_INTERVAL_MS,
    offlineAfterMs: DISTRIBUTED_ENCODING_OFFLINE_AFTER_MS,
    leaseDurationMs: DISTRIBUTED_ENCODING_LEASE_DURATION_MS,
    leaseRenewIntervalMs: DISTRIBUTED_ENCODING_LEASE_RENEW_INTERVAL_MS,
    primaryFallbackAfterMs: DISTRIBUTED_ENCODING_PRIMARY_FALLBACK_AFTER_MS,
    primaryMaxNominalHeight:
      DISTRIBUTED_ENCODING_PRIMARY_MAX_NOMINAL_HEIGHT,
    maxSlots: DISTRIBUTED_ENCODING_MAX_SLOTS,
    cacheMaxBytes: DISTRIBUTED_ENCODING_CACHE_MAX_BYTES,
    artifactRetentionDays: parseRetentionDays(
      env.SAMI_DISTRIBUTED_ENCODING_ARTIFACT_RETENTION_DAYS,
      DISTRIBUTED_ENCODING_ARTIFACT_RETENTION_DAYS,
      "SAMI_DISTRIBUTED_ENCODING_ARTIFACT_RETENTION_DAYS"
    ),
    jobRetentionDays: parseRetentionDays(
      env.SAMI_DISTRIBUTED_ENCODING_JOB_RETENTION_DAYS,
      DISTRIBUTED_ENCODING_JOB_RETENTION_DAYS,
      "SAMI_DISTRIBUTED_ENCODING_JOB_RETENTION_DAYS"
    ),
    failedCacheTtlMs: DISTRIBUTED_ENCODING_FAILED_CACHE_TTL_MS,
    failureCacheTtlMs: DISTRIBUTED_ENCODING_FAILURE_CACHE_TTL_MS,
    retryBackoffMs: DISTRIBUTED_ENCODING_RETRY_BACKOFF_MS,
  });
}

const assertEnabled = (config) => {
  if (!config.enabled) {
    throw new Error(
      "L'encodage distribué expérimental est désactivé "
      + "(SAMI_DISTRIBUTED_ENCODING_ENABLED)."
    );
  }
  if (!config.pipelineVersion) {
    throw new Error("La version du pipeline d'encodage distribué est vide.");
  }
  return config;
};

export function assertDistributedPrimaryConfig(env = process.env) {
  const config = assertEnabled(getDistributedEncodingConfig(env));
  if (config.role !== ENCODING_WORKER_ROLE.PRIMARY) {
    throw new Error("Cette instance n'est pas configurée comme serveur principal.");
  }
  return config;
}

export function assertDistributedWorkerConfig(env = process.env) {
  const config = assertEnabled(getDistributedEncodingConfig(env));
  if (
    config.role === ENCODING_WORKER_ROLE.CLONE
    && !config.primaryBaseUrl
  ) {
    throw new Error("SAMI_PRIMARY_BASE_URL est requise sur un worker clone.");
  }
  return config;
}
