import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer } from "../server/createServer.js";
import { precompressAssets } from "../../frontend/scripts/precompress-assets.mjs";

let root;
let server;
const source = "console.log('Un fichier public qui se compresse sans modifier son contenu.');\n".repeat(100);
const jsUrl = "/static/js/main.a1b2c3d4.js";
const cssUrl = "/static/css/main.a1b2c3d4.css";

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "sami-asset-delivery-"));
  const build = path.join(root, "build");
  const uploads = path.join(root, "uploads");
  await fs.mkdir(path.join(build, "static/js"), { recursive: true });
  await fs.mkdir(path.join(build, "static/css"), { recursive: true });
  await fs.mkdir(uploads);
  await fs.writeFile(path.join(build, "index.html"), '<html><head><meta name="sami-meta-start" content=""><title>SAMI</title><meta name="sami-meta-end" content=""></head><body><div id="root"></div></body></html>');
  await fs.writeFile(path.join(build, jsUrl), source);
  await fs.writeFile(path.join(build, cssUrl), ".application { color: blue; }\n".repeat(100));
  await fs.writeFile(path.join(build, "static/js/stable.js"), "console.log('non versionné');");
  await fs.writeFile(path.join(build, "logo.png"), "logo");
  await precompressAssets(path.join(build, "static"));
  server = createServer({ frontendBuildRootPath: build, uploadsRootPath: uploads, appName: "SAMI", publicUrl: "https://sami.example", publicHost: "sami.example", loadSocialPreviewMetadata: async () => null });
  await server.ready();
});
afterEach(async () => { await server?.close(); if (root) await fs.rm(root, { recursive: true, force: true }); });

describe("distribution des assets publics", () => {
  it.each([
    ["br, gzip", "br"],
    ["gzip", "gzip"],
    ["br;q=0, gzip;q=1", "gzip"],
  ])("négocie %s, conserve le type MIME et les octets décompressés", async (accept, expected) => {
    const response = await server.inject({ url: jsUrl, headers: { "accept-encoding": accept } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-encoding"]).toBe(expected);
    expect(response.headers["content-type"]).toMatch(/javascript/);
    const decoded = expected === "br" ? brotliDecompressSync(response.rawPayload) : gunzipSync(response.rawPayload);
    expect(decoded.toString()).toBe(source);
    expect(response.rawPayload.length).toBeLessThan(Buffer.byteLength(source));
    expect(response.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(response.headers.vary.toLowerCase()).toContain("accept-encoding");
  });

  it("garde la variante sans compression et les autres valeurs de Vary", async () => {
    const response = await server.inject({ url: jsUrl, headers: { "accept-encoding": "identity", origin: "https://sami.example" } });
    expect(response.body).toBe(source);
    expect(response.headers["content-encoding"]).toBeUndefined();
    expect(response.headers.vary.toLowerCase()).toContain("origin");
    expect(response.headers.vary.toLowerCase()).toContain("accept-encoding");
  });

  it("sert aussi le CSS et retombe sur le fichier source quand les variantes manquent", async () => {
    const css = await server.inject({ url: cssUrl, headers: { "accept-encoding": "br, gzip" } });
    expect(css.headers["content-type"]).toMatch(/text\/css/);
    expect(brotliDecompressSync(css.rawPayload).toString()).toContain("color: blue");
    await fs.rm(path.join(root, "build", jsUrl + ".br"));
    await fs.rm(path.join(root, "build", jsUrl + ".gz"));
    const plain = await server.inject({ url: jsUrl, headers: { "accept-encoding": "br, gzip" } });
    expect(plain.body).toBe(source);
    expect(plain.headers["content-encoding"]).toBeUndefined();
  });

  it("conserve HEAD, les requêtes conditionnelles et les plages sans compression", async () => {
    const initial = await server.inject({ url: jsUrl, headers: { "accept-encoding": "gzip" } });
    const cached = await server.inject({ url: jsUrl, headers: { "accept-encoding": "gzip", "if-none-match": initial.headers.etag } });
    expect(cached.statusCode).toBe(304);
    expect(cached.body).toBe("");
    expect(cached.headers["cache-control"]).toContain("immutable");
    expect(cached.headers.vary.toLowerCase()).toContain("accept-encoding");
    const head = await server.inject({ method: "HEAD", url: jsUrl, headers: { "accept-encoding": "br" } });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe("");
    expect(head.headers["content-encoding"]).toBe("br");
    const range = await server.inject({ url: jsUrl, headers: { "accept-encoding": "identity", range: "bytes=0-9" } });
    expect(range.statusCode).toBe(206);
    expect(range.body).toBe(source.slice(0, 10));
  });

  it("réserve le cache long aux assets à empreinte et ne transforme pas les erreurs en HTML", async () => {
    for (const url of ["/", "/updates", "/login", "/stats", "/logo.png", "/static/js/stable.js", "/static/js/absent.a1b2c3d4.js", "/api/inconnue"]) {
      const response = await server.inject({ url, headers: { "accept-encoding": "br, gzip" } });
      expect(response.headers["cache-control"] || "").not.toContain("immutable");
      expect(response.headers["content-encoding"]).toBeUndefined();
      if (url.includes("absent") || url.startsWith("/api")) expect(response.statusCode).toBe(404);
    }
  });

  it("ignore les fichiers non textuels, les petits fichiers et les liens symboliques du build", async () => {
    const staticRoot = path.join(root, "build/static");
    const outside = path.join(root, "outside.js");
    await fs.writeFile(outside, source);
    await fs.symlink(outside, path.join(staticRoot, "external.js"));
    await fs.writeFile(path.join(staticRoot, "poster.webp"), source);
    await precompressAssets(staticRoot);
    await expect(fs.stat(path.join(staticRoot, "external.js.br"))).rejects.toThrow();
    await expect(fs.stat(path.join(staticRoot, "poster.webp.br"))).rejects.toThrow();
    await expect(fs.stat(path.join(staticRoot, "js/stable.js.br"))).rejects.toThrow();
    const shrinking = path.join(root, "build", jsUrl);
    await fs.writeFile(shrinking, "console.log('petit');");
    await precompressAssets(staticRoot);
    await expect(fs.stat(shrinking + ".br")).rejects.toThrow();
    await expect(fs.stat(shrinking + ".gz")).rejects.toThrow();
  });
});
