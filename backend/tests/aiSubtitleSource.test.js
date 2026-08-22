import path from "path";

import { describe, expect, it } from "vitest";

import {
  getAiSubtitleSourcePaths,
  resolveAiSubtitleSource,
} from "../services/aiSubtitles/sourceService.js";

const config = { sourceRoot: path.resolve("var", "ai-subtitle-source-test") };
const jobId = "019c0000-0000-7000-8000-000000000042";

describe("sources audio des sous-titres IA", () => {
  it("utilise un WAV PCM commun à faster-whisper et whisper.cpp", () => {
    const paths = getAiSubtitleSourcePaths(jobId, config);
    expect(paths.audioPath).toBe(path.join(config.sourceRoot, jobId, "audio.wav"));
    expect(paths.relativePath).toBe(`${jobId}/audio.wav`);
  });

  it("refuse un chemin qui sort du stockage IA", () => {
    expect(() => resolveAiSubtitleSource("../secret.wav", config))
      .toThrow(/hors périmètre/i);
  });
});
