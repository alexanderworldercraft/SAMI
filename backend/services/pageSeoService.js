import fs from "node:fs/promises";
import path from "node:path";
import { buildRouteSeo, INDEXABLE_PAGE_PATHS } from "../../frontend/src/seo/routePolicy.mjs";
import { injectSocialMetaBlock, renderSocialMetaBlock, resolvePublicOrigin } from "./socialPreviewService.js";

export function createPageShellSender({ frontendBuildRoot, appName, publicUrl }) {
  const origin = resolvePublicOrigin(publicUrl);
  return async (reply, pathname, statusCode = 200) => {
    const meta = buildRouteSeo({ pathname, siteName: appName, origin, statusCode });
    let template = await fs.readFile(path.join(frontendBuildRoot, "index.html"), "utf8");
    if (statusCode >= 400) {
      const heading = statusCode >= 500 ? "Service temporairement indisponible" : "Page introuvable";
      // Une erreur HTTP doit rester lisible sans monter les pages protégées de React.
      template = template
        .replace(/<script\b[^>]*\bsrc\s*=[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<div\s+id=["']root["']\s*><\/div>/i, `<div id="root"><main class="mx-auto grid min-h-screen max-w-2xl content-center gap-5 bg-slate-950 px-6 py-12 text-slate-100"><h1 class="text-3xl font-bold">${heading}</h1><p>${meta.description}</p><a href="/" class="text-sky-400">Retour à l'accueil</a></main></div>`);
    }
    return reply.code(statusCode)
      .header("Cache-Control", "no-cache")
      .header("X-Robots-Tag", meta.robots)
      .type("text/html; charset=utf-8")
      .send(injectSocialMetaBlock(template, renderSocialMetaBlock(meta)));
  };
}

const escapeXml = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("'", "&apos;");

export function renderPublicSitemap(publicUrl) {
  const origin = resolvePublicOrigin(publicUrl);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...INDEXABLE_PAGE_PATHS.map((pathname) => `  <url><loc>${escapeXml(new URL(pathname, origin).href)}</loc></url>`),
    "</urlset>",
  ].join("\n");
}
