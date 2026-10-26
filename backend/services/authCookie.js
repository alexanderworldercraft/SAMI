import { AUTH_COOKIE_NAME } from "../constants.js";
const secure = () => process.env.COOKIE_SECURE === "true" || process.env.NODE_ENV === "production"
  || String(process.env.PUBLIC_URL || "").startsWith("https://") || Boolean(process.env.HTTPS);
export function setReplyHeader(reply, name, value) { reply.header?.(name, value); }
export function buildAuthCookie(value, maxAge) {
  return [`${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax",
    `Max-Age=${maxAge}`, ...(secure() ? ["Secure"] : [])].join("; ");
}
export const setSessionCookie = (reply, session) => setReplyHeader(reply, "Set-Cookie", buildAuthCookie(session.token, session.maxAge));
export const clearAuthCookie = reply => setReplyHeader(reply, "Set-Cookie", buildAuthCookie("", 0));
