import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { checkRuntime, getDownloadDirectory } from "./runtime.mjs";
import { boundedText, fetchMedia, headersFor, httpUrl, safeHeaders, sanitizeError } from "./network.mjs";
import { createMediaRelay } from "./mediaRelay.mjs";
import { parseHlsManifest } from "../../src/mediaDetection.js";
import { isUmp, downloadUmp } from "./ump.mjs";
export { resolveFfmpegPath, getDownloadDirectory } from "./runtime.mjs";

export function assertMediaCandidate(candidate) {
  const url = httpUrl(String(candidate?.url || ""));
  if (!["video", "audio", "hls", "dash"].includes(candidate?.kind)) throw new Error("Type de média non pris en charge.");
  if (candidate.requiresAudio && !candidate.audioCandidate) throw new Error("Piste audio manquante : lancez la lecture avec le son, actualisez les médias, puis sélectionnez la piste audio associée.");
  if (candidate.audioCandidate) assertMediaCandidate(candidate.audioCandidate);
  return { ...candidate, url: url.href };
}
export function safeFilename(value) {
  let name = String(value || "video").normalize("NFKD").replace(/[^a-zA-Z0-9 _.-]/g, "").trim().replace(/^\.+|[. ]+$/g, "").slice(0, 100) || "video";
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) name = `video-${name}`;
  return name;
}
export const buildFfmpegHeaders = (headers = {}) => Object.entries(safeHeaders(headers)).map(([key, value]) => `${key}: ${value}`).join("\r\n");
export function ffmpegErrorMessage(stderr, code) {
  const lines = String(stderr || "").split(/\r?\n/).filter((line) => /error|failed|forbidden|unauthorized|invalid|unable|not found|HTTP.*\d{3}|server returned/i.test(line));
  return sanitizeError(lines.slice(-12).join("\n") || `FFmpeg a quitté avec le code ${code}.`);
}
export async function inspectHlsResponse(url, headers = {}, fetchImpl = fetch) {
  try {
    const { response, url: resolved } = await fetchMedia(url, { url, headers }, { fetchImpl });
    const text = await boundedText(response); const parsed = parseHlsManifest(text, resolved);
    return `Diagnostic HLS : HTTP ${response.status}, playlist valide, structure ${parsed.isMaster ? "maître" : "média"}.`;
  } catch (error) { return `Diagnostic HLS : ${sanitizeError(error.message)}`; }
}
export async function prepareMedia(candidate, { signal } = {}) {
  let media = assertMediaCandidate(candidate);
  for (let depth = 0; media.kind === "hls" && depth < 4; depth++) {
    const { response, url } = await fetchMedia(media.url, media, { signal });
    const text = await boundedText(response);
    if (/#EXT-X-(?:SESSION-)?KEY:.*(?:METHOD=SAMPLE-AES|KEYFORMAT="(?!identity"))/i.test(text)) throw new Error("Ce flux utilise une protection DRM non prise en charge.");
    const parsed = parseHlsManifest(text, url);
    if (!parsed.isMaster) {
      if (!/#EXT-X-ENDLIST/.test(text)) throw new Error("Flux HLS sans fin annoncée : l’enregistrement en direct n’est pas pris en charge.");
      return media;
    }
    const variant = [...parsed.variants].sort((a, b) => (b.height || 0) - (a.height || 0) || (b.bandwidth || 0) - (a.bandwidth || 0))[0];
    const audioCandidate = media.audioCandidate || (variant.audio ? {
      ...variant.audio, kind: "hls", headers: headersFor(variant.audio.url, media), headersByOrigin: media.headersByOrigin,
    } : undefined);
    media = { ...media, ...variant, headers: headersFor(variant.url, media), audioCandidate };
  }
  return media;
}
export function buildFfmpegArguments(candidate, outputPath, inputPaths = null, { extensionPicky = false } = {}) {
  const media = assertMediaCandidate(candidate);
  const args = ["-hide_banner", "-nostdin", "-n", "-progress", "pipe:2", "-nostats"];
  const input = (item, localUrl) => {
    args.push("-rw_timeout", "45000000", "-protocol_whitelist", localUrl && !/^https?:/.test(localUrl) ? "file" : "http,https,tcp,tls,crypto");
    const headers = buildFfmpegHeaders(item.headers);
    if (!localUrl && headers) args.push("-headers", `${headers}\r\n`);
    if (item.kind === "hls") {
      args.push("-allowed_extensions", "ALL");
      if (extensionPicky) args.push("-extension_picky", "0");
      args.push("-f", "hls");
    }
    args.push("-i", localUrl || item.url);
  };
  input(media, inputPaths?.[0]);
  if (media.audioCandidate) {
    input(media.audioCandidate, inputPaths?.[1]);
    // An absent selected audio track is a failure, never a successful silent video.
    args.push("-map", "0:v:0", "-map", "1:a:0");
  } else {
    args.push("-map", media.kind === "audio" ? "0:a:0" : "0:v:0", "-map", "0:a?");
  }
  return [...args, "-c", "copy", "-f", "matroska", outputPath];
}
export async function assembleMedia(candidate, { config = {}, outputDirectory, title = "video", onProgress, signal } = {}) {
  const runtime = checkRuntime(config);
  signal?.throwIfAborted();
  const media = await prepareMedia(candidate, { signal });
  const directory = outputDirectory || getDownloadDirectory(config);
  fs.mkdirSync(directory, { recursive: true });
  const outputPath = path.join(directory, `${safeFilename(title)}-${crypto.randomUUID().slice(0, 8)}.mkv`);
  const partial = `${outputPath}.part`;
  const relays = []; const umpFiles = [];
  try {
    const paths = [];
    for (const input of [media, media.audioCandidate].filter(Boolean)) {
      if (isUmp(input)) {
        const temporary = path.join(directory, `sami-ump-${crypto.randomUUID()}.part`);
        umpFiles.push(temporary);
        paths.push(await downloadUmp(input, temporary, { signal, onProgress }));
        continue;
      }
      const relay = await createMediaRelay(input, { signal });
      relays.push(relay); paths.push(relay.register(input.url, input.kind === "hls", input.kind === "dash"));
    }
    const help = spawnSync(runtime.ffmpegPath, ["-hide_banner", "-h", "demuxer=hls"], { encoding: "utf8", windowsHide: true, timeout: 10000 });
    const args = buildFfmpegArguments(media, partial, paths, { extensionPicky: /extension_picky/.test(help.stdout || "") });
    await new Promise((resolve, reject) => {
      const child = spawn(runtime.ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
      let errors = ""; let lastActivity = Date.now(); let timedOut = false;
      const abort = () => child.kill("SIGKILL");
      const idleTimer = setInterval(() => {
        if (Date.now() - lastActivity > 120000) { timedOut = true; abort(); }
      }, 5000);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      child.stderr.on("data", (chunk) => {
        lastActivity = Date.now(); errors = (errors + chunk).slice(-24000);
        const time = /out_time=(\d+:\d+:\d+(?:\.\d+)?)/.exec(String(chunk))?.[1];
        onProgress?.({ stage: "assembly", ...(time ? { time } : {}) });
      });
      const cleanup = () => { clearInterval(idleTimer); signal?.removeEventListener("abort", abort); };
      child.once("error", (error) => { cleanup(); reject(error); });
      child.once("close", (code) => {
        cleanup();
        if (signal?.aborted) return reject(new Error("Opération annulée."));
        if (timedOut) return reject(new Error("Aucune progression pendant deux minutes : transfert interrompu."));
        const relayError = relays.find((relay) => relay.error)?.error;
        if (relayError) return reject(new Error(relayError));
        if (code !== 0 || /failed to open segment|error when loading first segment|error during demuxing/i.test(errors)) return reject(new Error(ffmpegErrorMessage(errors, code)));
        if (!fs.existsSync(partial) || !fs.statSync(partial).size) return reject(new Error("Le média produit est vide."));
        resolve();
      });
    });
    fs.renameSync(partial, outputPath);
    return outputPath;
  } finally {
    await Promise.all(relays.map((relay) => relay.close()));
    fs.rmSync(partial, { force: true });
    for (const temporary of umpFiles) fs.rmSync(temporary, { force: true });
  }
}
