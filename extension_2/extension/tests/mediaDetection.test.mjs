import test from "node:test";
import assert from "node:assert/strict";
import { attachAudio, classifyMedia, mediaIdentity, normalizeMediaUrl, parseHlsManifest, selectDisplayCandidates } from "../src/mediaDetection.js";

test("écarte les segments HLS et conserve les manifestes", () => {
  assert.equal(classifyMedia("https://cdn.example/master.m3u8", "application/vnd.apple.mpegurl"), "hls");
  assert.equal(classifyMedia("https://cdn.example/segment-001.ts", "video/mp2t"), null);
  assert.equal(classifyMedia("https://cdn.example/chunk.m4s", "video/mp4"), null);
  assert.equal(classifyMedia("https://r1.googlevideo.com/videoplayback?mime=video%2Fmp4", "application/octet-stream"), "video");
  assert.equal(classifyMedia("https://r1.googlevideo.com/videoplayback?mime=audio%2Fwebm", "application/octet-stream"), "audio");
  assert.equal(classifyMedia("https://r1.googlevideo.com/videoplayback?itag=399&range=0-1000", "application/octet-stream"), "video");
  assert.equal(classifyMedia("https://r1.googlevideo.com/videoplayback?itag=251&range=0-1000", "application/octet-stream"), "audio");
});

test("retire les paramètres de plage des URL YouTube avant téléchargement", () => {
  const normalized = new URL(normalizeMediaUrl("https://r1.googlevideo.com/videoplayback?itag=399&range=10-999&rn=4&sig=keep"));
  assert.equal(normalized.searchParams.has("range"), false);
  assert.equal(normalized.searchParams.has("rn"), false);
  assert.equal(normalized.searchParams.get("sig"), "keep");
});

test("conserve les pistes YouTube directes avec un manifeste DASH", () => {
  const selected = selectDisplayCandidates([
    { id: "dash", kind: "dash", url: "https://www.youtube.com/api/manifest.mpd" },
    { id: "video", kind: "video", url: "https://r1.googlevideo.com/videoplayback?mime=video%2Fmp4", detectedAt: 2 },
    { id: "audio", kind: "audio", url: "https://r2.googlevideo.com/videoplayback?mime=audio%2Fwebm", detectedAt: 1 },
  ]);
  assert.deepEqual(new Set(selected.map((candidate) => candidate.id)), new Set(["dash", "video", "audio"]));
});

test("lit les variantes, résolutions et durées HLS", () => {
  const master = parseHlsManifest('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Français",LANGUAGE="fr",DEFAULT=YES,URI="audio/index.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="audio"\n1080/index.m3u8', "https://cdn.example/master.m3u8");
  assert.equal(master.isMaster, true);
  assert.deepEqual(master.variants[0], { url: "https://cdn.example/1080/index.m3u8", resolution: "1080p", width: 1920, height: 1080, bandwidth: 5000000, audio: { url: "https://cdn.example/audio/index.m3u8", language: "fr", name: "Français", isDefault: true } });
  const media = parseHlsManifest("#EXTM3U\n#EXTINF:4.2,\na.ts\n#EXTINF:5.8,\nb.ts", "https://cdn.example/index.m3u8");
  assert.equal(media.duration, 10); assert.equal(media.segmentCount, 2);
});

test("priorise les playlists valides sans perdre les MP4 à URL opaque", () => {
  const selected = selectDisplayCandidates([
    { id: "chunk", kind: "video", url: "https://proxy.example/chunk", size: 5000000 },
    { id: "empty", kind: "hls", url: "https://site.example/ad.m3u8", analyzed: true, isMaster: false, segmentCount: 0 },
    { id: "episode", kind: "hls", url: "https://cdn.example/episode.m3u8", analyzed: true, duration: 1425, segmentCount: 350 },
  ]);
  assert.deepEqual(selected.map((candidate) => candidate.id), ["episode", "chunk"]);
});

test("préserve les paramètres signés et le transport UMP", () => {
  const url = "https://r1.googlevideo.com/videoplayback?id=a&range=1-10&sparams=id,range&ump=1&srfvp=1";
  const normalized = new URL(normalizeMediaUrl(url));
  assert.equal(normalized.searchParams.get("range"), "1-10");
  assert.equal(normalized.searchParams.get("ump"), "1");
  assert.equal(normalized.searchParams.get("srfvp"), "1");
  assert.notEqual(mediaIdentity({ kind: "video", url: "https://cdn.test/play?id=1" }), mediaIdentity({ kind: "video", url: "https://cdn.test/play?id=2" }));
});
test("ne mélange pas les pistes audio de vidéos YouTube différentes", () => {
  const video = { kind: "video", url: "https://r1.googlevideo.com/videoplayback?id=one&itag=399" };
  const wrong = { kind: "audio", url: "https://r1.googlevideo.com/videoplayback?id=two&itag=251", detectedAt: 100 };
  const right = { kind: "audio", url: "https://r2.googlevideo.com/videoplayback?id=one&itag=251", detectedAt: 1 };
  assert.equal(attachAudio(video, [wrong]).audioCandidate, undefined);
  assert.equal(attachAudio(video, [wrong, right]).audioCandidate, right);
  const selected = selectDisplayCandidates([video, wrong, right, ...Array.from({ length: 45 }, (_, i) => ({ kind: "hls", url: `https://cdn.test/${i}.m3u8` }))]);
  // Audio association runs before any display-list truncation.
  assert.equal(attachAudio(video, [wrong, right]).requiresAudio, true);
});
