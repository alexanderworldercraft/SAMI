import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createWikimediaClient,
  normalizePersonName,
  parseCliArguments,
  personNameSimilarity,
  personDisplayName,
  selectCommonsImageCandidates,
  selectWikidataCandidate,
  validateImageBytes,
} from "../prisma/seedPersonneImages.js";

function entity({ id, name, image, occupations = ["Q33999"], description = "acteur français", sitelinks = 10 }) {
  return {
    id,
    labels: { fr: { value: name } },
    aliases: {},
    descriptions: { fr: { value: description } },
    claims: {
      P18: image ? [{ rank: "normal", mainsnak: { datavalue: { value: image } } }] : [],
      P31: [{ rank: "normal", mainsnak: { datavalue: { value: { id: "Q5" } } } }],
      P106: occupations.map((occupation) => ({ rank: "normal", mainsnak: { datavalue: { value: { id: occupation } } } })),
    },
    sitelinks: Object.fromEntries(Array.from({ length: sitelinks }, (_, index) => [`wiki${index}`, {}])),
  };
}

describe("seedPersonneImages", () => {
  it("normalise et affiche les identités de la base", () => {
    expect(normalizePersonName("Joëlle O’Hara")).toBe("joelle o hara");
    expect(personDisplayName({ Prenom: "Pedro", Nom: "Pascal", Surnom: null })).toBe("Pedro Pascal");
    expect(personDisplayName({ Prenom: "", Nom: "Zendaya", Surnom: null })).toBe("Zendaya");
  });

  it("analyse les options de limitation et protège la concurrence", () => {
    expect(parseCliArguments(["--dry-run", "--limit=20", "--person-id=42", "--concurrency=3"])).toEqual({
      dryRun: true,
      refresh: false,
      retryMisses: false,
      limit: 20,
      personId: 42,
      concurrency: 3,
    });
    expect(() => parseCliArguments(["--concurrency=8"])).toThrow("compris entre 1 et 4");
    expect(parseCliArguments(["--retry-misses"]).retryMisses).toBe(true);
  });

  it("tolère l’ordre inversé et les petites variantes de translittération", () => {
    expect(personNameSimilarity("Satomi Sato", "Sato Satomi")).toBeGreaterThanOrEqual(0.98);
    expect(personNameSimilarity("Shohei Ohtani", "Shohei Otani")).toBeGreaterThan(0.9);
  });

  it("fournit les identifiants Wikidata vérifiés depuis les distributions", () => {
    const mapping = JSON.parse(fs.readFileSync(new URL("../prisma/peopleWikidataIds.json", import.meta.url), "utf8"));
    expect(Object.keys(mapping.people).length).toBeGreaterThan(3000);
    expect(mapping.people["adam driver"]).toBe("Q4678990");
  });

  it("retient uniquement une personne exacte avec image et métier compatible", () => {
    const search = [{ id: "Q1" }, { id: "Q2" }];
    const entities = {
      Q1: entity({ id: "Q1", name: "Pedro Pascal", image: "Pedro Pascal.jpg", sitelinks: 20 }),
      Q2: entity({ id: "Q2", name: "Pedro Pascual", image: "Other.jpg", sitelinks: 20 }),
    };
    const result = selectWikidataCandidate("Pedro Pascal", search, entities, { actor: true, director: false });
    expect(result.status).toBe("matched");
    expect(result.candidate).toMatchObject({ wikidataId: "Q1", imageName: "Pedro Pascal.jpg" });
  });

  it("refuse de choisir automatiquement entre deux homonymes crédibles", () => {
    const search = [{ id: "Q1" }, { id: "Q2" }];
    const entities = {
      Q1: entity({ id: "Q1", name: "John Smith", image: "John Smith 1.jpg", sitelinks: 15 }),
      Q2: entity({ id: "Q2", name: "John Smith", image: "John Smith 2.jpg", sitelinks: 13 }),
    };
    const result = selectWikidataCandidate("John Smith", search, entities, { actor: true, director: false });
    expect(result.status).toBe("ambiguous");
    expect(result.candidates).toHaveLength(2);
  });

  it("distingue une identité trouvée sans photo d’une personne introuvable", () => {
    const search = [{ id: "Q1" }];
    const entities = { Q1: entity({ id: "Q1", name: "Satomi Sato", image: null }) };
    const result = selectWikidataCandidate("Sato Satomi", search, entities, { actor: true, director: false });
    expect(result.status).toBe("no-image");
    expect(result.candidate.wikidataId).toBe("Q1");
  });

  it("retient une photo Commons individuelle et écarte les groupes ou signatures", () => {
    const candidates = selectCommonsImageCandidates("Pedro Pascal", [
      { title: "File:Pedro Pascal and Grogu.jpg" },
      { title: "File:Pedro Pascal signature.png" },
      { title: "File:Pedro Pascal 2019.jpg" },
    ]);
    expect(candidates.map((candidate) => candidate.imageName)).toEqual(["Pedro Pascal 2019.jpg"]);
  });

  it("valide les signatures réelles plutôt que la seule extension", () => {
    expect(validateImageBytes(Buffer.from([0xff, 0xd8, 0xff, 0x00]), "image/jpeg")).toBe(true);
    expect(validateImageBytes(Buffer.from("not-an-image"), "image/jpeg")).toBe(false);
    expect(validateImageBytes(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png")).toBe(true);
  });

  it("exige un User-Agent Wikimedia avec contact", () => {
    expect(() => createWikimediaClient({ userAgent: "SAMI-bot/1.0" })).toThrow("WIKIMEDIA_USER_AGENT");
    expect(() => createWikimediaClient({ userAgent: "SAMI-image-import-bot/1.0 (mailto:admin@example.com)" })).not.toThrow();
  });
});
