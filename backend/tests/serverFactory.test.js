import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { createServer } from "../server/createServer.js";
import { VIDEO_TRANSFER_BLOCK_MARKER } from "../services/videoTransferConfig.js";

let server;
const temporaryRoots = [];

const rawHttpGet = ({ port, requestPath }) =>
  new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        method: "GET",
        path: requestPath,
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          resolve({
            statusCode: response.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    request.on("error", reject);
    request.end();
  });

afterEach(async () => {
  await server?.close();
  server = undefined;
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.promises.rm(root, { recursive: true, force: true })
    )
  );
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

    const timelineResponse = await server.inject({
      method: "GET",
      url: "/api/videos/stats/timeline?metric=inconnue&period=7",
    });

    expect(timelineResponse.statusCode).toBe(400);
    expect(timelineResponse.json()).toEqual({ error: "Métrique ou période invalide." });
  });

  it("ne redirige pas les routes API inconnues vers l'application React", async () => {
    server = createServer({
      publicUrl: "https://sami.test",
      publicHost: "sami.test",
    });
    await server.ready();

    const unknownResponse = await server.inject({
      method: "GET",
      url: "/api/inconnue",
    });
    expect(unknownResponse.statusCode).toBe(404);
    expect(unknownResponse.json()).toEqual({ error: "Route API introuvable." });

    const legacyImportResponse = await server.inject({
      method: "POST",
      url: "/api/import/video",
      payload: {
        Titre: "Ancien import",
        CheminAcces: "video",
        CheminImage: "affiche.jpg",
      },
    });
    expect(legacyImportResponse.statusCode).toBe(404);
    expect(legacyImportResponse.json()).toEqual({
      error: "Route API introuvable.",
    });
  });

  it("n'expose jamais le staging des transferts comme fichier statique", async () => {
    server = createServer({
      publicUrl: "https://sami.test",
      publicHost: "sami.test",
    });
    await server.ready();

    for (const url of [
      "/uploads/video/.transfers",
      "/uploads/video/.transfers/session-id/hls/master.m3u8",
      "/uploads/video/.blocked",
      "/uploads/video/.blocked/42",
    ]) {
      const response = await server.inject({ method: "GET", url });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Not found" });
    }
  });

  it("ne sert une destination transférée qu'après retrait du marqueur de blocage", async () => {
    const uploadsRootPath = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "sami-static-transfer-")
    );
    temporaryRoots.push(uploadsRootPath);
    const videoRoot = path.join(uploadsRootPath, "video", "42");
    const mediaPath = path.join(videoRoot, "hls", "segment.ts");
    const markerPath = path.join(videoRoot, VIDEO_TRANSFER_BLOCK_MARKER);
    const reservationPath = path.join(
      uploadsRootPath,
      "video",
      ".blocked",
      "42"
    );
    await fs.promises.mkdir(path.dirname(mediaPath), { recursive: true });
    await fs.promises.mkdir(path.dirname(reservationPath), { recursive: true });
    await fs.promises.writeFile(mediaPath, "segment vérifié");
    await fs.promises.writeFile(markerPath, "blocked", { mode: 0o600 });
    await fs.promises.writeFile(reservationPath, "transfer-id", { mode: 0o600 });

    server = createServer({
      publicUrl: "https://sami.test",
      publicHost: "sami.test",
      uploadsRootPath,
    });
    await server.listen({ host: "127.0.0.1", port: 0 });

    const blocked = await server.inject({
      method: "GET",
      url: "/uploads/video/42/hls/segment.ts",
    });
    expect(blocked.statusCode).toBe(404);
    expect(blocked.json()).toEqual({ error: "Not found" });

    const address = server.server.address();
    for (const requestPath of [
      "/uploads/video/999/%2e%2e/42/hls/segment.ts",
      "/uploads/video/999/../42/hls/segment.ts",
      "/uploads/video/999/%252e%252e/42/hls/segment.ts",
      "/uploads/images/%2e%2e/video/42/hls/segment.ts",
      "/uploads/images/../video/42/hls/segment.ts",
      "/uploads/./video/42/hls/segment.ts",
      "/uploads//video/42/hls/segment.ts",
      "/foo/../uploads/video/42/hls/segment.ts",
      "/foo/%2e%2e/uploads/video/42/hls/segment.ts",
    ]) {
      const traversal = await rawHttpGet({
        port: address.port,
        requestPath,
      });
      expect(traversal.statusCode).toBe(404);
      expect(traversal.body).not.toContain("segment vérifié");
    }

    await fs.promises.rm(markerPath);
    const stillReserved = await server.inject({
      method: "GET",
      url: "/uploads/video/42/hls/segment.ts",
    });
    expect(stillReserved.statusCode).toBe(404);

    await fs.promises.rm(reservationPath);
    const published = await server.inject({
      method: "GET",
      url: "/uploads/video/42/hls/segment.ts",
    });
    expect(published.statusCode).toBe(200);
    expect(published.body).toBe("segment vérifié");
  });

  it("protège la configuration d'export derrière l'authentification", async () => {
    server = createServer({
      publicUrl: "https://sami.test",
      publicHost: "sami.test",
    });
    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/api/video-exports/config",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "No token provided" });
  });
});
