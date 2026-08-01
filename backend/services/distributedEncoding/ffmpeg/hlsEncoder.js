import fs from "fs";
import path from "path";

import {
  buildAudioRenditionArguments,
  buildVideoProfileArguments,
} from "./ffmpegArguments.js";
import { runFfmpeg } from "./ffmpegRunner.js";
import { validateHlsMediaPlaylist } from "./hlsValidation.js";

const normalizeOutputKey = (value, fieldName) => {
  const key = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(key)) {
    throw new TypeError(`${fieldName} contient des caractères interdits.`);
  }
  return key;
};

const toPosixRelativePath = (root, target) =>
  path.relative(root, target).split(path.sep).join("/");

export async function encodeSingleVideoProfile({
  videoPath,
  outputDir,
  profile,
  videoStreamIndex,
  audioStreamIndex,
  includeAudio = true,
  durationSeconds = 0,
  segmentDurationSeconds = 4,
  audioBitrateKbps = 192,
  onProgress,
  signal,
  ffmpegPath,
  runFfmpegImpl = runFfmpeg,
}) {
  const outputKey = normalizeOutputKey(profile?.label, "profile.label");
  const profileDir = path.join(outputDir, outputKey);
  const playlistPath = path.join(profileDir, "playlist.m3u8");
  const segmentPattern = path.join(profileDir, "segment_%06d.ts");
  await fs.promises.mkdir(profileDir, { recursive: true });

  const args = buildVideoProfileArguments({
    videoPath,
    playlistPath,
    segmentPattern,
    profile,
    videoStreamIndex,
    audioStreamIndex,
    includeAudio,
    audioBitrateKbps,
    segmentDurationSeconds,
  });
  await runFfmpegImpl({
    args,
    durationSeconds,
    onProgress,
    signal,
    ...(ffmpegPath ? { ffmpegPath } : {}),
  });
  const validation = await validateHlsMediaPlaylist({
    playlistPath,
    requireIndependentSegments: true,
  });

  return {
    resolutionPlaylist: toPosixRelativePath(outputDir, playlistPath),
    bitrate: profile.bitrate,
    width: profile.width,
    height: profile.height,
    playlistPath,
    segmentPaths: validation.segmentPaths,
    segmentDurations: validation.durations,
  };
}

export async function encodeAudioRendition({
  videoPath,
  outputDir,
  track,
  durationSeconds = 0,
  segmentDurationSeconds = 4,
  audioBitrateKbps = 192,
  onProgress,
  signal,
  ffmpegPath,
  runFfmpegImpl = runFfmpeg,
}) {
  const order = Number(track?.order);
  if (!Number.isInteger(order) || order < 0) {
    throw new TypeError("track.order doit être un entier positif ou nul.");
  }
  const audioDir = path.join(outputDir, "audio", String(order));
  const playlistPath = path.join(audioDir, "playlist.m3u8");
  const segmentPattern = path.join(audioDir, "segment_%06d.ts");
  await fs.promises.mkdir(audioDir, { recursive: true });

  const args = buildAudioRenditionArguments({
    videoPath,
    playlistPath,
    segmentPattern,
    sourceIndex: track.sourceIndex,
    audioBitrateKbps,
    segmentDurationSeconds,
  });
  await runFfmpegImpl({
    args,
    durationSeconds,
    onProgress,
    signal,
    ...(ffmpegPath ? { ffmpegPath } : {}),
  });
  const validation = await validateHlsMediaPlaylist({ playlistPath });

  return {
    label: track.label,
    language: track.language,
    isDefault: track.isDefault,
    order,
    sourceIndex: track.sourceIndex,
    outputChannels: 2,
    relativePlaylist: toPosixRelativePath(outputDir, playlistPath),
    playlistPath,
    segmentPaths: validation.segmentPaths,
    segmentDurations: validation.durations,
  };
}
