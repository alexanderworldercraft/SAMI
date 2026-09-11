import crypto from "crypto";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";

import { assertAiDubbingConfig, getAiDubbingRuntimeStatus } from "./config.js";
import { AI_DUBBING_WORKER_FAILURE_COOLDOWN_MS } from "./constants.js";
import { buildAiDubbingVoiceScript, sha256File } from "./sourceService.js";
import { parseWebVtt } from "../aiSubtitles/vtt.js";
import { runAiDubbingCommand } from "./processor.js";
import { ensureAiDubbingPrimaryWorker, prepareNextAiDubbingInput } from "./leaseService.js";
import {
  claimRemoteDubbingJob,
  completeRemoteDubbingJob,
  failRemoteDubbingJob,
  openRemoteDubbingAsset,
  registerRemoteDubbingArtifacts,
  renewRemoteDubbingJob,
  sendRemoteDubbingHeartbeat,
  sendRemoteDubbingDiagnostic,
  uploadRemoteDubbingArtifact,
} from "./workerClient.js";
import { stableStringify } from "../videoTransferSecurity.js";
import { preserveAiDubbingFailure } from "./diagnostics.js";
import { flushAiDubbingDiagnostics } from "./diagnosticTransfer.js";
import { runVoiceLease } from "../voices/worker.js";
import { recoverVoiceLeases } from "../voices/leases.js";

const safeLog = (logger, method, ...args) => {
  try { logger?.[method]?.(...args); } catch { /* aucun log ne bloque le worker */ }
};
const CONNECTIVITY_WARNING_INTERVAL_MS = 60_000;
const FILE_ID_SAFE = /[^A-Za-z0-9._-]+/g;

const isInside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const safeRelativePath = (value) => {
  const normalized = String(value || "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Le primary a fourni un chemin d'entrée invalide.");
  }
  return normalized;
};

const downloadClaimInputs = async ({ claim, config, signal }) => {
  const root = path.join(config.workRoot, claim.job.id, claim.job.phase, "input");
  await fs.promises.rm(root, { recursive: true, force: true });
  await fs.promises.mkdir(root, { recursive: true, mode: 0o700 });
  const paths = {};
  for (const entry of claim.inputManifest?.files || []) {
    const relative = safeRelativePath(entry.relativePath);
    const destination = path.resolve(root, ...relative.split("/"));
    if (!isInside(root, destination)) throw new Error("Une entrée sort du workspace du clone.");
    const partial = `${destination}.partial`;
    await fs.promises.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    const response = await openRemoteDubbingAsset({
      jobId: claim.job.id,
      fileId: entry.id,
      leaseToken: claim.leaseToken,
      leaseGeneration: claim.leaseGeneration,
      signal,
    });
    try {
      await pipeline(response.stream, fs.createWriteStream(partial, { mode: 0o600 }), { signal });
      const stats = await fs.promises.stat(partial);
      if (stats.size !== Number(entry.size) || await sha256File(partial) !== entry.sha256) {
        throw new Error(`L'entrée ${entry.id} ne correspond pas à son empreinte.`);
      }
      await fs.promises.rename(partial, destination);
      paths[entry.id] = destination;
    } catch (error) {
      await fs.promises.rm(partial, { force: true }).catch(() => {});
      throw error;
    }
  }
  return { root, paths };
};

const describeArtifact = async ({ id, kind, absolutePath, speaker }) => {
  const stats = await fs.promises.stat(absolutePath);
  return {
    id,
    kind,
    size: stats.size,
    sha256: await sha256File(absolutePath),
    ...(speaker ? { speaker } : {}),
    absolutePath,
  };
};

const buildOutputArtifacts = async ({ claim, result, workspace }) => {
  const audioPath = path.resolve(String(result.audioPath || ""));
  if (!isInside(workspace, audioPath) || !fs.existsSync(audioPath)) {
    throw new Error("Le runtime n'a produit aucune piste audio dans son workspace.");
  }
  const files = [await describeArtifact({ id: "audio", kind: "audio", absolutePath: audioPath })];
  if (claim.job.phase === "preview") {
    const profileRoot = path.resolve(String(result.voiceProfilePath || ""));
    const manifestPath = path.join(profileRoot, "manifest.json");
    if (!isInside(workspace, profileRoot) || !fs.existsSync(manifestPath)) {
      throw new Error("Le runtime n'a produit aucun profil vocal valide.");
    }
    const profile = JSON.parse(await fs.promises.readFile(manifestPath, "utf8"));
    files.push(await describeArtifact({
      id: "profile-manifest",
      kind: "profile-manifest",
      absolutePath: manifestPath,
    }));
    for (const [speaker, reference] of Object.entries(profile.references || {})) {
      const absolutePath = path.resolve(profileRoot, ...safeRelativePath(reference.path).split("/"));
      if (!isInside(profileRoot, absolutePath)) throw new Error("Une référence vocale sort du profil.");
      const safe = speaker.replace(FILE_ID_SAFE, "_").replace(/^_+|_+$/g, "") || "speaker";
      files.push(await describeArtifact({
        id: `profile-reference-${safe}`,
        kind: "profile-reference",
        absolutePath,
        speaker,
      }));
    }
    const voiceSamples = [];
    for (const sample of result.voiceSamples || []) {
      const speaker = String(sample.speaker || "");
      const absolutePath = path.resolve(String(sample.audioPath || ""));
      if (!speaker || !isInside(workspace, absolutePath) || !fs.existsSync(absolutePath)) {
        throw new Error("Un échantillon vocal renvoyé par le runtime est invalide.");
      }
      const safe = speaker.replace(FILE_ID_SAFE, "_").replace(/^_+|_+$/g, "") || "speaker";
      const artifactId = `voice-sample-${safe}`;
      files.push(await describeArtifact({
        id: artifactId,
        kind: "voice-sample",
        absolutePath,
        speaker,
      }));
      voiceSamples.push({
        speaker,
        artifactId,
        sourceStart: sample.sourceStart,
        text: sample.text,
        watermarkConfidence: sample.watermarkConfidence,
      });
    }
    result.voiceSamples = voiceSamples;
  }
  const publicFiles = files.map(({ absolutePath: _absolutePath, ...entry }) => entry);
  const manifest = { schemaVersion: 1, phase: claim.job.phase, files: publicFiles };
  const manifestHash = crypto.createHash("sha256").update(stableStringify(manifest)).digest("hex");
  return { files, manifest, manifestHash, result };
};

export const buildRuntimeInput = async ({ claim, downloaded, workspace }) => {
  const transcript = JSON.parse(await fs.promises.readFile(downloaded.paths["source-transcript"], "utf8"));
  const voiceScript = downloaded.paths["voice-script"]
    ? JSON.parse(await fs.promises.readFile(downloaded.paths["voice-script"], "utf8"))
    : buildAiDubbingVoiceScript({
      targetSegments: parseWebVtt(
        await fs.promises.readFile(downloaded.paths["target-subtitle"], "utf8")
      ),
      sourceTranscript: transcript,
    });
  return {
    schemaVersion: 4,
    phase: claim.job.phase,
    videoId: claim.job.videoId,
    sourcePlaylist: downloaded.paths["source-audio"],
    targetSubtitle: downloaded.paths["target-subtitle"],
    sourceTranscript: transcript,
    voiceScript,
    targetLanguage: claim.job.targetLanguage,
    previewDurationSeconds: 45,
    previewStartSeconds: claim.job.phase === "preview" ? claim.job.previewStartSeconds : 0,
    expectedSpeakerCount: claim.job.expectedSpeakerCount,
    manualVoiceReferences: claim.job.manualVoiceReferences || null,
    rejectedVoiceReferences: claim.job.phase === "preview"
      ? (claim.job.rejectedVoiceReferences || [])
      : [],
    regenerationTarget: claim.job.phase === "preview" ? claim.job.regenerationTarget : null,
    voiceProfilePath: claim.job.phase === "full"
      ? path.join(downloaded.root, "profile")
      : claim.job.regenerationTarget ? path.join(downloaded.root, "previous-profile") : null,
    voiceProfileChecksum: claim.job.phase === "full" || claim.job.regenerationTarget
      ? claim.job.voiceProfileChecksum
      : null,
    models: claim.job.models,
    generationConfigHash: claim.job.models.generationConfigHash,
    requirements: {
      localOnly: true,
      preserveBackground: true,
      cloneClosestSpeakerVoices: true,
      watermarkRequired: true,
    },
    workspace,
  };
};

export async function collectAiDubbingCapabilities({ config } = {}) {
  const runtimeConfig = config || assertAiDubbingConfig();
  const status = getAiDubbingRuntimeStatus();
  if (!runtimeConfig.workerEnabled) {
    return { ready: false, engine: null, device: null, model: null, error: null, capabilities: {} };
  }
  if (!status.workerReady) {
    return {
      ready: false,
      engine: runtimeConfig.voiceEngine,
      device: null,
      model: runtimeConfig.voiceModel,
      modelRevision: runtimeConfig.voiceModelRevision,
      error: status.error,
      capabilities: status.capabilities || {},
    };
  }
  try {
    await fs.promises.mkdir(runtimeConfig.workRoot, { recursive: true, mode: 0o700 });
    const output = await runAiDubbingCommand(runtimeConfig.command, ["--probe"], {
      cwd: runtimeConfig.workRoot,
    });
    const probe = JSON.parse(String(output).trim().split(/\r?\n/).filter(Boolean).at(-1));
    return {
      ready: Boolean(probe.ready),
      engine: probe.voiceEngine || runtimeConfig.voiceEngine,
      device: probe.device || null,
      model: probe.voiceModel || runtimeConfig.voiceModel,
      modelRevision: probe.voiceModelRevision || runtimeConfig.voiceModelRevision,
      error: probe.error || null,
      capabilities: {
        platform: process.platform,
        architecture: process.arch,
        languages: ["en", "fr", "ja"],
        ...(probe.components || {}),
        voiceLibrary: probe.voiceLibrary === 1 ? 1 : 0,
        // Le probe matériel ne remplace pas l'identité du profil utilisée par le primary.
        profile: {
          id: runtimeConfig.profile.id,
          label: runtimeConfig.profile.label,
          generationConfigHash: runtimeConfig.generationConfigHash,
        },
      },
    };
  } catch (error) {
    return {
      ready: false,
      engine: runtimeConfig.voiceEngine,
      device: null,
      model: runtimeConfig.voiceModel,
      modelRevision: runtimeConfig.voiceModelRevision,
      error: String(error?.message || error),
      capabilities: {},
    };
  }
}

export async function startAiDubbingWorkerRuntime(options = {}) {
  const config = options.config || assertAiDubbingConfig();
  const logger = options.logger === undefined ? console : options.logger;
  const bootId = options.bootId || crypto.randomUUID();
  const capabilities = options.capabilities
    ? await Promise.resolve(options.capabilities)
    : await collectAiDubbingCapabilities({ config });
  const dependencies = {
    prepare: async () => { await recoverVoiceLeases(); return prepareNextAiDubbingInput({ config }); },
    heartbeat: sendRemoteDubbingHeartbeat,
    diagnostic: sendRemoteDubbingDiagnostic,
    claim: claimRemoteDubbingJob,
    renew: renewRemoteDubbingJob,
    fail: failRemoteDubbingJob,
    registerArtifacts: registerRemoteDubbingArtifacts,
    uploadArtifact: uploadRemoteDubbingArtifact,
    complete: completeRemoteDubbingJob,
    ...(options.dependencies || {}),
  };
  let stopped = false;
  let active = null;
  let claiming = false;
  let activeController = null;
  let lastError = capabilities.error || null;
  let unavailableUntil = 0;
  let heartbeatTimer = null;
  let claimTimer = null;
  let prepareTimer = null;
  let diagnosticTimer = null;
  let diagnosticActive = null;
  const diagnosticController = new AbortController();
  let lastConnectivityWarningAt = 0;
  const flushDiagnostics = () => {
    if (stopped || config.role !== "CLONE" || !config.root || diagnosticActive) return;
    diagnosticActive = flushAiDubbingDiagnostics({
      config, send: dependencies.diagnostic, signal: diagnosticController.signal,
    }).then(result => {
      for (const error of result.errors) safeLog(logger, "warn", `[ai-dubbing] diagnostic ${error.id} non transféré : ${error.message}`);
    }).catch(error => safeLog(logger, "warn", "[ai-dubbing] transfert des diagnostics impossible", error))
      .finally(() => { diagnosticActive = null; });
  };

  const recordConnectivityError = (message, error) => {
    lastError = String(error?.message || error).slice(0, 4000);
    const now = Date.now();
    if (now - lastConnectivityWarningAt < CONNECTIVITY_WARNING_INTERVAL_MS) return;
    lastConnectivityWarningAt = now;
    safeLog(logger, "warn", message, error);
  };

  if (config.role === "PRIMARY") await ensureAiDubbingPrimaryWorker({ config });

  const heartbeat = async () => {
    if (config.role !== "CLONE" || !config.workerEnabled) return;
    try {
      await dependencies.heartbeat({
        role: "CLONE",
        ready: capabilities.ready && Date.now() >= unavailableUntil,
        engine: capabilities.engine,
        device: capabilities.device,
        model: capabilities.model,
        modelRevision: capabilities.modelRevision,
        pipelineVersion: config.pipelineVersion,
        protocolVersion: config.protocolVersion,
        performanceScore: config.performanceScore,
        maxSlots: 1,
        capabilities: capabilities.capabilities,
        bootId,
        lastError,
      });
      if (capabilities.ready) lastError = null;
    } catch (error) {
      recordConnectivityError("[ai-dubbing] primary inaccessible, nouvelle tentative automatique", error);
    }
  };

  const processLease = async (claim, controller) => {
    let renewTimer = null;
    let phase = "DOWNLOADING";
    let progress = 5;
    let localLeaseExpiry = new Date(claim.leaseExpiresAt).getTime();
    const renew = async ({ tolerateTransientFailure = false } = {}) => {
      try {
        const response = await dependencies.renew({
          jobId: claim.job.id,
          leaseToken: claim.leaseToken,
          leaseGeneration: claim.leaseGeneration,
          phase,
          progress,
        }, { signal: controller.signal });
        localLeaseExpiry = Date.now() + config.leaseDurationMs;
        return response;
      } catch (error) {
        const safetyWindowMs = Math.max(5_000, Math.min(15_000, config.leaseRenewIntervalMs / 2));
        if (tolerateTransientFailure && Date.now() < localLeaseExpiry - safetyWindowMs) {
          safeLog(logger, "warn", `[ai-dubbing:${claim.job.id}] renouvellement temporairement indisponible`, error);
          return null;
        }
        controller.abort(error);
        throw error;
      }
    };
    const workspace = path.join(config.workRoot, claim.job.id, claim.job.phase, "runtime");
    try {
      renewTimer = setInterval(
        () => renew({ tolerateTransientFailure: true }).catch(() => {}),
        claim.renewAfterMs || config.leaseRenewIntervalMs
      );
      renewTimer.unref?.();
      await renew();
      const downloaded = await downloadClaimInputs({ claim, config, signal: controller.signal });
      await fs.promises.rm(workspace, { recursive: true, force: true });
      await fs.promises.mkdir(workspace, { recursive: true, mode: 0o700 });
      const inputPath = path.join(workspace, "input.json");
      const outputPath = path.join(workspace, "output.json");
      const input = await buildRuntimeInput({ claim, downloaded, workspace });
      await fs.promises.writeFile(inputPath, JSON.stringify(input), { encoding: "utf8", mode: 0o600 });
      phase = "SYNTHESIZING";
      progress = 10;
      await runAiDubbingCommand(config.command, [
        "--phase", claim.job.phase,
        "--input", inputPath,
        "--output", outputPath,
      ], {
        cwd: workspace,
        signal: controller.signal,
        onProgress: async (event) => {
          phase = String(event.stage || phase).slice(0, 32);
          progress = Math.max(progress, Math.min(90, Number(event.progress) || progress));
        },
      });
      const result = JSON.parse(await fs.promises.readFile(outputPath, "utf8"));
      phase = "UPLOADING";
      progress = 92;
      await renew();
      const artifacts = await buildOutputArtifacts({ claim, result, workspace });
      await dependencies.registerArtifacts({
        jobId: claim.job.id,
        leaseToken: claim.leaseToken,
        leaseGeneration: claim.leaseGeneration,
        manifest: artifacts.manifest,
        manifestHash: artifacts.manifestHash,
      }, { signal: controller.signal });
      for (const file of artifacts.files) {
        await dependencies.uploadArtifact({
          jobId: claim.job.id,
          fileId: file.id,
          absolutePath: file.absolutePath,
          size: file.size,
          sha256: file.sha256,
          leaseToken: claim.leaseToken,
          leaseGeneration: claim.leaseGeneration,
          signal: controller.signal,
        });
      }
      progress = 98;
      await renew();
      await dependencies.complete({
        jobId: claim.job.id,
        leaseToken: claim.leaseToken,
        leaseGeneration: claim.leaseGeneration,
        result: artifacts.result,
      }, { signal: controller.signal });
      lastError = null;
    } catch (error) {
      lastError = String(error?.message || error).slice(0, 4000);
      try {
        const diagnosticPath = await preserveAiDubbingFailure({ config, claim, error, phase, progress });
        safeLog(logger, "warn", `[ai-dubbing:${claim.job.id}] diagnostics conservés : ${diagnosticPath}`);
        flushDiagnostics();
      } catch (diagnosticError) {
        safeLog(logger, "warn", `[ai-dubbing:${claim.job.id}] conservation des diagnostics impossible`, diagnosticError);
      }
      if (error?.retryable !== false) {
        unavailableUntil = Date.now() + AI_DUBBING_WORKER_FAILURE_COOLDOWN_MS;
      }
      if (!controller.signal.aborted || !stopped) {
        await dependencies.fail({
          jobId: claim.job.id,
          leaseToken: claim.leaseToken,
          leaseGeneration: claim.leaseGeneration,
          errorMessage: lastError,
          retryable: error?.retryable !== false,
        }).catch(() => {});
      }
      safeLog(logger, "error", `[ai-dubbing:${claim.job.id}]`, error);
    } finally {
      if (renewTimer) clearInterval(renewTimer);
      await fs.promises.rm(path.join(config.workRoot, claim.job.id), { recursive: true, force: true }).catch(() => {});
    }
  };

  const runClaim = async () => {
    if (
      stopped
      || config.role !== "CLONE"
      || !config.workerEnabled
      || active
      || claiming
      || !capabilities.ready
      || Date.now() < unavailableUntil
    ) return;
    claiming = true;
    try {
      const response = await dependencies.claim({});
      if (!response?.lease && capabilities.capabilities?.voiceLibrary !== 1) return;
      const controller = new AbortController();
      activeController = controller;
      active = (response?.lease
        ? processLease(response.lease, controller)
        : runVoiceLease({ config, signal: controller.signal })).finally(() => {
        active = null;
        if (activeController === controller) activeController = null;
      });
      await active;
    } catch (error) {
      recordConnectivityError("[ai-dubbing] attribution impossible, nouvelle tentative automatique", error);
    } finally {
      claiming = false;
    }
  };

  const prepare = async () => {
    if (stopped || config.role !== "PRIMARY") return;
    try { await dependencies.prepare(); }
    catch (error) { safeLog(logger, "warn", "[ai-dubbing] préparation des entrées impossible", error); }
  };

  await heartbeat();
  await prepare();
  if (config.role === "CLONE" && config.root) {
    flushDiagnostics();
    diagnosticTimer = setInterval(flushDiagnostics, 60_000);
    diagnosticTimer.unref?.();
  }
  if (config.role === "CLONE" && config.workerEnabled) {
    heartbeatTimer = setInterval(heartbeat, config.heartbeatIntervalMs);
    heartbeatTimer.unref?.();
    claimTimer = setInterval(() => void runClaim(), config.claimIntervalMs);
    claimTimer.unref?.();
    void runClaim();
  }
  if (config.role === "PRIMARY") {
    prepareTimer = setInterval(prepare, config.claimIntervalMs);
    prepareTimer.unref?.();
  }
  return {
    ready: Promise.resolve(capabilities),
    capabilities,
    async stop() {
      stopped = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (claimTimer) clearInterval(claimTimer);
      if (prepareTimer) clearInterval(prepareTimer);
      if (diagnosticTimer) clearInterval(diagnosticTimer);
      diagnosticController.abort(new Error("Arrêt du transfert des diagnostics."));
      await diagnosticActive;
      activeController?.abort(new Error("Arrêt du worker de doublage."));
      await active?.catch(() => {});
    },
  };
}
