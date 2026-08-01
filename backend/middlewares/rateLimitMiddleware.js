import { getClientIp } from "../controllers/logController.js";

const stores = new Map();

function getStore(name) {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  return stores.get(name);
}

function getRateLimitKey(request, keyPrefix, keyGenerator) {
  const customKey = keyGenerator?.(request);
  if (customKey) return `${keyPrefix}:${customKey}`;

  return `${keyPrefix}:ip:${getClientIp(request) || request.ip || "unknown"}`;
}

export function createRateLimit({
  windowMs = 60_000,
  max = 120,
  keyPrefix = "default",
  keyGenerator,
  skip,
} = {}) {
  const store = getStore(keyPrefix);

  return async function rateLimitMiddleware(request, reply) {
    if (skip?.(request)) return;

    const now = Date.now();
    const key = getRateLimitKey(request, keyPrefix, keyGenerator);
    const existing = store.get(key);
    const entry = existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + windowMs };

    entry.count += 1;
    store.set(key, entry);

    const retryAfterSeconds = Math.ceil((entry.resetAt - now) / 1000);
    reply.header("X-RateLimit-Limit", String(max));
    reply.header("X-RateLimit-Remaining", String(Math.max(0, max - entry.count)));
    reply.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      reply.header("Retry-After", String(retryAfterSeconds));
      return reply.status(429).send({
        error: "Trop de requêtes. Réessaie plus tard.",
        retryAfter: retryAfterSeconds,
      });
    }
  };
}

export const globalRateLimit = createRateLimit({
  keyPrefix: "global",
  windowMs: 60_000,
  max: 1200,
  skip: (request) =>
    request.method === "OPTIONS"
    || !request.url.startsWith("/api/")
    || (
      request.method === "PUT"
      && (
        (
          request.url.startsWith("/api/internal/video-transfers/sessions/")
          && request.url.includes("/files/")
        )
        || (
          request.url.startsWith("/api/internal/video-encoding/tasks/")
          && request.url.includes("/artifacts/")
        )
      )
    ),
});

export const authRateLimit = createRateLimit({
  keyPrefix: "auth",
  windowMs: 15 * 60_000,
  max: 30,
  keyGenerator: (request) => {
    const ip = getClientIp(request) || request.ip || "unknown";
    const surnom = typeof request.body?.surnom === "string"
      ? request.body.surnom.trim().toLowerCase()
      : "";
    return surnom ? `${ip}:user:${surnom}` : `ip:${ip}`;
  },
});

export const registerRateLimit = createRateLimit({
  keyPrefix: "register",
  windowMs: 60 * 60_000,
  max: 10,
});

export const passwordResetRateLimit = createRateLimit({
  keyPrefix: "password-reset",
  windowMs: 60 * 60_000,
  max: 5,
});

export const videoExportAuthorizationRateLimit = createRateLimit({
  keyPrefix: "video-export-authorization",
  windowMs: 15 * 60_000,
  max: 5,
  keyGenerator: (request) => {
    const ip = getClientIp(request) || request.ip || "unknown";
    const userId = Number(request.user?.userId);
    return Number.isInteger(userId) ? `${ip}:user:${userId}` : `ip:${ip}`;
  },
});
