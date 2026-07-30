import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/db.js", () => ({
  prisma: {
    series: {
      findFirst: vi.fn(),
    },
    userFavoriteContent: {
      create: vi.fn(),
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
    },
    video: {
      findFirst: vi.fn(),
    },
  },
}));

import {
  getFavoriteStatus,
  toggleFavoriteContent,
} from "../services/favoriteContentService.js";
import { ETAT } from "../constants.js";
import { prisma } from "../services/db.js";

describe("visibilité des favoris pendant un transfert vidéo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.userFavoriteContent.findMany.mockResolvedValue([]);
  });

  it("filtre les favoris vidéo et série par leur état ACTIVE", async () => {
    await getFavoriteStatus(7, [
      { type: "video", id: 42 },
      { type: "series", id: 9 },
    ]);

    expect(prisma.userFavoriteContent.findMany).toHaveBeenCalledWith({
      where: {
        UserID: 7,
        OR: [
          {
            VideoID: { in: [42] },
            Video: { EtatID: ETAT.ACTIVE },
          },
          {
            SeriesID: { in: [9] },
            Series: { EtatID: ETAT.ACTIVE },
          },
        ],
      },
      select: {
        VideoID: true,
        SeriesID: true,
      },
    });
  });

  it("ne supprime pas un favori existant si la vidéo est BLOCKED", async () => {
    prisma.video.findFirst.mockResolvedValue(null);
    prisma.userFavoriteContent.findFirst.mockResolvedValue({
      UserFavoriteContentID: 123n,
    });

    await expect(
      toggleFavoriteContent({ userId: 7, type: "video", id: 42 })
    ).rejects.toMatchObject({
      message: "Contenu introuvable.",
      statusCode: 404,
    });

    expect(prisma.video.findFirst).toHaveBeenCalledWith({
      where: { VideoID: 42, EtatID: ETAT.ACTIVE },
      select: { VideoID: true },
    });
    expect(prisma.userFavoriteContent.findFirst).not.toHaveBeenCalled();
    expect(prisma.userFavoriteContent.delete).not.toHaveBeenCalled();
  });
});
