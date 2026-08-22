import { describe, expect, it } from "vitest";

import { buildWebVtt, normalizeAiSegments } from "../services/aiSubtitles/vtt.js";

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
});
