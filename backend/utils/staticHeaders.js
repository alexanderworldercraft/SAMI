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
