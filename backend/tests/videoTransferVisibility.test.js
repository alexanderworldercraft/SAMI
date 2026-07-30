import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/db.js", () => ({
  prisma: {
    video: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../services/authz.js", () => ({
  ensureAdmin: vi.fn(async () => ({ userId: 1, gradeId: 1 })),
  ensureSuperAdmin: vi.fn(async () => ({ userId: 1, gradeId: 1 })),
}));

vi.mock("../controllers/logController.js", () => ({
  createLog: vi.fn(async () => ({ ok: true })),
}));

import {
  getNavigationInfo,
  getVideoDetails,
  getVideoGenres,
  restoreVideo,
  updateVideoTitle,
} from "../controllers/videoController.js";
import { ETAT } from "../constants.js";
import { prisma } from "../services/db.js";

const createReply = () => {
  const reply = {
    statusCode: 200,
    payload: undefined,
    status: vi.fn((statusCode) => {
      reply.statusCode = statusCode;
      return reply;
    }),
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

describe("visibilité des vidéos en transfert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("masque une vidéo BLOCKED sur la route de lecture", async () => {
    prisma.video.findUnique.mockResolvedValue({
      VideoID: 42,
      EtatID: ETAT.BLOCKED,
    });
    const reply = createReply();

    await getVideoDetails(
      { params: { id: "42" }, user: { userId: 1 } },
      reply
    );

    expect(reply.statusCode).toBe(404);
    expect(reply.payload).toEqual({ error: "Vidéo non trouvée." });
  });

  it("ne divulgue pas les genres d'une vidéo BLOCKED", async () => {
    prisma.video.findFirst.mockResolvedValue(null);
    const reply = createReply();

    await getVideoGenres({ params: { id: "42" } }, reply);

    expect(prisma.video.findFirst).toHaveBeenCalledWith({
      where: { VideoID: 42, EtatID: ETAT.ACTIVE },
      select: { VideoID: true },
    });
    expect(reply.statusCode).toBe(404);
    expect(reply.payload).toEqual({ error: "Vidéo introuvable." });
  });

  it("exclut les vidéos BLOCKED de la navigation précédente et suivante", async () => {
    prisma.video.findFirst
      .mockResolvedValueOnce({ Titre: "Milieu" })
      .mockResolvedValueOnce({ VideoID: 10, Titre: "Avant" })
      .mockResolvedValueOnce({ VideoID: 30, Titre: "Après" });
    const reply = createReply();

    await getNavigationInfo({ params: { id: "20" } }, reply);

    expect(prisma.video.findFirst).toHaveBeenNthCalledWith(1, {
      where: { VideoID: 20, EtatID: ETAT.ACTIVE },
      select: { Titre: true },
    });
    expect(prisma.video.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        EtatID: ETAT.ACTIVE,
        Titre: { lt: "Milieu" },
      },
      orderBy: { Titre: "desc" },
      select: { VideoID: true, Titre: true },
    });
    expect(prisma.video.findFirst).toHaveBeenNthCalledWith(3, {
      where: {
        EtatID: ETAT.ACTIVE,
        Titre: { gt: "Milieu" },
      },
      orderBy: { Titre: "asc" },
      select: { VideoID: true, Titre: true },
    });
  });

  it("refuse de restaurer manuellement une vidéo BLOCKED", async () => {
    prisma.video.findUnique.mockResolvedValue({
      VideoID: 42,
      Titre: "Import en cours",
      EtatID: ETAT.BLOCKED,
      SaisonID: null,
      Saison: null,
    });
    const reply = createReply();

    await restoreVideo(
      { params: { id: "42" }, user: { userId: 1 } },
      reply
    );

    expect(reply.statusCode).toBe(409);
    expect(reply.payload).toMatchObject({
      code: "VIDEO_TRANSFER_IN_PROGRESS",
    });
    expect(prisma.video.update).not.toHaveBeenCalled();
  });

  it("verrouille les mutations administratives pendant le transfert", async () => {
    prisma.video.findUnique.mockResolvedValue({ EtatID: ETAT.BLOCKED });
    const reply = createReply();

    await updateVideoTitle(
      {
        id: "request-1",
        method: "PUT",
        url: "/api/videos/42/title",
        params: { id: "42" },
        body: { Titre: "Nouveau titre" },
        user: { userId: 1 },
      },
      reply
    );

    expect(reply.statusCode).toBe(409);
    expect(reply.payload).toMatchObject({
      code: "VIDEO_TRANSFER_IN_PROGRESS",
    });
    expect(prisma.video.update).not.toHaveBeenCalled();
  });
});
