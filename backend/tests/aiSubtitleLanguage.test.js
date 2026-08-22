import { describe, expect, it } from "vitest";

import {
  isFullFrenchSubtitle,
  normalizeAiLanguage,
  requireAiLanguage,
  subtitleTypeFromLabel,
  subtitleTypeFromStream,
} from "../services/aiSubtitles/language.js";

describe("langues des sous-titres IA", () => {
  it("normalise les codes historiques français", () => {
    expect(normalizeAiLanguage("fre")).toBe("fr");
    expect(normalizeAiLanguage("Français")).toBe("fr");
    expect(requireAiLanguage("jpn")).toBe("ja");
  });

  it("refuse une langue cible non proposée", () => {
    expect(() => requireAiLanguage("xx")).toThrow(/pas prise en charge/i);
  });

  it("distingue les pistes françaises forcées des sous-titres complets", () => {
    expect(subtitleTypeFromLabel("French (Forced)")).toBe("FORCED");
    expect(subtitleTypeFromStream({
      label: "Français",
      disposition: { forced: 1 },
    })).toBe("FORCED");
    expect(isFullFrenchSubtitle({ Label: "French (Forced)", Language: "fr" })).toBe(false);
    expect(isFullFrenchSubtitle({ Label: "Français SDH", Language: "fr", Type: "SDH" })).toBe(true);
  });
});
