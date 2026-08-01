import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
import { Server as SocketIOServer } from "socket.io";
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";

import adminBackupRoutes from "../routes/adminBackupRoutes.js";
import adminMessageRoutes from "../routes/adminMessageRoutes.js";
import appSettingRoutes from "../routes/appSettingRoutes.js";
import genreRoutes from "../routes/genreRoutes.js";
import internalVideoEncodingRoutes from "../routes/internalVideoEncodingRoutes.js";
import internalVideoTransferRoutes from "../routes/internalVideoTransferRoutes.js";
import logRoutes from "../routes/logRoutes.js";
import musicRoutes from "../routes/musicRoutes.js";
import personneRoutes from "../routes/personneRoutes.js";
import sagaRoutes from "../routes/sagaRoutes.js";
import seriesRoutes from "../routes/seriesRoutes.js";
import universeRoutes from "../routes/universeRoutes.js";
import userRoutes from "../routes/userRoutes.js";
import videoExportRoutes from "../routes/videoExportRoutes.js";
import videoEncodingRoutes from "../routes/videoEncodingRoutes.js";
import videoRoutes from "../routes/videoRoutes.js";
import { globalRateLimit } from "../middlewares/rateLimitMiddleware.js";
import {
  createCorsOriginValidator,
  securityHeadersMiddleware,
} from "../middlewares/securityMiddleware.js";
import { setStaticFileHeaders } from "../utils/staticHeaders.js";
import { VIDEO_TRANSFER_BLOCK_MARKER } from "../services/videoTransferConfig.js";
import { parsePublicOrigins } from "./serverConfig.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendBuildRoot = path.resolve(backendRoot, "../frontend/build");
const uploadsRoot = path.join(backendRoot, "uploads");

const ROUTES = [
  [userRoutes, "/api/users"],
  [videoRoutes, "/api/videos"],
  [videoEncodingRoutes, "/api/video-encoding"],
  [videoExportRoutes, "/api/video-exports"],
  [internalVideoEncodingRoutes, "/api/internal/video-encoding"],
  [internalVideoTransferRoutes, "/api/internal/video-transfers"],
  [genreRoutes, "/api/genres"],
  [seriesRoutes, "/api/series"],
  [personneRoutes, "/api/people"],
  [logRoutes, "/api/logs"],
  [adminMessageRoutes, "/api/admin-message"],
  [adminBackupRoutes, "/api/admin-backup"],
  [appSettingRoutes, "/api/app-settings"],
  [sagaRoutes, "/api/sagas"],
  [universeRoutes, "/api/universes"],
  [musicRoutes, "/api/music"],
];

function getSocketCorsOrigin(publicUrl) {
  const origins = parsePublicOrigins(publicUrl);
  if (origins.length === 0) return undefined;
  return origins.length === 1 ? origins[0] : origins;
}

function registerDocumentation(server, publicHost) {
  server.register(fastifySwagger, {
    openapi: {
      info: {
        title: "SAMI API",
        description: "API de la médiathèque SAMI.",
        version: "1.0.0",
      },
      externalDocs: {
        url: "https://swagger.io",
        description: "Documentation OpenAPI",
      },
      ...(publicHost ? { servers: [{ url: `https://${publicHost}` }] } : {}),
      components: {
        securitySchemes: {
          token: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  });

  server.register(fastifySwaggerUI, {
    routePrefix: "/documentation",
    uiConfig: { docExpansion: "list" },
  });
}

function registerStaticFiles(server, uploadsRootPath = uploadsRoot) {
  server.all("/uploads/BDD", async (_request, reply) =>
    reply.status(404).send({ error: "Not found" })
  );
  server.all("/uploads/BDD/*", async (_request, reply) =>
    reply.status(404).send({ error: "Not found" })
  );
  server.all("/uploads/video/.transfers", async (_request, reply) =>
    reply.status(404).send({ error: "Not found" })
  );
  server.all("/uploads/video/.transfers/*", async (_request, reply) =>
    reply.status(404).send({ error: "Not found" })
  );
  server.all("/uploads/video/.blocked", async (_request, reply) =>
    reply.status(404).send({ error: "Not found" })
  );
  server.all("/uploads/video/.blocked/*", async (_request, reply) =>
    reply.status(404).send({ error: "Not found" })
  );
  server.all("/uploads/video/.encoding", async (_request, reply) =>
    reply.status(404).send({ error: "Not found" })
  );
  server.all("/uploads/video/.encoding/*", async (_request, reply) =>
    reply.status(404).send({ error: "Not found" })
  );
  server.addHook("onRequest", async (request, reply) => {
    const rawPath = String(request.raw.url || "").split("?", 1)[0];
    let decodedPath = rawPath;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      return reply.status(404).send({ error: "Not found" });
    }
    if (/%(?:2f|5c|25)/i.test(rawPath)) {
      return reply.status(404).send({ error: "Not found" });
    }

    const segments = decodedPath.split("/");
    if (
      decodedPath.includes("\\")
      || decodedPath.includes("%")
      || /[\u0000-\u001f\u007f]/.test(decodedPath)
      || segments.some((segment) => segment === "." || segment === "..")
      || path.posix.normalize(decodedPath) !== decodedPath
    ) {
      return reply.status(404).send({ error: "Not found" });
    }
    if (!decodedPath.startsWith("/uploads/")) return;
    if (!decodedPath.startsWith("/uploads/video/")) return;
    if (
      decodedPath === "/uploads/video/.transfers"
      || decodedPath.startsWith("/uploads/video/.transfers/")
      || decodedPath === "/uploads/video/.blocked"
      || decodedPath.startsWith("/uploads/video/.blocked/")
      || decodedPath === "/uploads/video/.encoding"
      || decodedPath.startsWith("/uploads/video/.encoding/")
    ) {
      return reply.status(404).send({ error: "Not found" });
    }

    const match = decodedPath.match(
      /^\/uploads\/video\/([1-9][0-9]*)(?:\/|$)/
    );
    if (!match) return;

    const markerPath = path.join(
      uploadsRootPath,
      "video",
      match[1],
      VIDEO_TRANSFER_BLOCK_MARKER
    );
    const reservationPath = path.join(
      uploadsRootPath,
      "video",
      ".blocked",
      match[1]
    );
    if (fs.existsSync(reservationPath) || fs.existsSync(markerPath)) {
      return reply.status(404).send({ error: "Not found" });
    }
  });

  server.register(fastifyStatic, {
    root: frontendBuildRoot,
    prefix: "/",
    wildcard: true,
    decorateReply: false,
  });

  server.register(fastifyStatic, {
    root: uploadsRootPath,
    prefix: "/uploads/",
    setHeaders: setStaticFileHeaders,
  });

  server.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith("/api/")) {
      return reply.status(404).send({ error: "Route API introuvable." });
    }
    return reply.sendFile("index.html", frontendBuildRoot);
  });
}

export function createServer({
  https,
  trustProxy = false,
  publicUrl = process.env.PUBLIC_URL,
  publicHost = process.env.PUBLIC_HOST,
  uploadsRootPath = uploadsRoot,
} = {}) {
  const server = Fastify({
    ...(https ? { https } : {}),
    ...(trustProxy ? { trustProxy: true } : {}),
    ajv: {
      customOptions: { removeAdditional: true },
    },
  });

  const io = new SocketIOServer(server.server, {
    cors: {
      origin: getSocketCorsOrigin(publicUrl),
      methods: ["GET", "POST"],
    },
  });
  server.decorate("io", io);

  registerDocumentation(server, publicHost);
  server.addHook("onRequest", securityHeadersMiddleware);
  server.register(fastifyCors, {
    origin: createCorsOriginValidator(publicUrl),
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    exposedHeaders: ["Content-Disposition", "X-Backup-Filename"],
  });
  server.register(fastifyMultipart, {
    limits: { fileSize: 50 * 1024 * 1024 * 1024 },
  });

  server.setErrorHandler((error, _request, reply) => {
    if (error?.statusCode === 413 || error?.code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.status(413).send({ error: "Fichier trop volumineux." });
    }

    return reply.send(error);
  });

  server.addHook("onRequest", globalRateLimit);
  for (const [routes, prefix] of ROUTES) {
    server.register(routes, { prefix });
  }
  registerStaticFiles(server, uploadsRootPath);

  return server;
}
