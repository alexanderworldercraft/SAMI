import fs from "fs";
import path from "path";

import {
  buildLectureSocialMeta,
  buildPersonSocialMeta,
  getLectureSocialMetadata,
  getPersonSocialMetadata,
  injectSocialMetaBlock,
  parseLectureVideoId,
  parsePersonId,
  renderSocialMetaBlock,
  resolvePublicOrigin,
} from "../services/socialPreviewService.js";

export function registerSocialPreviewRoute(server, {
  appName = process.env.APP_NAME || "SAMI",
  frontendBuildRoot,
  loadMetadata = getLectureSocialMetadata,
  loadPersonMetadata = getPersonSocialMetadata,
  publicUrl = process.env.PUBLIC_URL,
} = {}) {
  const templatePath = path.join(frontendBuildRoot, "index.html");
  // Le build frontend peut être remplacé pendant que le backend reste lancé.
  // Relire le shell évite de continuer à servir un ancien hash JavaScript supprimé.
  const loadTemplate = () => fs.promises.readFile(templatePath, "utf8");

  server.get("/lecture/:id", async (request, reply) => {
    const videoId = parseLectureVideoId(request.params?.id);
    let content = null;

    if (videoId) {
      try {
        content = await loadMetadata(videoId);
      } catch (error) {
        request.log.error(
          { err: error, videoId },
          "Impossible de charger les métadonnées sociales de la vidéo."
        );
      }
    }

    const publicOrigin = resolvePublicOrigin(publicUrl);
    const meta = buildLectureSocialMeta({
      content,
      videoId,
      appName,
      publicOrigin,
    });
    const htmlTemplate = await loadTemplate();
    const html = injectSocialMetaBlock(htmlTemplate, renderSocialMetaBlock(meta));

    return reply
      .header("Cache-Control", "no-cache")
      .type("text/html; charset=utf-8")
      .send(html);
  });

  server.get("/personnes/:id", async (request, reply) => {
    const personId = parsePersonId(request.params?.id);
    let person = null;

    if (personId) {
      try {
        person = await loadPersonMetadata(personId);
      } catch (error) {
        request.log.error(
          { err: error, personId },
          "Impossible de charger les métadonnées sociales de la personne."
        );
      }
    }

    const publicOrigin = resolvePublicOrigin(publicUrl);
    const meta = buildPersonSocialMeta({
      person,
      personId,
      appName,
      publicOrigin,
    });
    const htmlTemplate = await loadTemplate();
    const html = injectSocialMetaBlock(htmlTemplate, renderSocialMetaBlock(meta));

    return reply
      .header("Cache-Control", "no-cache")
      .type("text/html; charset=utf-8")
      .send(html);
  });
}
