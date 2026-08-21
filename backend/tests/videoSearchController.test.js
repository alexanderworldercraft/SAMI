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
          CheminImage: "3.webp",
        },
        {
          id: 8,
          type: "series",
          Titre: "Spidr Man Adventures",
          CheminImage: "serie.webp",
          FirstVideoID: 81,
        },
      ],
      total: 2,
    });
  });
});
