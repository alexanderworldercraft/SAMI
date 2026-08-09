import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  buildVideoEncodingPlan,
  encodeAudioRendition,
  encodeSingleVideoProfile,
  getFfmpegExecutable,
  validateHlsMediaPlaylist,
} from "../services/distributedEncoding/ffmpeg/index.js";
import {
  probeVideo,
  transcodeVideoToHls,
} from "../services/video/videoTranscodingService.js";
import {
  buildAudioTrackPlans,
  getAudioStreams,
  getVideoDurationSeconds,
  getVideoStream,
  selectPreferredAudioStream,
} from "../services/video/videoImportHelpers.js";

const ffmpegPath = getFfmpegExecutable();
const encoderProbe = spawnSync(ffmpegPath, ["-hide_banner", "-encoders"], {
  encoding: "utf8",
  shell: false,
  windowsHide: true,
});
const hasRequiredFfmpeg = encoderProbe.status === 0
  && encoderProbe.stdout.includes("libx264")
  && encoderProbe.stdout.includes(" AAC ");
const ffmpegDescribe = hasRequiredFfmpeg ? describe : describe.skip;

ffmpegDescribe("pipeline HLS réel libx264/AAC", () => {
  let root;
  let fixturePath;
  let metadata;
  let videoStream;
  let audioStream;
  let audioTracks;

  beforeAll(async () => {
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sami-hls-real-"));
    fixturePath = path.join(root, "fixture-two-audio.mkv");
    const generated = spawnSync(ffmpegPath, [
      "-hide_banner",
      "-loglevel", "error",
      "-f", "lavfi",
      "-i", "testsrc2=size=320x240:rate=24",
      "-f", "lavfi",
      "-i", "sine=frequency=880:sample_rate=48000:duration=3",
      "-f", "lavfi",
      "-i", "sine=frequency=440:sample_rate=48000",
      "-t", "5",
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-map", "2:a:0",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-metadata:s:a:0", "language=fra",
      "-metadata:s:a:0", "title=VFF",
      "-metadata:s:a:1", "language=jpn",
      "-metadata:s:a:1", "title=Japonais",
      "-y",
      fixturePath,
    ], {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    if (generated.status !== 0) {
      throw new Error(generated.stderr || "La fixture FFmpeg n'a pas pu être générée.");
    }

    metadata = await probeVideo(fixturePath);
    videoStream = getVideoStream(metadata);
    audioStream = selectPreferredAudioStream(metadata);
    audioTracks = buildAudioTrackPlans(getAudioStreams(metadata), audioStream);
  }, 30000);

  afterAll(async () => {
    if (root) await fs.promises.rm(root, { recursive: true, force: true });
  });

  it("préserve le contrat classique avec l'audio préféré intégré", async () => {
    const sourcePath = path.join(root, "classic-source.mkv");
    const outputDir = path.join(root, "classic-hls");
    await fs.promises.copyFile(fixturePath, sourcePath);
    await fs.promises.mkdir(outputDir);
    const onProgress = vi.fn();

    const result = await transcodeVideoToHls({
      videoPath: sourcePath,
      metadata,
      videoStream,
      audioStream,
      audioTracks,
      multiAudioEnabled: false,
      outputDir,
      title: "Fixture classique",
      onProgress,
    });

    expect(result).toMatchObject({ multiAudio: false, audioTracks: [] });
    expect(result.playlists).toEqual([
      expect.objectContaining({
        resolutionPlaylist: "source/playlist.m3u8",
        width: 320,
        height: 240,
      }),
    ]);
    expect(fs.existsSync(result.masterPlaylistPath)).toBe(true);
    expect(fs.existsSync(sourcePath)).toBe(false);
    const encodedMetadata = await probeVideo(
      path.join(outputDir, result.playlists[0].resolutionPlaylist)
    );
    expect(encodedMetadata.streams.some((stream) => stream.codec_type === "video")).toBe(true);
    expect(encodedMetadata.streams.some((stream) => stream.codec_type === "audio")).toBe(true);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      completed: true,
      progress: 100,
    }));
  }, 30000);

  it("préserve les variantes vidéo seules et les renditions du multi-audio", async () => {
    const sourcePath = path.join(root, "multi-source.mkv");
    const outputDir = path.join(root, "multi-hls");
    await fs.promises.copyFile(fixturePath, sourcePath);
    await fs.promises.mkdir(outputDir);

    const result = await transcodeVideoToHls({
      videoPath: sourcePath,
      metadata,
      videoStream,
      audioStream,
      audioTracks,
      multiAudioEnabled: true,
      outputDir,
      title: "Fixture multi-audio",
    });

    expect(result.multiAudio).toBe(true);
    expect(result.audioTracks).toHaveLength(2);
    expect(result.audioTracks.filter((track) => track.isDefault)).toHaveLength(1);
    expect(audioTracks[0].durationSeconds).toBeLessThan(
      getVideoDurationSeconds(metadata, videoStream) - 1
    );
    const videoPlaylistPath = path.join(outputDir, result.playlists[0].resolutionPlaylist);
    const encodedVideo = await probeVideo(videoPlaylistPath);
    expect(encodedVideo.streams.some((stream) => stream.codec_type === "video")).toBe(true);
    expect(encodedVideo.streams.some((stream) => stream.codec_type === "audio")).toBe(false);

    const videoTimeline = await validateHlsMediaPlaylist({
      playlistPath: videoPlaylistPath,
    });
    for (const track of result.audioTracks) {
      const audioPlaylistPath = path.join(outputDir, track.relativePlaylist);
      const encodedAudio = await probeVideo(audioPlaylistPath);
      expect(encodedAudio.streams.some((stream) => stream.codec_type === "audio")).toBe(true);
      expect(encodedAudio.streams.some((stream) => stream.codec_type === "video")).toBe(false);
      const audioTimeline = await validateHlsMediaPlaylist({ playlistPath: audioPlaylistPath });
      expect(Math.abs(audioTimeline.totalDuration - videoTimeline.totalDuration)).toBeLessThan(0.25);
    }

    const master = await fs.promises.readFile(result.masterPlaylistPath, "utf8");
    expect(master).toContain("#EXT-X-MEDIA:TYPE=AUDIO");
    expect(master.match(/DEFAULT=YES/g)).toHaveLength(1);
    expect(fs.existsSync(sourcePath)).toBe(false);
  }, 30000);

  it("encode réellement une tâche distribuée vidéo et sa rendition audio alignée", async () => {
    const outputDir = path.join(root, "distributed-hls");
    await fs.promises.mkdir(outputDir);
    const plan = buildVideoEncodingPlan({
      metadata,
      videoStream,
      audioStream,
      audioTracks,
      multiAudioEnabled: true,
    });
    const profile = plan.profiles[0];

    const video = await encodeSingleVideoProfile({
      videoPath: fixturePath,
      outputDir,
      profile,
      videoStreamIndex: plan.videoStreamIndex,
      audioStreamIndex: plan.audioStreamIndex,
      includeAudio: false,
      durationSeconds: plan.durationSeconds,
      segmentDurationSeconds: plan.segmentDurationSeconds,
      audioBitrateKbps: plan.audioBitrateKbps,
    });
    const audio = await encodeAudioRendition({
      videoPath: fixturePath,
      outputDir,
      track: plan.audioRenditions[0],
      durationSeconds: plan.durationSeconds,
      segmentDurationSeconds: plan.segmentDurationSeconds,
      audioBitrateKbps: plan.audioBitrateKbps,
    });

    const videoTimeline = await validateHlsMediaPlaylist({
      playlistPath: video.playlistPath,
      requireIndependentSegments: true,
    });
    const audioTimeline = await validateHlsMediaPlaylist({
      playlistPath: audio.playlistPath,
    });
    expect(Math.abs(audioTimeline.totalDuration - videoTimeline.totalDuration))
      .toBeLessThan(0.25);
  }, 30000);
});
