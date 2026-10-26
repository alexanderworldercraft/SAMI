import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import jwt from "jsonwebtoken";
import { prisma } from "./db.js";
import { ETAT } from "../constants.js";

export const sessionEvents = new EventEmitter();
const AUDIENCE = "sami-session";
export class SessionError extends Error {
  constructor(message = "Session invalide ou expirée.", statusCode = 401, code = "INVALID_SESSION") {
    super(message); this.statusCode = statusCode; this.code = code;
  }
}
const secret = () => {
  if (!process.env.JWT_SECRET) throw new SessionError("Configuration d'authentification indisponible.", 503);
  return process.env.JWT_SECRET;
};
export const sessionLifetime = user => ({ 1: 14400, 2: 28800, 3: 2592000 }[user.GradeID] || 43200);

export async function issueUserSession(user, { database = prisma, scope = "session" } = {}) {
  const now = Date.now();
  const expiresAt = new Date(scope === "password-change"
    ? Math.min(now + 10 * 60_000, new Date(user.RecoveryPasswordExpiresAt).getTime())
    : now + sessionLifetime(user) * 1000);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now) throw new SessionError();
  await database.userSession.deleteMany({ where: { ExpiresAt: { lt: new Date(now) } } });
  const sessionId = crypto.randomUUID();
  await database.userSession.create({ data: {
    UserSessionID: sessionId, UtilisateurID: user.UtilisateurID,
    AuthVersion: user.AuthVersion, Scope: scope, ExpiresAt: expiresAt,
  } });
  const token = jwt.sign({ userId: user.UtilisateurID, surnom: user.Surnom,
    authVersion: user.AuthVersion, tokenUse: scope }, secret(), {
    algorithm: "HS256", audience: AUDIENCE, jwtid: sessionId,
    expiresIn: Math.max(1, Math.floor((expiresAt.getTime() - now) / 1000)),
  });
  return { token, expiresAt, maxAge: Math.floor((expiresAt.getTime() - now) / 1000) };
}

export async function validateSessionClaims(decoded, { database = prisma, allowPasswordChange = false } = {}) {
  if (!decoded || !["session", "password-change"].includes(decoded.tokenUse)
    || !Number.isSafeInteger(decoded.userId) || decoded.userId <= 0
    || !Number.isSafeInteger(decoded.authVersion) || decoded.authVersion < 0
    || typeof decoded.jti !== "string" || !/^[a-f0-9-]{36}$/i.test(decoded.jti)) throw new SessionError();
  const session = await database.userSession.findUnique({
    where: { UserSessionID: decoded.jti },
    include: { Utilisateur: { select: {
      UtilisateurID: true, Surnom: true, GradeID: true, EtatID: true,
      AuthVersion: true, PasswordChangeRequired: true, RecoveryPasswordExpiresAt: true,
    } } },
  });
  const user = session?.Utilisateur;
  if (!session || !user || user.EtatID !== ETAT.ACTIVE
    || session.UtilisateurID !== decoded.userId || session.AuthVersion !== decoded.authVersion
    || user.AuthVersion !== decoded.authVersion || session.Scope !== decoded.tokenUse
    || new Date(session.ExpiresAt).getTime() <= Date.now()) throw new SessionError();
  const passwordChangeRequired = session.Scope === "password-change";
  if (Boolean(user.PasswordChangeRequired) !== passwordChangeRequired) throw new SessionError();
  if (passwordChangeRequired && (!user.RecoveryPasswordExpiresAt
    || new Date(user.RecoveryPasswordExpiresAt).getTime() <= Date.now())) throw new SessionError();
  if (passwordChangeRequired && !allowPasswordChange) {
    throw new SessionError("Change ton mot de passe pour continuer.", 403, "PASSWORD_CHANGE_REQUIRED");
  }
  return { ...decoded, passwordChangeRequired, sessionId: session.UserSessionID, gradeId: user.GradeID };
}

export async function verifyUserSession(token, options) {
  let decoded;
  try { decoded = jwt.verify(token, secret(), { algorithms: ["HS256"], audience: AUDIENCE }); }
  catch (error) { if (error instanceof SessionError) throw error; throw new SessionError(); }
  return validateSessionClaims(decoded, options);
}

// Call inside the transaction that changes credentials or activates a recovery request.
export async function invalidateUserSessions(tx, userId) {
  const user = await tx.utilisateur.update({
    where: { UtilisateurID: userId }, data: { AuthVersion: { increment: 1 } },
  });
  await tx.userSession.deleteMany({ where: { UtilisateurID: userId } });
  await tx.extensionAuthCode.deleteMany({ where: { UtilisateurID: userId } });
  await tx.extensionAccessToken.updateMany({ where: { UtilisateurID: userId, RevokedAt: null }, data: { RevokedAt: new Date() } });
  return user;
}
export const notifySessionsRevoked = userId => sessionEvents.emit("revoked", userId);

export const notifySessionRevoked = sessionId => sessionEvents.emit("session-revoked", sessionId);
