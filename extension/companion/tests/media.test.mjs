import test from "node:test";
import assert from "node:assert/strict";
import { assertMediaCandidate, buildFfmpegArguments, buildFfmpegHeaders, ffmpegErrorMessage, inspectHlsResponse, resolveFfmpegPath, safeFilename } from "../src/media.mjs";
test("valide uniquement les médias HTTP attendus", () => {
  assert.equal(assertMediaCandidate({ url: "https://cdn.example/video.m3u8", kind: "hls" }).kind, "hls");
  assert.throws(() => assertMediaCandidate({ url: "file:///etc/passwd", kind: "video" }), /HTTP/);
  assert.throws(() => assertMediaCandidate({ url: "https://example.test/x", kind: "script" }), /Type/);
});
test("nettoie les noms et limite les en-têtes transmis", () => {
  assert.equal(safeFilename('../Film: test?'), "Film test");
  const headers = buildFfmpegHeaders({ cookie: "a=b", referer: "https://example.test/", "x-secret": "no" });
  assert.match(headers, /cookie: a=b/); assert.doesNotMatch(headers, /x-secret/);
});
test("ignore un chemin absolu FFmpeg provenant d'un autre système", () => {
  assert.equal(resolveFfmpegPath({ ffmpegPath: "/chemin/macos/ffmpeg" }, { Path: "" }, "win32", () => false), "ffmpeg.exe");
  assert.notEqual(resolveFfmpegPath({ ffmpegPath: "C:\\ffmpeg\\bin\\ffmpeg.exe" }, {}, "darwin"), "C:\\ffmpeg\\bin\\ffmpeg.exe");
});
test("retourne les lignes FFmpeg qui expliquent réellement l'échec", () => {
  const message = ffmpegErrorMessage("Input #0\n[http] Server returned 403 Forbidden\nError opening input files", 1);
  assert.match(message, /403 Forbidden/);
  assert.match(message, /Error opening/);
});
test("conserve la variante YouTube sélectionnée et sa piste audio", () => {
  const args = buildFfmpegArguments({
    kind: "hls",
    url: "https://rr1.googlevideo.com/video/index.m3u8",
    variantOf: "https://manifest.googlevideo.com/master.m3u8",
    audioCandidate: { kind: "hls", url: "https://rr1.googlevideo.com/audio/index.m3u8" },
  }, "video.mkv");
  assert.deepEqual(args.filter((arg) => arg === "-i"), ["-i", "-i"]);
  assert.equal(args[args.indexOf("-i") + 1], "https://rr1.googlevideo.com/video/index.m3u8");
  assert.equal(args[args.lastIndexOf("-i") + 1], "https://rr1.googlevideo.com/audio/index.m3u8");
  assert.deepEqual(args.filter((arg, index) => args[index - 1] === "-f"), ["hls", "hls", "matroska"]);
  assert.ok(args.includes("0:v:0"));
  assert.ok(args.includes("1:a:0"));
  assert.equal(args.includes("0:a?"), false);
});
test("conserve la variante YouTube lors de l'assemblage des playlists locales", () => {
  const args = buildFfmpegArguments({
    kind: "hls",
    url: "https://rr1.googlevideo.com/video/index.m3u8",
    variantOf: "https://manifest.googlevideo.com/master.m3u8",
    audioCandidate: { kind: "audio", url: "https://rr1.googlevideo.com/audio/index.m3u8" },
  }, "video.mkv", ["C:\\temp\\video\\index.m3u8", "C:\\temp\\audio\\index.m3u8"]);
  assert.equal(args[args.indexOf("-i") + 1], "C:\\temp\\video\\index.m3u8");
  assert.equal(args[args.lastIndexOf("-i") + 1], "C:\\temp\\audio\\index.m3u8");
  assert.equal(args.includes("https://manifest.googlevideo.com/master.m3u8"), false);
});
test("applique le traitement HLS à tous les hébergeurs", () => {
  const args = buildFfmpegArguments({
    kind: "hls",
    url: "https://cdn.senpai.example/video.m3u8",
    variantOf: "https://cdn.senpai.example/master.m3u8",
    audioCandidate: { kind: "audio", url: "https://cdn.senpai.example/audio.m3u8" },
  }, "video.mkv");
  assert.deepEqual(args.filter((arg) => arg === "-i"), ["-i", "-i"]);
  assert.equal(args[args.indexOf("-i") + 1], "https://cdn.senpai.example/video.m3u8");
  assert.equal(args.includes("-f"), true);
  assert.equal(args.includes("-allowed_extensions"), true);
});
test("le diagnostic HLS distingue une playlist d'une réponse de refus", async () => {
  const diagnostic = await inspectHlsResponse("https://cdn.example/master.m3u8", {}, async () => new Response("Access denied", { status: 403 }));
  assert.match(diagnostic, /HTTP 403/);
  assert.match(diagnostic, /Accès refusé/);
});
test("le diagnostic lit plusieurs blocs avant de classifier un manifeste", async () => {
  const chunks = ["#EXTM3U\n#EXT-X-VERSION:3\n", "#EXT-X-STREAM-INF:BANDWIDTH=1000\nvideo.m3u8"];
  const diagnostic = await inspectHlsResponse("https://cdn.example/master.m3u8", {}, async () => new Response(new ReadableStream({
    pull(controller) { chunks.length ? controller.enqueue(new TextEncoder().encode(chunks.shift())) : controller.close(); },
  })));
  assert.match(diagnostic, /structure maître/);
  assert.match(diagnostic, /playlist valide/);
});
