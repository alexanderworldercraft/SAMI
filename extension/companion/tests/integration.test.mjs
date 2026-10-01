import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { assembleMedia } from "../src/media.mjs";
import { checkRuntime } from "../src/runtime.mjs";
import { uploadToSami } from "../src/upload.mjs";
import { NativeDecoder, encodeMessage } from "../src/nativeProtocol.mjs";
import { CompositeBuffer, UmpWriter } from "googlevideo/ump";
import { MediaHeader, UMPPartId } from "googlevideo/protos";

test("bout en bout : FFmpeg réel, médias synthétiques et fausse instance SAMIHUB", { timeout: 90000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sami-media-integration-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const { ffmpegPath } = checkRuntime();
  const ffprobe = path.join(path.dirname(ffmpegPath), process.platform === "win32" ? "ffprobe.exe" : "ffprobe");
  const run = (args) => execFileSync(ffmpegPath, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], { cwd: directory, windowsHide: true });
  run(["-f", "lavfi", "-i", "testsrc=size=128x72:rate=10", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100",
    "-t", "2", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", "full.mp4"]);
  run(["-i", "full.mp4", "-map", "0:v", "-c", "copy", "video.mp4"]);
  run(["-i", "full.mp4", "-map", "0:a", "-c", "copy", "audio.m4a"]);
  run(["-i", "video.mp4", "-c", "copy", "-hls_time", "1", "-hls_playlist_type", "vod", "video.m3u8"]);
  run(["-i", "audio.m4a", "-c", "copy", "-hls_time", "1", "-hls_playlist_type", "vod", "audio.m3u8"]);
  run(["-i", "full.mp4", "-map", "0", "-c", "copy", "-f", "dash", "-seg_duration", "1", "manifest.mpd"]);
  const transfers = []; const observed = [];
  let base; let cdnBase;
  const serveFile = (req, res, pathname) => {
    const filename = path.join(directory, path.basename(pathname));
    if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.writeHead(404).end(); return; }
    const bytes = fs.readFileSync(filename);
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || "");
    const start = Number(range?.[1] || 0); const end = Math.min(Number(range?.[2] || bytes.length - 1), bytes.length - 1);
    if (start >= bytes.length) { res.writeHead(416).end(); return; }
    res.writeHead(range ? 206 : 200, {
      "Content-Type": pathname.endsWith(".mpd") ? "application/dash+xml" : pathname.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "application/octet-stream",
      "Content-Length": end - start + 1, "Accept-Ranges": "bytes",
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` } : {}),
    }); res.end(bytes.subarray(start, end + 1));
  };
  const cdn = http.createServer((req, res) => {
    observed.push({ url: req.url, cookie: req.headers.cookie, authorization: req.headers.authorization });
    serveFile(req, res, new URL(req.url, cdnBase).pathname);
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, base);
    if (req.method === "POST") {
      const chunks = []; req.on("data", (chunk) => chunks.push(chunk)); req.on("end", () => {
        transfers.push({ url: req.url, authorization: req.headers.authorization, body: Buffer.concat(chunks).toString("latin1") });
        if (req.url.startsWith("/redirect-app/")) { res.writeHead(302, { Location: "/login" }).end(); return; }
        if (req.url.startsWith("/html-app/")) { res.writeHead(200, { "Content-Type": "text/html" }).end("<html>login</html>"); return; }
        res.writeHead(201, { "Content-Type": "application/json" }).end(JSON.stringify({ VideoID: 42 }));
      }); return;
    }
    if (url.pathname === "/master.m3u8") {
      if (req.headers.cookie !== "session=private" || req.headers.referer !== "https://player.test/") { res.writeHead(403).end(); return; }
      res.end(`#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",DEFAULT=YES,NAME="Audio",URI="${cdnBase}/audio.m3u8?signature=a%2Bb"\n#EXT-X-STREAM-INF:BANDWIDTH=100000,RESOLUTION=128x72,AUDIO="a"\n${cdnBase}/video.m3u8?signature=v%2Bb\n`);
      return;
    }
    if (url.pathname === "/redirect") { res.writeHead(302, { Location: cdnBase + "/full.mp4?sig=a%2Bb" }).end(); return; }
    if (url.pathname === "/ump") {
      const content = fs.readFileSync(path.join(directory, url.searchParams.get("track") === "audio" ? "audio.m4a" : "video.mp4"));
      const [start, end] = url.searchParams.get("range").split("-").map(Number);
      const data = content.subarray(start, end + 1);
      const buffer = new CompositeBuffer(); const writer = new UmpWriter(buffer);
      writer.write(UMPPartId.MEDIA_HEADER, MediaHeader.encode({ headerId: 0, itag: Number(url.searchParams.get("itag")), startRange: String(start), contentLength: String(data.length) }).finish());
      writer.write(UMPPartId.MEDIA, Buffer.concat([Buffer.from([0]), data]));
      writer.write(UMPPartId.MEDIA_END, Buffer.from([0]));
      res.writeHead(200, { "Content-Type": "application/vnd.yt-ump" }).end(Buffer.concat(buffer.chunks)); return;
    }
    if (url.pathname === "/failure.m3u8") { res.end("#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2,\n/refused.ts\n#EXT-X-ENDLIST"); return; }
    if (url.pathname === "/refused.ts") { res.writeHead(429).end("Too many requests"); return; }
    if (url.pathname === "/slow.mp4") return;
    serveFile(req, res, url.pathname);
  });
  const listen = (service) => new Promise((resolve, reject) => { service.once("error", reject); service.listen(0, "127.0.0.1", resolve); });
  t.after(async () => { for (const service of [server, cdn]) { service.closeAllConnections(); await new Promise((resolve) => service.close(resolve)); } });
  await listen(server); await listen(cdn);
  base = `http://127.0.0.1:${server.address().port}`; cdnBase = `http://127.0.0.1:${cdn.address().port}`;
  const outputDirectory = path.join(directory, "downloads");
  const verifyTracks = (file) => {
    const info = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8", windowsHide: true }));
    assert.deepEqual(new Set(info.streams.map((stream) => stream.codec_type)), new Set(["video", "audio"]));
    assert.ok(Number(info.format.duration) >= 1.9);
  };
  let direct;
  await t.test("MP4 progressif avec redirection signée, sans import implicite", async () => {
    direct = await assembleMedia({ kind: "video", url: base + "/redirect", headers: { cookie: "session=private", authorization: "Bearer private" } }, { outputDirectory, title: "Test / Windows : Mac" });
    verifyTracks(direct); assert.equal(transfers.length, 0);
    assert.ok(observed.some((request) => request.url === "/full.mp4?sig=a%2Bb"));
    assert.ok(observed.every((request) => !request.cookie && !request.authorization));
  });
  await t.test("vidéo et audio séparés, assemblage obligatoire des deux", async () => {
    const file = await assembleMedia({ kind: "video", url: base + "/video.mp4", requiresAudio: true, audioCandidate: { kind: "audio", url: base + "/audio.m4a" } }, { outputDirectory });
    verifyTracks(file);
    await assert.rejects(assembleMedia({ kind: "video", url: base + "/video.mp4", audioCandidate: { kind: "audio", url: base + "/video.mp4" } }, { outputDirectory }));
  });
  await t.test("HLS maître + audio séparé + CDN distinct + signatures intactes", async () => {
    const file = await assembleMedia({ kind: "hls", url: base + "/master.m3u8", headers: { cookie: "session=private", referer: "https://player.test/" } }, { outputDirectory });
    verifyTracks(file);
    assert.ok(observed.some((request) => request.url === "/audio.m3u8?signature=a%2Bb"));
    assert.ok(observed.every((request) => !request.cookie && !request.authorization));
  });
  await t.test("DASH avec SegmentTemplate, représentation vidéo et audio", async () => {
    verifyTracks(await assembleMedia({ kind: "dash", url: base + "/manifest.mpd" }, { outputDirectory }));
  });
  await t.test("UMP dépaqueté sans yt-dlp puis fusion vidéo + audio", async () => {
    const videoSize = fs.statSync(path.join(directory, "video.mp4")).size;
    const audioSize = fs.statSync(path.join(directory, "audio.m4a")).size;
    const file = await assembleMedia({ kind: "video", url: `${base}/ump?ump=1&itag=399&clen=${videoSize}`, requiresAudio: true,
      audioCandidate: { kind: "audio", url: `${base}/ump?ump=1&itag=251&track=audio&clen=${audioSize}` } }, { outputDirectory });
    verifyTracks(file);
    assert.ok(fs.readdirSync(outputDirectory).every((name) => !name.startsWith("sami-ump-")));
  });
  await t.test("import simple et multi : URL SAMIHUB avec préfixe, jeton et affiche", async () => {
    for (const encodingMode of ["classic", "distributed"]) {
      const result = await uploadToSami({ apiBaseUrl: base + "/samihub", accessToken: "test-revocable", filePath: direct,
        metadata: { titre: "Test", resumer: "Description", SaisonID: 12, genres: [1, 4], encodingMode, image: { type: "image/png", name: "sans-extension", data: Buffer.from("fixture image").toString("base64") } } });
      assert.equal(result.VideoID, 42);
    }
    assert.deepEqual(transfers.map((request) => request.url), ["/samihub/api/videos/extension-import", "/samihub/api/video-encoding/extension-jobs"]);
    assert.ok(transfers.every((request) => request.authorization === "Bearer test-revocable" && request.body.includes('filename="affiche.png"') && request.body.includes("[1,4]")));
  });
  await t.test("refus HTTP précis et aucun fichier partiel conservé", async () => {
    const before = fs.readdirSync(outputDirectory);
    await assert.rejects(assembleMedia({ kind: "hls", url: base + "/failure.m3u8" }, { outputDirectory }), /HTTP 429/);
    assert.deepEqual(fs.readdirSync(outputDirectory), before);
  });
  await t.test("annulation nettoyée et faux succès d’import refusés", async () => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 100);
    try { await assert.rejects(assembleMedia({ kind: "video", url: base + "/slow.mp4" }, { outputDirectory, signal: controller.signal })); }
    finally { clearTimeout(timer); }
    assert.ok(fs.readdirSync(outputDirectory).every((file) => !file.endsWith(".part")));
    for (const prefix of ["redirect-app", "html-app"]) await assert.rejects(uploadToSami({ apiBaseUrl: base + "/" + prefix, accessToken: "test", filePath: direct, metadata: { titre: "Test" } }));
  });
  await t.test("processus Native Messaging réel : trame de ping et version", async () => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("../src/companion.mjs", import.meta.url))], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    t.after(() => child.kill());
    const reply = await new Promise((resolve, reject) => {
      const decoder = new NativeDecoder(resolve);
      child.stdout.on("data", (chunk) => decoder.push(chunk)); child.once("error", reject);
      child.once("exit", (code) => { if (code) reject(new Error("Native host exited")); });
      child.stdin.write(encodeMessage({ action: "ping" }));
    });
    child.stdin.end(); assert.equal(reply.ok, true); assert.equal(reply.version, "0.1.4");
  });
});
