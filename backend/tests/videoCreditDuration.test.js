import { afterEach, beforeEach, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { getCreditVideoDuration } from "../services/video/videoCreditDuration.js";
import { UPLOADS_ROOT } from "../services/video/videoPaths.js";
let directory;
beforeEach(async () => { await fs.mkdir(UPLOADS_ROOT, { recursive: true }); directory = await fs.mkdtemp(path.join(UPLOADS_ROOT, "credit-duration-test-")); });
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
const source = () => ({ CheminAcces: `uploads/${path.basename(directory)}/master.m3u8` });
it("sums local video rendition segments, including fractional duration", async () => {
  await fs.writeFile(path.join(directory, "master.m3u8"), '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=123\nvideo.m3u8\n');
  await fs.writeFile(path.join(directory, "video.m3u8"), '#EXTM3U\n#EXTINF:6.25,\na.ts\n#EXTINF:4.5,\nb.ts\n#EXT-X-ENDLIST\n');
  expect(await getCreditVideoDuration(source())).toBe(10.75);
});
it("reads a media playlist directly", async () => {
  await fs.writeFile(path.join(directory, "master.m3u8"), '#EXTM3U\n#EXTINF:100,\na.ts\n#EXT-X-ENDLIST\n');
  expect(await getCreditVideoDuration(source())).toBe(100);
});
it("rejects unfinished and missing media", async () => {
  await expect(getCreditVideoDuration(source())).rejects.toThrow();
  await fs.writeFile(path.join(directory, "master.m3u8"), '#EXTM3U\n#EXTINF:100,\na.ts\n');
  await expect(getCreditVideoDuration(source())).rejects.toThrow();
});
it("rejects remote playlists", async () => {
  await fs.writeFile(path.join(directory, "master.m3u8"), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=123\nhttps://example.test/video.m3u8\n');
  await expect(getCreditVideoDuration(source())).rejects.toThrow();
});
it("rejects paths outside uploads", async () => {
  await expect(getCreditVideoDuration({ CheminAcces: "package.json" })).rejects.toThrow();
  await fs.writeFile(path.join(directory, "master.m3u8"), '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=123\n../../package.json\n');
  await expect(getCreditVideoDuration(source())).rejects.toThrow();
});
