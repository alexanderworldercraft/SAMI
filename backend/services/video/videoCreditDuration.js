import fs from "node:fs/promises";
import path from "node:path";
import { resolveUploadPath, UPLOADS_ROOT } from "./videoPaths.js";

// Read the local video rendition, never a browser-supplied duration or remote URL.
export async function getCreditVideoDuration(video) {
  const root = await fs.realpath(UPLOADS_ROOT);
  async function readPlaylist(filename, depth = 0) {
    if (!filename || depth > 2) throw new Error("Playlist invalide");
    const real = await fs.realpath(filename);
    if (!real.startsWith(`${root}${path.sep}`)) throw new Error("Playlist hors stockage");
    const lines = (await fs.readFile(real, "utf8")).split(/\r?\n/).map(line => line.trim());
    const durations = lines.filter(line => line.startsWith("#EXTINF:")).map(line => Number(line.slice(8).split(",")[0]));
    if (durations.length && lines.includes("#EXT-X-ENDLIST") && durations.every(n => Number.isFinite(n) && n > 0)) {
      return durations.reduce((a, b) => a + b, 0);
    }
    const variantIndex = lines.findIndex(line => line.startsWith("#EXT-X-STREAM-INF:"));
    const variant = lines.slice(variantIndex + 1).find(line => line && !line.startsWith("#"));
    if (variantIndex < 0 || !variant || /^[a-z]+:|^[/\\]/i.test(variant)) throw new Error("Durée indisponible");
    return readPlaylist(path.resolve(path.dirname(real), variant), depth + 1);
  }
  return readPlaylist(resolveUploadPath(video.CheminAcces));
}
