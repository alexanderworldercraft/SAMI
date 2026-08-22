import fs from "fs";
import { finished } from "stream/promises";
import { pipeline } from "stream/promises";
import path from "path";
import ffmpeg from "fluent-ffmpeg";

import { MULTIPART_LIMITS } from "../../constants.js";
import {
  getFfmpegExecutable,
  getFfprobeExecutable,
} from "../distributedEncoding/ffmpeg/index.js";
import { withEncodingCapacity } from "../distributedEncoding/capacity.js";
import {
  normalizeAiLanguage,
  subtitleTypeFromStream,
} from "../aiSubtitles/language.js";
import {
  ERROR_ROOT,
  TEMP_ROOT,
} from "./videoPaths.js";
import {
  VideoImportValidationError,
  buildAddVideoProcessingVideoInfo,
  buildMasterPlaylist,
  buildMultiAudioMasterPlaylist,
  getHlsProfiles,
  getVideoDurationSeconds,
  normalizeLangTag,
  timemarkToSeconds,
} from "./videoImportHelpers.js";

const VIDEO_EXTENSIONS = new Set([".avi", ".mov", ".mkv", ".webm", ".flv", ".wmv", ".mp4"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const HLS_AUDIO_BITRATE = 192;

export function configureVideoTranscodingExecutables({
  fluentFfmpeg = ffmpeg,
  env = process.env,
} = {}) {
  const ffmpegPath = getFfmpegExecutable(env);
  const ffprobePath = getFfprobeExecutable(env);
  fluentFfmpeg.setFfmpegPath(ffmpegPath);
  fluentFfmpeg.setFfprobePath(ffprobePath);
  return { ffmpegPath, ffprobePath };
}

configureVideoTranscodingExecutables();

export class VideoTranscodingError extends Error {
  constructor(message, { errors = [], reference = null } = {}) {
    super(message);
    this.name = "VideoTranscodingError";
    this.errors = errors;
    this.reference = reference;
  }
}

export function createVideoUploadWorkspace() {
  fs.mkdirSync(TEMP_ROOT, { recursive: true });
  fs.mkdirSync(ERROR_ROOT, { recursive: true });

  const root = fs.mkdtempSync(path.join(TEMP_ROOT, "addvideo-"));
  const workspace = {
    root,
    videoDir: path.join(root, "source"),
    hlsDir: path.join(root, "hls"),
    imageDir: path.join(root, "image"),
    subtitlesDir: path.join(root, "subtitles"),
  };

  Object.values(workspace)
    .filter((directory) => directory !== root)
    .forEach((directory) => fs.mkdirSync(directory, { recursive: true }));

  return workspace;
}

const assignTextField = (data, fieldName, value) => {
  const normalizedField = String(fieldName || "").trim();
  const lowerName = normalizedField.toLowerCase();
  const compactName = lowerName.replace(/[^a-z0-9]/g, "");
  const fieldValue = String(value ?? "").trim();

  data[normalizedField] = fieldValue;
  if (lowerName === "titre") data.titre = fieldValue;
  if (lowerName === "resumer") data.resumer = fieldValue;
  if (compactName === "genres") data.genres = fieldValue;
  if (compactName === "saisonid") data.SaisonID = fieldValue;
};

const drainFile = async (stream) => {
  stream.resume();
  await finished(stream).catch(() => {});
};

export async function readVideoMultipart({
  request,
  io,
  processingId,
  processingTimer,
  workspace,
}) {
  if (!/multipart\/form-data/i.test(request.headers["content-type"] || "")) {
    throw new VideoImportValidationError("Un formulaire multipart avec un fichier vidéo est requis.");
  }

  const data = {};
  let videoTempPath = null;
  const parts = request.parts({
    limits: { fileSize: MULTIPART_LIMITS.VIDEO_FILE_SIZE },
  });

  for await (const part of parts) {
    if (part.type !== "file") {
      assignTextField(data, part.fieldname, part.value);
      continue;
    }

    const originalName = path.basename(part.filename || "");
    const extension = path.extname(originalName).toLowerCase();
    const mimeType = String(part.mimetype || "").toLowerCase();
    const isVideo = VIDEO_EXTENSIONS.has(extension)
      && (mimeType.startsWith("video/") || mimeType === "application/octet-stream");
    const isImage = IMAGE_EXTENSIONS.has(extension) && mimeType.startsWith("image/");

    if (!isVideo && !isImage) {
      console.warn("[addVideo] Fichier ignoré :", { originalName, mimeType, extension });
      await drainFile(part.file);
      continue;
    }

    if (isVideo && videoTempPath) {
      await drainFile(part.file);
      throw new VideoImportValidationError("Un seul fichier vidéo peut être importé à la fois.");
    }

    const filePath = isVideo
      ? path.join(workspace.videoDir, `source${extension}`)
      : path.join(workspace.imageDir, `affiche${extension}`);

    if (isVideo) {
      data.videoOriginalName = originalName;
      let uploadedBytes = 0;
      const totalBytes = Number.parseInt(request.headers["content-length"], 10);

      part.file.on("data", (chunk) => {
        uploadedBytes += chunk.length;
        if (!Number.isFinite(totalBytes) || totalBytes <= 0) return;

        io.emit("progress", {
          stage: "upload",
          status: "download",
          processingId,
          ...(processingTimer?.snapshot() || {}),
          video: buildAddVideoProcessingVideoInfo({
            data,
            processingId,
            audioStream: null,
            subtitleInfos: [],
            saison: null,
          }),
          progress: Math.min(99, Math.round((uploadedBytes / totalBytes) * 100)),
        });
      });
    }

    await pipeline(part.file, fs.createWriteStream(filePath));

    if (isVideo) {
      videoTempPath = filePath;
      io.emit("progress", {
        stage: "upload",
        status: "download",
        processingId,
        ...(processingTimer?.snapshot() || {}),
        video: buildAddVideoProcessingVideoInfo({
          data,
          processingId,
          audioStream: null,
          subtitleInfos: [],
          saison: null,
        }),
        progress: 100,
      });
    } else {
      data.imageTempPath = filePath;
      data.imageTempExt = extension;
    }
  }

  return { data, videoTempPath };
}

export const probeVideo = (videoPath) =>
  new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (error, metadata) => {
      if (error) return reject(error);
      return resolve(metadata);
    });
  });

export async function extractVideoSubtitles({ videoPath, subtitleStreams, outputDir }) {
  const subtitleInfos = [];

  for (const [position, stream] of subtitleStreams.entries()) {
    const language = normalizeLangTag(stream.tags?.language);
    const filename = `${language || "subtitle"}_${position + 1}.vtt`;
    const label = String(
      stream.tags?.title || stream.tags?.language || `Subtitle ${position + 1}`
    ).trim();
    const subtitlePath = path.join(outputDir, filename);

    try {
      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .outputOptions([`-map 0:${stream.index}`, "-c:s webvtt"])
          .output(subtitlePath)
          .on("end", resolve)
          .on("error", reject)
          .run();
      });
      subtitleInfos.push({
        tempPath: subtitlePath,
        filename,
        label,
        language: normalizeAiLanguage(language) || language || null,
        type: subtitleTypeFromStream({ label, disposition: stream.disposition }),
      });
    } catch (error) {
      console.warn(
        `[addVideo] Le sous-titre ${position + 1} n'a pas pu être extrait :`,
        error.message
      );
    }
  }

  return subtitleInfos;
}

const archiveTranscodingFailure = ({ title, videoPath, errors }) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeTitle = String(title || "VideoError").replace(/[^a-zA-Z0-9_-]/g, "") || "VideoError";
  const reference = `${safeTitle}_${timestamp}`;
  const errorFolder = path.join(ERROR_ROOT, reference);
  const errorLogPath = path.join(errorFolder, "conversion-errors.txt");
  const details = errors
    .map((error) =>
      `Résolution : ${error.resolution}\nErreur : ${error.message}\nCode : ${error.code || "N/A"}`
    )
    .join("\n\n");

  fs.mkdirSync(errorFolder, { recursive: true });
  fs.writeFileSync(errorLogPath, details);
  if (videoPath && fs.existsSync(videoPath)) {
    fs.renameSync(videoPath, path.join(errorFolder, path.basename(videoPath)));
  }

  return reference;
};

async function transcodeVideoToHlsSequential({
  videoPath,
  metadata,
  videoStream,
  audioStream,
  audioTracks = [],
  multiAudioEnabled = false,
  outputDir,
  title,
  onProgress,
}) {
  const duration = getVideoDurationSeconds(metadata, videoStream);
  const profiles = getHlsProfiles(videoStream);
  const playlists = [];
  const alternateAudioTracks = [];
  const errors = [];
  const useAlternateAudio = multiAudioEnabled && audioTracks.length > 1;

  for (const profile of profiles) {
    const resolutionDir = path.join(outputDir, profile.label);
    const playlistPath = path.join(resolutionDir, "playlist.m3u8");
    fs.mkdirSync(resolutionDir, { recursive: true });

    try {
      await new Promise((resolve, reject) => {
        const outputOptions = [
          `-map 0:${videoStream.index}`,
          `-vf scale=w=${profile.width}:h=-2`,
          "-crf 23",
          `-maxrate ${profile.bitrate}k`,
          "-bufsize 2M",
          "-hls_time 4",
          "-hls_playlist_type vod",
          "-preset veryfast",
          "-profile:v high",
          "-pix_fmt yuv420p",
        ];

        if (useAlternateAudio) {
          outputOptions.push(
            "-an",
            "-force_key_frames expr:gte(t,n_forced*4)"
          );
        } else {
          outputOptions.push(
            `-map 0:${audioStream.index}`,
            "-c:a aac",
            "-ac 2",
            "-ar 48000",
            `-b:a ${HLS_AUDIO_BITRATE}k`,
            "-af apad",
            ...(duration > 0 ? [`-t ${duration}`] : [])
          );
        }

        const command = ffmpeg(videoPath);
        if (useAlternateAudio) {
          command.inputOptions(["-copyts", "-start_at_zero"]);
        }

        command
          .outputOptions(outputOptions)
          .output(playlistPath)
          .on("progress", (progress) => {
            const seconds = timemarkToSeconds(progress.timemark);
            const percent = duration > 0
              ? Math.max(0, Math.min(99, Math.round((seconds / duration) * 100)))
              : 0;
            onProgress?.({ profile, progress: percent });
          })
          .on("end", resolve)
          .on("error", reject)
          .run();
      });

      playlists.push({
        resolutionPlaylist: path.relative(outputDir, playlistPath),
        bitrate: profile.bitrate,
        width: profile.width,
        height: profile.height,
      });
      onProgress?.({ profile, progress: 100, completed: true });
    } catch (error) {
      errors.push({
        resolution: profile.label,
        message: error.message,
        code: error.code,
      });
      onProgress?.({ profile, progress: 100, error });
    }
  }

  if (useAlternateAudio && errors.length === 0) {
    for (const track of audioTracks) {
      const audioDir = path.join(outputDir, "audio", String(track.order));
      const playlistPath = path.join(audioDir, "playlist.m3u8");
      const segmentPath = path.join(audioDir, "segment_%05d.ts");
      const profile = { label: `Audio ${track.label}` };
      fs.mkdirSync(audioDir, { recursive: true });

      try {
        await new Promise((resolve, reject) => {
          ffmpeg(videoPath)
            .inputOptions(["-copyts", "-start_at_zero"])
            .outputOptions([
              `-map 0:${track.stream.index}`,
              "-vn",
              "-c:a aac",
              "-ac 2",
              "-ar 48000",
              `-b:a ${HLS_AUDIO_BITRATE}k`,
              "-af apad",
              ...(duration > 0 ? [`-t ${duration}`] : []),
              "-hls_time 4",
              "-hls_playlist_type vod",
              `-hls_segment_filename ${segmentPath}`,
            ])
            .output(playlistPath)
            .on("progress", (progress) => {
              const seconds = timemarkToSeconds(progress.timemark);
              const percent = duration > 0
                ? Math.max(0, Math.min(99, Math.round((seconds / duration) * 100)))
                : 0;
              onProgress?.({ profile, progress: percent });
            })
            .on("end", resolve)
            .on("error", reject)
            .run();
        });

        alternateAudioTracks.push({
          label: track.label,
          language: track.language,
          isDefault: track.isDefault,
          order: track.order,
          sourceIndex: track.sourceIndex,
          outputChannels: 2,
          relativePlaylist: path.relative(outputDir, playlistPath),
        });
        onProgress?.({ profile, progress: 100, completed: true });
      } catch (error) {
        errors.push({
          resolution: profile.label,
          message: error.message,
          code: error.code,
        });
        onProgress?.({ profile, progress: 100, error });
      }
    }
  }

  if (errors.length > 0 || playlists.length === 0) {
    const failureErrors = errors.length > 0
      ? errors
      : [{ resolution: "N/A", message: "Aucune conversion réussie." }];
    const reference = archiveTranscodingFailure({
      title,
      videoPath,
      errors: failureErrors,
    });
    throw new VideoTranscodingError("Une ou plusieurs conversions ont échoué.", {
      errors: failureErrors,
      reference,
    });
  }

  const masterPlaylistPath = path.join(outputDir, "master.m3u8");
  const masterPlaylist = useAlternateAudio
    ? buildMultiAudioMasterPlaylist(
        playlists,
        alternateAudioTracks,
        HLS_AUDIO_BITRATE
      )
    : buildMasterPlaylist(playlists);
  fs.writeFileSync(masterPlaylistPath, masterPlaylist);
  fs.rmSync(videoPath, { force: true });

  return {
    masterPlaylistPath,
    playlists,
    audioTracks: alternateAudioTracks,
    multiAudio: useAlternateAudio,
  };
}

export async function transcodeVideoToHls(options) {
  return withEncodingCapacity(
    () => transcodeVideoToHlsSequential(options),
    { signal: options?.signal }
  );
}
