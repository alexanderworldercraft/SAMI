import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../server/createServer.js";
import { buildRouteSeo, INDEXABLE_PAGE_PATHS, STATIC_PAGE_PATHS } from "../../frontend/src/seo/routePolicy.mjs";

let server;
let root;
let loadVideo;
let loadPerson;
const approvedPaths = ["/", "/updates", "/politique-confidentialite", "/conditions-utilisation", "/conformite-donnees"];
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "sami-seo-"));
  const build = path.join(root, "build");
  const uploads = path.join(root, "uploads");
  await fs.mkdir(build);
  await fs.mkdir(uploads);
  await fs.writeFile(path.join(build, "index.html"), '<!doctype html><html><head><meta name="sami-meta-start" content=""><title>Ancien titre</title><link rel="canonical" href="https://wrong.example/"><meta name="sami-meta-end" content=""><script defer src="/static/js/main.hash.js"></script></head><body><div id="root"></div></body></html>');
  loadVideo = vi.fn().mockResolvedValue({ type: "movie", video: { title: "Film public en aperçu", summary: "Résumé autorisé", image: "uploads/video/42/poster.webp" } });
  loadPerson = vi.fn().mockResolvedValue({ personId: 7, firstName: "Une", lastName: "Personne" });
  server = createServer({ frontendBuildRootPath: build, uploadsRootPath: uploads, appName: "Mon SAMI", publicUrl: "https://sami.example,https://autre.example", publicHost: "sami.example", loadSocialPreviewMetadata: loadVideo, loadPersonSocialPreviewMetadata: loadPerson });
  await server.ready();
});
afterEach(async () => {
  await server?.close();
  if (root) await fs.rm(root, { recursive: true, force: true });
});

describe("politique SEO du HTML initial", () => {
  it.each(STATIC_PAGE_PATHS)("sert les balises propres à %s dès le serveur", async (pathname) => {
    const response = await server.inject({ url: pathname, headers: { host: "evil.example" } });
    const meta = buildRouteSeo({ pathname, siteName: "Mon SAMI", origin: "https://sami.example" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-robots-tag"]).toBe(meta.robots);
    expect(response.headers["x-robots-tag"]).toBe(approvedPaths.includes(pathname) ? "index, follow" : "noindex, nofollow");
    expect(response.body).toContain(`href="${meta.canonicalUrl}"`);
    expect(response.body.match(/rel="canonical"/g)).toHaveLength(1);
    expect(response.body).toContain(`name="robots" content="${meta.robots}"`);
    expect(response.body).toContain('property="og:image"');
    expect(response.body).toContain('name="twitter:card"');
    expect(response.body).not.toContain("wrong.example");
    expect(response.body).not.toContain("evil.example");
    expect(response.body).toContain("/static/js/main.hash.js");
    expect(loadVideo).not.toHaveBeenCalled();
    expect(loadPerson).not.toHaveBeenCalled();
  });

  it("normalise une barre finale et index.html sans perdre les paramètres", async () => {
    const response = await server.inject({ url: "/updates/?source=menu" });
    expect(response.statusCode).toBe(308);
    expect(response.headers.location).toBe("/updates?source=menu");
    const index = await server.inject({ url: "/index.html" });
    expect(index.statusCode).toBe(301);
    expect(index.headers.location).toBe("/");
    const head = await server.inject({ method: "HEAD", url: "/updates" });
    expect(head.statusCode).toBe(200);
    expect(head.headers["x-robots-tag"]).toBe("index, follow");
    expect(head.body).toBe("");
  });

  it("conserve les aperçus des contenus protégés en les excluant de l'indexation", async () => {
    for (const url of ["/lecture/42", "/personnes/7"]) {
      const response = await server.inject({ url });
      expect(response.statusCode).toBe(200);
      expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
      expect(response.body).toContain(`href="https://sami.example${url}"`);
      expect(response.body).toContain('name="robots" content="noindex, nofollow"');
    }
  });

  it.each(["/inconnue", "/lecture/0", "/personnes/2147483648"])("répond 404 avec une page lisible et sans script pour %s", async (url) => {
    const response = await server.inject({ url });
    expect(response.statusCode).toBe(404);
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(response.body).toContain("<h1");
    expect(response.body).toContain("bg-slate-950");
    expect(response.body).toContain("text-slate-100");
    expect(response.body).toContain("Page introuvable");
    expect(response.body).toContain('href="/"');
    expect(response.body).not.toContain('rel="canonical"');
    expect(response.body).not.toContain("<script");
    expect(loadVideo).not.toHaveBeenCalled();
    expect(loadPerson).not.toHaveBeenCalled();
  });

  it("distingue une absence de contenu d'une indisponibilité de la base", async () => {
    loadVideo.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("secret DB"));
    expect((await server.inject({ url: "/lecture/42" })).statusCode).toBe(404);
    const unavailable = await server.inject({ url: "/lecture/42" });
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.headers["retry-after"]).toBe("30");
    expect(unavailable.body).not.toContain("secret DB");
    loadPerson.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("secret DB"));
    expect((await server.inject({ url: "/personnes/7" })).statusCode).toBe(404);
    expect((await server.inject({ url: "/personnes/7" })).statusCode).toBe(503);
  });

  it("ne renvoie jamais le shell à la place d'une ressource manquante ou d'une API inconnue", async () => {
    for (const url of ["/static/js/absent.js", "/uploads/absent.webp", "/image-absente.png", "/api/inconnue"]) {
      const response = await server.inject({ url });
      expect(response.statusCode).toBe(404);
      expect(response.headers["content-type"]).not.toContain("text/html");
      expect(response.body).not.toContain("<html");
    }
  });

  it("publie uniquement les cinq URL canoniques approuvées dans un sitemap XML", async () => {
    const response = await server.inject({ url: "/sitemap.xml", headers: { host: "evil.example" } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/xml");
    expect([...response.body.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1])).toEqual(INDEXABLE_PAGE_PATHS.map((pathname) => `https://sami.example${pathname}`));
    expect(INDEXABLE_PAGE_PATHS).toHaveLength(5);
    expect(INDEXABLE_PAGE_PATHS).toEqual(approvedPaths);
    expect(response.body).not.toMatch(/lecture|personnes|stats|login|lastmod|evil.example/);
    const robots = await server.inject({ url: "/robots.txt" });
    expect(robots.headers["content-type"]).toContain("text/plain");
    expect(robots.body).toContain("Sitemap: https://sami.example/sitemap.xml");
    expect(robots.body).not.toContain("Disallow:");
  });
});
