import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { UPLOADS_ROOT, VIDEO_ROOT } from "./videoPaths.js";

const readPlaylistLines = (playlistPath) => {
  const content = fs.readFileSync(playlistPath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
};

const resolvePlaylistReference = (baseFilePath, reference) => {
  const cleanReference = String(reference || "").split("?")[0].trim();
  if (!cleanReference || cleanReference.startsWith("#")) return null;

  const absolutePath = path.resolve(path.dirname(baseFilePath), cleanReference);
  const normalizedUploadsRoot = path.resolve(UPLOADS_ROOT);

  if (!absolutePath.startsWith(normalizedUploadsRoot)) return null;
  return absolutePath;
};

const get240pPlaylistPath = (masterPlaylistPath) => {
  const lines = readPlaylistLines(masterPlaylistPath);
  const direct240p = lines.find((line) => !line.startsWith("#") && line.includes("240p/playlist.m3u8"));

  if (direct240p) return resolvePlaylistReference(masterPlaylistPath, direct240p);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.startsWith("#EXT-X-STREAM-INF") || !/426x240|240p/i.test(line)) continue;

    const nextMediaLine = lines.slice(index + 1).find((candidate) => !candidate.startsWith("#"));
    if (nextMediaLine) return resolvePlaylistReference(masterPlaylistPath, nextMediaLine);
  }

  return null;
};

const pickPreviewSegments = (segmentPaths, limit = 10) => {
  if (segmentPaths.length <= limit) return segmentPaths;

  const step = Math.max(1, Math.floor(segmentPaths.length / limit));
  const selected = [];

  for (let index = 0; index < segmentPaths.length && selected.length < limit; index += step) {
    selected.push(segmentPaths[index]);
  }

  return selected;
};

const extractFrameFromSegment = (segmentPath, outputPath) =>
  new Promise((resolve, reject) => {
    ffmpeg(segmentPath)
      .seekInput(0.1)
      .frames(1)
      .outputOptions(["-q:v 4"])
      .on("end", resolve)
      .on("error", reject)
      .save(outputPath);
  });

const getVideoScopedPreviewDir = (videoId) =>
  path.join(VIDEO_ROOT, String(videoId), "preview");

const getLegacyPreviewDir = (videoId) =>
  path.join(UPLOADS_ROOT, "previews", String(videoId));

const getPreviewFrameUrlsFromDir = (videoId, previewDir, urlPrefix) => {
  if (!fs.existsSync(previewDir)) return [];

  return fs
    .readdirSync(previewDir)
    .filter((filename) => /\.(jpe?g|png|webp)$/i.test(filename))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .slice(0, 10)
    .map((filename) => `${urlPrefix}/${filename}`);
};

export const getExistingPreviewFrames = (videoId) => {
  const scopedFrames = getPreviewFrameUrlsFromDir(
    videoId,
    getVideoScopedPreviewDir(videoId),
    `/uploads/video/${videoId}/preview`
  );

  if (scopedFrames.length > 0) return scopedFrames;

  return getPreviewFrameUrlsFromDir(
    videoId,
    getLegacyPreviewDir(videoId),
    `/uploads/previews/${videoId}`
  );
};

export const generateVideoPreviewFramesFromMaster = async ({ videoId, masterPlaylistPath }) => {
  const existingFrames = getExistingPreviewFrames(videoId);
  if (existingFrames.length > 0) return existingFrames;

  if (!masterPlaylistPath || !fs.existsSync(masterPlaylistPath)) {
    throw new Error("Playlist HLS introuvable.");
  }

  const playlist240pPath = get240pPlaylistPath(masterPlaylistPath);
  if (!playlist240pPath || !fs.existsSync(playlist240pPath)) {
    throw new Error("Playlist 240p introuvable.");
  }

  const segmentPaths = readPlaylistLines(playlist240pPath)
    .filter((line) => !line.startsWith("#") && /\.ts(?:\?|$)/i.test(line))
    .map((line) => resolvePlaylistReference(playlist240pPath, line))
    .filter((segmentPath) => segmentPath && fs.existsSync(segmentPath));

  const selectedSegments = pickPreviewSegments(segmentPaths);
  if (!selectedSegments.length) {
    throw new Error("Aucun segment 240p exploitable.");
  }

  const previewDir = getVideoScopedPreviewDir(videoId);
  fs.mkdirSync(previewDir, { recursive: true });

  const frames = [];
  for (let index = 0; index < selectedSegments.length; index += 1) {
    const outputFilename = `frame-${String(index + 1).padStart(2, "0")}.jpg`;
    const outputPath = path.join(previewDir, outputFilename);

    if (!fs.existsSync(outputPath)) {
      try {
        await extractFrameFromSegment(selectedSegments[index], outputPath);
      } catch (error) {
        console.warn(`Aperçu vidéo ${videoId}: frame ${index + 1} ignorée`, error.message);
        continue;
      }
    }

    frames.push(`/uploads/video/${videoId}/preview/${outputFilename}`);
  }

  if (!frames.length) {
    throw new Error("Aucune image de prévisualisation générée.");
  }

  return frames;
};
