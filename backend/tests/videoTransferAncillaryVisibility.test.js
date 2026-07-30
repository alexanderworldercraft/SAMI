import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/db.js", () => ({
  prisma: {
    action: {
      findUnique: vi.fn(),
    },
    genre: {
      findMany: vi.fn(async () => []),
    },
    genreFeaturedContent: {
      findMany: vi.fn(async () => []),
      upsert: vi.fn(),
    },
    log: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    seriesGenre: {
      findMany: vi.fn(async () => []),
    },
    userVideoProgress: {
      findUnique: vi.fn(),
    },
    video: {
      findFirst: vi.fn(),
    },
    videoGenre: {
      findMany: vi.fn(async () => []),
    },
    $transaction: vi.fn(async () => []),
  },
}));

import {
  logVideoFirstPlay,
  logVideoResumePlay,
} from "../controllers/logController.js";
import {
  getGenreFeaturedContent,
  rotateGenreFeaturedContent,
} from "../services/genreFeaturedContentService.js";
import { ETAT } from "../constants.js";
import { prisma } from "../services/db.js";

const createReply = () => {
  const reply = {
    statusCode: 200,
    payload: undefined,
    code: vi.fn((statusCode) => {
      reply.statusCode = statusCode;
      return reply;
    }),
    send: vi.fn((payload) => {
      reply.payload = payload;
      return payload;
    }),
  };
  return reply;
};

describe("visibilité annexe des vidéos en transfert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.genre.findMany.mockResolvedValue([]);
    prisma.genreFeaturedContent.findMany.mockResolvedValue([]);
    prisma.seriesGenre.findMany.mockResolvedValue([]);
    prisma.videoGenre.findMany.mockResolvedValue([]);
  });

  it.each([
    ["première lecture", logVideoFirstPlay, { VideoID: 42 }],
    [
      "reprise de lecture",
      logVideoResumePlay,
      { VideoID: 42, StartTimecode: 12, Duration: 120 },
    ],
  ])("refuse un log de %s pour une vidéo non ACTIVE", async (_label, handler, body) => {
    prisma.video.findFirst.mockResolvedValue(null);
    const reply = createReply();

    await handler(
      {
        body,
        headers: {},
        socket: {},
        user: { userId: 7 },
      },
      reply
    );

    expect(prisma.video.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          VideoID: 42,
          EtatID: ETAT.ACTIVE,
        },
      })
    );
    expect(reply.statusCode).toBe(404);
    expect(prisma.action.findUnique).not.toHaveBeenCalled();
    expect(prisma.log.create).not.toHaveBeenCalled();
  });

  it("exclut les vidéos non ACTIVE de la rotation des contenus par genre", async () => {
    await rotateGenreFeaturedContent();

    expect(prisma.videoGenre.findMany).toHaveBeenCalledWith({
      where: {
        Video: {
          SaisonID: null,
          EtatID: ETAT.ACTIVE,
        },
      },
      select: { GenreID: true, VideoID: true },
    });
  });

  it("filtre aussi une sélection mise en avant devenue obsolète", async () => {
    await getGenreFeaturedContent([3]);

    expect(prisma.genreFeaturedContent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          GenreID: { in: [3] },
          OR: expect.arrayContaining([
            {
              VideoID: { not: null },
              Video: { EtatID: ETAT.ACTIVE },
            },
          ]),
        }),
      })
    );
  });
});
