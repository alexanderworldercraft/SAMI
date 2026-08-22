import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";

import { getFfmpegExecutable } from "../distributedEncoding/ffmpeg/index.js";
import { resolveUploadPath } from "../video/videoPaths.js";
import { assertAiSubtitleConfig } from "./config.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireJobId = (jobId) => {
  const value = String(jobId || "");
  if (!UUID_PATTERN.test(value)) throw new TypeError("AiSubtitleJobID invalide.");
  return value;
};

const run = (executable, args, { signal } = {}) => new Promise((resolve, reject) => {
  execFile(executable, args, {
    windowsHide: true,
    shell: false,
    signal,
    maxBuffer: 4 * 1024 * 1024,
  }, (error, stdout, stderr) => {
    if (error) {
      error.message = `${error.message}${stderr ? `: ${String(stderr).slice(-1500)}` : ""}`;
      reject(error);
      return;
    }
    resolve(stdout);
  });
});

export const getAiSubtitleSourcePaths = (jobId, config = assertAiSubtitleConfig()) => {
  const id = requireJobId(jobId);
  const root = path.resolve(config.sourceRoot, id);
  const prefix = `${path.resolve(config.sourceRoot)}${path.sep}`;
  if (!root.startsWith(prefix)) throw new TypeError("Chemin de source IA invalide.");
  return {
    root,
    audioPath: path.join(root, "audio.wav"),
    partialPath: path.join(root, "audio.partial.wav"),
    relativePath: `${id}/audio.wav`,
  };
};

export const resolveAiSubtitleSource = (relativePath, config = assertAiSubtitleConfig()) => {
  const value = String(relativePath || "").replace(/\\/g, "/");
  const absolute = path.resolve(config.sourceRoot, ...value.split("/"));
  const prefix = `${path.resolve(config.sourceRoot)}${path.sep}`;
  if (!absolute.startsWith(prefix)) throw new TypeError("Chemin de source IA hors périmètre.");
  return absolute;
};

export const sha256File = (filename) => new Promise((resolve, reject) => {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filename);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("error", reject);
  stream.on("end", () => resolve(hash.digest("hex")));
});

export async function prepareAiSubtitleAudio({ jobId, videoPath, signal, config } = {}) {
  const runtimeConfig = config || assertAiSubtitleConfig();
  const sourceVideoPath = resolveUploadPath(videoPath);
  if (!sourceVideoPath || !fs.existsSync(sourceVideoPath)) {
    throw new Error("La source HLS de la vidéo est introuvable.");
  }
  const paths = getAiSubtitleSourcePaths(jobId, runtimeConfig);
  await fs.promises.mkdir(paths.root, { recursive: true, mode: 0o700 });
  await fs.promises.rm(paths.partialPath, { force: true });
  try {
    await run(getFfmpegExecutable(), [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", sourceVideoPath,
      "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000",
      "-c:a", "pcm_s16le", paths.partialPath,
    ], { signal });
    await fs.promises.rename(paths.partialPath, paths.audioPath);
    const stats = await fs.promises.stat(paths.audioPath);
    return {
      path: paths.audioPath,
      relativePath: paths.relativePath,
      size: stats.size,
      sha256: await sha256File(paths.audioPath),
    };
  } catch (error) {
    await fs.promises.rm(paths.partialPath, { force: true }).catch(() => {});
    throw error;
  }
}

export async function openAiSubtitleSource({ relativePath, offset = 0, config } = {}) {
  const absolute = resolveAiSubtitleSource(relativePath, config);
  const stats = await fs.promises.stat(absolute);
  const parsedOffset = Number(offset);
  if (!Number.isSafeInteger(parsedOffset) || parsedOffset < 0 || parsedOffset > stats.size) {
    const error = new Error("Offset de source IA invalide.");
    error.statusCode = 416;
    throw error;
  }
  return {
    size: stats.size,
    offset: parsedOffset,
    length: stats.size - parsedOffset,
    stream: fs.createReadStream(absolute, { start: parsedOffset }),
  };
}

export const cleanupAiSubtitleSource = async (jobId, config) => {
  const paths = getAiSubtitleSourcePaths(jobId, config);
  await fs.promises.rm(paths.root, { recursive: true, force: true });
};
