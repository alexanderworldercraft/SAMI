import { describe, expect, it } from "vitest";

import {
  calculatePersonSearchSimilarity,
  filterPeopleBySearch,
  getPersonSearchMatch,
  normalizePersonSearchText,
} from "../services/personSearchService.js";

const people = [
  { PersonneID: 1, Prenom: "Tom", Nom: "Hanks", Surnom: null },
  { PersonneID: 2, Prenom: "François", Nom: "Damiens", Surnom: null },
  { PersonneID: 3, Prenom: "Dwayne", Nom: "Johnson", Surnom: "The Rock" },
];

describe("personSearchService", () => {
  it("normalise les accents, apostrophes et séparateurs", () => {
    expect(normalizePersonSearchText("  François-O’Connor  ")).toBe("francois o connor");
  });

  it("retrouve une personne par prénom et nom complets dans les deux ordres", () => {
    expect(getPersonSearchMatch(people[0], "Tom Hanks")?.type).toBe("exact");
    expect(getPersonSearchMatch(people[0], "Hanks Tom")?.type).toBe("exact");
  });

  it("conserve les recherches par prénom, nom ou surnom", () => {
    expect(filterPeopleBySearch(people, "Tom")).toEqual([people[0]]);
    expect(filterPeopleBySearch(people, "Damiens")).toEqual([people[1]]);
    expect(filterPeopleBySearch(people, "the rock")).toEqual([people[2]]);
  });

  it("accepte une similarité d'au moins quatre-vingts pour cent", () => {
    expect(calculatePersonSearchSimilarity("Tom Hanks", "Tom Hanls")).toBeGreaterThan(0.8);
    expect(getPersonSearchMatch(people[0], "Tom Hanls")?.type).toBe("similar");
    expect(getPersonSearchMatch(people[0], "Hxnks")).toEqual({
      type: "similar",
      rank: 1,
      score: 0.8,
    });
  });

  it("écarte une personne sans rapport", () => {
    expect(getPersonSearchMatch(people[0], "Steven Spielberg")).toBeNull();
    expect(filterPeopleBySearch(people, "Steven Spielberg")).toEqual([]);
  });
});
