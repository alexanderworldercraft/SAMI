import http from "node:http";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { boundedText, fetchMedia, httpUrl, sanitizeError } from "./network.mjs";
import { rewriteDash } from "./dashManifest.mjs";

// FFmpeg sees only opaque loopback URLs. Cookies and signed URLs stay in this process.
export async function createMediaRelay(candidate, { signal } = {}) {
  const resources = new Map(); const identities = new Map(); const templates = [];
  const prefix = crypto.randomBytes(24).toString("hex");
  let base; let lastError = null;
  const register = (url, playlist = false, dash = false) => {
    url = httpUrl(url).href;
    const key = `${playlist}:${dash}:${url}`;
    if (!identities.has(key)) {
      if (resources.size > 50000) throw new Error("Trop de fragments dans ce média.");
      const tokens = [...url.matchAll(/\$(RepresentationID|Bandwidth|Number(?:%0\d+d)?|Time)\$/g)];
      if (tokens.length) {
        const stem = `/${prefix}/template/${templates.length}/`;
        const id = stem + tokens.map((match) => match[0]).join("/") + ".m4s";
        templates.push({ stem, url, tokens });
        identities.set(key, id.slice(1)); return `${base}${id}`;
      }
      const extension = dash ? "mpd" : playlist ? "m3u8" : (/\.([a-z0-9]{1,5})$/i.exec(new URL(url).pathname)?.[1] || "ts");
      const id = `${prefix}/${resources.size}.${extension}`;
      resources.set(`/${id}`, { url, playlist, dash }); identities.set(key, id);
    }
    return `${base}/${identities.get(key)}`;
  };
  const server = http.createServer(async (request, reply) => {
    let resource = resources.get(request.url);
    if (!resource) for (const template of templates) {
      if (!request.url.startsWith(template.stem) || !request.url.endsWith(".m4s")) continue;
      const values = request.url.slice(template.stem.length, -4).split("/");
      if (values.length !== template.tokens.length || values.some((value) => !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(value))) break;
      let index = 0;
      resource = { url: template.url.replace(/\$(RepresentationID|Bandwidth|Number(?:%0\d+d)?|Time)\$/g, () => values[index++]) };
      break;
    }
    if (!resource || !["GET", "HEAD"].includes(request.method) || request.headers.origin) { reply.writeHead(403).end(); return; }
    const controller = new AbortController();
    const abort = () => controller.abort(); signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    reply.on("close", () => { if (!reply.writableFinished) controller.abort(); });
    try {
      const { response, url } = await fetchMedia(resource.url, candidate, {
        signal: controller.signal, range: resource.playlist || resource.dash ? undefined : request.headers.range,
      });
      const isPlaylist = resource.playlist || /mpegurl/i.test(response.headers.get("content-type") || "");
      if (/vnd\.yt-ump/i.test(response.headers.get("content-type") || "")) {
        await response.body?.cancel(); throw new Error("Le serveur a changé le transport en UMP. Actualisez les médias et sélectionnez la piste UMP détectée.");
      }
      if (resource.dash || /dash\+xml/i.test(response.headers.get("content-type") || "")) {
        const body = rewriteDash(await boundedText(response), url, register);
        reply.writeHead(200, { "Content-Type": "application/dash+xml", "Content-Length": Buffer.byteLength(body) }); reply.end(body);
      } else if (isPlaylist) {
        const source = await boundedText(response);
        if (!source.trimStart().startsWith("#EXTM3U")) throw new Error("Le serveur n’a pas renvoyé une playlist HLS.");
        if (/#EXT-X-(?:SESSION-)?KEY:.*(?:METHOD=SAMPLE-AES|KEYFORMAT="(?!identity"))/i.test(source)) throw new Error("Ce flux utilise une protection DRM non prise en charge.");
        let nextPlaylist = false;
        const body = source.split(/\r?\n/).map((raw) => {
          const line = raw.trim();
          if (line.startsWith("#EXT-X-STREAM-INF:")) nextPlaylist = true;
          if (line.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_, target) =>
            `URI="${register(new URL(target, url).href, /^#EXT-X-(MEDIA|I-FRAME-STREAM-INF|RENDITION-REPORT):/.test(line))}"`);
          if (!line) return line;
          const result = register(new URL(line, url).href, nextPlaylist); nextPlaylist = false; return result;
        }).join("\n");
        reply.writeHead(200, { "Content-Type": "application/vnd.apple.mpegurl", "Content-Length": Buffer.byteLength(body) }); reply.end(body);
      } else {
        const headers = {};
        for (const name of ["content-type", "content-length", "content-range", "accept-ranges"]) {
          const value = response.headers.get(name); if (value) headers[name] = value;
        }
        reply.writeHead(response.status, headers);
        if (request.method === "HEAD") { await response.body?.cancel(); reply.end(); }
        else await pipeline(Readable.fromWeb(response.body), reply);
      }
    } catch (error) {
      if (!controller.signal.aborted) lastError = sanitizeError(error.message);
      if (!reply.headersSent) reply.writeHead(error.status || 502);
      reply.end();
    } finally { signal?.removeEventListener("abort", abort); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
  return { register, get error() { return lastError; }, close: async () => {
    server.closeAllConnections(); await new Promise((resolve) => server.close(resolve));
  } };
}
