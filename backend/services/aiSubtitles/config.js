import fs from "fs";
import path from "path";

import { validateVideoTransferConfig } from "../videoTransferSecurity.js";
import { BACKEND_ROOT } from "../video/videoPaths.js";
import {
  AI_SUBTITLE_CLAIM_INTERVAL_MS,
  AI_SUBTITLE_HEARTBEAT_INTERVAL_MS,
  AI_SUBTITLE_LEASE_DURATION_MS,
  AI_SUBTITLE_LEASE_RENEW_INTERVAL_MS,
  AI_SUBTITLE_OFFLINE_AFTER_MS,
  AI_SUBTITLE_PIPELINE_VERSION,
  AI_SUBTITLE_PROTOCOL_VERSION,
} from "./constants.js";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
export const AI_SUBTITLE_ROOT = path.join(BACKEND_ROOT, "var", "ai-subtitles");
export const AI_SUBTITLE_SOURCE_ROOT = path.join(AI_SUBTITLE_ROOT, "sources");
export const AI_SUBTITLE_WORK_ROOT = path.join(AI_SUBTITLE_ROOT, "work");
export const AI_SUBTITLE_INSTALL_MANIFEST = path.join(AI_SUBTITLE_ROOT, "install.json");

export const isAiSubtitleEnvironmentEnabled = (env = process.env) =>
  ENABLED_VALUES.has(String(env.SAMI_AI_SUBTITLES_ENABLED || "").trim().toLowerCase());

const readInstallManifest = (manifestPath) => {
  try {
    const value = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
};

const defaultPythonPath = (root) => process.platform === "win32"
  ? path.join(root, "venv", "Scripts", "python.exe")
  : path.join(root, "venv", "bin", "python");

export function getAiSubtitleConfig(env = process.env) {
  const enabled = isAiSubtitleEnvironmentEnabled(env);
  if (!enabled) {
    return Object.freeze({ enabled: false });
  }

  const transfer = validateVideoTransferConfig(env);
  const root = path.resolve(env.SAMI_AI_SUBTITLE_ROOT || AI_SUBTITLE_ROOT);
  const manifestPath = path.resolve(
    env.SAMI_AI_SUBTITLE_INSTALL_MANIFEST || path.join(root, "install.json")
  );
  const install = readInstallManifest(manifestPath);
  const performanceScore = Number(env.SAMI_AI_SUBTITLE_PERFORMANCE_SCORE || 1);

  return Object.freeze({
    enabled: true,
    role: transfer.isPrimary ? "PRIMARY" : "CLONE",
    instanceId: transfer.instanceId,
    primaryBaseUrl: transfer.primaryBaseUrl ? new URL(transfer.primaryBaseUrl) : null,
    sharedSecret: transfer.sharedSecret,
    protocolVersion: AI_SUBTITLE_PROTOCOL_VERSION,
    pipelineVersion: String(
      env.SAMI_AI_SUBTITLE_PIPELINE_VERSION || AI_SUBTITLE_PIPELINE_VERSION
    ).trim(),
    performanceScore:
      Number.isFinite(performanceScore) && performanceScore > 0 ? performanceScore : 1,
    root,
    sourceRoot: path.resolve(env.SAMI_AI_SUBTITLE_SOURCE_ROOT || path.join(root, "sources")),
    workRoot: path.resolve(env.SAMI_AI_SUBTITLE_WORK_ROOT || path.join(root, "work")),
    manifestPath,
    install,
    pythonPath: path.resolve(
      env.SAMI_AI_SUBTITLE_PYTHON || install?.pythonPath || defaultPythonPath(root)
    ),
    workerScript: path.resolve(
      env.SAMI_AI_SUBTITLE_WORKER_SCRIPT
      || path.join(BACKEND_ROOT, "scripts", "ai", "worker.py")
    ),
    heartbeatIntervalMs: AI_SUBTITLE_HEARTBEAT_INTERVAL_MS,
    offlineAfterMs: AI_SUBTITLE_OFFLINE_AFTER_MS,
    leaseDurationMs: AI_SUBTITLE_LEASE_DURATION_MS,
    leaseRenewIntervalMs: AI_SUBTITLE_LEASE_RENEW_INTERVAL_MS,
    claimIntervalMs: AI_SUBTITLE_CLAIM_INTERVAL_MS,
  });
}

export function assertAiSubtitleConfig(env = process.env) {
  const config = getAiSubtitleConfig(env);
  if (!config.enabled) {
    throw new Error("Le runtime de sous-titrage IA est désactivé dans l'environnement.");
  }
  if (config.role === "CLONE" && !config.primaryBaseUrl) {
    throw new Error("SAMI_PRIMARY_BASE_URL est requise sur un clone IA.");
  }
  return config;
}
