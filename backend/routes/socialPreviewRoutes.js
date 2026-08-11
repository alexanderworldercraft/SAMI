import fs from "fs";
import path from "path";

import {
  buildLectureSocialMeta,
  getLectureSocialMetadata,
  injectSocialMetaBlock,
  parseLectureVideoId,
  renderSocialMetaBlock,
  resolvePublicOrigin,
} from "../services/socialPreviewService.js";

export function registerSocialPreviewRoute(server, {
  appName = process.env.APP_NAME || "SAMI",
  frontendBuildRoot,
  loadMetadata = getLectureSocialMetadata,
  publicUrl = process.env.PUBLIC_URL,
} = {}) {
  const templatePath = path.join(frontendBuildRoot, "index.html");
  let templatePromise = null;
  const loadTemplate = () => {
    if (!templatePromise) {
      templatePromise = fs.promises.readFile(templatePath, "utf8");
    }
    return templatePromise;
  };

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
}
