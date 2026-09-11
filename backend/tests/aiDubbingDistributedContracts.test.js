import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { validateAiDubbingArtifactManifest } from "../services/aiDubbing/artifactService.js";
import {
  AI_DUBBING_GENERATION_CONFIG,
  AI_DUBBING_GENERATION_CONFIG_HASH,
  getAiDubbingGenerationConfig,
  getAiDubbingGenerationConfigHash,
} from "../services/aiDubbing/generationConfig.js";
import {
  aiDubbingWorkerMatchesJob,
  prepareNextAiDubbingInput,
} from "../services/aiDubbing/leaseService.js";

const digest = "a".repeat(64);
const profileHash = getAiDubbingGenerationConfigHash("sami-dubbing-v5-aligned-quality");
const worker = {
  Engine: "qwen3-tts",
  Model: "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
  ModelRevision: "checkpoint-1",
  PipelineVersion: "sami-dubbing-v5-aligned-quality",
  Capabilities: {
    languages: ["en", "fr", "ja"],
    profile: { generationConfigHash: profileHash },
  },
};
const job = {
  VoiceEngine: worker.Engine,
  VoiceModel: worker.Model,
  VoiceModelRevision: worker.ModelRevision,
  PipelineVersion: worker.PipelineVersion,
  GenerationConfigHash: profileHash,
  TargetLanguage: "fr",
};

describe("contrats du doublage IA distribué", () => {
  it("utilise le NULL SQL explicite de Prisma pour chercher les entrées à préparer", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await expect(prepareNextAiDubbingInput({
      database: { aiDubbingJob: { findMany } },
      config: { role: "PRIMARY" },
    })).resolves.toBeNull();
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        InputManifest: { equals: Prisma.DbNull },
      }),
    }));
  });

  it("n'attribue un job qu'au moteur, checkpoint, pipeline et langage exacts", () => {
    expect(aiDubbingWorkerMatchesJob(worker, job)).toBe(true);
    expect(aiDubbingWorkerMatchesJob({ ...worker, ModelRevision: "checkpoint-2" }, job)).toBe(false);
    expect(aiDubbingWorkerMatchesJob({ ...worker, PipelineVersion: "ancien-pipeline" }, job)).toBe(false);
    expect(aiDubbingWorkerMatchesJob({
      ...worker,
      Capabilities: {
        ...worker.Capabilities,
        profile: { generationConfigHash: "b".repeat(64) },
      },
    }, job)).toBe(false);
    expect(aiDubbingWorkerMatchesJob({ ...worker, Capabilities: { languages: ["en"] } }, job)).toBe(false);
  });

  it("verrouille les paramètres de génération dans une empreinte SHA-256", () => {
    expect(AI_DUBBING_GENERATION_CONFIG).toMatchObject({
      schemaVersion: 18,
      seedPolicy: "speaker-reference-stable-retry-v3",
      voiceProfileRegeneration: "target-only-preserve-other-speakers-v1",
      dialogueSource: "validated-word-timed-spoken-script-v2",
      mixArchitecture: "background-plus-per-speaker-stems-v1",
      referencePromptPolicy: "single-sentence-refined-speaker-consensus-v5",
      dialogueUnitPolicy: "lexical-word-speaker-hybrid-v6",
      sourceTokenPolicy: "lexical-only-attach-punctuation-v1",
      shortGenerationPolicy: "qwen-greedy-then-ranked-seeded-retries-v2",
      shortDialogueMergePolicy: "same-speaker-or-punctuation-continuation-v1",
      shortUtterancePolicy: "accept-from-40ms-with-quality-reported-spillover-v1",
      dialogueSegmentation: {
        minimumUnitSeconds: 0.25,
        minimumMergePartSeconds: 0.75,
        shortSpeakerIslandSeconds: 0.5,
        shortSpeakerNeighborGapSeconds: 1,
        splitSubtitleAtDiarizationBoundary: true,
        preserveDisplaySubtitleBlocks: true,
        preferPunctuationBoundaries: true,
        wordTimedSpeakerAssignment: true,
        mergeShortSameSpeakerClauses: true,
        mergeShortPunctuationContinuations: true,
        maximumShortContinuationSeconds: 0.6,
      },
      hybridSpeakerAssignment: {
        referenceTurns: "sortformer-refined-global",
        baseUncertainCoverage: 0.55,
        baseUncertainMargin: 0.2,
        refinedMinimumCoverage: 0.55,
        refinedMinimumMargin: 0.25,
        refinedDecisiveCoverage: 0.75,
        refinedDecisiveMargin: 0.5,
        allowConfidentRefinedOverride: true,
      },
      voiceTiming: {
        strategy: "subtitle-start-source-end-v4",
        maxSourceSilenceExtensionSeconds: 1,
        preserveSubtitleDisplayTiming: true,
        neverStartBeforeSubtitle: true,
        useDetectedSpeechOnsetWhenLater: true,
        minimumDetectedOnsetWindowSeconds: 0.25,
        maximumDetectedOnsetDelaySeconds: 0.25,
        keepSubtitleStartWhenSpeakerAlreadyActive: true,
        fallbackToValidatedSubtitleStart: true,
        capAtAdjacentDialogueUnits: true,
        minimumAcceleration: 1,
        maximumAcceleration: 1.3,
        trimGeneratedLeadingSilence: true,
        edgeFadeInMs: 8,
        edgeFadeOutMs: 35,
      },
      qualityControl: {
        maxAcceleration: 1.3,
        maxVoiceTailSpilloverSeconds: 1,
        maxTimingBoundaryTrimSeconds: 0.02,
        shortMismatchPolicy: "immediate-acoustic-evidence-warning-v3",
        shortAsrMaxWordsPerSecond: 7.5,
        shortAsrMaxCharactersPerSecond: 30,
        shortAcousticEvidence: {
          minimumDurationSeconds: 0.04,
          minimumPeakDbfs: -40,
          minimumRmsDbfs: -50,
          activeFrameDbfs: -45,
        },
      },
      qwen3Tts: {
        shortUtteranceDoSample: false,
        shortRetryDoSample: true,
        shortRetryTemperatures: [0.35, 0.45],
        shortRetryTopP: [0.75, 0.8],
        selectBestShortAttempt: true,
      },
    });
    expect(AI_DUBBING_GENERATION_CONFIG_HASH).toMatch(/^[a-f0-9]{64}$/);
    expect(getAiDubbingGenerationConfig("sami-dubbing-v5-aligned-quality")).toMatchObject({
      schemaVersion: 2,
      seedPolicy: "speaker-stable-retry-v2",
      referencePromptPolicy: "speaker-pure-transcript-aligned-v2",
      dialogueUnitPolicy: "speaker-boundary-merge-v1",
      qualityControl: { maxAcceleration: 1.5 },
    });
    expect(profileHash).toBe("dbe8d8fb553ca099f099bd3c4891125c472509ad0ea05e0c34ceebbe2008ac80");
    expect(profileHash).not.toBe(AI_DUBBING_GENERATION_CONFIG_HASH);
    const corrected = getAiDubbingGenerationConfig("sami-dubbing-v5-stable-boundaries-r1");
    const historical = getAiDubbingGenerationConfig("sami-dubbing-v5-aligned-quality");
    expect(corrected.qwen3Tts).toEqual(historical.qwen3Tts);
    expect(corrected.qualityControl).toEqual(historical.qualityControl);
    expect(corrected.referencePromptPolicy).toBe(historical.referencePromptPolicy);
    expect(corrected.dialogueSegmentation).toMatchObject({
      minimumSplitPieceSeconds: 0.12, preserveStandaloneShortCues: true,
      preserveSubtitleBounds: true, globalSpeakerSmoothing: false,
    });
    expect(getAiDubbingGenerationConfigHash("sami-dubbing-v5-stable-boundaries-r1"))
      .toBe("d9b8559b4c019e83e5e1cbe2f8529e2ece8a42325d94058a9ed56db21f4936fc");
    const r2 = getAiDubbingGenerationConfig("sami-dubbing-v5-aligned-sentences-r2");
    expect(r2.qwen3Tts).toEqual(historical.qwen3Tts);
    expect(r2.qualityControl).toEqual(historical.qualityControl);
    expect(r2.sentenceBoundaryRepair).toMatchObject({ requireExactSourceText: true, requireBoundaryInsideFirstWord: true });
    expect(getAiDubbingGenerationConfigHash("sami-dubbing-v5-aligned-sentences-r2"))
      .toBe("acdd393d8be4d19d26a91b85c915602dcafbc81fd6f473ab61539c1c8eafcfd3");
    const r3 = getAiDubbingGenerationConfig("sami-dubbing-v5-flexible-tails-r3");
    expect(r3.qwen3Tts).toEqual(historical.qwen3Tts);
    expect(r3.qualityControl).toEqual(historical.qualityControl);
    expect(r3.voiceTiming).toMatchObject({ maximumAcceleration: 1.5, preferOriginalWindow: true, preserveFollowingCueStarts: true, allowDialogueOverlap: true });
    expect(getAiDubbingGenerationConfigHash("sami-dubbing-v5-flexible-tails-r3"))
      .toBe("b63843015ecdf8cc000714df5bcaa7415bf1788475d61cd43bb4beb36efc60a4");
  });

  it("exige une référence et un échantillon watermarqué par voix dans l'aperçu", () => {
    const valid = {
      schemaVersion: 1,
      phase: "preview",
      files: [
        { id: "audio", kind: "audio", size: 10, sha256: digest },
        { id: "profile", kind: "profile-manifest", size: 10, sha256: digest },
        { id: "reference-1", kind: "profile-reference", speaker: "SPEAKER_00", size: 10, sha256: digest },
        { id: "sample-1", kind: "voice-sample", speaker: "SPEAKER_00", size: 10, sha256: digest },
      ],
    };
    expect(validateAiDubbingArtifactManifest(valid, "preview").manifest.files).toHaveLength(4);
    expect(() => validateAiDubbingArtifactManifest({
      ...valid,
      files: valid.files.filter((file) => file.kind !== "voice-sample"),
    }, "preview")).toThrow(/référence et un échantillon/i);
  });
});
