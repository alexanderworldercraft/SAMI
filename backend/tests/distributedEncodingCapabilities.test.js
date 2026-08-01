import { describe, expect, it, vi } from "vitest";

import {
  assertPrimaryEncodingCapabilities,
  collectDistributedEncodingWorkerCapabilities,
} from "../services/distributedEncoding/capabilityService.js";

const config = {
  cacheRoot: "/var/sami cache",
  stagingRoot: "/var/sami staging",
};
const fsModule = {
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    statfs: vi.fn().mockResolvedValue({ bavail: 10n, bsize: 1024n }),
  },
};
const osModule = {
  platform: () => "win32",
  arch: () => "x64",
  hostname: () => "primary-01",
  release: () => "test",
  cpus: () => [{}, {}],
};

describe("capacités réelles du primary d'encodage", () => {
  it("sonde FFmpeg, libx264, AAC et FFprobe avec des chemins contenant des espaces", async () => {
    const ffmpegPath = "C:\\Program Files\\SAMI Tools\\ffmpeg.exe";
    const ffprobePath = "C:\\Program Files\\SAMI Tools\\ffprobe.exe";
    const execFileImpl = vi.fn((executable, args, options, callback) => {
      if (executable === ffprobePath) {
        callback(null, "ffprobe version 7.1 test\n", "");
        return;
      }
      if (args.includes("-encoders")) {
        callback(
          null,
          " V....D libx264 H.264 encoder\n A..... aac AAC encoder\n",
          ""
        );
        return;
      }
      callback(null, "ffmpeg version 7.1 test\n", "");
    });

    const result = await collectDistributedEncodingWorkerCapabilities({
      config,
      execFileImpl,
      fsModule,
      osModule,
      ffmpegPath,
      ffprobePath,
      requireFfprobe: true,
      maxNominalHeight: 360,
    });

    expect(result).toMatchObject({
      ready: true,
      ffmpegAvailable: true,
      ffprobeAvailable: true,
      ffmpegVersion: "ffmpeg version 7.1 test",
      ffprobeVersion: "ffprobe version 7.1 test",
      supportsH264: true,
      supportsAac: true,
      maxNominalHeight: 360,
      capabilities: {
        ffmpeg: { executable: ffmpegPath, available: true },
        ffprobe: { executable: ffprobePath, available: true },
      },
    });
    expect(assertPrimaryEncodingCapabilities(result)).toBe(result);
    expect(execFileImpl).toHaveBeenCalledWith(
      ffmpegPath,
      ["-version"],
      expect.objectContaining({ shell: false, windowsHide: true }),
      expect.any(Function)
    );
    expect(execFileImpl).toHaveBeenCalledWith(
      ffprobePath,
      ["-version"],
      expect.objectContaining({ shell: false, windowsHide: true }),
      expect.any(Function)
    );
  });

  it("refuse le primary si FFprobe est indisponible", async () => {
    const execFileImpl = vi.fn((executable, args, _options, callback) => {
      if (executable === "missing-ffprobe") {
        const error = Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" });
        callback(error, "", "introuvable");
        return;
      }
      if (args.includes("-encoders")) {
        callback(null, " V....D libx264 encoder\n A..... aac encoder\n", "");
        return;
      }
      callback(null, "ffmpeg version 7.1\n", "");
    });
    const result = await collectDistributedEncodingWorkerCapabilities({
      config,
      execFileImpl,
      fsModule,
      osModule,
      ffmpegPath: "ffmpeg",
      ffprobePath: "missing-ffprobe",
      requireFfprobe: true,
    });

    expect(result).toMatchObject({
      ready: false,
      supportsH264: true,
      supportsAac: true,
      ffprobeAvailable: false,
    });
    expect(() => assertPrimaryEncodingCapabilities(result)).toThrow(
      expect.objectContaining({
        code: "DISTRIBUTED_PRIMARY_MEDIA_TOOLS_UNAVAILABLE",
        statusCode: 500,
      })
    );
  });

  it("n'annonce jamais AAC ou libx264 quand la liste réelle des encodeurs ne les contient pas", async () => {
    const execFileImpl = vi.fn((executable, args, _options, callback) => {
      if (executable === "ffprobe") {
        callback(null, "ffprobe version 7.1\n", "");
        return;
      }
      if (args.includes("-encoders")) {
        callback(null, " V..... h264_videotoolbox encoder\n", "");
        return;
      }
      callback(null, "ffmpeg version 7.1\n", "");
    });
    const result = await collectDistributedEncodingWorkerCapabilities({
      config,
      execFileImpl,
      fsModule,
      osModule,
      ffmpegPath: "ffmpeg",
      ffprobePath: "ffprobe",
      requireFfprobe: true,
    });

    expect(result).toMatchObject({
      ready: false,
      supportsH264: false,
      supportsAac: false,
      ffprobeAvailable: true,
      maxNominalHeight: 0,
    });
    expect(() => assertPrimaryEncodingCapabilities(result)).toThrow(/libx264.*AAC/);
  });
});
