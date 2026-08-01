import { describe, expect, it, vi } from "vitest";

import { uploadInternalVideoEncodingArtifact } from "../controllers/internalVideoEncodingController.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
  internalDistributedEncodingBodyIntegrity,
  internalDistributedEncodingRawAuth,
} from "../middlewares/internalDistributedEncodingAuth.js";
import internalVideoEncodingRoutes from "../routes/internalVideoEncodingRoutes.js";
import videoEncodingRoutes from "../routes/videoEncodingRoutes.js";

const routeRecorder = () => {
  const routes = [];
  const fastify = {};
  for (const method of ["get", "post", "put", "patch", "delete"]) {
    fastify[method] = vi.fn((path, options, handler) => {
      routes.push({ method: method.toUpperCase(), path, options, handler });
    });
  }
  return { fastify, routes };
};

describe("routes d'encodage multi-server", () => {
  it("enregistre toute l'API publique derrière authMiddleware", async () => {
    const { fastify, routes } = routeRecorder();

    await videoEncodingRoutes(fastify);

    expect(routes.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /config",
      "PUT /config",
      "GET /workers",
      "POST /workers",
      "PATCH /workers/:workerId",
      "DELETE /workers/:workerId",
      "POST /jobs",
      "GET /jobs",
      "GET /jobs/:jobId",
      "POST /jobs/:jobId/resume",
      "POST /jobs/:jobId/cancel",
    ]);
    expect(routes.every((route) => route.options.preHandler === authMiddleware)).toBe(true);
  });

  it("protège le JSON interne en deux phases et traite le PUT brut onRequest", async () => {
    const { fastify, routes } = routeRecorder();

    await internalVideoEncodingRoutes(fastify);

    const rawUpload = routes.find(
      (route) => route.path === "/tasks/:taskId/artifacts/:fileId"
    );
    expect(rawUpload).toMatchObject({ method: "PUT" });
    expect(rawUpload.options.onRequest).toEqual([
      internalDistributedEncodingRawAuth,
      uploadInternalVideoEncodingArtifact,
    ]);
    expect(rawUpload.options.preHandler).toBeUndefined();

    const jsonRoutes = routes.filter((route) => route !== rawUpload);
    expect(jsonRoutes).toHaveLength(8);
    for (const route of jsonRoutes) {
      expect(route.options.onRequest).toBe(internalDistributedEncodingRawAuth);
      expect(route.options.preHandler).toBe(
        internalDistributedEncodingBodyIntegrity
      );
    }
  });
});
