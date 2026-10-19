import { describe, expect, it } from "vitest";
import { normalizeAlternativeTitles } from "../services/alternativeTitles.js";
import { getContentTitleSearchMatch } from "../services/video/videoSearchService.js";

describe("titres alternatifs", () => {
  it("nettoie les espaces, les doublons et les séparateurs vides", () => {
    expect(normalizeAlternativeTitles(" | Mégalodon || En eau trouble | Mégalodon | "))
      .toBe("Mégalodon | En eau trouble");
  });
  it.each([undefined, null, "", "  ", " | | "])("stocke une valeur vide en null : %s", (value) => {
    expect(normalizeAlternativeTitles(value)).toBeNull();
  });
  it.each([[], {}, 12, "a".repeat(10001)])("rejette les valeurs invalides", (value) => {
    expect(() => normalizeAlternativeTitles(value)).toThrow();
  });
  it("garde la meilleure correspondance parmi tous les titres", () => {
    expect(getContentTitleSearchMatch({ Titre: "The Meg 2", TitreAlternatif: "The Meg | Mégalodon" }, "the meg"))
      .toMatchObject({ type: "exact", rank: 3 });
  });
  it("ne fait pas correspondre une phrase à cheval sur plusieurs titres", () => {
    expect(getContentTitleSearchMatch({ Titre: "The Meg", TitreAlternatif: "Mégalodon | En eau trouble" }, "mégalodon en eau trouble"))
      .toBeNull();
  });
});
