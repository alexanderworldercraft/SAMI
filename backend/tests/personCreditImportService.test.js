import { describe, expect, it } from "vitest";
import {
  importPeopleCredits,
  parsePeopleList,
  PersonCreditImportError,
} from "../services/personCreditImportService.js";

function createFakePrisma({ inactivePerson = false } = {}) {
  const state = {
    people: [{
      PersonneID: 1,
      Prenom: "Tom",
      Nom: "Hanks",
      Surnom: null,
      CheminImage: "uploads/people/1/photo.jpg",
      ImageStatut: "CUSTOM",
      EtatID: inactivePerson ? 2 : 1,
    }],
    videoLinks: [{ VideoID: 10, PersonneID: 1, EstActeur: false, EstRealisateur: true }],
    seriesLinks: [],
  };

  const linkDelegate = (collection, idColumn, uniqueColumn) => ({
    findUnique: async ({ where }) => {
      const key = where[uniqueColumn];
      return collection.find((link) => (
        link[idColumn] === key[idColumn] && link.PersonneID === key.PersonneID
      )) ?? null;
    },
    create: async ({ data }) => {
      collection.push({ ...data });
      return data;
    },
    update: async ({ where, data }) => {
      const key = where[uniqueColumn];
      const link = collection.find((item) => (
        item[idColumn] === key[idColumn] && item.PersonneID === key.PersonneID
      ));
      Object.assign(link, data);
      return link;
    },
  });

  const tx = {
    video: {
      findFirst: async ({ where }) => (
        where.VideoID === 10 && where.SaisonID === null
          ? { VideoID: 10, Titre: "Le Terminal", EtatID: 1 }
          : null
      ),
    },
    series: {
      findFirst: async ({ where }) => (
        where.SeriesID === 20 ? { SeriesID: 20, Titre: "Série test" } : null
      ),
    },
    personne: {
      findMany: async () => state.people,
      create: async ({ data }) => {
        const person = { ...data, PersonneID: state.people.length + 1 };
        state.people.push(person);
        return person;
      },
    },
    videoPersonne: linkDelegate(state.videoLinks, "VideoID", "VideoID_PersonneID"),
    seriesPersonne: linkDelegate(state.seriesLinks, "SeriesID", "SeriesID_PersonneID"),
  };

  return {
    state,
    prisma: { $transaction: async (callback) => callback(tx) },
  };
}

describe("personCreditImportService", () => {
  it("accepte les séparateurs | et retour à la ligne puis retire les doublons", () => {
    const parsed = parsePeopleList("Tom Hanks | Catherine Zeta-Jones\nTom Hanks");

    expect(parsed.people.map((person) => person.displayName)).toEqual([
      "Tom Hanks",
      "Catherine Zeta-Jones",
    ]);
    expect(parsed.duplicateCount).toBe(1);
  });

  it("réutilise les personnes, crée les absentes et complète le rôle sans effacer l'autre", async () => {
    const { prisma, state } = createFakePrisma();
    const result = await importPeopleCredits({
      prisma,
      type: "video",
      contentId: 10,
      role: "actor",
      names: "Tom Hanks | Catherine Zeta-Jones",
    });

    expect(result.summary).toEqual({
      requested: 2,
      peopleCreated: 1,
      peopleExisting: 1,
      linksCreated: 1,
      linksUpdated: 1,
      linksUnchanged: 0,
    });
    expect(state.people[1]).toMatchObject({ Prenom: "Catherine", Nom: "Zeta-Jones", EtatID: 1 });
    expect(state.videoLinks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        VideoID: 10,
        PersonneID: 1,
        EstActeur: true,
        EstRealisateur: true,
      }),
      expect.objectContaining({
        VideoID: 10,
        PersonneID: 2,
        EstActeur: true,
        EstRealisateur: false,
      }),
    ]));
  });

  it("refuse de recréer une personne présente dans la corbeille", async () => {
    const { prisma } = createFakePrisma({ inactivePerson: true });

    await expect(importPeopleCredits({
      prisma,
      type: "series",
      contentId: 20,
      role: "director",
      names: "Tom Hanks",
    })).rejects.toMatchObject({
      code: "INACTIVE_DATABASE_PERSON",
      statusCode: 409,
    });
  });

  it("valide le contenu, le rôle et la liste avant toute écriture", async () => {
    const { prisma } = createFakePrisma();

    await expect(importPeopleCredits({
      prisma,
      type: "video",
      contentId: 999,
      role: "actor",
      names: "Tom Hanks",
    })).rejects.toBeInstanceOf(PersonCreditImportError);
    await expect(importPeopleCredits({
      prisma,
      type: "video",
      contentId: 10,
      role: "producer",
      names: "Tom Hanks",
    })).rejects.toMatchObject({ statusCode: 400 });
  });
});
