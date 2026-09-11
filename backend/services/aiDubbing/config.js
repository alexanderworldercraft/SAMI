import fs from "fs";
import path from "path";

import { validateVideoTransferConfig } from "../videoTransferSecurity.js";
import { BACKEND_ROOT } from "../video/videoPaths.js";
import {
  AI_DUBBING_CLAIM_INTERVAL_MS,
  AI_DUBBING_HEARTBEAT_INTERVAL_MS,
  AI_DUBBING_LEASE_DURATION_MS,
  AI_DUBBING_LEASE_RENEW_INTERVAL_MS,
  AI_DUBBING_OFFLINE_AFTER_MS,
  AI_DUBBING_PIPELINE_VERSION,
  AI_DUBBING_PROTOCOL_VERSION,
} from "./constants.js";
import { getAiDubbingProfile } from "./profiles.js";

const ENABLED_VALUES = new Set(["1", "true", "yes", "on", "enabled"]);
const DISABLED_VALUES = new Set(["0", "false", "no", "off", "disabled"]);
const isEnabled = (value) => ENABLED_VALUES.has(String(value || "").trim().toLowerCase());

const readInstallManifest = (filename) => {
  try {
    const value = JSON.parse(fs.readFileSync(filename, "utf8"));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
};

const resolveWorkerEnabled = (env, active) => {
  const raw = String(env.SAMI_AI_DUBBING_WORKER_ENABLED ?? "").trim().toLowerCase();
  if (DISABLED_VALUES.has(raw)) return false;
  if (ENABLED_VALUES.has(raw)) return true;
  return active;
};

export const getAiDubbingConfig = (env = process.env) => {
  const transfer = validateVideoTransferConfig(env);
  const root = path.resolve(env.SAMI_AI_DUBBING_ROOT || path.join(BACKEND_ROOT, "var", "ai-dubbing"));
  const command = String(env.SAMI_AI_DUBBING_COMMAND || "").trim();
  const active = isEnabled(env.SAMI_AI_DUBBING_ENABLED);
  const installManifest = path.resolve(
    env.SAMI_AI_DUBBING_INSTALL_MANIFEST || path.join(root, "install.json")
  );
  const install = readInstallManifest(installManifest);
  const performanceScore = Number(env.SAMI_AI_DUBBING_PERFORMANCE_SCORE || 1);
  const primaryTlsCaFileValue = String(env.SAMI_AI_DUBBING_PRIMARY_TLS_CA_FILE || "").trim();
  const pipelineVersion = String(
    env.SAMI_AI_DUBBING_PIPELINE_VERSION || AI_DUBBING_PIPELINE_VERSION
  ).trim();
  const profile = getAiDubbingProfile(pipelineVersion);
  return Object.freeze({
    active,
    workerEnabled: resolveWorkerEnabled(env, active),
    role: transfer.isPrimary ? "PRIMARY" : "CLONE",
    instanceId: transfer.instanceId,
    primaryBaseUrl: transfer.primaryBaseUrl ? new URL(transfer.primaryBaseUrl) : null,
    sharedSecret: transfer.sharedSecret,
    primaryTlsCaFile: primaryTlsCaFileValue ? path.resolve(primaryTlsCaFileValue) : null,
    primaryTlsCertSha256: String(env.SAMI_AI_DUBBING_PRIMARY_TLS_CERT_SHA256 || "")
      .replace(/[^a-f0-9]/gi, "").toLowerCase() || null,
    command: command ? path.resolve(command) : "",
    root,
    workRoot: path.resolve(env.SAMI_AI_DUBBING_WORK_ROOT || path.join(root, "work")),
    sourceRoot: path.resolve(env.SAMI_AI_DUBBING_SOURCE_ROOT || path.join(root, "sources")),
    incomingRoot: path.resolve(env.SAMI_AI_DUBBING_INCOMING_ROOT || path.join(root, "incoming")),
    installManifest,
    install,
    protocolVersion: AI_DUBBING_PROTOCOL_VERSION,
    pipelineVersion,
    profile,
    generationConfigHash: profile.generationConfigHash,
    voiceEngine: String(env.SAMI_AI_DUBBING_VOICE_ENGINE || install?.voiceEngine || "chatterbox").trim().toLowerCase(),
    voiceModel: String(env.SAMI_AI_DUBBING_VOICE_MODEL || install?.voiceModel || "chatterbox-multilingual-v3").trim(),
    voiceModelRevision: String(
      env.SAMI_AI_DUBBING_VOICE_MODEL_REVISION || install?.voiceModelRevision || ""
    ).trim() || null,
    diarizationModel: profile.diarizationModel,
    separationModel: String(env.SAMI_AI_DUBBING_SEPARATION_MODEL || "bandit-v2-multi").trim(),
    performanceScore: Number.isFinite(performanceScore) && performanceScore > 0
      ? performanceScore
      : 1,
    heartbeatIntervalMs: AI_DUBBING_HEARTBEAT_INTERVAL_MS,
    offlineAfterMs: AI_DUBBING_OFFLINE_AFTER_MS,
    leaseDurationMs: AI_DUBBING_LEASE_DURATION_MS,
    leaseRenewIntervalMs: AI_DUBBING_LEASE_RENEW_INTERVAL_MS,
    claimIntervalMs: AI_DUBBING_CLAIM_INTERVAL_MS,
  });
};

const commandIsReady = (config) => {
  if (!config.command || !fs.existsSync(config.command)) return false;
  try {
    if (!fs.statSync(config.command).isFile()) return false;
    if (process.platform !== "win32") fs.accessSync(config.command, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
};

const installIsReady = (install, requireHybridDiarization = false) => {
  const voicePath = install?.models?.voice?.path || install?.models?.chatterbox?.path;
  const banditPath = install?.models?.bandit?.path;
  const diarizationPath = install?.models?.diarization?.path;
  const qualityPath = install?.models?.quality?.path;
  const sortformerPath = install?.models?.sortformer?.hostPath
    || install?.models?.sortformer?.path;
  const sortformerRuntimeReady = install?.sortformerRuntime === "wsl"
    ? Boolean(install?.sortformerPythonPath && install?.sortformerScript)
    : Boolean(
      install?.sortformerPythonPath
      && fs.existsSync(install.sortformerPythonPath)
      && install?.sortformerScript
      && fs.existsSync(install.sortformerScript)
    );
  return Boolean(
    install?.offline === true
    && install?.pythonPath
    && fs.existsSync(install.pythonPath)
    && voicePath
    && fs.existsSync(voicePath)
    && qualityPath
    && fs.existsSync(qualityPath)
    && (install?.separationRequired !== true || (banditPath && fs.existsSync(banditPath)))
    && (
      (install?.diarizationRequired !== true && !requireHybridDiarization)
      || (
        diarizationPath
        && fs.existsSync(diarizationPath)
        && install?.diarizationPythonPath
        && fs.existsSync(install.diarizationPythonPath)
        && install?.diarizationScript
        && fs.existsSync(install.diarizationScript)
      )
    )
    && (
      !requireHybridDiarization
      || (
        install?.hybridDiarizationRequired === true
        && install?.models?.sortformer
        && sortformerPath
        && fs.existsSync(sortformerPath)
        && sortformerRuntimeReady
      )
    )
  );
};

export const getAiDubbingRuntimeStatus = (env = process.env) => {
  const config = getAiDubbingConfig(env);
  const commandReady = config.workerEnabled && commandIsReady(config);
  const installReady = config.workerEnabled && installIsReady(
    config.install,
    config.diarizationModel.includes("sortformer")
  );
  const workerReady = config.active && config.workerEnabled && commandReady && installReady;
  const coordinatorReady = config.active && config.role === "PRIMARY";
  const install = config.install;
  return {
    ...config,
    ready: coordinatorReady || workerReady,
    workerReady,
    coordinatorReady,
    installReady,
    capabilities: install ? {
      profile: {
        id: config.profile.id,
        label: config.profile.label,
        generationConfigHash: config.generationConfigHash,
      },
      offline: install.offline === true,
      singleSpeakerFallback: install.singleSpeakerFallback === true,
      voice: {
        ready: Boolean(install.models?.voice || install.models?.chatterbox),
        engine: install.voiceEngine || "chatterbox",
        model: install.voiceModel || "chatterbox-multilingual-v3",
        revision: install.voiceModelRevision || install.chatterboxRevision || null,
        license: install.models?.voice?.license || install.models?.chatterbox?.license || null,
      },
      separation: install.models?.bandit
        ? { ready: true, model: "bandit-v2-multi", license: install.models.bandit.license }
        : { ready: false, model: "single-speaker-ducking" },
      diarization: install.models?.diarization
        ? {
          ready: true,
          model: "pyannote-speaker-diarization-community-1",
          license: install.models.diarization.license,
          offline: true,
        }
        : {
          ready: false,
          model: "single-speaker-test",
          pending: install.pending?.diarization || null,
        },
      sortformer: install.models?.sortformer
        ? {
          ready: true,
          model: "nvidia/diar_sortformer_4spk-v1",
          license: install.models.sortformer.license,
          nonCommercialOnly: install.models.sortformer.nonCommercialOnly === true,
          maxSpeakersPerWindow: 4,
          runtime: install.sortformerRuntime || "native",
          offline: true,
        }
        : {
          ready: false,
          model: "nvidia/diar_sortformer_4spk-v1",
        },
    } : null,
    error: !config.active
      ? "Le doublage IA est désactivé par la configuration du serveur."
      : coordinatorReady && !config.workerEnabled
        ? null
        : !commandReady
          ? "La commande locale de doublage IA est absente."
          : !installReady
            ? "Le runtime local de doublage IA n'est pas installé ou incomplet."
            : null,
  };
};

export const isAiDubbingEnvironmentEnabled = (env = process.env) =>
  isEnabled(env.SAMI_AI_DUBBING_ENABLED);

export const assertAiDubbingConfig = (env = process.env) => {
  const config = getAiDubbingConfig(env);
  if (!config.active) throw new Error("Le doublage IA est désactivé dans l'environnement.");
  if (config.role === "CLONE" && !config.primaryBaseUrl) {
    throw new Error("SAMI_PRIMARY_BASE_URL est requise sur un clone de doublage IA.");
  }
  if (config.primaryTlsCaFile && !fs.existsSync(config.primaryTlsCaFile)) {
    throw new Error("Le certificat public du primary configuré pour le doublage est introuvable.");
  }
  if (config.primaryTlsCertSha256 && !/^[a-f0-9]{64}$/.test(config.primaryTlsCertSha256)) {
    throw new Error("L'empreinte TLS SHA-256 du primary est invalide.");
  }
  if (config.primaryTlsCertSha256 && !config.primaryTlsCaFile) {
    throw new Error("Le fichier CA public du primary est requis avec son empreinte TLS.");
  }
  return config;
};
