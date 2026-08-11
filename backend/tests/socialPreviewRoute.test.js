import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createServer } from "../server/createServer.js";
import {
  SOCIAL_META_END,
  SOCIAL_META_START,
} from "../services/socialPreviewService.js";

let server;
const temporaryRoots = [];

async function createStaticRoots() {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "sami-social-preview-")
  );
  const frontendBuildRootPath = path.join(root, "build");
  const uploadsRootPath = path.join(root, "uploads");
  await fs.promises.mkdir(frontendBuildRootPath, { recursive: true });
  await fs.promises.mkdir(uploadsRootPath, { recursive: true });
  await fs.promises.writeFile(
    path.join(frontendBuildRootPath, "index.html"),
    [
      "<!doctype html><html><head>",
      SOCIAL_META_START,
      '<title data-rh="true">Métadonnées génériques</title>',
      SOCIAL_META_END,
      "</head><body><div id=\"root\"></div></body></html>",
    ].join("\n")
  );
  temporaryRoots.push(root);
  return { frontendBuildRootPath, uploadsRootPath };
}

afterEach(async () => {
  await server?.close();
  server = undefined;
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.promises.rm(root, { recursive: true, force: true })
    )
  );
});

describe("GET /lecture/:id social preview", () => {
  it("sert le shell React enrichi avant le fallback statique et sans cookie", async () => {
    const roots = await createStaticRoots();
    const loadSocialPreviewMetadata = vi.fn().mockResolvedValue({
      type: "episode",
      videoId: 42,
      video: {
        title: "Le Départ",
        summary: "Résumé de l'épisode",
        image: "uploads/video/42/le-depart.webp",
      },
      season: { number: 3 },
      series: {
        title: "Voyages",
        summary: "Résumé de la série",
        image: "uploads/serie/5/voyages.webp",
      },
    });
    server = createServer({
      ...roots,
      appName: "Mon SAMI",
      publicUrl: "https://sami.example",
      publicHost: "sami.example",
      loadSocialPreviewMetadata,
    });
    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/lecture/42",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(loadSocialPreviewMetadata).toHaveBeenCalledWith(42);
    expect(response.body).toContain(
      '<meta data-rh="true" property="og:title" content="Le Départ (Saison 3 - Voyages) - Mon SAMI" />'
    );
    expect(response.body).toContain(
      '<meta data-rh="true" property="og:image" content="https://sami.example/uploads/serie/5/voyages.webp" />'
    );
    expect(response.body).toContain(
      '<link data-rh="true" rel="canonical" href="https://sami.example/lecture/42" />'
    );
    expect(response.body).not.toContain("Métadonnées génériques");
    expect(response.body).not.toContain("CheminAcces");
  });

  it("retourne des métadonnées génériques si la base échoue", async () => {
    const roots = await createStaticRoots();
    server = createServer({
      ...roots,
      appName: "Mon SAMI",
      publicUrl: "https://sami.example",
      publicHost: "sami.example",
      loadSocialPreviewMetadata: vi.fn().mockRejectedValue(new Error("DB indisponible")),
    });
    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/lecture/99",
      headers: { host: "evil.example" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(
      '<meta data-rh="true" property="og:title" content="Mon SAMI" />'
    );
    expect(response.body).toContain(
      '<meta data-rh="true" property="og:image" content="https://sami.example/logo512.png" />'
    );
    expect(response.body).toContain("https://sami.example/lecture/99");
    expect(response.body).not.toContain("evil.example");
    expect(response.body).not.toContain("DB indisponible");
  });

  it("n'interroge pas la base pour un identifiant invalide", async () => {
    const roots = await createStaticRoots();
    const loadSocialPreviewMetadata = vi.fn();
    server = createServer({
      ...roots,
      appName: "Mon SAMI",
      publicUrl: "https://sami.example",
      publicHost: "sami.example",
      loadSocialPreviewMetadata,
    });
    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/lecture/1e3",
    });

    expect(response.statusCode).toBe(200);
    expect(loadSocialPreviewMetadata).not.toHaveBeenCalled();
    expect(response.body).toContain(
      '<link data-rh="true" rel="canonical" href="https://sami.example/" />'
    );
  });
});
