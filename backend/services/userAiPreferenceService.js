import { prisma } from "./db.js";

export const AI_DISCLOSURE_VERSION = "2026-08-23-v1";

export const AI_DISCLOSURE_TEXT = Object.freeze({
  title: "Fonctionnalités d'intelligence artificielle de SAMI",
  summary:
    "SAMI peut mettre à disposition des sous-titres et des pistes audio générés "
    + "localement par intelligence artificielle afin de faciliter la compréhension "
    + "des vidéos. Ces contenus peuvent contenir des erreurs et les voix synthétiques "
    + "ne constituent pas des doublages officiels. Tous les éléments générés par IA "
    + "sont clairement identifiés. Vous pouvez choisir d'y accéder ou non et modifier "
    + "ce choix à tout moment dans Paramètres → Intelligence artificielle.",
  acceptLabel:
    "Oui, je comprends le fonctionnement de l'IA de SAMI et souhaite accéder à ces fonctionnalités.",
  refuseLabel: "Non, je ne souhaite pas accéder aux fonctionnalités IA.",
});

export const serializeUserAiPreference = (preference) => {
  const currentVersion = preference?.DisclosureVersion === AI_DISCLOSURE_VERSION;
  if (!preference || !currentVersion) {
    return {
      status: "UNANSWERED",
      accepted: null,
      disclosureVersion: AI_DISCLOSURE_VERSION,
      decidedAt: null,
      updatedAt: null,
      disclosure: AI_DISCLOSURE_TEXT,
    };
  }
  return {
    status: preference.Accepted ? "ACCEPTED" : "REFUSED",
    accepted: Boolean(preference.Accepted),
    disclosureVersion: AI_DISCLOSURE_VERSION,
    decidedAt: preference.DecidedAt,
    updatedAt: preference.UpdateDate,
    disclosure: AI_DISCLOSURE_TEXT,
  };
};

export async function getUserAiPreference(userId, { database = prisma } = {}) {
  const preference = await database.userAiPreference.findUnique({
    where: { UtilisateurID: Number(userId) },
  });
  return serializeUserAiPreference(preference);
}

export async function setUserAiPreference(userId, accepted, { database = prisma } = {}) {
  if (typeof accepted !== "boolean") {
    const error = new TypeError("accepted doit être un booléen.");
    error.statusCode = 400;
    throw error;
  }
  const now = new Date();
  const preference = await database.userAiPreference.upsert({
    where: { UtilisateurID: Number(userId) },
    create: {
      UtilisateurID: Number(userId),
      Accepted: accepted,
      DisclosureVersion: AI_DISCLOSURE_VERSION,
      DecidedAt: now,
    },
    update: {
      Accepted: accepted,
      DisclosureVersion: AI_DISCLOSURE_VERSION,
      DecidedAt: now,
    },
  });
  return serializeUserAiPreference(preference);
}

export async function ensureAiFeaturesAccepted(request, reply, { database = prisma } = {}) {
  const userId = Number(request.user?.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    reply.status(401).send({ error: "Utilisateur non authentifié." });
    return null;
  }
  const preference = await getUserAiPreference(userId, { database });
  if (preference.status === "UNANSWERED") {
    reply.status(428).send({
      error: "Vous devez choisir si vous souhaitez accéder aux fonctionnalités IA de SAMI.",
      code: "AI_FEATURES_DECISION_REQUIRED",
    });
    return null;
  }
  if (!preference.accepted) {
    reply.status(403).send({
      error: "Vous avez choisi de ne pas accéder aux fonctionnalités IA de SAMI.",
      code: "AI_FEATURES_NOT_ACCEPTED",
    });
    return null;
  }
  return { userId, preference };
}
