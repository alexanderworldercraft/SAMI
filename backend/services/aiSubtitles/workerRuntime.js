import crypto from "crypto";
import fs from "fs";
import path from "path";
import { pipeline } from "stream/promises";

import { sha256File } from "./sourceService.js";
import { assertAiSubtitleConfig } from "./config.js";
import {
  AI_SUBTITLE_PHASE,
  AI_SUBTITLE_WORKER_FAILURE_COOLDOWN_MS,
} from "./constants.js";
import { probeAiSubtitleEngine, runAiSubtitleEngine } from "./engineProcess.js";
import {
  claimNextAiSubtitleJob,
  completeAiSubtitleLease,
  ensureAiPrimaryWorker,
  failAiSubtitleLease,
  getLocalAiSubtitleSourcePath,
  heartbeatAiSubtitleWorker,
  prepareNextAiSubtitleSource,
  renewAiSubtitleLease,
  serializeAiSubtitleClaim,
} from "./jobService.js";
import {
  claimRemoteAiJob,
  completeRemoteAiJob,
  failRemoteAiJob,
  openRemoteAiSource,
  renewRemoteAiJob,
  sendRemoteAiHeartbeat,
} from "./workerClient.js";

const safeLog = (logger, method, ...args) => {
  try { logger?.[method]?.(...args); } catch { /* le log ne bloque jamais */ }
};

const CONNECTIVITY_WARNING_INTERVAL_MS = 60_000;

const localDependencies = (config) => ({
  prepare: () => prepareNextAiSubtitleSource({ config }),
  heartbeat: (payload) => heartbeatAiSubtitleWorker(config.instanceId, payload),
  claim: async () => {
    const claim = await claimNextAiSubtitleJob({ workerId: config.instanceId, config });
    return claim ? {
      lease: serializeAiSubtitleClaim(claim),
      localSourcePath: getLocalAiSubtitleSourcePath(claim.job),
    } : { lease: null };
  },
  renew: (payload) => renewAiSubtitleLease({ ...payload, workerId: config.instanceId, config }),
  complete: (payload) => completeAiSubtitleLease({ ...payload, workerId: config.instanceId, config }),
  fail: (payload) => failAiSubtitleLease({
    ...payload,
    workerId: config.instanceId,
    config,
  }),
});

const remoteDependencies = (config) => ({
  prepare: async () => null,
  heartbeat: (payload, options) => sendRemoteAiHeartbeat(payload, options),
  claim: (options) => claimRemoteAiJob({}, options),
  renew: (payload, options) => renewRemoteAiJob(payload, options),
  complete: (payload, options) => completeRemoteAiJob(payload, options),
  fail: (payload, options) => failRemoteAiJob(payload, options),
});

const downloadRemoteSource = async ({ claim, config, signal }) => {
  const directory = path.join(config.workRoot, "downloaded-sources");
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  const destination = path.join(directory, `${claim.job.id}.wav`);
  const partial = `${destination}.partial`;
  await fs.promises.rm(partial, { force: true });
  await fs.promises.rm(destination, { force: true });
  try {
    const response = await openRemoteAiSource({
      jobId: claim.job.id,
      leaseToken: claim.leaseToken,
      leaseGeneration: claim.leaseGeneration,
      signal,
    });
    await pipeline(response.stream, fs.createWriteStream(partial, { mode: 0o600 }), { signal });
    const stats = await fs.promises.stat(partial);
    const expectedSize = Number(claim.source?.size);
    if (!Number.isSafeInteger(expectedSize) || stats.size !== expectedSize) {
      throw new Error("La taille de la source audio IA reçue est invalide.");
    }
    const digest = await sha256File(partial);
    if (digest !== claim.source?.sha256) {
      throw new Error("L'empreinte de la source audio IA reçue est invalide.");
    }
    await fs.promises.rename(partial, destination);
    return destination;
  } catch (error) {
    await fs.promises.rm(partial, { force: true }).catch(() => {});
    await fs.promises.rm(destination, { force: true }).catch(() => {});
    throw error;
  }
};

export async function collectAiSubtitleCapabilities({ config } = {}) {
  const runtimeConfig = config || assertAiSubtitleConfig();
  const probe = await probeAiSubtitleEngine({ config: runtimeConfig });
  return {
    ready: Boolean(probe.ready),
    engine: probe.engine || runtimeConfig.install?.engine || null,
    device: probe.device || runtimeConfig.install?.device || null,
    model: probe.model || runtimeConfig.install?.model || null,
    translationModel:
      probe.translationModel || runtimeConfig.install?.translationModel || null,
    error: probe.error || null,
    capabilities: {
      platform: process.platform,
      architecture: process.arch,
      pythonPath: runtimeConfig.pythonPath,
      manifestPath: runtimeConfig.manifestPath,
      ...(probe.capabilities || {}),
    },
  };
}

export async function startAiSubtitleWorkerRuntime(options = {}) {
  const config = options.config || assertAiSubtitleConfig();
  const logger = options.logger === undefined ? console : options.logger;
  const dependencies = {
    runEngine: runAiSubtitleEngine,
    ...(config.role === "PRIMARY" ? localDependencies(config) : remoteDependencies(config)),
    ...(options.dependencies || {}),
  };
  const bootId = options.bootId || crypto.randomUUID();
  const capabilities = await (options.capabilities
    ? Promise.resolve(options.capabilities)
    : collectAiSubtitleCapabilities({ config }));
  let stopped = false;
  let active = null;
  let activeController = null;
  let lastError = capabilities.error || null;
  let unavailableUntil = 0;
  let heartbeatTimer = null;
  let claimTimer = null;
  let prepareTimer = null;
  let lastConnectivityWarningAt = 0;

  const recordConnectivityError = (message, error) => {
    lastError = String(error?.message || error).slice(0, 4000);
    const now = Date.now();
    if (now - lastConnectivityWarningAt < CONNECTIVITY_WARNING_INTERVAL_MS) return;
    lastConnectivityWarningAt = now;
    safeLog(logger, "warn", message, error);
  };

  if (config.role === "PRIMARY") await ensureAiPrimaryWorker({ config });

  const heartbeat = async () => {
    try {
      const ready = capabilities.ready && Date.now() >= unavailableUntil;
      await dependencies.heartbeat({
        role: config.role,
        ready,
        engine: capabilities.engine,
        device: capabilities.device,
        model: capabilities.model,
        translationModel: capabilities.translationModel,
        pipelineVersion: config.pipelineVersion,
        protocolVersion: config.protocolVersion,
        performanceScore: config.performanceScore,
        maxSlots: 1,
        capabilities: capabilities.capabilities,
        bootId,
        lastError,
      });
      if (ready) lastError = null;
    } catch (error) {
      recordConnectivityError("[ai-subtitles] primary inaccessible, nouvelle tentative automatique", error);
    }
  };

  const processLease = async ({ lease: claim, localSourcePath }, controller) => {
    let sourcePath = localSourcePath || null;
    let downloaded = false;
    let renewTimer = null;
    let phase = claim.transcript ? AI_SUBTITLE_PHASE.TRANSLATING : AI_SUBTITLE_PHASE.TRANSCRIBING;
    let progress = claim.transcript ? 55 : 15;
    const renew = () => dependencies.renew({
      jobId: claim.job.id,
      leaseToken: claim.leaseToken,
      leaseGeneration: claim.leaseGeneration,
      phase,
      progress,
    }, { signal: controller.signal });
    try {
      renewTimer = setInterval(
        () => renew().catch((error) => controller.abort(error)),
        claim.renewAfterMs || config.leaseRenewIntervalMs
      );
      renewTimer.unref?.();
      if (claim.source && !sourcePath) {
        phase = AI_SUBTITLE_PHASE.DOWNLOADING;
        progress = 8;
        await renew();
        sourcePath = await downloadRemoteSource({ claim, config, signal: controller.signal });
        downloaded = true;
      }
      phase = claim.transcript ? AI_SUBTITLE_PHASE.TRANSLATING : AI_SUBTITLE_PHASE.TRANSCRIBING;
      progress = claim.transcript ? 60 : 15;
      await renew();
      const result = await dependencies.runEngine({
        jobId: claim.job.id,
        audioPath: sourcePath,
        transcript: claim.transcript,
        targetLanguage: claim.job.targetLanguage,
        signal: controller.signal,
        config,
      });
      phase = AI_SUBTITLE_PHASE.PUBLISHING;
      progress = 95;
      await renew();
      await dependencies.complete({
        jobId: claim.job.id,
        leaseToken: claim.leaseToken,
        leaseGeneration: claim.leaseGeneration,
        result,
      }, { signal: controller.signal });
      lastError = null;
      return { completed: true, jobId: claim.job.id };
    } catch (error) {
      lastError = String(error?.message || error).slice(0, 4000);
      unavailableUntil = Date.now() + AI_SUBTITLE_WORKER_FAILURE_COOLDOWN_MS;
      if (!controller.signal.aborted || !stopped) {
        await dependencies.fail({
          jobId: claim.job.id,
          leaseToken: claim.leaseToken,
          leaseGeneration: claim.leaseGeneration,
          errorMessage: lastError,
        }).catch(() => {});
      }
      safeLog(logger, "error", `[ai-subtitles:${claim.job.id}]`, error);
      return { completed: false, jobId: claim.job.id, error };
    } finally {
      if (renewTimer) clearInterval(renewTimer);
      if (downloaded && sourcePath) await fs.promises.rm(sourcePath, { force: true }).catch(() => {});
    }
  };

  const runClaim = async () => {
    if (
      stopped
      || active
      || !capabilities.ready
      || Date.now() < unavailableUntil
    ) return;
    try {
      const response = await dependencies.claim();
      if (!response?.lease) return;
      const claim = response.lease;
      const operation = claim.transcript ? "traduction" : "transcription";
      const assignee = config.role === "CLONE" ? "au clone" : "au serveur principal";
      safeLog(
        logger,
        "info",
        `[ai-subtitles:${claim.job.id}] tâche attribuée ${assignee} (${operation}, vidéo ${claim.job.videoId}, langue ${claim.job.targetLanguage}).`
      );
      const controller = new AbortController();
      activeController = controller;
      active = processLease(response, controller).finally(() => {
        active = null;
        if (activeController === controller) activeController = null;
      });
      await active;
    } catch (error) {
      recordConnectivityError("[ai-subtitles] attribution impossible, nouvelle tentative automatique", error);
    }
  };

  const prepare = async () => {
    if (stopped || config.role !== "PRIMARY") return;
    try {
      await dependencies.prepare();
    } catch (error) {
      safeLog(logger, "warn", "[ai-subtitles] préparation audio impossible", error);
    }
  };

  await heartbeat();
  await prepare();
  heartbeatTimer = setInterval(heartbeat, config.heartbeatIntervalMs);
  heartbeatTimer.unref?.();
  claimTimer = setInterval(() => void runClaim(), config.claimIntervalMs);
  claimTimer.unref?.();
  if (config.role === "PRIMARY") {
    prepareTimer = setInterval(prepare, config.claimIntervalMs);
    prepareTimer.unref?.();
  }
  void runClaim();

  return {
    ready: Promise.resolve(capabilities),
    capabilities,
    async stop() {
      stopped = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (claimTimer) clearInterval(claimTimer);
      if (prepareTimer) clearInterval(prepareTimer);
      activeController?.abort(new Error("Arrêt du runtime IA."));
      await active?.catch(() => {});
    },
  };
}
