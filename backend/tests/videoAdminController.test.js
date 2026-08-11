import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/db.js", () => ({
  prisma: {
    video: { findMany: vi.fn() },
  },
}));

vi.mock("../services/authz.js", () => ({
  ensureAdmin: vi.fn(async () => ({ userId: 3, gradeId: 2 })),
  ensureSuperAdmin: vi.fn(),
}));

import { getAdminVideos } from "../controllers/videoController.js";
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

describe("videoController - catalogue administrable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transmet la date de création nécessaire au tri des contenus de saga", async () => {
    const createDate = new Date("2026-08-11T10:00:00.000Z");
    prisma.video.findMany.mockResolvedValue([{
      VideoID: 12,
      Titre: "Film récent",
      CheminImage: "film.webp",
      SaisonID: null,
      CreateDate: createDate,
      Saison: null,
    }]);
    const reply = createReply();

    await getAdminVideos({ user: { userId: 3 } }, reply);

    expect(prisma.video.findMany).toHaveBeenCalledWith({
      where: { EtatID: 1 },
      orderBy: { VideoID: "desc" },
      select: {
        VideoID: true,
        Titre: true,
        CheminImage: true,
        SaisonID: true,
        CreateDate: true,
        Saison: {
          select: {
            Numero: true,
            Series: {
              select: {
                SeriesID: true,
                Titre: true,
              },
            },
          },
        },
      },
    });
    expect(reply.send).toHaveBeenCalledWith([{
      VideoID: 12,
      Titre: "Film récent",
      CheminImage: "film.webp",
      SaisonID: null,
      CreateDate: createDate,
      type: "film",
      SaisonNumero: null,
      SeriesID: null,
      SeriesTitre: null,
    }]);
  });
});
