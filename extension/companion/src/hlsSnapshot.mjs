import fs from "node:fs/promises";
import path from "node:path";

const playlistPrefix = "#EXTM3U";
const playlistReference = /^#EXT-X-(?:MEDIA|I-FRAME-STREAM-INF):/;

export async function snapshotHlsPlaylist(url, directory, { headers = {}, fetchImpl = fetch } = {}) {
  const cached = new Map();
  const requestHeaders = Object.fromEntries(Object.entries(headers)
    .filter(([name, value]) => ["cookie", "authorization", "referer", "origin", "user-agent"].includes(name.toLowerCase()) && value)
    .map(([name, value]) => [name, String(value).replace(/[\r\n]/g, "")]));

  const visit = async (playlistUrl) => {
    if (cached.has(playlistUrl)) return cached.get(playlistUrl);
    if (cached.size >= 24) throw new Error("Le manifeste HLS contient trop de playlists.");
    const localPath = path.join(directory, `playlist-${cached.size}.m3u8`);
    cached.set(playlistUrl, localPath);
    const response = await fetchImpl(playlistUrl, { headers: requestHeaders, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Playlist HLS inaccessible : HTTP ${response.status}.`);
    const source = await response.text();
    const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
    if (lines.find((line) => line.trim()) !== playlistPrefix) throw new Error("Le serveur n'a pas renvoyé une playlist HLS.");
    const master = lines.some((line) => line.startsWith("#EXT-X-STREAM-INF:"));
    let nextIsPlaylist = false;
    const rewritten = [];
    for (const line of lines) {
      if (line.startsWith("#EXT-X-STREAM-INF:")) nextIsPlaylist = true;
      if (playlistReference.test(line) && line.includes('URI="')) {
        const match = line.match(/URI="([^"]+)"/);
        if (match) {
          const childUrl = new URL(match[1], playlistUrl).toString();
          const childPath = await visit(childUrl);
          rewritten.push(line.replace(match[0], `URI="${path.basename(childPath)}"`));
          continue;
        }
      }
      if (line.startsWith("#") && line.includes('URI="')) {
        rewritten.push(line.replace(/URI="([^"]+)"/g, (_, relative) => `URI="${new URL(relative, playlistUrl)}"`));
      } else if (line && !line.startsWith("#")) {
        const absolute = new URL(line.trim(), playlistUrl).toString();
        rewritten.push(master && nextIsPlaylist ? path.basename(await visit(absolute)) : absolute);
        nextIsPlaylist = false;
      } else {
        rewritten.push(line);
      }
    }
    await fs.writeFile(localPath, rewritten.join("\n"), "utf8");
    return localPath;
  };

  return visit(url);
}
