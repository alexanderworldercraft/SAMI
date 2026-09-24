import { ADMIN_GRADE_IDS } from "../constants.js";
import { findExtensionAccessToken } from "../services/extensionAuthService.js";

export async function extensionAuthMiddleware(request, reply) {
  const header = String(request.headers.authorization || "");
  const rawToken = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const token = await findExtensionAccessToken(rawToken);
  if (!token) return reply.status(401).send({ error: "Jeton d'extension invalide ou expiré." });
  if (!ADMIN_GRADE_IDS.includes(token.Utilisateur.GradeID)) {
    return reply.status(403).send({ error: "L'import est réservé aux administrateurs." });
  }
  request.extensionToken = token;
  request.user = { userId: token.UtilisateurID, surnom: token.Utilisateur.Surnom };
}
