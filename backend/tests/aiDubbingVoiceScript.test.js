import { describe, expect, it } from "vitest";

import { buildAiDubbingVoiceScript } from "../services/aiDubbing/sourceService.js";

describe("script vocal de doublage IA", () => {
  it("sépare le texte affiché du texte prononcé et conserve la preuve source", () => {
    const script = buildAiDubbingVoiceScript({
      targetSegments: [
        { start: 10, end: 12, text: "Bonjour tout le monde." },
        { start: 12.1, end: 13, text: "Ça va ?" },
      ],
      sourceTranscript: {
        SourceLanguage: "fr",
        Segments: [
          {
            start: 9.9,
            end: 12.05,
            text: "Bonjour tout le monde.",
            confidence: 0.91,
          },
          {
            start: 12.1,
            end: 13,
            text: "Ça va ?",
            words: [
              { start: 12.1, end: 12.4, text: "Ça", confidence: 0.8 },
              { start: 12.4, end: 13, text: "va", confidence: 0.6 },
            ],
          },
        ],
      },
    });

    expect(script).toMatchObject({
      schemaVersion: 2,
      sourceLanguage: "fr",
      cueCount: 2,
      cues: [
        {
          displayText: "Bonjour tout le monde.",
          spokenText: "Bonjour tout le monde.",
          sourceText: "Bonjour tout le monde.",
          sourceConfidence: 0.91,
        },
        {
          displayText: "Ça va ?",
          spokenText: "Ça va ?",
          sourceText: "Ça va ?",
          sourceConfidence: 0.7,
          speechStart: 12.1,
          speechEnd: 13,
          sourceWords: [
            { start: 12.1, end: 12.4, text: "Ça", confidence: 0.8 },
            { start: 12.4, end: 13, text: "va", confidence: 0.6 },
          ],
        },
      ],
    });
  });

  it("signale une réplique sans preuve audio/transcript associée", () => {
    const script = buildAiDubbingVoiceScript({
      targetSegments: [{ start: 2, end: 2.2, text: "Test" }],
      sourceTranscript: { SourceLanguage: "fr", Segments: [] },
    });

    expect(script.warningCount).toBe(1);
    expect(script.cues[0].flags).toEqual([
      "missing_source_evidence",
      "very_short_voice_window",
    ]);
  });

  it("ancre le script parlé sur les mots sans avancer la voix avec le bloc affiché", () => {
    const script = buildAiDubbingVoiceScript({
      targetSegments: [{ start: 60.19, end: 64.22, text: "Allez, cinquante-cinq !" }],
      sourceTranscript: {
        SourceLanguage: "fr",
        Segments: [{
          start: 60.19,
          end: 64.22,
          text: "Allez, cinquante-cinq !",
          words: [
            { start: 62.69, end: 63.02, text: "Allez," },
            { start: 63.04, end: 63.62, text: "cinquante-cinq !" },
          ],
        }],
      },
    });

    expect(script.cues[0]).toMatchObject({
      start: 60.19,
      end: 64.22,
      speechStart: 62.69,
      speechEnd: 63.62,
    });
  });
});
