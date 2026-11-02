import { STATIC_PAGE_PATHS, getSeoRoute, normalizePagePath } from "../../frontend/src/seo/routePolicy.mjs";
import { renderPublicSitemap } from "../services/pageSeoService.js";
import { resolvePublicOrigin } from "../services/socialPreviewService.js";

export function registerPageSeoRoutes(server, { sendPageShell, publicUrl }) {
  // Normaliser uniquement les routes applicatives connues, en conservant la query.
  server.addHook("onRequest", async (request, reply) => {
    if (!["GET", "HEAD"].includes(request.method)) return;
    const url = request.raw.url || "/";
    const queryIndex = url.indexOf("?");
    const pathname = queryIndex < 0 ? url : url.slice(0, queryIndex);
    const normalized = normalizePagePath(pathname);
    if (pathname !== normalized && getSeoRoute(normalized)) {
      return reply.code(308).redirect(normalized + (queryIndex < 0 ? "" : url.slice(queryIndex)));
    }
  });
  for (const pathname of STATIC_PAGE_PATHS) server.get(pathname, (_request, reply) => sendPageShell(reply, pathname));
  server.get("/index.html", (_request, reply) => reply.code(301).redirect("/"));
  server.get("/robots.txt", (_request, reply) => reply
    .header("Cache-Control", "no-cache")
    .type("text/plain; charset=utf-8")
    .send(`User-agent: *\nAllow: /\nSitemap: ${new URL("/sitemap.xml", resolvePublicOrigin(publicUrl)).href}\n`));
  server.get("/sitemap.xml", (_request, reply) => reply
    .header("Cache-Control", "no-cache")
    .type("application/xml; charset=utf-8")
    .send(renderPublicSitemap(publicUrl)));
}
