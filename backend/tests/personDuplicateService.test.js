import { beforeEach, describe, expect, it, vi } from "vitest";
import { ETAT } from "../constants.js";
import {
  findPotentialDuplicatePairs,
  identitySimilarity,
  mergeDuplicatePeople,
  reviewDuplicatePair,
} from "../services/personDuplicateService.js";

const person = (PersonneID, Prenom, Nom, overrides = {}) => ({
  PersonneID,
  Prenom,
  Nom,
  Surnom: null,
  CheminImage: null,
  ImageStatut: "DEFAULT",
  EtatID: ETAT.ACTIVE,
  _count: { Videos: 0, Series: 0 },
  ...overrides,
});

describe("personDuplicateService - détection", () => {
  it("rapproche les variantes accentuées et translittérées d'un même prénom", () => {
    const people = [
      person(1, "Yuki", "Belge"),
      person(2, "Yuūki", "Belge"),
      person(3, "Yuuki", "Belge"),
      person(4, "Paul", "Belge"),
    ];

    const pairs = findPotentialDuplicatePairs(people);

    expect(identitySimilarity("Yuūki", "Yuuki")).toBe(1);
    expect(pairs.map((pair) => pair.key)).toEqual(["2:3", "1:2", "1:3"]);
    expect(pairs.every((pair) => pair.personA.Prenom !== "Paul" && pair.personB.Prenom !== "Paul")).toBe(true);
  });

  it("rapproche Yūki et Yuuki comme noms lorsque le prénom est identique", () => {
    const pairs = findPotentialDuplicatePairs([
      person(10, "Aoi", "Yūki"),
      person(11, "Aoi", "Yuuki"),
      person(12, "Aoi", "Suzuki"),
    ]);

    expect(pairs).toEqual([
      expect.objectContaining({
        key: "10:11",
        status: "new",
        score: 90,
        firstNameScore: 100,
        lastNameScore: 80,
      }),
    ]);
  });

  it("masque les paires déclarées différentes et conserve les doutes", () => {
    const people = [person(8, "Yuki", "Belge"), person(3, "Yuuki", "Belge")];

    expect(findPotentialDuplicatePairs(people, [{
      PersonneAID: 3,
      PersonneBID: 8,
      Decision: "DISTINCT",
    }])).toEqual([]);

    expect(findPotentialDuplicatePairs(people, [{
      PersonneAID: 3,
      PersonneBID: 8,
      Decision: "DOUBT",
    }])).toEqual([
      expect.objectContaining({ key: "3:8", status: "doubt" }),
    ]);
  });
});

describe("personDuplicateService - décisions", () => {
  let prisma;

  beforeEach(() => {
    prisma = {
      personne: { findMany: vi.fn() },
      personDuplicateReview: { upsert: vi.fn() },
    };
    prisma.personne.findMany.mockResolvedValue([{ PersonneID: 2 }, { PersonneID: 9 }]);
    prisma.personDuplicateReview.upsert.mockResolvedValue({ Decision: "DOUBT" });
  });

  it("enregistre une paire dans un ordre canonique", async () => {
    await reviewDuplicatePair(prisma, {
      personAId: 9,
      personBId: 2,
      decision: "doubt",
      reviewedById: 1,
    });

    expect(prisma.personDuplicateReview.upsert).toHaveBeenCalledWith({
      where: { PersonneAID_PersonneBID: { PersonneAID: 2, PersonneBID: 9 } },
      create: {
        PersonneAID: 2,
        PersonneBID: 9,
        Decision: "DOUBT",
        MergedPersonneID: null,
        ReviewedByID: 1,
      },
      update: { Decision: "DOUBT", MergedPersonneID: null, ReviewedByID: 1 },
    });
  });
});

describe("personDuplicateService - fusion", () => {
  it("transfère les liens et réunit les rôles avant de placer la fiche secondaire dans la corbeille", async () => {
    const videoLinks = [
      { VideoPersonneID: 101, VideoID: 10, PersonneID: 1, EstActeur: true, EstRealisateur: false },
      { VideoPersonneID: 102, VideoID: 10, PersonneID: 2, EstActeur: false, EstRealisateur: true },
      { VideoPersonneID: 103, VideoID: 20, PersonneID: 2, EstActeur: true, EstRealisateur: false },
    ];
    const seriesLinks = [
      { SeriesPersonneID: 201, SeriesID: 30, PersonneID: 2, EstActeur: false, EstRealisateur: true },
    ];
    const createLinkDelegate = (links, primaryKey) => ({
      findMany: vi.fn(async () => links.map((link) => ({ ...link }))),
      update: vi.fn(async ({ where, data }) => {
        const link = links.find((item) => item[primaryKey] === where[primaryKey]);
        Object.assign(link, data);
        return link;
      }),
      delete: vi.fn(async ({ where }) => {
        const index = links.findIndex((item) => item[primaryKey] === where[primaryKey]);
        return links.splice(index, 1)[0];
      }),
    });
    const tx = {
      videoPersonne: createLinkDelegate(videoLinks, "VideoPersonneID"),
      seriesPersonne: createLinkDelegate(seriesLinks, "SeriesPersonneID"),
      personne: { update: vi.fn() },
      personDuplicateReview: { deleteMany: vi.fn(), upsert: vi.fn() },
    };
    const prisma = {
      personne: {
        findMany: vi.fn().mockResolvedValue([
          person(1, "Yuki", "Belge"),
          person(2, "Yuuki", "Belge"),
        ]),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    };

    const result = await mergeDuplicatePeople(prisma, {
      keepPersonId: 1,
      mergePersonId: 2,
      reviewedById: 7,
    });

    expect(videoLinks).toEqual([
      expect.objectContaining({
        VideoPersonneID: 101,
        PersonneID: 1,
        EstActeur: true,
        EstRealisateur: true,
      }),
      expect.objectContaining({ VideoPersonneID: 103, PersonneID: 1 }),
    ]);
    expect(seriesLinks).toEqual([
      expect.objectContaining({ SeriesPersonneID: 201, PersonneID: 1 }),
    ]);
    expect(tx.personne.update).toHaveBeenCalledWith({
      where: { PersonneID: 2 },
      data: { EtatID: ETAT.DELETED },
    });
    expect(tx.personDuplicateReview.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        Decision: "MERGED",
        MergedPersonneID: 2,
        ReviewedByID: 7,
      }),
    }));
    expect(result).toEqual(expect.objectContaining({
      keptPersonId: 1,
      mergedPersonId: 2,
      photoTransferred: false,
      videoLinks: { moved: 1, combined: 1 },
      seriesLinks: { moved: 1, combined: 0 },
    }));
  });
});
