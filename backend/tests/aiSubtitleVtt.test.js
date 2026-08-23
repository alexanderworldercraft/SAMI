import { describe, expect, it } from "vitest";

import {
  buildWebVtt,
  normalizeAiSegments,
  normalizeEditedAiSegments,
  parseWebVtt,
} from "../services/aiSubtitles/vtt.js";

describe("publication WebVTT des sous-titres IA", () => {
  it("produit des cues WebVTT horodatés", () => {
    expect(buildWebVtt([
      { start: 1.25, end: 3.5, text: " Bonjour   tout le monde " },
    ])).toBe(
      "WEBVTT\n\n1\n00:00:01.250 --> 00:00:03.500\nBonjour tout le monde\n"
    );
  });

  it("rejette les segments vides ou inversés", () => {
    expect(() => normalizeAiSegments([{ start: 3, end: 2, text: "Erreur" }]))
      .toThrow(/segment IA 1/i);
  });

  it("neutralise les balises de cue inattendues", () => {
    const vtt = buildWebVtt([{ start: 0, end: 1, text: "<script>& test" }]);
    expect(vtt).toContain("&lt;script&gt;&amp; test");
  });

  it("relit les fichiers générés pour l'éditeur d'administration", () => {
    const segments = parseWebVtt(buildWebVtt([
      { start: 0.125, end: 1.5, text: "Un & deux" },
      { start: 2, end: 4.25, text: "Suite <corrigée>" },
    ]));

    expect(segments).toEqual([
      { start: 0.125, end: 1.5, text: "Un & deux" },
      { start: 2, end: 4.25, text: "Suite <corrigée>" },
    ]);
  });

  it("refuse les chevauchements créés par l'éditeur temporel", () => {
    expect(() => normalizeEditedAiSegments([
      { start: 0, end: 2, text: "Premier" },
      { start: 1.9, end: 3, text: "Second" },
    ])).toThrow(/chevauche/i);
  });
});
