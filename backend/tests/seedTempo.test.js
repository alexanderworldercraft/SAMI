import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyImportPlan,
  buildImportPlan,
  normalizePersonName,
  parseSemicolonCsv,
  splitPersonName,
} from "../prisma/seedTempo.js";

const __filename = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(__filename), "../..");

function createFakePrisma() {
  const state = {
    people: [{ PersonneID: 1, Prenom: "John", Nom: "Doe", Surnom: null, EtatID: 1 }],
    videos: [{ VideoID: 10 }],
    series: [{ SeriesID: 20 }],
    videoLinks: [{ VideoID: 10, PersonneID: 1, EstActeur: false, EstRealisateur: true }],
    seriesLinks: [],
  };

  const createLinkDelegate = (collection, idColumn) => ({
    findMany: async () => collection,
    createMany: async ({ data }) => {
      collection.push(...data);
      return { count: data.length };
    },
    updateMany: async ({ where, data }) => {
      let count = 0;
      for (const link of collection) {
        const selected = where.OR.some((candidate) => (
          candidate[idColumn] === link[idColumn] && candidate.PersonneID === link.PersonneID
        ));
        const roleColumn = Object.keys(data)[0];
        if (selected && link[roleColumn] === where[roleColumn]) {
          link[roleColumn] = data[roleColumn];
          count += 1;
        }
      }
      return { count };
    },
  });

  const tx = {
    video: { findMany: async () => state.videos },
    series: { findMany: async () => state.series },
    personne: {
      findMany: async () => state.people,
      createMany: async ({ data }) => {
        for (const person of data) {
          state.people.push({ ...person, PersonneID: state.people.length + 1 });
        }
        return { count: data.length };
      },
    },
    videoPersonne: createLinkDelegate(state.videoLinks, "VideoID"),
    seriesPersonne: createLinkDelegate(state.seriesLinks, "SeriesID"),
  };

  return {
    state,
    prisma: { $transaction: async (callback) => callback(tx) },
  };
}

describe("seedTempo", () => {
  it("lit les séparateurs, les guillemets et le BOM des CSV", () => {
    const rows = parseSemicolonCsv('\uFEFFA;B;C\r\n1;"Titre; étendu";"Nom ""public"""\r\n');
    expect(rows).toEqual([
      ["A", "B", "C"],
      ["1", "Titre; étendu", 'Nom "public"'],
    ]);
  });

  it("normalise les identités et sépare les noms composés", () => {
    expect(normalizePersonName("  Joëlle  O’Hara ")).toBe("joelle o hara");
    expect(splitPersonName("Guillermo del Toro")).toEqual({ Prenom: "Guillermo", Nom: "del Toro", Surnom: null });
    expect(splitPersonName("Robert Downey Jr.")).toEqual({ Prenom: "Robert", Nom: "Downey Jr.", Surnom: null });
    expect(splitPersonName("Zendaya")).toEqual({ Prenom: "", Nom: "Zendaya", Surnom: null });
  });

  it("valide et fusionne les six fichiers réels", async () => {
    const plan = await buildImportPlan({ repositoryRoot });
    expect(plan.sourceStats).toHaveLength(6);
    expect(plan.sourceStats.reduce((total, source) => total + source.rows, 0)).toBe(1682);
    expect(plan.videoIds).toHaveLength(623);
    expect(plan.seriesIds).toHaveLength(218);
    expect(plan.people.size).toBe(4497);
    expect(plan.links.size).toBe(7697);
  });

  it("crée les absents, complète les rôles et reste idempotent", async () => {
    const { prisma, state } = createFakePrisma();
    const johnKey = normalizePersonName("John Doe");
    const aliceKey = normalizePersonName("Alice Smith");
    const plan = {
      people: new Map([[johnKey, "John Doe"], [aliceKey, "Alice Smith"]]),
      links: new Map([
        [`video:10:${johnKey}`, {
          contentType: "video", contentId: 10, personKey: johnKey,
          displayName: "John Doe", EstActeur: true, EstRealisateur: true,
        }],
        [`series:20:${aliceKey}`, {
          contentType: "series", contentId: 20, personKey: aliceKey,
          displayName: "Alice Smith", EstActeur: true, EstRealisateur: false,
        }],
      ]),
      videoIds: [10],
      seriesIds: [20],
    };

    const first = await applyImportPlan(prisma, plan);
    expect(first.people).toEqual({ requested: 2, existing: 1, created: 1 });
    expect(first.videos).toMatchObject({ created: 0, updated: 1, actorsAdded: 1, directorsAdded: 0 });
    expect(first.series).toMatchObject({ created: 1, updated: 0 });
    expect(state.people).toHaveLength(2);
    expect(state.videoLinks[0]).toMatchObject({ EstActeur: true, EstRealisateur: true });
    expect(state.seriesLinks[0]).toMatchObject({ SeriesID: 20, PersonneID: 2, EstActeur: true });

    const second = await applyImportPlan(prisma, plan);
    expect(second.people).toEqual({ requested: 2, existing: 2, created: 0 });
    expect(second.videos).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(second.series).toMatchObject({ created: 0, updated: 0, unchanged: 1 });
    expect(state.people).toHaveLength(2);
    expect(state.videoLinks).toHaveLength(1);
    expect(state.seriesLinks).toHaveLength(1);
  });
});
