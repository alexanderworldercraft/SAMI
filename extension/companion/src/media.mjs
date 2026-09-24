import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

export function assertMediaCandidate(candidate) {
  let url;
  try { url = new URL(String(candidate?.url || "")); } catch { throw new Error("URL média invalide."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Protocole média non autorisé.");
  if (!["video", "audio", "hls", "dash"].includes(candidate?.kind)) throw new Error("Type de média non pris en charge.");
  return { ...candidate, url: url.toString() };
}

export function safeFilename(value) {
  return String(value || "video").normalize("NFKD").replace(/[^a-zA-Z0-9 _.-]/g, "").trim().replace(/^\.+/, "").slice(0, 120) || "video";
}

export function getDownloadDirectory(config = {}) {
  return config.downloadDirectory ? path.resolve(config.downloadDirectory) : path.join(os.homedir(), "Downloads");
}

export function buildFfmpegHeaders(headers = {}) {
  return Object.entries(headers)
    .filter(([name, value]) => ["cookie", "authorization", "referer", "origin", "user-agent"].includes(name.toLowerCase()) && value)
    .map(([name, value]) => `${name}: ${String(value).replace(/[\r\n]/g, "")}`)
    .join("\r\n");
}

export async function assembleMedia(candidate, { config = {}, outputDirectory, title = "video", onProgress } = {}) {
  const media = assertMediaCandidate(candidate);
  const directory = outputDirectory || getDownloadDirectory(config);
  fs.mkdirSync(directory, { recursive: true });
  const outputPath = path.join(directory, `${safeFilename(title)}-${Date.now()}.mkv`);
  const args = ["-hide_banner", "-nostdin", "-y"];
  const headers = buildFfmpegHeaders(media.headers);
  if (headers) args.push("-headers", `${headers}\r\n`);
  args.push("-i", media.url);
  if (media.audioCandidate) {
    const audio = assertMediaCandidate(media.audioCandidate);
    const audioHeaders = buildFfmpegHeaders(audio.headers);
    if (audioHeaders) args.push("-headers", `${audioHeaders}\r\n`);
    args.push("-i", audio.url, "-map", "0:v?", "-map", "1:a?", "-map", "0:s?", "-c", "copy", outputPath);
  } else {
    args.push("-map", "0:v?", "-map", "0:a?", "-map", "0:s?", "-c", "copy", outputPath);
  }
  await new Promise((resolve, reject) => {
    const child = spawn(config.ffmpegPath || "ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let errors = "";
    child.stderr.on("data", (chunk) => { errors = `${errors}${chunk}`.slice(-12000); onProgress?.(); });
    child.on("error", (error) => reject(new Error(error.code === "ENOENT" ? "FFmpeg est introuvable. Configurez ffmpegPath." : error.message)));
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(errors.trim().split(/\r?\n/).pop() || `FFmpeg a quitté avec le code ${code}.`)));
  });
  return outputPath;
}
