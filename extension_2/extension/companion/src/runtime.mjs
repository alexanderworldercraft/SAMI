import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

export function foreignPath(value, platform = process.platform) {
  return platform === "win32" ? /^\/(?!\/)/.test(value) : /^(?:[a-z]:|\\\\)/i.test(value);
}

export function resolveFfmpegPath(config = {}, env = process.env, platform = process.platform, exists = fs.existsSync) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const configured = String(config.ffmpegPaths?.[platform] || config.ffmpegPath || "").trim();
  const bare = configured && !/[\\/]/.test(configured);
  if (configured && !foreignPath(configured, platform) && !bare && exists(configured)) return configured;
  const executable = platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const entries = String(env.PATH || env.Path || "").split(paths.delimiter).filter(Boolean);
  const candidates = entries.map((entry) => paths.join(entry.replace(/^"|"$/g, ""), executable));
  if (platform === "win32") candidates.push("C:\\ffmpeg\\bin\\ffmpeg.exe",
    env.LOCALAPPDATA && paths.join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Links", executable),
    env.ProgramFiles && paths.join(env.ProgramFiles, "ffmpeg", "bin", executable));
  else candidates.push(...(platform === "darwin" ? ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg"] : []), "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/snap/bin/ffmpeg");
  return candidates.filter(Boolean).find(exists) || (bare && !/\.exe$/i.test(configured) ? configured : executable);
}

export function checkRuntime(config = {}) {
  const ffmpegPath = resolveFfmpegPath(config);
  const result = spawnSync(ffmpegPath, ["-version"], { encoding: "utf8", windowsHide: true, timeout: 10000 });
  if (result.error || result.status !== 0) throw new Error(`FFmpeg indisponible (${ffmpegPath}). Installez FFmpeg puis relancez l’installateur du compagnon.`);
  return { ffmpegPath, ffmpegVersion: result.stdout.split(/\r?\n/)[0], platform: process.platform };
}

export function getDownloadDirectory(config = {}) {
  const configured = String(config.downloadDirectories?.[process.platform] || config.downloadDirectory || "").trim();
  if (configured && foreignPath(configured)) throw new Error("Le dossier de téléchargement provient d’un autre système. Corrigez downloadDirectory dans config.json.");
  return configured ? path.resolve(configured) : path.join(os.homedir(), "Downloads");
}
