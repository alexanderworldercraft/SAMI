import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "./db.js";
import { ETAT } from "../constants.js";
import { sendPasswordRecoveryEmail } from "./mailService.js";
import { consumeRecoveryLimit } from "./recoveryRateLimitService.js";
import { invalidateUserSessions, notifySessionsRevoked } from "./userSessionService.js";
import { validatePassword, PASSWORD_POLICY_MESSAGE } from "./passwordPolicy.js";

export const RECOVERY_MESSAGE = "Si les informations correspondent à un compte actif, un lien de confirmation sera envoyé par email.";
const TTL_MS = 15 * 60_000;
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const clean = value => typeof value === "string" ? value.trim().normalize("NFKC").slice(0, 100) : "";
const fail = (message = "Lien invalide ou expiré.", statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
export function recoveryLink(token, env = process.env) {
  const origin = String(env.PUBLIC_URL || "").split(",")[0].trim();
  let url;
  try { url = new URL(origin); } catch { fail("PUBLIC_URL est nécessaire pour la récupération.", 503); }
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol)
    || (env.NODE_ENV === "production" && url.protocol !== "https:")) fail("Origine publique de récupération invalide.", 503);
  url = new URL("/recuperation-mot-de-passe", url);
  url.hash = new URLSearchParams({ token }).toString();
  return url.href;
}
function temporaryPassword() {
  const groups = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnopqrstuvwxyz", "23456789", "!@#$%&*"];
  const chars = groups.map(group => group[crypto.randomInt(group.length)]);
  const all = groups.join("");
  while (chars.length < 20) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join("");
}
const lockUser = (tx, userId) => tx.$queryRaw`SELECT UtilisateurID FROM Utilisateur WHERE UtilisateurID = ${userId} FOR UPDATE`;
const defaultEnqueue = task => setImmediate(() => task().catch(() => console.error("Envoi de récupération indisponible.")));

export function createPasswordRecoveryService({ database = prisma, sendEmail = sendPasswordRecoveryEmail,
  enqueue = defaultEnqueue, now = () => new Date(), env = process.env } = {}) {
  const limit = (key, max, windowMs) => consumeRecoveryLimit(key, { max, windowMs, database, now: now() });
  return {
    async request({ surnom, email, ip }) {
      const nickname = clean(surnom); const address = clean(email).toLowerCase();
      if (!await limit(`recovery-ip:${ip}`, 5, 3600_000)) fail("Trop de demandes. Réessaie dans une heure.", 429);
      const allowed = await limit(`recovery-account:${nickname.toLowerCase()}`, 3, 3600_000);
      // Cleanup has an indexed cutoff; no raw token or address is persisted in counters.
      await database.securityRateLimit.deleteMany({ where: { ResetAt: { lt: new Date(now().getTime() - 86400_000) } } });
      await database.passwordRecovery.deleteMany({ where: { ExpiresAt: { lt: now() } } });
      await database.userSession.deleteMany({ where: { ExpiresAt: { lt: now() } } });
      if (!nickname || !address || !allowed) return;
      const token = crypto.randomBytes(32).toString("base64url");
      const link = recoveryLink(token, env);
      const user = await database.utilisateur.findFirst({ where: { Surnom: nickname, Email: address, EtatID: ETAT.ACTIVE } });
      if (!user || !await limit(`recovery-user:${user.UtilisateurID}`, 3, 3600_000)) return;
      const id = crypto.randomUUID();
      const expiresAt = new Date(now().getTime() + TTL_MS);
      await database.passwordRecovery.create({ data: {
        PasswordRecoveryID: id, UtilisateurID: user.UtilisateurID, TokenHash: digest(token), ExpiresAt: expiresAt,
      } });
      // SMTP never delays the HTTP response or reveals whether the account exists.
      // A restart before delivery loses this email only; the current password/session stays intact.
      enqueue(async () => {
        try {
          await sendEmail(user.Email, user.Surnom, link);
          const activated = await database.$transaction(async tx => {
            await lockUser(tx, user.UtilisateurID);
            const current = await tx.utilisateur.findUnique({ where: { UtilisateurID: user.UtilisateurID } });
            const record = await tx.passwordRecovery.findUnique({ where: { PasswordRecoveryID: id } });
            if (!current || current.EtatID !== ETAT.ACTIVE || current.Email !== user.Email
              || !record || record.ExpiresAt <= now() || record.ConsumedAt) return;
            await tx.passwordRecovery.updateMany({ where: { UtilisateurID: user.UtilisateurID, ConsumedAt: null, NOT: { PasswordRecoveryID: id } }, data: { ConsumedAt: now() } });
            await tx.passwordRecovery.update({ where: { PasswordRecoveryID: id }, data: { DeliveredAt: now() } });
            await invalidateUserSessions(tx, user.UtilisateurID);
            return true;
          });
          if (activated) notifySessionsRevoked(user.UtilisateurID);
        } catch {
          await database.passwordRecovery.deleteMany({ where: { PasswordRecoveryID: id, DeliveredAt: null } });
          throw new Error("Envoi de récupération indisponible.");
        }
      });
    },
    async confirm({ token, ip }) {
      if (!await limit(`recovery-confirm-ip:${ip}`, 30, TTL_MS)) fail("Trop de tentatives. Réessaie dans quinze minutes.", 429);
      if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail();
      const TokenHash = digest(token);
      const candidate = await database.passwordRecovery.findUnique({ where: { TokenHash } });
      if (!candidate || !candidate.DeliveredAt || candidate.ConsumedAt || candidate.ExpiresAt <= now()) fail();
      const password = temporaryPassword(); const salt = await bcrypt.genSalt(10); const hash = await bcrypt.hash(password, salt);
      const expiresAt = new Date(now().getTime() + TTL_MS);
      const user = await database.$transaction(async tx => {
        await lockUser(tx, candidate.UtilisateurID);
        const record = await tx.passwordRecovery.findUnique({ where: { TokenHash } });
        const current = await tx.utilisateur.findUnique({ where: { UtilisateurID: candidate.UtilisateurID } });
        if (!record || !record.DeliveredAt || record.ConsumedAt || record.ExpiresAt <= now() || current?.EtatID !== ETAT.ACTIVE) fail();
        const consumed = await tx.passwordRecovery.updateMany({ where: { TokenHash, ConsumedAt: null, ExpiresAt: { gt: now() } }, data: { ConsumedAt: now() } });
        if (consumed.count !== 1) fail();
        await tx.passwordRecovery.updateMany({ where: { UtilisateurID: current.UtilisateurID, ConsumedAt: null }, data: { ConsumedAt: now() } });
        await tx.utilisateur.update({ where: { UtilisateurID: current.UtilisateurID }, data: {
          MotDePasse: hash, Salt: salt, PasswordChangeRequired: true,
          RecoveryPasswordExpiresAt: expiresAt, RecoveryPasswordUsedAt: null,
        } });
        return invalidateUserSessions(tx, current.UtilisateurID);
      });
      notifySessionsRevoked(user.UtilisateurID);
      return { temporaryPassword: password, expiresAt, surnom: user.Surnom };
    },
    async consumeTemporaryPassword(user) {
      const instant = now();
      if (user.RecoveryPasswordUsedAt || !user.RecoveryPasswordExpiresAt || user.RecoveryPasswordExpiresAt <= instant) fail("Mot de passe temporaire invalide ou expiré.", 401);
      const changed = await database.utilisateur.updateMany({ where: {
        UtilisateurID: user.UtilisateurID, EtatID: ETAT.ACTIVE, AuthVersion: user.AuthVersion,
        PasswordChangeRequired: true, RecoveryPasswordUsedAt: null, RecoveryPasswordExpiresAt: { gt: instant },
      }, data: { RecoveryPasswordUsedAt: instant } });
      if (changed.count !== 1) fail("Mot de passe temporaire déjà utilisé ou expiré.", 401);
      return user;
    },
    async complete({ session, newPassword, confirmPassword, ip }) {
      if (!await limit(`recovery-complete:${session.userId}:${ip}`, 15, TTL_MS)) fail("Trop de tentatives. Réessaie plus tard.", 429);
      if (!validatePassword(newPassword)) fail(PASSWORD_POLICY_MESSAGE);
      if (newPassword !== confirmPassword) fail("Le mot de passe et sa confirmation ne correspondent pas.");
      const current = await database.utilisateur.findUnique({ where: { UtilisateurID: session.userId } });
      if (!current || !current.PasswordChangeRequired || current.AuthVersion !== session.authVersion) fail("Session de récupération invalide.", 401);
      if (await bcrypt.compare(newPassword, current.MotDePasse)) fail("Choisis un mot de passe différent du mot de passe temporaire.");
      const salt = await bcrypt.genSalt(10); const hash = await bcrypt.hash(newPassword, salt);
      const user = await database.$transaction(async tx => {
        await lockUser(tx, session.userId);
        const activeSession = await tx.userSession.findUnique({ where: { UserSessionID: session.sessionId } });
        if (!activeSession || activeSession.UtilisateurID !== session.userId || activeSession.AuthVersion !== session.authVersion || activeSession.Scope !== "password-change" || activeSession.ExpiresAt <= now()) fail("Session de récupération expirée.", 401);
        const changed = await tx.utilisateur.updateMany({ where: {
          UtilisateurID: session.userId, EtatID: ETAT.ACTIVE, AuthVersion: session.authVersion,
          PasswordChangeRequired: true, RecoveryPasswordUsedAt: { not: null }, RecoveryPasswordExpiresAt: { gt: now() },
        }, data: { MotDePasse: hash, Salt: salt, PasswordChangeRequired: false,
          RecoveryPasswordExpiresAt: null, RecoveryPasswordUsedAt: null } });
        if (changed.count !== 1) fail("Session de récupération invalide ou expirée.", 401);
        await tx.passwordRecovery.updateMany({ where: { UtilisateurID: session.userId, ConsumedAt: null }, data: { ConsumedAt: now() } });
        return invalidateUserSessions(tx, session.userId);
      });
      notifySessionsRevoked(user.UtilisateurID);
      return user;
    },
  };
}
export const passwordRecoveryService = createPasswordRecoveryService();
