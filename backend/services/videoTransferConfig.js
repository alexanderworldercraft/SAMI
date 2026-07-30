import path from "path";
import { fileURLToPath } from "url";
import { validateVideoTransferConfig } from "./videoTransferSecurity.js";

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

export const VIDEO_TRANSFER_PROTOCOL_VERSION = 1;
export const VIDEO_TRANSFER_AUTH_TTL_SECONDS = 10 * 60;
export const VIDEO_TRANSFER_CLOCK_SKEW_MS = 5 * 60 * 1000;
export const VIDEO_TRANSFER_JSON_TIMEOUT_MS = 30 * 1000;
export const VIDEO_TRANSFER_UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;
export const VIDEO_TRANSFER_STAGING_ROOT = path.join(
  backendRoot,
  "uploads",
  "video",
  ".transfers"
);
export const VIDEO_TRANSFER_BLOCKED_ROOT = path.join(
  backendRoot,
  "uploads",
  "video",
  ".blocked"
);
export const VIDEO_TRANSFER_BLOCK_MARKER = ".sami-transfer-blocked";

const normalizeRole = (value) => String(value || "").trim().toLowerCase();

export const getInstanceRole = () => normalizeRole(process.env.SAMI_INSTANCE_ROLE);

export const getInstanceId = () => String(process.env.SAMI_INSTANCE_ID || "").trim();

export const getTransferSharedSecret = () =>
  String(process.env.SAMI_TRANSFER_SHARED_SECRET || "");

export const hasStrongTransferSharedSecret = () => {
  try {
    validateVideoTransferConfig(process.env);
    return true;
  } catch {
    return false;
  }
};

export function getPrimaryBaseUrl({ required = false } = {}) {
  try {
    const config = validateVideoTransferConfig(process.env);
    if (!config.primaryBaseUrl) {
      if (required) {
        throw new Error("SAMI_PRIMARY_BASE_URL n'est pas configurée.");
      }
      return null;
    }
    return new URL(config.primaryBaseUrl);
  } catch (error) {
    if (!required && !String(process.env.SAMI_PRIMARY_BASE_URL || "").trim()) {
      return null;
    }
    throw error;
  }
}

export function getVideoTransferPublicConfig() {
  const role = getInstanceRole();
  let primaryUrl = null;
  let configurationError = null;

  try {
    primaryUrl = getPrimaryBaseUrl();
  } catch (error) {
    configurationError = error.message;
  }

  let validatedConfig = null;
  try {
    validatedConfig = validateVideoTransferConfig(process.env);
  } catch (error) {
    configurationError ||= error.message;
  }
  const instanceId = validatedConfig?.instanceId || getInstanceId();
  const sharedSecretConfigured = Boolean(validatedConfig?.sharedSecret);
  const enabled = Boolean(
    validatedConfig?.isClone
    && primaryUrl
    && sharedSecretConfigured
    && !configurationError
  );

  return {
    enabled,
    instanceRole: role || null,
    instanceId: instanceId || null,
    primaryConfigured: Boolean(primaryUrl),
    primaryOrigin: primaryUrl?.origin || null,
    configurationError,
  };
}

export function assertCloneTransferConfiguration() {
  const config = validateVideoTransferConfig(process.env);
  if (!config.isClone) {
    throw new Error("Cette instance n'est pas configurée comme clone.");
  }

  return {
    ...config,
    primaryBaseUrl: new URL(config.primaryBaseUrl),
  };
}

export function assertPrimaryTransferConfiguration() {
  const config = validateVideoTransferConfig(process.env);
  if (!config.isPrimary) {
    throw new Error("Cette instance n'est pas configurée comme serveur principal.");
  }
  return config;
}
