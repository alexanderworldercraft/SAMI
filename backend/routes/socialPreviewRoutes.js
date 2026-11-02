import fs from "node:fs/promises";
import path from "node:path";
import { createPageShellSender } from "../services/pageSeoService.js";
import {
  buildLectureSocialMeta, buildPersonSocialMeta,
  getLectureSocialMetadata, getPersonSocialMetadata,
  injectSocialMetaBlock, parseLectureVideoId, parsePersonId,
  renderSocialMetaBlock, resolvePublicOrigin,
} from "../services/socialPreviewService.js";

export function registerSocialPreviewRoute(server, {
  appName = process.env.APP_NAME || "SAMI",
  frontendBuildRoot,
  loadMetadata = getLectureSocialMetadata,
  loadPersonMetadata = getPersonSocialMetadata,
  publicUrl = process.env.PUBLIC_URL,
  sendPageShell = createPageShellSender({ frontendBuildRoot, appName, publicUrl }),
} = {}) {
  const routes = [
    { path: "/lecture/:id", parse: parseLectureVideoId, load: loadMetadata, build: (content, id, origin) => buildLectureSocialMeta({ content, videoId: id, appName, publicOrigin: origin }) },
    { path: "/personnes/:id", parse: parsePersonId, load: loadPersonMetadata, build: (person, id, origin) => buildPersonSocialMeta({ person, personId: id, appName, publicOrigin: origin }) },
  ];
  for (const route of routes) {
    server.get(route.path, async (request, reply) => {
      const pathname = (request.raw.url || "/").split("?", 1)[0];
      const id = route.parse(request.params?.id);
      if (!id) return sendPageShell(reply, pathname, 404);
      let content;
      try {
        content = await route.load(id);
      } catch (error) {
        request.log.error({ err: error, id }, "Impossible de charger les métadonnées de partage.");
        reply.header("Retry-After", "30");
        return sendPageShell(reply, pathname, 503);
      }
      if (!content) return sendPageShell(reply, pathname, 404);
      const meta = route.build(content, id, resolvePublicOrigin(publicUrl));
      // Le build peut être remplacé sans redémarrage : ne pas garder ses anciens hashes.
      const template = await fs.readFile(path.join(frontendBuildRoot, "index.html"), "utf8");
      return reply.header("Cache-Control", "no-cache")
        .header("X-Robots-Tag", "noindex, nofollow")
        .type("text/html; charset=utf-8")
        .send(injectSocialMetaBlock(template, renderSocialMetaBlock(meta)));
    });
  }
}
