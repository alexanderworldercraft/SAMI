import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";

import { ETAT, GRADE } from "../constants.js";
import { prisma } from "./db.js";
import { VIDEO_TRANSFER_AUTH_TTL_SECONDS } from "./videoTransferConfig.js";

export class VideoExportAuthorizationError extends Error {
  constructor(message, statusCode = 400, code = "VIDEO_EXPORT_AUTHORIZATION_ERROR") {
    super(message);
    this.name = "VideoExportAuthorizationError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

const getJwtSecret = () => {
  const secret = String(process.env.JWT_SECRET || "");
  if (!secret) {
    throw new VideoExportAuthorizationError(
      "La configuration d'authentification du serveur est incomplète.",
      500,
      "JWT_SECRET_MISSING"
    );
  }
  return secret;
};

export async function getActiveSuperAdmin(userId) {
  const parsedUserId = Number(userId);
  if (!Number.isInteger(parsedUserId) || parsedUserId <= 0) {
    throw new VideoExportAuthorizationError(
      "Utilisateur non authentifié.",
      401,
      "UNAUTHENTICATED"
    );
  }

  const user = await prisma.utilisateur.findUnique({
    where: { UtilisateurID: parsedUserId },
    select: {
      UtilisateurID: true,
      Surnom: true,
      GradeID: true,
      EtatID: true,
      MotDePasse: true,
    },
  });

  if (
    !user
    || user.GradeID !== GRADE.SUPER_ADMIN
    || user.EtatID !== ETAT.ACTIVE
  ) {
    throw new VideoExportAuthorizationError(
      "Accès réservé au super administrateur actif.",
      403,
      "SUPER_ADMIN_REQUIRED"
    );
  }

  return user;
}

export async function authenticateVideoExportPassword({ userId, currentPassword }) {
  if (typeof currentPassword !== "string" || currentPassword.length === 0) {
    throw new VideoExportAuthorizationError(
      "Le mot de passe est requis.",
      400,
      "PASSWORD_REQUIRED"
    );
  }

  const user = await getActiveSuperAdmin(userId);
  const valid = await bcrypt.compare(currentPassword, user.MotDePasse || "");
  if (!valid) {
    throw new VideoExportAuthorizationError(
      "Mot de passe incorrect.",
      401,
      "INVALID_PASSWORD"
    );
  }

  return user;
}

export function createVideoExportChallenge({ userId, videoId }) {
  const parsedUserId = Number(userId);
  const parsedVideoId = Number(videoId);
  if (!Number.isInteger(parsedUserId) || !Number.isInteger(parsedVideoId)) {
    throw new VideoExportAuthorizationError(
      "Impossible de créer l'autorisation d'export.",
      400,
      "INVALID_CHALLENGE_SUBJECT"
    );
  }

  const challenge = jwt.sign(
    {
      purpose: "video-export",
      userId: parsedUserId,
      videoId: parsedVideoId,
      jti: randomUUID(),
    },
    getJwtSecret(),
    { expiresIn: VIDEO_TRANSFER_AUTH_TTL_SECONDS }
  );
  const decoded = jwt.decode(challenge);

  return {
    challenge,
    expiresAt: new Date(Number(decoded.exp) * 1000),
  };
}

export async function verifyVideoExportChallenge({
  challenge,
  requestUserId,
  videoId,
}) {
  if (typeof challenge !== "string" || !challenge) {
    throw new VideoExportAuthorizationError(
      "L'autorisation d'export est requise.",
      401,
      "CHALLENGE_REQUIRED"
    );
  }

  let decoded;
  try {
    decoded = jwt.verify(challenge, getJwtSecret());
  } catch (error) {
    const expired = error?.name === "TokenExpiredError";
    throw new VideoExportAuthorizationError(
      expired
        ? "L'autorisation d'export a expiré. Confirmez de nouveau votre mot de passe."
        : "Autorisation d'export invalide.",
      401,
      expired ? "CHALLENGE_EXPIRED" : "CHALLENGE_INVALID"
    );
  }

  if (
    decoded?.purpose !== "video-export"
    || Number(decoded.userId) !== Number(requestUserId)
    || Number(decoded.videoId) !== Number(videoId)
  ) {
    throw new VideoExportAuthorizationError(
      "Cette autorisation ne correspond pas à la vidéo ou à l'utilisateur.",
      403,
      "CHALLENGE_SCOPE_MISMATCH"
    );
  }

  return getActiveSuperAdmin(requestUserId);
}

