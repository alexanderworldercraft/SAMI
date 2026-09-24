import test from "node:test";
import assert from "node:assert/strict";
import { NativeDecoder, encodeMessage } from "../src/nativeProtocol.mjs";
import { fetchMedia, headersFor } from "../src/network.mjs";
import { resolveFfmpegPath } from "../src/runtime.mjs";
import { rewriteDash } from "../src/dashManifest.mjs";
import { assertMediaCandidate } from "../src/media.mjs";

test("protocole natif : fragments, messages concaténés et taille bornée", () => {
  const received = []; const decoder = new NativeDecoder((message) => received.push(message));
  const bytes = Buffer.concat([encodeMessage({ action: "ping" }), encodeMessage({ action: "cancel" })]);
  for (const byte of bytes) decoder.push(Buffer.from([byte]));
  assert.deepEqual(received, [{ action: "ping" }, { action: "cancel" }]);
  const oversized = Buffer.alloc(4); oversized.writeUInt32LE(17 * 1024 * 1024);
  assert.throws(() => decoder.push(oversized), /16 Mo/);
});
test("résolution Mac/Windows indépendante du PATH du navigateur et de l’ancien OS", () => {
  const exists = (value) => ["/opt/homebrew/bin/ffmpeg", "D:\\Tools\\ffmpeg.exe"].includes(value);
  assert.equal(resolveFfmpegPath({ ffmpegPath: "C:\\ffmpeg\\bin\\ffmpeg.exe" }, {}, "darwin", exists), "/opt/homebrew/bin/ffmpeg");
  assert.equal(resolveFfmpegPath({ ffmpegPath: "ffmpeg" }, {}, "darwin", exists), "/opt/homebrew/bin/ffmpeg");
  assert.equal(resolveFfmpegPath({ ffmpegPath: "/opt/homebrew/bin/ffmpeg" }, { Path: "D:\\Tools" }, "win32", exists), "D:\\Tools\\ffmpeg.exe");
});
test("cookies et authorization ne fuient pas sur une redirection interorigine", async () => {
  const candidate = { url: "https://a.test/master.m3u8", headers: { cookie: "a=private", authorization: "Bearer secret", referer: "https://page.test/" } };
  assert.equal(headersFor("https://b.test/v.ts", candidate).cookie, undefined);
  const seen = [];
  const result = await fetchMedia(candidate.url, candidate, { fetchImpl: async (url, options) => {
    seen.push(options.headers);
    return seen.length === 1 ? new Response(null, { status: 302, headers: { location: "https://b.test/final" } }) : new Response("ok");
  } });
  assert.equal(result.url, "https://b.test/final");
  assert.equal(seen[0].cookie, "a=private"); assert.equal(seen[1].cookie, undefined); assert.equal(seen[1].authorization, undefined);
});
test("conserve le code HTTP exact et ne présente pas un refus comme un média", async () => {
  for (const status of [403, 410, 416, 429, 451]) {
    await assert.rejects(fetchMedia("https://cdn.test/movie", { url: "https://cdn.test/movie" }, { fetchImpl: async () => new Response("denied", { status }) }), new RegExp(`HTTP ${status}`));
  }
});
test("DASH : héritage des URL/templates, pistes séparées, refus DRM et entités", () => {
  const result = rewriteDash('<MPD><BaseURL>https://cdn.test/assets/</BaseURL><Period><AdaptationSet><SegmentTemplate media="$RepresentationID$/$Number%05d$.m4s" initialization="$RepresentationID$/init.mp4"/><Representation id="v"><BaseURL>video/</BaseURL></Representation><Representation id="a"><BaseURL>audio/</BaseURL></Representation></AdaptationSet></Period></MPD>',
    "https://site.test/master.mpd", (url) => `https://relay.test/?url=${encodeURIComponent(url)}`);
  assert.match(result, /video%2F%24RepresentationID%24/); assert.match(result, /audio%2F%24RepresentationID%24/);
  assert.throws(() => rewriteDash("<!DOCTYPE foo><MPD/>", "https://x.test/m", () => ""), /XML/);
  assert.throws(() => rewriteDash("<MPD><Period><ContentProtection/></Period></MPD>", "https://x.test/m", () => ""), /protection/);
});
test("audio manquant : refus explicite au lieu d’une vidéo silencieuse", () => {
  assert.throws(() => assertMediaCandidate({ url: "https://cdn.test/v.mp4", kind: "video", requiresAudio: true }), /audio manquante/);
});
