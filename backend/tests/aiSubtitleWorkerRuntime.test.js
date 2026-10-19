import path from "path";
import fs from "fs";
import os from "os";

import { describe, expect, it, vi } from "vitest";

import { startAiSubtitleWorkerRuntime } from "../services/aiSubtitles/workerRuntime.js";
import { AI_SUBTITLE_REPETITIVE_TRANSCRIPTION } from "../services/aiSubtitles/transcriptQuality.js";
import { acquireEncodingCapacity, getEncodingCapacityState } from "../services/distributedEncoding/capacity.js";

const config = {
  role: "CLONE",
  instanceId: "mac-clone",
  performanceScore: 60,
  pipelineVersion: "sami-ai-subtitles-v2-contextual-quality-r3-word-timing",
  protocolVersion: 1,
  heartbeatIntervalMs: 60_000,
  claimIntervalMs: 60_000,
  leaseRenewIntervalMs: 30_000,
  workRoot: path.resolve("var/ai-subtitles-test"),
};

describe("AI subtitle worker runtime", () => {
  it("exécute le vrai pont moteur sans attendre sa propre réservation de capacité", async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sami-subtitle-engine-lock-"));
    const workerScript = path.join(root, "worker.mjs");
    await fs.promises.writeFile(workerScript, `import fs from 'node:fs';
      fs.writeFileSync(process.argv[process.argv.indexOf('--progress') + 1], JSON.stringify({ phase: 'checking', progress: 88 }));
      await new Promise(resolve => setTimeout(resolve, 1200));
      fs.writeFileSync(process.argv[process.argv.indexOf('--output') + 1], JSON.stringify({ targetSegments: [] }));`);
    const complete = vi.fn().mockResolvedValue(undefined);
    const fail = vi.fn().mockResolvedValue(undefined);
    const renew = vi.fn().mockResolvedValue(undefined);
    let runtime;
    try {
      runtime = await startAiSubtitleWorkerRuntime({ config: { ...config, workRoot: path.join(root, "work"),
        pythonPath: process.execPath, workerScript, manifestPath: path.join(root, "install.json"), leaseRenewIntervalMs: 50 },
        capabilities: { ready: true }, logger: null,
        dependencies: { heartbeat: vi.fn(), renew, complete, fail,
          claim: vi.fn().mockResolvedValue({ lease: { job: { id: "test-lock", targetLanguage: "fr" }, leaseToken: "test", leaseGeneration: 1 }, localSourcePath: "/audio.wav" }) },
      });
      await vi.waitFor(() => expect(complete).toHaveBeenCalledOnce(), { timeout: 3000 });
      expect(fail).not.toHaveBeenCalled();
      expect(renew).toHaveBeenCalledWith(expect.objectContaining({ phase: "checking", progress: 88 }), expect.any(Object));
    } finally {
      await runtime?.stop();
      await fs.promises.rm(root, { recursive: true, force: true });
    }
    expect(getEncodingCapacityState()).toMatchObject({ active: 0, queued: 0 });
  });

  it("laisse la capacité locale à un encodage déjà lancé sans réclamer de sous-titre", async () => {
    const release = await acquireEncodingCapacity();
    const claim = vi.fn().mockResolvedValue({ lease: null });
    let runtime;
    try {
      runtime = await startAiSubtitleWorkerRuntime({ config, capabilities: { ready: true }, logger: null,
        dependencies: { heartbeat: vi.fn(), claim } });
      await new Promise((resolve) => setImmediate(resolve));
      expect(claim).not.toHaveBeenCalled();
    } finally {
      await runtime?.stop();
      release();
    }
  });

  it("renouvelle le bail avec la progression réelle du moteur", async () => {
    const renew = vi.fn().mockResolvedValue(undefined);
    const complete = vi.fn().mockResolvedValue(undefined);
    const logger = { info: vi.fn() };
    const runtime = await startAiSubtitleWorkerRuntime({ config, capabilities: { ready: true }, logger,
      dependencies: { heartbeat: vi.fn(), renew, complete,
        claim: vi.fn().mockResolvedValue({ lease: { job: { id: "progress", targetLanguage: "fr" }, leaseToken: "test", leaseGeneration: 1 } }),
        runEngine: async ({ onProgress }) => { onProgress({ phase: "checking", progress: 88 }); return { targetSegments: [] }; },
      },
    });
    await vi.waitFor(() => expect(complete).toHaveBeenCalled());
    expect(logger.info).toHaveBeenCalledWith("[ai-subtitles:progress] étape : checking.");
    expect(renew).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "publishing", progress: 95 }), expect.any(Object));
    await runtime.stop();
  });
  it("journalise immédiatement la transcription attribuée au clone", async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const claim = {
      job: {
        id: "ccd31bfa-0b93-41ee-b0b5-1671b89e7e0a",
        videoId: 42,
        targetLanguage: "fr",
      },
      source: null,
      transcript: null,
      leaseToken: "lease-token",
      leaseGeneration: 1,
      renewAfterMs: 30_000,
    };
    const runtime = await startAiSubtitleWorkerRuntime({
      config,
      capabilities: {
        ready: true,
        engine: "faster-whisper",
        device: "cuda",
        model: "large-v3",
        translationModel: "nllb",
        error: null,
        capabilities: {},
      },
      dependencies: {
        heartbeat: vi.fn().mockResolvedValue(undefined),
        claim: vi.fn().mockResolvedValue({ lease: claim, localSourcePath: "/audio.wav" }),
        renew: vi.fn().mockResolvedValue(undefined),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
        runEngine: vi.fn().mockResolvedValue({ segments: [] }),
      },
      logger,
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(logger.info).toHaveBeenCalledWith(
      "[ai-subtitles:ccd31bfa-0b93-41ee-b0b5-1671b89e7e0a] tâche attribuée au clone (transcription, vidéo 42, langue fr)."
    );
    await runtime.stop();
  });

  it("reste actif si le primary est indisponible lors de la première attribution", async () => {
    const claimError = new Error("primary unavailable");
    const claim = vi.fn().mockRejectedValue(claimError);
    const logger = { warn: vi.fn(), error: vi.fn() };

    const runtime = await startAiSubtitleWorkerRuntime({
      config,
      capabilities: {
        ready: true,
        engine: "whisper.cpp",
        device: "metal",
        model: "small",
        translationModel: null,
        error: null,
        capabilities: {},
      },
      dependencies: {
        heartbeat: vi.fn().mockResolvedValue(undefined),
        claim,
      },
      logger,
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(claim).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      "[ai-subtitles] attribution impossible, nouvelle tentative automatique",
      claimError
    );

    await runtime.stop();
  });

  it("signale une transcription répétitive comme un échec non réessayable", async () => {
    const qualityError = new Error(
      `[${AI_SUBTITLE_REPETITIVE_TRANSCRIPTION}] répétition anormale`
    );
    const fail = vi.fn().mockResolvedValue(undefined);
    const runtime = await startAiSubtitleWorkerRuntime({
      config,
      capabilities: {
        ready: true,
        engine: "whisper.cpp-metal",
        device: "metal",
        model: "large-v3",
        translationModel: "nllb",
        error: null,
        capabilities: {},
      },
      dependencies: {
        heartbeat: vi.fn().mockResolvedValue(undefined),
        claim: vi.fn().mockResolvedValue({
          lease: {
            job: { id: "quality-job", videoId: 11, targetLanguage: "fr" },
            source: null,
            transcript: null,
            leaseToken: "lease-token",
            leaseGeneration: 1,
            renewAfterMs: 30_000,
          },
          localSourcePath: "/audio.wav",
        }),
        renew: vi.fn().mockResolvedValue(undefined),
        runEngine: vi.fn().mockRejectedValue(qualityError),
        fail,
      },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });

    await new Promise((resolve) => setImmediate(resolve));

    expect(fail).toHaveBeenCalledWith(expect.objectContaining({
      jobId: "quality-job",
      retryable: false,
    }));
    await runtime.stop();
  });
});
