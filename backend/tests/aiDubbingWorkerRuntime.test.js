import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildRuntimeInput, startAiDubbingWorkerRuntime } from "../services/aiDubbing/workerRuntime.js";
import * as configModule from "../services/aiDubbing/config.js";
import * as processorModule from "../services/aiDubbing/processor.js";
import { getAiDubbingProfile } from "../services/aiDubbing/profiles.js";
import { aiDubbingWorkerMatchesJob } from "../services/aiDubbing/leaseService.js";

const temporaryRoots = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryRoots.splice(0).map((root) => (
    fs.promises.rm(root, { recursive: true, force: true })
  )));
});

describe("runtime distribué de doublage ciblé", () => {
  it.each([
    "sami-dubbing-v5-aligned-quality",
    "sami-dubbing-v5-stable-boundaries-r1",
    "sami-dubbing-v5-aligned-sentences-r2",
    "sami-dubbing-v5-flexible-tails-r3",
    "sami-dubbing-v5-guided-references-r4",
    "sami-dubbing-v5-guided-references-r4-r1",
    "sami-dubbing-v5-guided-references-r4-r2",
    "sami-dubbing-v5-translated-clauses-r5",
    "sami-dubbing-v5-bounded-samples-r5-r1",
    "sami-dubbing-v5-japanese-identity-r5-r2",
    "sami-dubbing-v5-japanese-bounded-r5-r3",
    "sami-dubbing-v5-english-identity-r5-r4",
    "sami-dubbing-v6-clean-phrases-r9-r1",
  ])("annonce le profil %s après un probe réussi et permet son attribution", async (pipelineVersion) => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sami-dubbing-heartbeat-"));
    temporaryRoots.push(root);
    const profile = getAiDubbingProfile(pipelineVersion);
    const config = {
      role: "CLONE", workerEnabled: true, workRoot: root, command: "mock-runtime",
      pipelineVersion, profile, generationConfigHash: profile.generationConfigHash,
      voiceEngine: "qwen3-tts", voiceModel: "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
      voiceModelRevision: "checkpoint-1", heartbeatIntervalMs: 60_000, claimIntervalMs: 60_000,
    };
    vi.spyOn(configModule, "getAiDubbingRuntimeStatus").mockReturnValue({ workerReady: true });
    vi.spyOn(processorModule, "runAiDubbingCommand").mockResolvedValue(JSON.stringify({
      ready: true, device: "cuda", components: { diarization: { ready: true } },
    }));
    const heartbeat = vi.fn().mockResolvedValue({});
    const runtime = await startAiDubbingWorkerRuntime({
      config, logger: null, dependencies: { heartbeat, claim: vi.fn().mockResolvedValue(null) },
    });
    try {
      const announced = heartbeat.mock.calls[0][0];
      expect(announced).toMatchObject({
        ready: true, device: "cuda", pipelineVersion,
        capabilities: {
          languages: ["en", "fr", "ja"], diarization: { ready: true },
          profile: { id: pipelineVersion, label: profile.label, generationConfigHash: profile.generationConfigHash },
        },
      });
      const worker = {
        PipelineVersion: announced.pipelineVersion, Capabilities: announced.capabilities,
        Engine: announced.engine, Model: announced.model, ModelRevision: announced.modelRevision,
      };
      const job = {
        PipelineVersion: pipelineVersion, GenerationConfigHash: profile.generationConfigHash,
        VoiceEngine: config.voiceEngine, VoiceModel: config.voiceModel,
        VoiceModelRevision: config.voiceModelRevision, TargetLanguage: "fr",
      };
      expect(aiDubbingWorkerMatchesJob(worker, job)).toBe(true);
      expect(aiDubbingWorkerMatchesJob(worker, { ...job, GenerationConfigHash: "mismatched" })).toBe(false);
    } finally {
      await runtime.stop();
    }
  });

  it("transmet le profil précédent et l'intervenant à régénérer", async () => {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sami-dubbing-worker-"));
    temporaryRoots.push(root);
    const transcript = path.join(root, "source-transcript.json");
    const voiceScript = path.join(root, "voice-script.json");
    await fs.promises.writeFile(transcript, JSON.stringify({ sourceLanguage: "fr", segments: [] }));
    await fs.promises.writeFile(voiceScript, JSON.stringify({ schemaVersion: 1, cues: [] }));
    const runtimeInput = await buildRuntimeInput({
      claim: {
        job: {
          phase: "preview",
          videoId: 11,
          targetLanguage: "fr",
          previewStartSeconds: 120,
          expectedSpeakerCount: 3,
          manualVoiceReferences: [{ speaker: "SPEAKER_00", ranges: [{ start: 1, end: 4 }] }],
          rejectedVoiceReferences: [{ sourceStart: 10, sourceEnd: 14 }],
          regenerationTarget: "SPEAKER_01",
          voiceProfileChecksum: "a".repeat(64),
          models: { generationConfigHash: "b".repeat(64) },
        },
      },
      downloaded: {
        root,
        paths: {
          "source-audio": path.join(root, "source.wav"),
          "target-subtitle": path.join(root, "target.vtt"),
          "source-transcript": transcript,
          "voice-script": voiceScript,
        },
      },
      workspace: path.join(root, "runtime"),
    });

    expect(runtimeInput).toMatchObject({
      schemaVersion: 4,
      phase: "preview",
      regenerationTarget: "SPEAKER_01",
      manualVoiceReferences: [{ speaker: "SPEAKER_00", ranges: [{ start: 1, end: 4 }] }],
      voiceProfilePath: path.join(root, "previous-profile"),
      voiceProfileChecksum: "a".repeat(64),
    });
  });
});
