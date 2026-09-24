import test from "node:test";
import assert from "node:assert/strict";
import { assertMediaCandidate, buildFfmpegHeaders, safeFilename } from "../src/media.mjs";
test("valide uniquement les médias HTTP attendus", () => {
  assert.equal(assertMediaCandidate({ url: "https://cdn.example/video.m3u8", kind: "hls" }).kind, "hls");
  assert.throws(() => assertMediaCandidate({ url: "file:///etc/passwd", kind: "video" }), /Protocole/);
  assert.throws(() => assertMediaCandidate({ url: "https://example.test/x", kind: "script" }), /Type/);
});
test("nettoie les noms et limite les en-têtes transmis", () => {
  assert.equal(safeFilename('../Film: test?'), "Film test");
  const headers = buildFfmpegHeaders({ cookie: "a=b", referer: "https://example.test/", "x-secret": "no" });
  assert.match(headers, /cookie: a=b/); assert.doesNotMatch(headers, /x-secret/);
});
