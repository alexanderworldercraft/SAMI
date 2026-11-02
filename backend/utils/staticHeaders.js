const CONTENT_TYPES_BY_EXT = new Map([
  [".m3u8", "application/vnd.apple.mpegurl; charset=utf-8"],
  [".ts", "video/mp2t"],
  [".m4s", "video/iso.segment"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".vtt", "text/vtt; charset=utf-8"],
]);

export function setStaticFileHeaders(response, filePath) {
  const lowerPath = String(filePath || "").toLowerCase();
  const match = Array.from(CONTENT_TYPES_BY_EXT.entries())
    .find(([extension]) => lowerPath.endsWith(extension));

  if (match) {
    response.setHeader("Content-Type", match[1]);
  }

  if (lowerPath.includes("/hls/") || lowerPath.endsWith(".m3u8") || lowerPath.endsWith(".ts")) {
    response.setHeader("Cache-Control", "public, max-age=3600");
  }
}

// Cette politique est réservée aux assets publics du build, identifiés par leur hash.
const HASHED_FRONTEND_ASSET = /^\/static\/(?:[^/]+\/)*[^/]+\.[a-f0-9]{8,}(?:\.chunk)?\.(?:js|css|png|jpe?g|gif|svg|webp|avif|ico|woff2?|ttf|eot)(?:\.map)?$/i;

export async function setFrontendAssetHeaders(request, reply, payload) {
  const pathname = String(request.raw.url || "").split("?", 1)[0];
  if (![200, 206, 304].includes(reply.statusCode) || !pathname.startsWith("/static/")) return payload;
  if (HASHED_FRONTEND_ASSET.test(pathname)) {
    reply.header("Cache-Control", "public, max-age=31536000, immutable");
  }
  // Vary est aussi nécessaire pour la réponse sans compression, faute de quoi
  // un cache partagé pourrait réutiliser la mauvaise représentation.
  if (/\.(?:js|css)$/.test(pathname)) {
    const vary = String(reply.getHeader("Vary") || "").split(",").map((value) => value.trim()).filter(Boolean);
    if (!vary.some((value) => value === "*" || value.toLowerCase() === "accept-encoding")) vary.push("Accept-Encoding");
    reply.header("Vary", vary.join(", "));
  }
  return payload;
}
