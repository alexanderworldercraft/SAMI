import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { snapshotHlsPlaylist } from "../src/hlsSnapshot.mjs";

test("matérialise les playlists HLS et rend les segments distants absolus", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sami-hls-test-"));
  const manifests = new Map([
    ["https://cdn.example/master.m3u8", '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000,AUDIO="a"\nvideo.m3u8'],
    ["https://cdn.example/audio.m3u8", "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\naudio/1.ts\n#EXT-X-ENDLIST"],
    ["https://cdn.example/video.m3u8", "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nvideo/1.ts\n#EXT-X-ENDLIST"],
  ]);
  try {
    const manifestPath = await snapshotHlsPlaylist("https://cdn.example/master.m3u8", directory, {
      fetchImpl: async (url) => ({ ok: true, text: async () => manifests.get(url) }),
    });
    const master = await fs.readFile(manifestPath, "utf8");
    assert.match(master, /URI="playlist-\d+\.m3u8"/);
    assert.match(master, /\nplaylist-\d+\.m3u8$/);
    const files = await fs.readdir(directory);
    assert.equal(files.length, 3);
    const children = await Promise.all(files.filter((file) => file !== path.basename(manifestPath))
      .map((file) => fs.readFile(path.join(directory, file), "utf8")));
    assert.ok(children.some((content) => content.includes("https://cdn.example/audio/1.ts")));
    assert.ok(children.some((content) => content.includes("https://cdn.example/video/1.ts")));
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
