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
      deleteMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    video: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
    series: { findFirst: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("../controllers/logController.js", () => ({ createLog: vi.fn() }));

import {
  addUniverseContent,
  formatUniverseContent,
  getUniverseAdminCatalog,
  getUniverses,
  getUniversesForContent,
  removeUniverseContent,
  sortUniverseItems,
  updateUniverseItemsOrder,
} from "../controllers/universeController.js";
import { prisma } from "../services/db.js";
import { createLog } from "../controllers/logController.js";

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

  it("charge le catalogue univers par date de création décroissante", async () => {
    const saga = { SagaID: 3, Titre: "Saga récente", CreateDate: new Date("2026-08-11T09:00:00.000Z") };
    const video = { VideoID: 8, Titre: "Film récent", CreateDate: new Date("2026-08-10T09:00:00.000Z") };
    const serie = { SeriesID: 5, Titre: "Série récente", CreateDate: new Date("2026-08-09T09:00:00.000Z") };
    prisma.saga.findMany.mockResolvedValue([saga]);
    prisma.video.findMany.mockResolvedValue([video]);
    prisma.series.findMany.mockResolvedValue([serie]);
    const reply = createReply();

    await getUniverseAdminCatalog({ user: { userId: 3 } }, reply);

    expect(prisma.saga.findMany).toHaveBeenCalledWith({
      where: { EtatID: 1 },
      orderBy: [{ CreateDate: "desc" }, { SagaID: "desc" }],
      select: { SagaID: true, Titre: true, CreateDate: true },
    });
    expect(prisma.video.findMany).toHaveBeenCalledWith({
      where: { EtatID: 1, SaisonID: null },
      orderBy: [{ CreateDate: "desc" }, { VideoID: "desc" }],
      select: { VideoID: true, Titre: true, CreateDate: true },
    });
    expect(prisma.series.findMany).toHaveBeenCalledWith({
      where: { EtatID: 1 },
      orderBy: [{ CreateDate: "desc" }, { SeriesID: "desc" }],
      select: { SeriesID: true, Titre: true, CreateDate: true },
    });
    expect(reply.send).toHaveBeenCalledWith({ sagas: [saga], videos: [video], series: [serie] });
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
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      UtilisateurID: 3,
      ActionNom: "universe_content_add",
      VideoID: 42,
      Meta: expect.objectContaining({ universeId: 12, contentId: 42 }),
    }));
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
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      UtilisateurID: 3,
      ActionNom: "universe_items_reorder",
      Meta: expect.objectContaining({ universeId: 12, itemType: "mixed" }),
    }));
    expect(reply.send).toHaveBeenCalledWith({ ok: true });
  });

  it("journalise le retrait direct d'un contenu d'un univers", async () => {
    prisma.universeContent.findFirst.mockResolvedValue({ VideoID: 42, SeriesID: null });
    prisma.universeContent.deleteMany.mockResolvedValue({ count: 1 });
    const reply = createReply();

    await removeUniverseContent({
      user: { userId: 3 },
      params: { id: "12", universeContentId: "9" },
    }, reply);

    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      UtilisateurID: 3,
      ActionNom: "universe_content_remove",
      VideoID: 42,
      AncienneValeur: "9",
      Meta: {
        universeId: 12,
        universeContentId: 9,
        contentType: "video",
        contentId: 42,
      },
    }));
    expect(reply.send).toHaveBeenCalledWith({ ok: true });
  });

  it("retrouve tous les univers réels d'un épisode via la série et ses sagas", async () => {
    prisma.video.findUnique.mockResolvedValue({
      VideoID: 77,
      EtatID: 1,
      Saison: { SeriesID: 6 },
    });
    prisma.universe.findMany.mockResolvedValue([
      { UniverseID: 12, Titre: "Star Wars", Resume: "" },
      { UniverseID: 18, Titre: "Univers chronologique", Resume: "" },
    ]);
    const reply = createReply();

    await getUniversesForContent({ params: { videoId: "77" } }, reply);

    const membershipFilters = [{ VideoID: 77 }, { SeriesID: 6 }];
    expect(prisma.universe.findMany).toHaveBeenCalledWith({
      where: {
        EtatID: 1,
        OR: [
          {
            UniverseContents: {
              some: { OR: membershipFilters },
            },
          },
          {
            UniverseSagas: {
              some: {
                Saga: {
                  EtatID: 1,
                  SagaContents: {
                    some: { OR: membershipFilters },
                  },
                },
              },
            },
          },
        ],
      },
      orderBy: [{ Titre: "asc" }, { UniverseID: "asc" }],
      select: { UniverseID: true, Titre: true, Resume: true },
    });
    expect(reply.send).toHaveBeenCalledWith({
      items: [
        { UniverseID: 12, Titre: "Star Wars", Resume: "" },
        { UniverseID: 18, Titre: "Univers chronologique", Resume: "" },
      ],
      totalItems: 2,
    });
  });

  it("ne fabrique pas l'univers par défaut pour une saga orpheline", async () => {
    prisma.video.findUnique.mockResolvedValue({ VideoID: 42, EtatID: 1, Saison: null });
    prisma.universe.findMany.mockResolvedValue([]);
    const reply = createReply();

    await getUniversesForContent({ params: { videoId: "42" } }, reply);

    expect(reply.send).toHaveBeenCalledWith({ items: [], totalItems: 0 });
  });
});
