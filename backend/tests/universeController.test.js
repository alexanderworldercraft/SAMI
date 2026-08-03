import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/db.js", () => ({
  prisma: {
    $transaction: vi.fn(async (operations) => Promise.all(operations)),
    utilisateur: { findUnique: vi.fn() },
    universe: { findFirst: vi.fn(), findMany: vi.fn() },
    saga: { findMany: vi.fn() },
    universeSaga: { aggregate: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    universeContent: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    video: { findFirst: vi.fn() },
    series: { findFirst: vi.fn() },
  },
}));

import {
  addUniverseContent,
  formatUniverseContent,
  getUniverses,
  sortUniverseItems,
  updateUniverseItemsOrder,
} from "../controllers/universeController.js";
import { prisma } from "../services/db.js";

const createReply = () => {
  const reply = {
    code: vi.fn(),
    send: vi.fn(),
    status: vi.fn(),
  };
  reply.code.mockReturnValue(reply);
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
};

describe("universeController - contenus mixtes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.utilisateur.findUnique.mockResolvedValue({ GradeID: 2 });
    prisma.universe.findFirst.mockResolvedValue({ UniverseID: 12 });
    prisma.universeContent.findFirst.mockResolvedValue(null);
    prisma.universeSaga.aggregate.mockResolvedValue({ _max: { Ordre: 4 } });
    prisma.universeContent.aggregate.mockResolvedValue({ _max: { Ordre: 7 } });
  });

  it("fusionne les sagas et contenus selon un ordre unique", () => {
    expect(sortUniverseItems([
      { UniverseItemKey: "content:8", Ordre: 2 },
      { UniverseItemKey: "saga:3", Ordre: 1 },
      { UniverseItemKey: "content:7", Ordre: 1 },
    ])).toEqual([
      { UniverseItemKey: "content:7", Ordre: 1 },
      { UniverseItemKey: "saga:3", Ordre: 1 },
      { UniverseItemKey: "content:8", Ordre: 2 },
    ]);
  });

  it("normalise un film autonome pour VideoList", () => {
    expect(formatUniverseContent({
      UniverseContentID: 9,
      Ordre: 5,
      Video: {
        VideoID: 42,
        Titre: "Rogue One",
        Resumer: "A Star Wars Story",
        CheminImage: "rogue-one.webp",
        CreateDate: new Date("2026-08-03T12:00:00.000Z"),
        EtatID: 1,
        SaisonID: null,
        Premium: true,
        VideoGenres: [{ Genre: { Nom: "Science-fiction" } }],
      },
      Series: null,
    })).toMatchObject({
      UniverseContentID: 9,
      UniverseItemKey: "content:9",
      UniverseItemType: "content",
      Ordre: 5,
      id: 42,
      VideoID: 42,
      type: "video",
      Titre: "Rogue One",
      Premium: true,
      Genres: ["Science-fiction"],
    });
  });

  it("publie un univers contenant uniquement une série et garde l'univers par défaut limité aux sagas", async () => {
    prisma.universe.findMany.mockResolvedValue([{
      UniverseID: 12,
      Titre: "Star Wars",
      Resume: "Une galaxie lointaine",
      EtatID: 1,
      CreateDate: null,
      UniverseSagas: [],
      UniverseContents: [{
        UniverseContentID: 15,
        Ordre: 1,
        Video: null,
        Series: {
          SeriesID: 6,
          Titre: "The Mandalorian",
          Resumer: "",
          CheminImage: "mandalorian.webp",
          CreateDate: null,
          EtatID: 1,
          Premium: false,
          SeriesGenres: [],
          Saisons: [],
        },
      }],
    }]);
    prisma.saga.findMany.mockResolvedValue([{
      SagaID: 3,
      Titre: "Saga sans univers",
      Resumer: "",
      CheminImage: "saga.webp",
      EtatID: 1,
      Premium: false,
      CreateDate: null,
    }]);
    const reply = createReply();

    await getUniverses({ query: {} }, reply);

    const payload = reply.send.mock.calls[0][0];
    expect(payload.items[0]).toMatchObject({
      UniverseID: 12,
      Items: [{ type: "series", Titre: "The Mandalorian" }],
      Sagas: [],
    });
    expect(payload.items[1]).toMatchObject({
      UniverseID: 0,
      Titre: "Univers par défaut",
      Items: [{ type: "saga", Titre: "Saga sans univers" }],
    });
    expect(payload.items[1].Items.every((item) => item.type === "saga")).toBe(true);
  });

  it("ajoute un film directement sans vérifier ses appartenances aux sagas", async () => {
    prisma.video.findFirst.mockResolvedValue({ VideoID: 42 });
    prisma.universeContent.create.mockResolvedValue({
      UniverseContentID: 9,
      Ordre: 8,
      Video: {
        VideoID: 42,
        Titre: "Rogue One",
        Resumer: "",
        CheminImage: "rogue-one.webp",
        CreateDate: null,
        EtatID: 1,
        SaisonID: null,
        Premium: false,
        VideoGenres: [],
      },
      Series: null,
    });
    const reply = createReply();

    await addUniverseContent({
      user: { userId: 3 },
      params: { id: "12" },
      body: { type: "video", id: 42 },
    }, reply);

    expect(prisma.video.findFirst).toHaveBeenCalledWith({
      where: { VideoID: 42, EtatID: 1, SaisonID: null },
      select: { VideoID: true },
    });
    expect(prisma.universeContent.findFirst).toHaveBeenCalledWith({
      where: { UniverseID: 12, VideoID: 42 },
      select: { UniverseContentID: true },
    });
    expect(prisma.universeContent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        UniverseID: 12,
        VideoID: 42,
        SeriesID: null,
        Ordre: 8,
      },
    }));
    expect(reply.status).toHaveBeenCalledWith(201);
  });

  it("refuse les épisodes individuels", async () => {
    prisma.video.findFirst.mockResolvedValue(null);
    const reply = createReply();

    await addUniverseContent({
      user: { userId: 3 },
      params: { id: "12" },
      body: { type: "video", id: 99 },
    }, reply);

    expect(reply.status).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Film introuvable ou vidéo non autonome.",
    });
    expect(prisma.universeContent.create).not.toHaveBeenCalled();
  });

  it("refuse uniquement le doublon direct dans le même univers", async () => {
    prisma.series.findFirst.mockResolvedValue({ SeriesID: 6 });
    prisma.universeContent.findFirst.mockResolvedValue({ UniverseContentID: 33 });
    const reply = createReply();

    await addUniverseContent({
      user: { userId: 3 },
      params: { id: "12" },
      body: { type: "series", id: 6 },
    }, reply);

    expect(prisma.universeContent.findFirst).toHaveBeenCalledWith({
      where: { UniverseID: 12, SeriesID: 6 },
      select: { UniverseContentID: true },
    });
    expect(reply.status).toHaveBeenCalledWith(409);
    expect(prisma.universeContent.create).not.toHaveBeenCalled();
  });

  it("enregistre dans une transaction l'ordre commun d'une saga et d'un film", async () => {
    prisma.universeSaga.findMany.mockResolvedValue([{ UniverseSagaID: 5 }]);
    prisma.universeContent.findMany.mockResolvedValue([{ UniverseContentID: 9 }]);
    prisma.universeSaga.update.mockResolvedValue({ UniverseSagaID: 5, Ordre: 2 });
    prisma.universeContent.update.mockResolvedValue({ UniverseContentID: 9, Ordre: 1 });
    const reply = createReply();

    await updateUniverseItemsOrder({
      user: { userId: 3 },
      params: { id: "12" },
      body: {
        items: [
          { UniverseItemType: "content", UniverseContentID: 9, Ordre: 1 },
          { UniverseItemType: "saga", UniverseSagaID: 5, Ordre: 2 },
        ],
      },
    }, reply);

    expect(prisma.universeContent.update).toHaveBeenCalledWith({
      where: { UniverseContentID: 9 },
      data: { Ordre: 1 },
    });
    expect(prisma.universeSaga.update).toHaveBeenCalledWith({
      where: { UniverseSagaID: 5 },
      data: { Ordre: 2 },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(reply.send).toHaveBeenCalledWith({ ok: true });
  });
});
