import { describe, expect, it, vi } from "vitest";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import aiSubtitleRoutes from "../routes/aiSubtitleRoutes.js";

const routeRecorder = () => {
  const routes = [];
  const fastify = {};
  for (const method of ["get", "post", "put", "delete"]) {
    fastify[method] = vi.fn((path, options, handler) => {
      routes.push({ method: method.toUpperCase(), path, options, handler });
    });
  }
  return { fastify, routes };
};

describe("routes d'administration des sous-titres IA", () => {
  it("protège les listes et toutes les mutations derrière l'authentification", async () => {
    const { fastify, routes } = routeRecorder();

    await aiSubtitleRoutes(fastify);

    expect(routes.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /config",
      "PUT /config",
      "GET /admin/videos-without-french",
      "GET /admin/generated",
      "GET /admin/subtitles/:subtitleId",
      "PUT /admin/subtitles/:subtitleId/text",
      "PUT /admin/subtitles/:subtitleId/segments",
      "DELETE /admin/subtitles/:subtitleId",
      "POST /admin/subtitles/:subtitleId/recreate",
      "GET /videos/:videoId",
      "POST /videos/:videoId/requests",
    ]);
    expect(routes.every((route) => route.options.preHandler === authMiddleware)).toBe(true);
  });
});
