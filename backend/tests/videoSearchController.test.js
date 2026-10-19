import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/db.js", () => ({
  prisma: {
    video: { findMany: vi.fn() },
    series: { findMany: vi.fn() },
  },
}));

import {
  getVideosAndSeries,
  quickSearchVideos,
} from "../controllers/videoController.js";
import { prisma } from "../services/db.js";

const createReply = () => {
  const reply = {
    send: vi.fn(),
    status: vi.fn(),
  };
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
};

const makeVideo = (VideoID, Titre) => ({
  VideoID,
  Titre,
  Resumer: "",
  Premium: false,
  CheminImage: `${VideoID}.webp`,
  CreateDate: null,
  VideoGenres: [],
});

describe("videoController - recherche similaire", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.series.findMany.mockResolvedValue([]);
  });

  it("priorise le titre exact normalisé puis les inclusions et les similitudes", async () => {
    prisma.video.findMany.mockResolvedValue([
      makeVideo(1, "The Amazing Spider-Man"),
      makeVideo(2, "Spider Men"),
      makeVideo(3, "Spider-Man"),
      makeVideo(4, "Batman"),
    ]);
    const reply = createReply();

    await getVideosAndSeries(
      { query: { search: "spider man", sort: "az" }, headers: {} },
      reply
    );

    expect(reply.send).toHaveBeenCalledWith({
      items: [
        expect.objectContaining({ id: 3, Titre: "Spider-Man" }),
        expect.objectContaining({ id: 1, Titre: "The Amazing Spider-Man" }),
        expect.objectContaining({ id: 2, Titre: "Spider Men" }),
      ],
      totalItems: 3,
      totalPages: 1,
    });
    expect(reply.send.mock.calls[0][0].items[0]).not.toHaveProperty("SearchRank");
    expect(reply.send.mock.calls[0][0].items[0]).not.toHaveProperty("SearchScore");
  });

  it("renvoie des suggestions similaires pour les films et les séries", async () => {
    prisma.video.findMany.mockResolvedValue([makeVideo(3, "Spider-Man")]);
    prisma.series.findMany.mockResolvedValue([{
      SeriesID: 8,
      Titre: "Spidr Man Adventures",
      CheminImage: "serie.webp",
      Saisons: [{ Episodes: [{ VideoID: 81 }] }],
    }]);
    const reply = createReply();

    await quickSearchVideos({ query: { search: "spider man", limit: "6" } }, reply);

    expect(reply.send).toHaveBeenCalledWith({
      items: [
        {
          id: 3,
          type: "video",
          Titre: "Spider-Man",
          TitreAlternatif: null,
          CheminImage: "3.webp",
        },
        {
          id: 8,
          type: "series",
          Titre: "Spidr Man Adventures",
          TitreAlternatif: null,
          CheminImage: "serie.webp",
          FirstVideoID: 81,
        },
      ],
      total: 2,
    });
  });

  it.each(["spider man", "spidr man", "SPÍDER-MAN", "spiderman"])(
    "garde les mêmes correspondances et le même ordre dans la preview et la recherche complète pour %s",
    async (search) => {
      prisma.video.findMany.mockResolvedValue([
        makeVideo(1, "The Amazing Spider-Man"),
        makeVideo(2, "Spider Men"),
        makeVideo(3, "Spider-Man"),
        { ...makeVideo(4, "Batman"), Resumer: "Spider-Man rencontre Batman." },
      ]);
      prisma.series.findMany.mockResolvedValue([
        {
          SeriesID: 8,
          Titre: "Spider-Man Adventures",
          Resumer: "",
          SeriesGenres: [],
          Saisons: [{ Episodes: [{ VideoID: 81 }] }],
        },
        {
          SeriesID: 9,
          Titre: "Autre série",
          Resumer: "Spider-Man rencontre Batman.",
          SeriesGenres: [],
          Saisons: [],
        },
      ]);
      const fullReply = createReply();
      const previewReply = createReply();

      await getVideosAndSeries({ query: { search }, headers: {} }, fullReply);
      await quickSearchVideos({ query: { search, limit: "6" } }, previewReply);

      const fullResults = fullReply.send.mock.calls[0][0];
      const previewResults = previewReply.send.mock.calls[0][0];
      const keys = (items) => items.map((item) => `${item.type}:${item.id}`);
      expect(keys(previewResults.items)).toEqual(keys(fullResults.items));
      expect(fullResults.items.length).toBeGreaterThanOrEqual(3);
      expect(fullResults.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "series", id: 8 }),
      ]));
      expect(fullResults.items.some((item) => item.id === 4 || item.id === 9)).toBe(false);
    }
  );

  it("ne sélectionne aucun film ou série dont seul le résumé correspond", async () => {
    prisma.video.findMany.mockResolvedValue([
      { ...makeVideo(1, "Un autre film"), Resumer: "Peter Parker devient un héros." },
    ]);
    prisma.series.findMany.mockResolvedValue([
      {
        SeriesID: 2,
        Titre: "Une autre série",
        Resumer: "Peter Parker devient un héros.",
        SeriesGenres: [],
        Saisons: [],
      },
    ]);
    const reply = createReply();

    await getVideosAndSeries(
      { query: { search: "Peter Parker" }, headers: {} },
      reply
    );

    expect(reply.send).toHaveBeenCalledWith({ items: [], totalItems: 0, totalPages: 0 });
  });
});


describe("recherche des titres alternatifs", () => {
  it.each(["the meg", "mégalodon", "MEGALODON", "en eau trouble", "en eau troubl"])(
    "retrouve les films et séries dans la preview et le catalogue pour %s", async (search) => {
      prisma.video.findMany.mockResolvedValue([{
        ...makeVideo(42, "The Meg"),
        TitreAlternatif: "Mégalodon | En eau trouble",
      }]);
      prisma.series.findMany.mockResolvedValue([{
        SeriesID: 43,
        Titre: "The Meg Adventures",
        TitreAlternatif: "Mégalodon | En eau trouble",
        SeriesGenres: [],
        Saisons: [{ Episodes: [{ VideoID: 44 }] }],
      }]);
      const full = createReply();
      const preview = createReply();
      await getVideosAndSeries({ query: { search }, headers: {} }, full);
      await quickSearchVideos({ query: { search } }, preview);
      const fullItems = full.send.mock.calls[0][0].items;
      const previewItems = preview.send.mock.calls[0][0].items;
      expect(fullItems.map(({ id }) => id)).toEqual([42, 43]);
      expect(previewItems.map(({ id }) => id)).toEqual([42, 43]);
      expect(fullItems[0].Titre).toBe("The Meg");
      expect(prisma.video.findMany.mock.calls.at(-1)[0].select.TitreAlternatif).toBe(true);
      expect(prisma.series.findMany.mock.calls.at(-1)[0].select.TitreAlternatif).toBe(true);
    }
  );
});
