import test from "node:test";
import assert from "node:assert/strict";
import { classifyMedia, parseHlsManifest, selectDisplayCandidates } from "../src/mediaDetection.js";

test("écarte les segments HLS et conserve les manifestes", () => {
  assert.equal(classifyMedia("https://cdn.example/master.m3u8", "application/vnd.apple.mpegurl"), "hls");
  assert.equal(classifyMedia("https://cdn.example/segment-001.ts", "video/mp2t"), null);
  assert.equal(classifyMedia("https://cdn.example/chunk.m4s", "video/mp4"), null);
});

test("lit les variantes, résolutions et durées HLS", () => {
  const master = parseHlsManifest('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Français",LANGUAGE="fr",DEFAULT=YES,URI="audio/index.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="audio"\n1080/index.m3u8', "https://cdn.example/master.m3u8");
  assert.equal(master.isMaster, true);
  assert.deepEqual(master.variants[0], { url: "https://cdn.example/1080/index.m3u8", resolution: "1080p", width: 1920, height: 1080, bandwidth: 5000000, audio: { url: "https://cdn.example/audio/index.m3u8", language: "fr", name: "Français", isDefault: true } });
  const media = parseHlsManifest("#EXTM3U\n#EXTINF:4.2,\na.ts\n#EXTINF:5.8,\nb.ts", "https://cdn.example/index.m3u8");
  assert.equal(media.duration, 10); assert.equal(media.segmentCount, 2);
});

test("masque le bruit vidéo lorsque des playlists avancées existent", () => {
  const selected = selectDisplayCandidates([
    { id: "chunk", kind: "video", url: "https://proxy.example/chunk", size: 5000000 },
    { id: "empty", kind: "hls", url: "https://site.example/ad.m3u8", analyzed: true, isMaster: false, segmentCount: 0 },
    { id: "episode", kind: "hls", url: "https://cdn.example/episode.m3u8", analyzed: true, duration: 1425, segmentCount: 350 },
  ]);
  assert.deepEqual(selected.map((candidate) => candidate.id), ["episode"]);
});
