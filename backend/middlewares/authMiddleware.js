// middlewares/authMiddleware.js

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { AUTH_COOKIE_NAME } from "../constants.js";

dotenv.config();
const secretKey = process.env.JWT_SECRET;

export function getCookieValue(request, name) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map((cookie) => cookie.trim());
  const prefix = `${name}=`;
  const cookie = cookies.find((entry) => entry.startsWith(prefix));
  if (!cookie) return null;

  return decodeURIComponent(cookie.slice(prefix.length));
}

export function getJwtFromRequest(request) {
  const authHeader = request.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.split(" ")[1] || null;
  }

  return getCookieValue(request, AUTH_COOKIE_NAME);
}

export const authMiddleware = async (request, reply) => {
  try {
    if (!secretKey) {
      console.error("JWT_SECRET is not configured");
      return reply.status(500).send({ error: "Authentication configuration error" });
    }

    const token = getJwtFromRequest(request);
    if (!token) {
      return reply.status(401).send({ error: "No token provided" });
    }

    // Vérification du token (mode sync pour éviter double-callback)
    const decoded = jwt.verify(token, secretKey);
    request.user = decoded;
  } catch (err) {
    if (err?.name === "TokenExpiredError") {
      console.error("Token expired at:", err.expiredAt);
      return reply.status(401).send({ error: "Token expired", expiredAt: err.expiredAt });
    }
    console.error("Invalid token:", err?.message || err);
    return reply.status(401).send({ error: "Invalid token" });
  }
};
