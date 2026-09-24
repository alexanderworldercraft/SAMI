const SEGMENT_EXTENSIONS = /\.(?:ts|m4s|cmfv|cmfa|m4v|aac|key)(?:$|\?)/i;
const YOUTUBE_AUDIO_ONLY_ITAGS = new Set([
  "139", "140", "141", "171", "172", "249", "250", "251", "256", "258", "325", "328", "599", "600",
]);

export const headerValue = (headers, name) =>
  headers?.find((header) => header.name.toLowerCase() === name)?.value || "";

export function normalizeMediaUrl(value) {
  const url = new URL(value);
  if (url.hostname.endsWith(".googlevideo.com") && url.pathname.endsWith("/videoplayback")) {
    // Never alter parameters covered by the URL signature, or UMP transport semantics.
    const signed = new Set([url.searchParams.get("sparams"), url.searchParams.get("lsparams")].filter(Boolean).join(",").split(","));
    url.search = url.search.slice(1).split("&").filter((part) => {
      const name = decodeURIComponent(part.split("=")[0]);
      return !["range", "rn", "rbuf"].includes(name) || signed.has(name);
    }).join("&");
  }
  return url.toString();
}

export function classifyMedia(url, contentType = "") {
  const value = String(url || "");
  const cleanUrl = value.split("?", 1)[0].toLowerCase();
  let urlMime = "";
  let parsedUrl;
  try { parsedUrl = new URL(value); urlMime = parsedUrl.searchParams.get("mime") || ""; } catch {}
  const type = `${String(contentType || "").toLowerCase()} ${urlMime.toLowerCase()}`;
  if (SEGMENT_EXTENSIONS.test(value) || type.includes("mp2t")) return null;
  if (cleanUrl.endsWith(".m3u8") || type.includes("mpegurl")) return "hls";
  if (cleanUrl.endsWith(".mpd") || type.includes("dash+xml")) return "dash";
  if (type.includes("audio/")) return "audio";
  if (/\.(?:mp4|mkv|webm|mov|avi)$/.test(cleanUrl) || type.includes("video/")) return "video";
  if (/\.(?:m4a|mp3|opus|ogg)$/.test(cleanUrl) || type.includes("audio/")) return "audio";
  if (parsedUrl?.hostname.endsWith(".googlevideo.com") && parsedUrl.pathname.endsWith("/videoplayback")) {
    const itag = parsedUrl.searchParams.get("itag");
    if (itag) return YOUTUBE_AUDIO_ONLY_ITAGS.has(itag) ? "audio" : "video";
  }
  return null;
}

export function mediaIdentity(candidate) {
  const url = new URL(normalizeMediaUrl(candidate.url));
  if (url.hostname.endsWith(".googlevideo.com") && url.pathname.endsWith("/videoplayback")) {
    const id = url.searchParams.get("id"); const itag = url.searchParams.get("itag");
    if (id && itag) return `${candidate.kind}:googlevideo:${id}:${itag}:${url.searchParams.get("xtags") || ""}:${url.searchParams.get("ump") || "0"}`;
  }
  // Query parameters may identify different episodes, qualities or signed resources.
  return `${candidate.kind}:${url.href}`;
}

export function attachAudio(candidate, entries) {
  if (candidate.audioCandidate || candidate.kind !== "video") return candidate;
  const url = new URL(candidate.url);
  if (!url.hostname.endsWith(".googlevideo.com")) return candidate;
  const id = url.searchParams.get("id");
  if (!id) return candidate;
  const audio = entries.filter((entry) => {
    const other = new URL(entry.url);
    return entry.kind === "audio" && other.hostname.endsWith(".googlevideo.com") && other.searchParams.get("id") === id;
  }).sort((a, b) => (b.detectedAt || 0) - (a.detectedAt || 0))[0];
  return { ...candidate, requiresAudio: !["18", "22"].includes(url.searchParams.get("itag")), ...(audio ? { audioCandidate: audio } : {}) };
}

const parseAttributes = (line) => Object.fromEntries(
  [...line.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/gi)].map((match) => [match[1].toUpperCase(), match[2].replace(/^"|"$/g, "")])
);

export function parseHlsManifest(text, manifestUrl) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.some((line) => line === "#EXTM3U")) throw new Error("Playlist HLS invalide.");
  const variants = [];
  const audioGroups = new Map();
  let duration = 0;
  let segmentCount = 0;
  for (const line of lines) {
    if (!line.startsWith("#EXT-X-MEDIA:")) continue;
    const attributes = parseAttributes(line);
    if (attributes.TYPE !== "AUDIO" || !attributes.URI || !attributes["GROUP-ID"]) continue;
    const current = audioGroups.get(attributes["GROUP-ID"]);
    if (!current || attributes.DEFAULT === "YES") {
      audioGroups.set(attributes["GROUP-ID"], {
        url: new URL(attributes.URI, manifestUrl).toString(),
        language: attributes.LANGUAGE || null,
        name: attributes.NAME || null,
        isDefault: attributes.DEFAULT === "YES",
      });
    }
  }
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith("#EXTINF:")) {
      duration += Number.parseFloat(lines[index].slice(8)) || 0;
      segmentCount += 1;
    }
    if (!lines[index].startsWith("#EXT-X-STREAM-INF:")) continue;
    const attributes = parseAttributes(lines[index]);
    const target = lines.slice(index + 1).find((line) => !line.startsWith("#"));
    if (!target) continue;
    const [width, height] = String(attributes.RESOLUTION || "").split("x").map(Number);
    variants.push({
      url: new URL(target, manifestUrl).toString(),
      resolution: Number.isFinite(height) ? `${height}p` : null,
      width: Number.isFinite(width) ? width : null,
      height: Number.isFinite(height) ? height : null,
      bandwidth: Number(attributes.BANDWIDTH) || null,
      audio: audioGroups.get(attributes.AUDIO) || null,
    });
  }
  return { isMaster: variants.length > 0, variants, duration: Math.round(duration), segmentCount };
}

const candidateScore = (candidate) => {
  const height = Number(candidate.height) || Number.parseInt(candidate.resolution, 10) || 0;
  return (candidate.variantOf ? 1_000_000 : 0)
    + (candidate.duration > 60 ? 500_000 : 0)
    + (["hls", "dash"].includes(candidate.kind) ? 50_000 : 0)
    + height * 100
    + Math.min(Number(candidate.bandwidth) || 0, 10_000_000) / 1000
    + Number(candidate.detectedAt || 0) / 1e13;
};

export function selectDisplayCandidates(entries) {
  const source = Array.isArray(entries) ? entries : [];
  const advanced = source.filter((entry) => ["hls", "dash"].includes(entry.kind));
  const variantParents = new Set(advanced.map((entry) => entry.variantOf).filter(Boolean));
  const direct = source.filter((entry) => ["video", "audio"].includes(entry.kind));
  const usefulDirect = direct;
  const pool = [...advanced.filter((entry) => !entry.isMaster || !variantParents.has(entry.url)), ...usefulDirect];
  const deduped = new Map();
  for (const candidate of pool) {
    if (candidate.kind === "hls" && candidate.analyzed && !candidate.isMaster && candidate.segmentCount === 0) continue;
    const key = mediaIdentity(candidate);
    const previous = deduped.get(key);
    if (!previous || candidateScore(candidate) > candidateScore(previous)) deduped.set(key, candidate);
  }
  return [...deduped.values()].map((entry) => attachAudio(entry, source))
    .sort((left, right) => candidateScore(right) - candidateScore(left)).slice(0, 40);
}
