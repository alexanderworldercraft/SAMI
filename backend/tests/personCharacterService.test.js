import { describe, expect, it, vi } from "vitest";
import { charactersToAppend, normalizeCharacters, replacePersonCharacters } from "../services/personCharacterService.js";

describe("personCharacterService", () => {
  it("normalise les espaces et déduplique sans changer l'orthographe du premier nom", () => {
    expect(normalizeCharacters(["  Dr  Jekyll ", "dr jekyll", "Héloïse", "HELOISE"])).toEqual(["Dr Jekyll", "Héloïse"]);
    expect(charactersToAppend([{ Nom: "Akeem", Position: 4 }], ["akeem", "Randy"]))
      .toEqual([{ Nom: "Randy", Position: 5 }]);
  });

  it.each([null, "Akeem", [""], [42], ["x".repeat(161)], Array(51).fill("Akeem")])("refuse les listes invalides", (value) => {
    expect(() => normalizeCharacters(value)).toThrow();
  });

  it.each(["video", "series"])("remplace atomiquement les personnages pour %s sans changer le lien acteur/réalisateur", async (type) => {
    const key = type === "video" ? "VideoPersonneID" : "SeriesPersonneID";
    const charactersDelegate = { deleteMany: vi.fn(), createMany: vi.fn() };
    const linkDelegate = { findFirst: vi.fn(async () => ({ [key]: 12, Personnages: [{ Nom: "Ancien" }] })) };
    const tx = {
      [type]: { findFirst: vi.fn(async () => ({ EtatID: 1 })) },
      [type === "video" ? "videoPersonne" : "seriesPersonne"]: linkDelegate,
      [type === "video" ? "videoPersonnage" : "seriesPersonnage"]: charactersDelegate,
    };
    const prisma = { $transaction: vi.fn(async (callback) => callback(tx)) };
    const result = await replacePersonCharacters(prisma, { personId: 7, type, contentId: 10, characters: ["Corrigé", "Autre"] });
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(linkDelegate.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ PersonneID: 7, EstActeur: true, Personne: { EtatID: 1 } }),
    }));
    expect(charactersDelegate.deleteMany).toHaveBeenCalledWith({ where: { [key]: 12 } });
    expect(charactersDelegate.createMany).toHaveBeenCalledWith({ data: [
      { [key]: 12, Nom: "Corrigé", Position: 0 }, { [key]: 12, Nom: "Autre", Position: 1 },
    ] });
    expect(result).toEqual({ Personnages: ["Corrigé", "Autre"], previous: ["Ancien"] });
    charactersDelegate.createMany.mockClear();
    await replacePersonCharacters(prisma, { personId: 7, type, contentId: 10, characters: [] });
    expect(charactersDelegate.createMany).not.toHaveBeenCalled();
  });

  it("refuse un film verrouillé et un lien absent avant toute écriture", async () => {
    const tx = { video: { findFirst: vi.fn(async () => ({ EtatID: 3 })) }, videoPersonne: { findFirst: vi.fn(async () => null) } };
    const prisma = { $transaction: async (callback) => callback(tx) };
    const args = { personId: 7, type: "video", contentId: 10, characters: [] };
    await expect(replacePersonCharacters(prisma, args)).rejects.toMatchObject({ statusCode: 409 });
    expect(tx.videoPersonne.findFirst).not.toHaveBeenCalled();
    tx.video.findFirst.mockResolvedValue({ EtatID: 1 });
    await expect(replacePersonCharacters(prisma, args)).rejects.toMatchObject({ statusCode: 404 });
  });
});
