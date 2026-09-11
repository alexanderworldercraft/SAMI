import { describe, expect, it } from "vitest";

import {
  AI_SUBTITLE_REPETITIVE_TRANSCRIPTION,
  analyzeAiTranscriptQuality,
  assertAiTranscriptQuality,
} from "../services/aiSubtitles/transcriptQuality.js";

const segments = (texts) => texts.map((text, index) => ({
  start: index * 2,
  end: (index * 2) + 1.5,
  text,
}));

describe("qualité des transcriptions IA", () => {
  it("accepte une transcription courte et variée", () => {
    const input = segments(Array.from({ length: 19 }, (_, index) => `Phrase ${index + 1}`));

    expect(assertAiTranscriptQuality(input)).toMatchObject({
      segmentCount: 19,
      uniqueCount: 19,
    });
  });

  it("refuse une phrase dominante comme celle détectée sur une longue vidéo", () => {
    const input = segments([
      ...Array.from({ length: 108 }, (_, index) => `Dialogue distinct ${index + 1}`),
      ...Array.from({ length: 673 }, () => "Je suis le chef de la police."),
    ]);

    expect(() => assertAiTranscriptQuality(input)).toThrowError(expect.objectContaining({
      name: "AiSubtitleQualityError",
      code: AI_SUBTITLE_REPETITIVE_TRANSCRIPTION,
      statusCode: 422,
      retryable: false,
    }));
  });

  it("refuse une boucle consécutive même si le reste du texte est varié", () => {
    const input = segments([
      ...Array.from({ length: 32 }, (_, index) => `Réplique ${index + 1}`),
      ...Array.from({ length: 8 }, () => "La même hallucination !"),
    ]);
    const analysis = analyzeAiTranscriptQuality(input);

    expect(analysis.maximumConsecutiveCount).toBe(8);
    expect(() => assertAiTranscriptQuality(input)).toThrow(/répétition anormale/i);
  });

  it("normalise la casse, les espaces et la ponctuation pour repérer les répétitions", () => {
    const input = segments([
      ...Array.from({ length: 20 }, (_, index) => `Texte unique ${index}`),
      ...Array.from({ length: 20 }, (_, index) => (
        index % 2 ? "  BONJOUR... LE MONDE ! " : "Bonjour, le monde"
      )),
    ]);

    expect(() => assertAiTranscriptQuality(input)).toThrow(/20 occurrences sur 40 segments/i);
  });
});
