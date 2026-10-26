import { AUTH_COOKIE_NAME } from "../constants.js";
import { verifyUserSession } from "../services/userSessionService.js";

export function getCookieValue(request, name) {
  const cookie = String(request.headers.cookie || "").split(";").map(value => value.trim()).find(value => value.startsWith(`${name}=`));
  if (!cookie) return null;
  try { return decodeURIComponent(cookie.slice(name.length + 1)); } catch { return null; }
}
export function getJwtFromRequest(request) {
  const header = request.headers.authorization;
  return typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7).trim() : getCookieValue(request, AUTH_COOKIE_NAME);
}
const authenticate = allowPasswordChange => async (request, reply) => {
  try {
    const token = getJwtFromRequest(request);
    if (!token) return reply.status(401).send({ error: "Session requise.", code: "INVALID_SESSION" });
    request.user = await verifyUserSession(token, { allowPasswordChange });
  } catch (error) {
    return reply.status(error.statusCode || 503).send({ error: error.statusCode ? error.message : "Authentification momentanément indisponible.", code: error.code || "AUTH_UNAVAILABLE" });
  }
};
export const authMiddleware = authenticate(false);
export const sessionAuthMiddleware = authenticate(true);
