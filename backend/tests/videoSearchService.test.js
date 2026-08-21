import { describe, expect, it } from "vitest";

import {
  calculateVideoTitleSimilarity,
  getVideoContentSearchMatch,
  getVideoTitleSearchMatch,
  normalizeVideoSearchText,
  VIDEO_TITLE_SIMILARITY_THRESHOLD,
} from "../services/video/videoSearchService.js";

describe("videoSearchService", () => {
  it("normalise les accents, les tirets et les espaces", () => {
    expect(normalizeVideoSearchText("  Spider-Man : Élégance  ")).toBe(
      "spider man elegance"
    );
  });

  it("considère Spider-Man comme une correspondance exacte pour spider man", () => {
    expect(getVideoTitleSearchMatch("Spider-Man", "spider man")).toEqual({
      type: "exact",
      rank: 3,
      score: 1,
    });
  });

  it("retrouve une faute proche à au moins 80 pour cent dans un titre plus long", () => {
    const match = getVideoTitleSearchMatch("The Amazing Spider-Man", "spidr man");

    expect(match).toMatchObject({ type: "similar", rank: 1 });
    expect(match.score).toBeGreaterThanOrEqual(VIDEO_TITLE_SIMILARITY_THRESHOLD);
  });

  it("accepte exactement le seuil de similitude et rejette les titres sans rapport", () => {
    expect(calculateVideoTitleSimilarity("abcde", "abfde")).toBe(0.8);
    expect(getVideoTitleSearchMatch("abcde", "abfde")).not.toBeNull();
    expect(getVideoTitleSearchMatch("Batman", "spider man")).toBeNull();
  });

  it("conserve la recherche exacte historique dans le résumé en dernier recours", () => {
    expect(
      getVideoContentSearchMatch(
        { Titre: "Un autre film", Resumer: "Peter Parker devient Spider-Man." },
        "Peter Parker"
      )
    ).toEqual({ type: "summary", rank: 0, score: 1 });
  });
});

