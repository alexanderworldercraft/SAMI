import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";

import { UPLOADS_ROOT, VIDEO_ROOT } from "./videoPaths.js";

export const PREVIEW_LIVE_INTERVAL_SECONDS = 4;
export const PREVIEW_LIVE_FRAMES_PER_SPRITE = 50;
export const PREVIEW_LIVE_COLUMNS = 10;
export const PREVIEW_LIVE_ROWS = 5;
export const PREVIEW_LIVE_THUMB_WIDTH = 160;
export const PREVIEW_LIVE_THUMB_HEIGHT = 90;

const generationPromises = new Map();

const getPreviewLiveDir = (videoId) =>
  path.join(VIDEO_ROOT, String(videoId), "preview-live");

const getPreviewLiveUrl = (videoId) =>
  `/uploads/video/${videoId}/preview-live/thumbnails.vtt`;

const secondsToVttTimestamp = (seconds) => {
  const milliseconds = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const remainingSeconds = Math.floor((milliseconds % 60_000) / 1000);
  const remainingMilliseconds = milliseconds % 1000;

  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    `${String(remainingSeconds).padStart(2, "0")}.${String(remainingMilliseconds).padStart(3, "0")}`,
  ].join(":");
};

const getPlaylistDuration = (playlistPath) => {
  const playlist = fs.readFileSync(playlistPath, "utf8");
  return playlist
    .split(/\r?\n/)
    .reduce((duration, line) => {
      const match = line.trim().match(/^#EXTINF:([0-9.]+)/i);
      return duration + (match ? Number(match[1]) || 0 : 0);
    }, 0);
};

const resolveMediaPlaylist = (masterPlaylistPath) => {
  const masterDir = path.dirname(masterPlaylistPath);
  const lines = fs
    .readFileSync(masterPlaylistPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const candidates = lines.filter(
    (line) => !line.startsWith("#") && /\.m3u8(?:\?|$)/i.test(line)
  );
  const preferred = candidates.find((line) => /240p\/playlist\.m3u8/i.test(line))
    || candidates[0];

  if (!preferred) return null;

  const cleanReference = preferred.split("?")[0];
  const playlistPath = path.resolve(masterDir, cleanReference);
  const uploadsRoot = path.resolve(UPLOADS_ROOT);
  const relativePath = path.relative(uploadsRoot, playlistPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) return null;
  return playlistPath;
};

const runFfmpeg = (command) =>
  new Promise((resolve, reject) => {
    command
      .on("end", resolve)
      .on("error", reject)
      .run();
  });

const extractPreviewFrames = async ({ playlistPath, framesDir }) => {
  const framePattern = path.join(framesDir, "frame-%06d.jpg");
  const filter = [
    `fps=1/${PREVIEW_LIVE_INTERVAL_SECONDS}`,
    `scale=${PREVIEW_LIVE_THUMB_WIDTH}:${PREVIEW_LIVE_THUMB_HEIGHT}:force_original_aspect_ratio=decrease`,
    `pad=${PREVIEW_LIVE_THUMB_WIDTH}:${PREVIEW_LIVE_THUMB_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
  ].join(",");

  await runFfmpeg(
    ffmpeg(playlistPath)
      .outputOptions([
        `-vf ${filter}`,
        "-q:v 4",
        "-vsync vfr",
      ])
      .output(framePattern)
  );

  return fs
    .readdirSync(framesDir)
    .filter((filename) => /^frame-\d{6}\.jpg$/i.test(filename))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
};

const createSpriteSheet = async ({
  framesDir,
  outputDir,
  spriteIndex,
  firstFrameNumber,
  frameCount,
}) => {
  const framePattern = path.join(framesDir, "frame-%06d.jpg");
  const outputPath = path.join(
    outputDir,
    `sprite-${String(spriteIndex + 1).padStart(3, "0")}.jpg`
  );
  const tileFilter = [
    `tile=${PREVIEW_LIVE_COLUMNS}x${PREVIEW_LIVE_ROWS}`,
    `nb_frames=${frameCount}`,
    "padding=0",
    "margin=0",
    "color=black",
  ].join(":");

  await runFfmpeg(
    ffmpeg(framePattern)
      .inputOptions([
        `-start_number ${firstFrameNumber}`,
        "-framerate 1",
      ])
      .outputOptions([
        "-frames:v 1",
        "-q:v 4",
      ])
      .videoFilters(tileFilter)
      .output(outputPath)
  );
};

export const buildPreviewLiveWebVtt = ({ frameCount, duration }) => {
  const cues = ["WEBVTT", ""];

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const start = frameIndex * PREVIEW_LIVE_INTERVAL_SECONDS;
    const end = frameIndex === frameCount - 1 && duration > start
      ? duration
      : duration > start
      ? Math.min(start + PREVIEW_LIVE_INTERVAL_SECONDS, duration)
      : start + PREVIEW_LIVE_INTERVAL_SECONDS;
    const spriteIndex = Math.floor(frameIndex / PREVIEW_LIVE_FRAMES_PER_SPRITE);
    const cellIndex = frameIndex % PREVIEW_LIVE_FRAMES_PER_SPRITE;
    const x = (cellIndex % PREVIEW_LIVE_COLUMNS) * PREVIEW_LIVE_THUMB_WIDTH;
    const y = Math.floor(cellIndex / PREVIEW_LIVE_COLUMNS) * PREVIEW_LIVE_THUMB_HEIGHT;
    const spriteFilename = `sprite-${String(spriteIndex + 1).padStart(3, "0")}.jpg`;

    cues.push(
      `${secondsToVttTimestamp(start)} --> ${secondsToVttTimestamp(end)}`,
      `${spriteFilename}#xywh=${x},${y},${PREVIEW_LIVE_THUMB_WIDTH},${PREVIEW_LIVE_THUMB_HEIGHT}`,
      ""
    );
  }

  return cues.join("\n");
};

export const getExistingPreviewLive = (videoId) => {
  const previewDir = getPreviewLiveDir(videoId);
  const vttPath = path.join(previewDir, "thumbnails.vtt");

  if (!fs.existsSync(vttPath)) return null;

  const vtt = fs.readFileSync(vttPath, "utf8");
  const spriteFilenames = Array.from(new Set(
    Array.from(
      vtt.matchAll(/^(sprite-\d+\.jpg)#xywh=/gim),
      (match) => match[1]
    )
  ));

  if (
    spriteFilenames.length === 0
    || spriteFilenames.some((filename) => !fs.existsSync(path.join(previewDir, filename)))
  ) {
    return null;
  }

  return {
    videoId: Number(videoId),
    vttUrl: getPreviewLiveUrl(videoId),
    interval: PREVIEW_LIVE_INTERVAL_SECONDS,
    width: PREVIEW_LIVE_THUMB_WIDTH,
    height: PREVIEW_LIVE_THUMB_HEIGHT,
  };
};

const generatePreviewLive = async ({ videoId, masterPlaylistPath }) => {
  const existingPreview = getExistingPreviewLive(videoId);
  if (existingPreview) return existingPreview;

  if (!masterPlaylistPath || !fs.existsSync(masterPlaylistPath)) {
    throw new Error("Playlist HLS introuvable.");
  }

  const playlistPath = resolveMediaPlaylist(masterPlaylistPath);
  if (!playlistPath || !fs.existsSync(playlistPath)) {
    throw new Error("Playlist média HLS introuvable.");
  }

  const videoDir = path.join(VIDEO_ROOT, String(videoId));
  fs.mkdirSync(videoDir, { recursive: true });
  const workspace = fs.mkdtempSync(path.join(videoDir, ".preview-live-"));
  const framesDir = path.join(workspace, "frames");
  fs.mkdirSync(framesDir, { recursive: true });

  try {
    const duration = getPlaylistDuration(playlistPath);
    const frameFiles = await extractPreviewFrames({ playlistPath, framesDir });
    if (frameFiles.length === 0) {
      throw new Error("Aucune vignette n'a pu être extraite.");
    }

    const spriteCount = Math.ceil(frameFiles.length / PREVIEW_LIVE_FRAMES_PER_SPRITE);
    for (let spriteIndex = 0; spriteIndex < spriteCount; spriteIndex += 1) {
      const offset = spriteIndex * PREVIEW_LIVE_FRAMES_PER_SPRITE;
      const frameCount = Math.min(
        PREVIEW_LIVE_FRAMES_PER_SPRITE,
        frameFiles.length - offset
      );
      await createSpriteSheet({
        framesDir,
        outputDir: workspace,
        spriteIndex,
        firstFrameNumber: offset + 1,
        frameCount,
      });
    }

    fs.writeFileSync(
      path.join(workspace, "thumbnails.vtt"),
      buildPreviewLiveWebVtt({ frameCount: frameFiles.length, duration }),
      "utf8"
    );
    fs.rmSync(framesDir, { recursive: true, force: true });

    const previewDir = getPreviewLiveDir(videoId);
    fs.rmSync(previewDir, { recursive: true, force: true });
    fs.renameSync(workspace, previewDir);

    return getExistingPreviewLive(videoId);
  } catch (error) {
    fs.rmSync(workspace, { recursive: true, force: true });
    throw error;
  }
};

export const generateVideoPreviewLiveFromMaster = ({ videoId, masterPlaylistPath }) => {
  const key = String(videoId);
  const existingPromise = generationPromises.get(key);
  if (existingPromise) return existingPromise;

  const generationPromise = generatePreviewLive({ videoId, masterPlaylistPath })
    .finally(() => generationPromises.delete(key));
  generationPromises.set(key, generationPromise);
  return generationPromise;
};
