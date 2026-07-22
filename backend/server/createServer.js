import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUI from "@fastify/swagger-ui";
import { Server as SocketIOServer } from "socket.io";
import { fileURLToPath } from "url";
import path from "path";

import adminBackupRoutes from "../routes/adminBackupRoutes.js";
import adminMessageRoutes from "../routes/adminMessageRoutes.js";
import appSettingRoutes from "../routes/appSettingRoutes.js";
import genreRoutes from "../routes/genreRoutes.js";
import importRoutes from "../routes/importRoutes.js";
import logRoutes from "../routes/logRoutes.js";
import musicRoutes from "../routes/musicRoutes.js";
import personneRoutes from "../routes/personneRoutes.js";
import sagaRoutes from "../routes/sagaRoutes.js";
import seriesRoutes from "../routes/seriesRoutes.js";
import universeRoutes from "../routes/universeRoutes.js";
import userRoutes from "../routes/userRoutes.js";
import videoRoutes from "../routes/videoRoutes.js";
import { globalRateLimit } from "../middlewares/rateLimitMiddleware.js";
import {
  createCorsOriginValidator,
  securityHeadersMiddleware,
} from "../middlewares/securityMiddleware.js";
import { setStaticFileHeaders } from "../utils/staticHeaders.js";
import { parsePublicOrigins } from "./serverConfig.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendBuildRoot = path.resolve(backendRoot, "../frontend/build");
const uploadsRoot = path.join(backendRoot, "uploads");

const ROUTES = [
  [userRoutes, "/api/users"],
  [videoRoutes, "/api/videos"],
  [genreRoutes, "/api/genres"],
  [seriesRoutes, "/api/series"],
  [importRoutes, "/api/import"],
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

function registerStaticFiles(server) {
  server.all("/uploads/BDD", async (_request, reply) =>
    reply.status(404).send({ error: "Not found" })
  );
  server.all("/uploads/BDD/*", async (_request, reply) =>
    reply.status(404).send({ error: "Not found" })
  );

  server.register(fastifyStatic, {
    root: frontendBuildRoot,
    prefix: "/",
    wildcard: true,
    decorateReply: false,
  });

  server.register(fastifyStatic, {
    root: uploadsRoot,
    prefix: "/uploads/",
    setHeaders: setStaticFileHeaders,
  });

  server.setNotFoundHandler((_request, reply) => {
    return reply.sendFile("index.html", frontendBuildRoot);
  });
}

export function createServer({
  https,
  trustProxy = false,
  publicUrl = process.env.PUBLIC_URL,
  publicHost = process.env.PUBLIC_HOST,
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
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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
  registerStaticFiles(server);

  return server;
}
