import { prisma } from "./db.js";

export const DEFAULT_ADMIN_MESSAGE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function resolveAdminMessageExpiration(value, now = new Date()) {
  const currentDate = new Date(now);
  if (Number.isNaN(currentDate.getTime())) {
    throw new TypeError("La date de référence est invalide.");
  }

  if (value === undefined || value === null || value === "") {
    return new Date(currentDate.getTime() + DEFAULT_ADMIN_MESSAGE_DURATION_MS);
  }

  const expirationDate = new Date(value);
  if (Number.isNaN(expirationDate.getTime())) {
    throw new TypeError("La date de désactivation est invalide.");
  }

  if (expirationDate <= currentDate) {
    throw new RangeError("La date de désactivation doit être dans le futur.");
  }

  return expirationDate;
}

export async function deactivateExpiredAdminMessages({
  client = prisma,
  now = new Date(),
} = {}) {
  return client.adminMessage.updateMany({
    where: {
      Actif: true,
      ExpiresAt: { lte: now },
    },
    data: {
      Actif: false,
    },
  });
}
