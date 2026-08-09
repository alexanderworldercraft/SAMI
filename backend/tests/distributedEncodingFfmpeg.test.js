import { EventEmitter } from "events";
import fs from "fs";
import os from "os";
import path from "path";
import { PassThrough } from "stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assembleMasterPlaylist,
  buildAudioRenditionArguments,
  buildVideoEncodingPlan,
  buildVideoProfileArguments,
  encodeAudioRendition,
  encodeSingleVideoProfile,
  getFfmpegExecutable,
  getFfprobeExecutable,
  runFfmpeg,
  validateHlsMediaPlaylist,
} from "../services/distributedEncoding/ffmpeg/index.js";

const temporaryRoots = [];

const createTemporaryRoot = async (prefix = "sami-ffmpeg-") => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
};

const writeFakeHlsOutput = async (args, { independent = false } = {}) => {
  const playlistPath = args.at(-1);
  const segmentPattern = args[args.indexOf("-hls_segment_filename") + 1];
  const segmentPath = segmentPattern.replace("%06d", "000000");
  await fs.promises.mkdir(path.dirname(playlistPath), { recursive: true });
  await fs.promises.writeFile(segmentPath, "fake-mpeg-ts");
  await fs.promises.writeFile(
    playlistPath,
    [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      ...(independent ? ["#EXT-X-INDEPENDENT-SEGMENTS"] : []),
      "#EXTINF:4.000000,",
      path.basename(segmentPath),
      "#EXT-X-ENDLIST",
      "",
    ].join("\n")
  );
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.promises.rm(root, { recursive: true, force: true })
    )
  );
});

describe("plan d'encodage distribué", () => {
  it("construit un plan sérialisable et déterministe pour l'audio intégré", () => {
    const input = {
      metadata: { format: { duration: "120.5" } },
      videoStream: { index: 5, width: 1920, height: 800 },
      audioStream: { index: 9 },
      audioTracks: [{
        label: "Japonais",
        language: "ja",
        isDefault: true,
        order: 0,
        sourceIndex: 9,
      }],
      multiAudioEnabled: false,
    };

    const first = buildVideoEncodingPlan(input);
    const second = buildVideoEncodingPlan(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      durationSeconds: 120.5,
      segmentDurationSeconds: 4,
      videoStreamIndex: 5,
      audioStreamIndex: 9,
      multiAudio: false,
      audioRenditions: [],
    });
    expect(first.profiles.at(-1)).toEqual({
      label: "1080p",
      width: 1920,
      height: 800,
      bitrate: 12000,
    });
    expect(() => JSON.stringify(first)).not.toThrow();
  });

  it("fige les renditions multi-audio, leur ordre et leur unique piste par défaut", () => {
    const plan = buildVideoEncodingPlan({
      metadata: { format: { duration: 60 } },
      videoStream: { index: 2, width: 640, height: 360 },
      audioStream: { index: 7 },
      audioTracks: [
        { label: "Français", language: "fr", isDefault: false, order: 0, sourceIndex: 4 },
        { label: "Japonais", language: "ja", isDefault: true, order: 1, sourceIndex: 7 },
      ],
      multiAudioEnabled: true,
    });

    expect(plan.multiAudio).toBe(true);
    expect(plan.audioRenditions).toEqual([
      expect.objectContaining({ order: 0, sourceIndex: 4, isDefault: false }),
      expect.objectContaining({ order: 1, sourceIndex: 7, isDefault: true }),
    ]);

    expect(() => buildVideoEncodingPlan({
      metadata: { format: { duration: 60 } },
      videoStream: { index: 2, width: 640, height: 360 },
      audioStream: { index: 7 },
      audioTracks: [
        { label: "FR", order: 0, sourceIndex: 4 },
        { label: "JP", order: 1, sourceIndex: 7 },
      ],
      multiAudioEnabled: true,
    })).toThrow(/exactement une piste par défaut/);
  });

  it("mesure les durées vidéo/audio et calcule le silence à ajouter", () => {
    const plan = buildVideoEncodingPlan({
      metadata: { format: { duration: 6000 } },
      videoStream: {
        index: 0,
        width: 1920,
        height: 1080,
        duration: "N/A",
        tags: { DURATION: "01:39:51.611000000" },
      },
      audioStream: { index: 1 },
      audioTracks: [
        {
          label: "Français",
          order: 0,
          sourceIndex: 1,
          isDefault: true,
          durationSeconds: 5740.394,
        },
        {
          label: "Canadien",
          order: 1,
          sourceIndex: 2,
          durationSeconds: 5991.466,
        },
      ],
      multiAudioEnabled: true,
    });

    expect(plan.durationSeconds).toBeCloseTo(5991.611, 6);
    expect(plan.audioRenditions[0]).toMatchObject({
      sourceDurationSeconds: 5740.394,
    });
    expect(plan.audioRenditions[0].silencePaddingSeconds).toBeCloseTo(251.217, 6);
    expect(plan.audioRenditions[1].silencePaddingSeconds).toBeCloseTo(0.145, 6);
  });
});

describe("arguments et exécution FFmpeg portables", () => {
  it("résout FFmpeg/FFprobe sur macOS et Windows sans découper les chemins", () => {
    expect(getFfmpegExecutable({
      FFMPEG_PATH: "/Applications/SAMI Tools/ffmpeg",
    })).toBe("/Applications/SAMI Tools/ffmpeg");
    expect(getFfprobeExecutable({
      FFMPEG_PATH: "/Applications/SAMI Tools/ffmpeg",
    })).toBe("/Applications/SAMI Tools/ffprobe");
    expect(getFfprobeExecutable({
      FFMPEG_PATH: "C:\\Program Files\\SAMI Tools\\ffmpeg.exe",
    })).toBe("C:\\Program Files\\SAMI Tools\\ffprobe.exe");
    expect(getFfprobeExecutable({
      FFMPEG_PATH: "C:\\Program Files\\SAMI Tools\\ffmpeg.exe",
      FFPROBE_PATH: "D:\\Media Suite\\probe custom.exe",
    })).toBe("D:\\Media Suite\\probe custom.exe");
  });

  it("construit des argv libx264/AAC avec segments et keyframes alignés à 4 secondes", () => {
    const args = buildVideoProfileArguments({
      videoPath: "/tmp/source avec espace.mkv",
      playlistPath: "/tmp/output/playlist.m3u8",
      segmentPattern: "/tmp/output/segment_%06d.ts",
      profile: { width: 1280, bitrate: 4500 },
      videoStreamIndex: 5,
      audioStreamIndex: 9,
      includeAudio: true,
      audioBitrateKbps: 192,
      segmentDurationSeconds: 4,
      durationSeconds: 120.5,
    });

    expect(args).toContain("/tmp/source avec espace.mkv");
    expect(args.slice(args.indexOf("-c:v"), args.indexOf("-c:v") + 2)).toEqual([
      "-c:v", "libx264",
    ]);
    expect(args.slice(args.indexOf("-c:a"), args.indexOf("-c:a") + 2)).toEqual([
      "-c:a", "aac",
    ]);
    expect(args).toContain("expr:gte(t,n_forced*4)");
    expect(args).toContain("independent_segments");
    expect(args.slice(args.indexOf("-af"), args.indexOf("-af") + 2)).toEqual([
      "-af", "apad",
    ]);
    expect(args.slice(args.indexOf("-t"), args.indexOf("-t") + 2)).toEqual([
      "-t", "120.5",
    ]);
    expect(args.slice(
      args.indexOf("-hls_segment_filename"),
      args.indexOf("-hls_segment_filename") + 2
    )).toEqual(["-hls_segment_filename", "/tmp/output/segment_%06d.ts"]);
    expect(args).not.toContain("-map 0:5");
  });

  it("construit une rendition AAC seule sans encoder de vidéo", () => {
    const args = buildAudioRenditionArguments({
      videoPath: "source.mkv",
      playlistPath: "audio/playlist.m3u8",
      segmentPattern: "audio/segment_%06d.ts",
      sourceIndex: 7,
      audioBitrateKbps: 192,
      segmentDurationSeconds: 4,
      durationSeconds: 5991.611,
    });

    expect(args).toContain("-vn");
    expect(args).toContain("aac");
    expect(args).not.toContain("libx264");
    expect(args.slice(args.indexOf("-af"), args.indexOf("-af") + 2)).toEqual([
      "-af", "apad",
    ]);
    expect(args.slice(args.indexOf("-t"), args.indexOf("-t") + 2)).toEqual([
      "-t", "5991.611",
    ]);
    expect(args.slice(args.indexOf("-map"), args.indexOf("-map") + 2)).toEqual([
      "-map", "0:7",
    ]);
  });

  it("lance FFmpeg avec shell:false et transforme sa progression en pourcentage", async () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    const spawnImpl = vi.fn(() => child);
    const onProgress = vi.fn();

    const execution = runFfmpeg({
      args: ["-version"],
      ffmpegPath: "/opt/ffmpeg avec espace/ffmpeg",
      durationSeconds: 10,
      onProgress,
      spawnImpl,
    });
    child.stdout.write("out_time_us=5000000\nprogress=continue\n");
    child.emit("close", 0, null);
    await execution;

    expect(spawnImpl).toHaveBeenCalledWith(
      "/opt/ffmpeg avec espace/ffmpeg",
      ["-version"],
      expect.objectContaining({ shell: false, windowsHide: true })
    );
    expect(onProgress).toHaveBeenCalledWith(50);
  });

  it("annule proprement le processus FFmpeg via AbortSignal", async () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    const spawnImpl = vi.fn(() => child);
    const controller = new AbortController();

    const execution = runFfmpeg({
      args: ["-i", "source.mkv", "output.m3u8"],
      signal: controller.signal,
      spawnImpl,
    });
    controller.abort();
    child.emit("close", null, "SIGTERM");

    await expect(execution).rejects.toMatchObject({
      name: "AbortError",
      code: "ABORT_ERR",
    });
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});

describe("artefacts HLS unitaires", () => {
  it("encode une seule résolution et valide ses segments avant de la retourner", async () => {
    const outputDir = await createTemporaryRoot();
    const onProgress = vi.fn();
    const runFfmpegImpl = vi.fn(async ({ args, onProgress: report }) => {
      expect(args).toContain("-an");
      await writeFakeHlsOutput(args, { independent: true });
      report(42);
    });

    const result = await encodeSingleVideoProfile({
      videoPath: path.join(outputDir, "source.mkv"),
      outputDir,
      profile: { label: "720p", width: 1280, height: 720, bitrate: 4500 },
      videoStreamIndex: 3,
      audioStreamIndex: 5,
      includeAudio: false,
      durationSeconds: 10,
      onProgress,
      runFfmpegImpl,
    });

    expect(result).toMatchObject({
      resolutionPlaylist: "720p/playlist.m3u8",
      width: 1280,
      height: 720,
      bitrate: 4500,
    });
    expect(result.segmentPaths).toHaveLength(1);
    expect(onProgress).toHaveBeenCalledWith(42);
  });

  it("encode une rendition audio et assemble le master multi-audio historique", async () => {
    const outputDir = await createTemporaryRoot();
    const runVideo = async ({ args }) => writeFakeHlsOutput(args, { independent: true });
    const runAudio = async ({ args }) => writeFakeHlsOutput(args);
    const playlist = await encodeSingleVideoProfile({
      videoPath: "source.mkv",
      outputDir,
      profile: { label: "source", width: 320, height: 240, bitrate: 500 },
      videoStreamIndex: 0,
      audioStreamIndex: 1,
      includeAudio: false,
      runFfmpegImpl: runVideo,
    });
    const tracks = [];
    for (const track of [
      { label: "Français", language: "fr", isDefault: false, order: 0, sourceIndex: 1 },
      { label: "Japonais", language: "ja", isDefault: true, order: 1, sourceIndex: 2 },
    ]) {
      tracks.push(await encodeAudioRendition({
        videoPath: "source.mkv",
        outputDir,
        track,
        durationSeconds: 10,
        runFfmpegImpl: runAudio,
      }));
    }

    const { masterPlaylistPath, masterPlaylist } = await assembleMasterPlaylist({
      outputDir,
      playlists: [playlist],
      audioTracks: tracks,
      multiAudio: true,
    });

    expect(fs.existsSync(masterPlaylistPath)).toBe(true);
    expect(masterPlaylist).toContain('TYPE=AUDIO,GROUP-ID="sami-audio"');
    expect(masterPlaylist).toContain('AUDIO="sami-audio"');
    expect(masterPlaylist.match(/DEFAULT=YES/g)).toHaveLength(1);
  });

  it("refuse une playlist dont un segment sort du dossier", async () => {
    const outputDir = await createTemporaryRoot();
    const playlistPath = path.join(outputDir, "playlist.m3u8");
    await fs.promises.writeFile(
      playlistPath,
      "#EXTM3U\n#EXTINF:4,\n../secret.ts\n#EXT-X-ENDLIST\n"
    );

    await expect(validateHlsMediaPlaylist({ playlistPath })).rejects.toThrow(
      /traversée de chemin/
    );
  });
});
