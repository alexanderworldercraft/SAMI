import crypto from "crypto";
import { prisma } from "./db.js";

const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

export function normalizeExtensionClient({ clientId, redirectUri }) {
  const normalizedClientId = String(clientId || "").trim();
  const normalizedRedirectUri = String(redirectUri || "").trim();
  if (!/^[a-p]{32}$/.test(normalizedClientId)) {
    throw new Error("Identifiant d'extension Chromium invalide.");
  }
  const expectedRedirectUri = `https://${normalizedClientId}.chromiumapp.org/sami-auth`;
  if (normalizedRedirectUri !== expectedRedirectUri) {
    throw new Error("Adresse de retour de l'extension invalide.");
  }
  return { clientId: normalizedClientId, redirectUri: normalizedRedirectUri };
}

export async function createExtensionAuthorizationCode({
  userId,
  clientId,
  redirectUri,
  codeChallenge,
  extensionName,
}) {
  const client = normalizeExtensionClient({ clientId, redirectUri });
  const challenge = String(codeChallenge || "").trim();
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) {
    throw new Error("Challenge PKCE invalide.");
  }
  const code = randomToken();
  await prisma.extensionAuthCode.create({
    data: {
      ExtensionAuthCodeID: crypto.randomUUID(),
      CodeHash: sha256(code),
      ClientID: client.clientId,
      RedirectURI: client.redirectUri,
      CodeChallenge: challenge,
      ExtensionName: String(extensionName || "Extension SAMI").trim().slice(0, 100) || "Extension SAMI",
      UtilisateurID: userId,
      ExpiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
    },
  });
  return { code, redirectUri: client.redirectUri };
}

export async function exchangeExtensionAuthorizationCode({ code, codeVerifier, clientId, redirectUri }) {
  const client = normalizeExtensionClient({ clientId, redirectUri });
  const verifier = String(codeVerifier || "");
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) {
    throw new Error("Vérificateur PKCE invalide.");
  }
  const codeHash = sha256(String(code || ""));
  const record = await prisma.extensionAuthCode.findUnique({ where: { CodeHash: codeHash } });
  if (!record || record.ExpiresAt <= new Date()) throw new Error("Code expiré ou invalide.");
  if (record.ClientID !== client.clientId || record.RedirectURI !== client.redirectUri) {
    throw new Error("Le code ne correspond pas à cette extension.");
  }
  const expectedChallenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(record.CodeChallenge), Buffer.from(expectedChallenge))) {
    throw new Error("Vérification PKCE refusée.");
  }

  const accessToken = `sami_ext_${randomToken(36)}`;
  const tokenId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
  await prisma.$transaction([
    prisma.extensionAuthCode.delete({ where: { ExtensionAuthCodeID: record.ExtensionAuthCodeID } }),
    prisma.extensionAccessToken.create({
      data: {
        ExtensionAccessTokenID: tokenId,
        TokenHash: sha256(accessToken),
        ClientID: record.ClientID,
        ExtensionName: record.ExtensionName,
        UtilisateurID: record.UtilisateurID,
        ExpiresAt: expiresAt,
      },
    }),
  ]);
  return { accessToken, expiresAt };
}

export async function findExtensionAccessToken(rawToken) {
  if (!String(rawToken || "").startsWith("sami_ext_")) return null;
  const token = await prisma.extensionAccessToken.findUnique({
    where: { TokenHash: sha256(rawToken) },
    include: { Utilisateur: { select: { UtilisateurID: true, Surnom: true, GradeID: true, EtatID: true } } },
  });
  if (!token || token.RevokedAt || token.ExpiresAt <= new Date() || token.Utilisateur.EtatID !== 1) return null;
  await prisma.extensionAccessToken.update({
    where: { ExtensionAccessTokenID: token.ExtensionAccessTokenID },
    data: { LastUsedAt: new Date() },
  });
  return token;
}

export async function revokeExtensionAccessToken(rawToken) {
  if (!String(rawToken || "").startsWith("sami_ext_")) return false;
  const result = await prisma.extensionAccessToken.updateMany({
    where: { TokenHash: sha256(rawToken), RevokedAt: null },
    data: { RevokedAt: new Date() },
  });
  return result.count > 0;
}
