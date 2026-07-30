import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/db.js", () => ({
  prisma: {
    utilisateur: {
      findUnique: vi.fn(),
    },
  },
}));

import { ETAT, GRADE } from "../constants.js";
import { prisma } from "../services/db.js";
import {
  authenticateVideoExportPassword,
  createVideoExportChallenge,
  verifyVideoExportChallenge,
} from "../services/videoExportAuthorization.js";

const activeSuperAdmin = {
  UtilisateurID: 7,
  Surnom: "root",
  GradeID: GRADE.SUPER_ADMIN,
  EtatID: ETAT.ACTIVE,
  MotDePasse: "",
};

describe("autorisation sensible d'export vidéo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = "test-jwt-secret-long-enough-for-video-export";
  });

  it("valide localement le mot de passe du super administrateur actif", async () => {
    const MotDePasse = await bcrypt.hash("mot-de-passe-local", 4);
    prisma.utilisateur.findUnique.mockResolvedValue({
      ...activeSuperAdmin,
      MotDePasse,
    });

    await expect(
      authenticateVideoExportPassword({
        userId: 7,
        currentPassword: "mot-de-passe-local",
      })
    ).resolves.toMatchObject({
      UtilisateurID: 7,
      GradeID: GRADE.SUPER_ADMIN,
    });

    await expect(
      authenticateVideoExportPassword({
        userId: 7,
        currentPassword: "incorrect",
      })
    ).rejects.toMatchObject({
      code: "INVALID_PASSWORD",
      statusCode: 401,
    });
  });

  it("refuse un administrateur qui n'est pas super administrateur", async () => {
    prisma.utilisateur.findUnique.mockResolvedValue({
      ...activeSuperAdmin,
      GradeID: GRADE.ADMIN,
    });

    await expect(
      authenticateVideoExportPassword({
        userId: 7,
        currentPassword: "peu-importe",
      })
    ).rejects.toMatchObject({
      code: "SUPER_ADMIN_REQUIRED",
      statusCode: 403,
    });
  });

  it("lie le challenge à l'utilisateur et à la vidéo", async () => {
    prisma.utilisateur.findUnique.mockResolvedValue(activeSuperAdmin);
    const { challenge, expiresAt } = createVideoExportChallenge({
      userId: 7,
      videoId: 42,
    });

    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    await expect(
      verifyVideoExportChallenge({
        challenge,
        requestUserId: 7,
        videoId: 42,
      })
    ).resolves.toMatchObject({ UtilisateurID: 7 });
    await expect(
      verifyVideoExportChallenge({
        challenge,
        requestUserId: 7,
        videoId: 43,
      })
    ).rejects.toMatchObject({
      code: "CHALLENGE_SCOPE_MISMATCH",
      statusCode: 403,
    });
  });
});
