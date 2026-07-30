import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertClone: vi.fn(),
  authenticatePassword: vi.fn(),
  createExportJob: vi.fn(),
  getActiveSuperAdmin: vi.fn(),
  verifyChallenge: vi.fn(),
}));

vi.mock("../services/videoExportAuthorization.js", () => ({
  authenticateVideoExportPassword: mocks.authenticatePassword,
  createVideoExportChallenge: vi.fn(),
  getActiveSuperAdmin: mocks.getActiveSuperAdmin,
  verifyVideoExportChallenge: mocks.verifyChallenge,
}));

vi.mock("../services/videoTransferConfig.js", () => ({
  assertCloneTransferConfiguration: mocks.assertClone,
  getVideoTransferPublicConfig: vi.fn(),
}));

vi.mock("../services/videoExportJobService.js", () => ({
  cancelExportJob: vi.fn(),
  createExportJob: mocks.createExportJob,
  getExportJob: vi.fn(),
  getExportJobForVideo: vi.fn(),
  getPrimaryPreflightForVideo: vi.fn(),
  getPrimarySeasons: vi.fn(),
  resumeExportJob: vi.fn(),
}));

vi.mock("../services/videoTransferSerializer.js", () => ({
  serializeTransferJob: vi.fn((job) => job),
}));

import {
  authorizeVideoExport,
  getPrimarySeriesSeasons,
  resumeVideoExport,
  startVideoExport,
} from "../controllers/videoExportController.js";

const forbidden = Object.assign(
  new Error("Accès réservé au super administrateur actif."),
  { statusCode: 403, code: "SUPER_ADMIN_REQUIRED" }
);

const createReply = () => {
  const reply = {
    statusCode: 200,
    payload: null,
    status: vi.fn((statusCode) => {
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

describe("ordre des contrôles d'accès aux exports vidéo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertClone.mockImplementation(() => {
      throw new Error("La configuration ne doit pas être révélée.");
    });
  });

  it.each([
    [
      "autorisation",
      authorizeVideoExport,
      { params: { videoId: "42" }, body: { currentPassword: "secret" } },
      "password",
    ],
    [
      "catalogue des saisons",
      getPrimarySeriesSeasons,
      { params: { seriesId: "8" } },
      "role",
    ],
    [
      "démarrage",
      startVideoExport,
      { params: { videoId: "42" }, body: { challenge: "challenge" } },
      "role",
    ],
    [
      "reprise",
      resumeVideoExport,
      { params: { transferId: "transfer-id" }, body: { currentPassword: "secret" } },
      "password",
    ],
  ])(
    "refuse le %s avant de lire la configuration clone",
    async (_label, handler, requestData, guard) => {
      if (guard === "password") {
        mocks.authenticatePassword.mockRejectedValueOnce(forbidden);
      } else {
        mocks.getActiveSuperAdmin.mockRejectedValueOnce(forbidden);
      }
      const reply = createReply();

      await handler(
        { ...requestData, user: { userId: 9 } },
        reply
      );

      expect(reply.statusCode).toBe(403);
      expect(reply.payload).toMatchObject({
        code: "SUPER_ADMIN_REQUIRED",
      });
      expect(mocks.assertClone).not.toHaveBeenCalled();
    }
  );

  it("refuse entièrement une sélection contenant un GenreID invalide", async () => {
    const superAdmin = { UtilisateurID: 1, Surnom: "root" };
    mocks.getActiveSuperAdmin.mockResolvedValue(superAdmin);
    mocks.verifyChallenge.mockResolvedValue(superAdmin);
    mocks.assertClone.mockReturnValue({});
    const reply = createReply();

    await startVideoExport(
      {
        params: { videoId: "42" },
        body: {
          challenge: "challenge",
          destinationSeasonId: null,
          genreIds: [1, "invalide", -2],
        },
        user: { userId: 1 },
      },
      reply
    );

    expect(reply.statusCode).toBe(400);
    expect(reply.payload).toEqual({
      error: "La sélection de genres est invalide.",
      code: "INVALID_DESTINATION_GENRES",
    });
    expect(mocks.createExportJob).not.toHaveBeenCalled();
  });
});
