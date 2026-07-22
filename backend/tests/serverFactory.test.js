import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "../server/createServer.js";

let server;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("createServer", () => {
  it("enregistre les routes communes sans démarrer l'écoute réseau", async () => {
    server = createServer({
      publicUrl: "https://sami.test",
      publicHost: "sami.test",
    });
    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/api/videos/calendar/added-by-date?year=2026&month=13",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Paramètres année ou mois invalides" });
  });
});
