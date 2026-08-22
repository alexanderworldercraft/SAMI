import path from "path";

import { describe, expect, it, vi } from "vitest";

import { startAiSubtitleWorkerRuntime } from "../services/aiSubtitles/workerRuntime.js";

const config = {
  role: "CLONE",
  instanceId: "mac-clone",
  performanceScore: 60,
  pipelineVersion: "sami-ai-subtitles-v1",
  protocolVersion: 1,
  heartbeatIntervalMs: 60_000,
  claimIntervalMs: 60_000,
  leaseRenewIntervalMs: 30_000,
  workRoot: path.resolve("var/ai-subtitles-test"),
};

describe("AI subtitle worker runtime", () => {
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
});
