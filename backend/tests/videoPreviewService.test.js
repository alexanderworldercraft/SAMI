import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ffmpeg: vi.fn(),
  uploadsRoot: `/tmp/sami-video-preview-service-${process.pid}`,
}));

vi.mock("fluent-ffmpeg", () => ({
  default: mocks.ffmpeg,
}));

vi.mock("../services/video/videoPaths.js", () => ({
  UPLOADS_ROOT: mocks.uploadsRoot,
  VIDEO_ROOT: `${mocks.uploadsRoot}/video`,
}));

import {
  generateVideoPreviewFramesFromMaster,
  getExistingPreviewFrames,
} from "../services/video/videoPreviewService.js";

const VIDEO_ID = 42;
const videoDir = path.join(mocks.uploadsRoot, "video", String(VIDEO_ID));
const masterPlaylistPath = path.join(videoDir, "hls", "master.m3u8");

const createPlaylist = () => {
  const mediaDir = path.join(videoDir, "hls", "240p");
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.writeFileSync(masterPlaylistPath, "#EXTM3U\n240p/playlist.m3u8\n");
  fs.writeFileSync(
    path.join(mediaDir, "playlist.m3u8"),
    "#EXTM3U\n#EXTINF:4.0,\nplaylist0.ts\n"
  );
  fs.writeFileSync(path.join(mediaDir, "playlist0.ts"), "fake segment");
};

const createFfmpegCommand = ({ error = null } = {}) => {
  const handlers = {};
  const command = {
    seek: vi.fn(() => command),
    frames: vi.fn(() => command),
    outputOptions: vi.fn(() => command),
    on: vi.fn((event, handler) => {
      handlers[event] = handler;
      return command;
    }),
    save: vi.fn((outputPath) => {
      if (error) {
        handlers.error(error);
      } else {
        fs.writeFileSync(outputPath, "generated preview");
        handlers.end();
      }
      return command;
    }),
  };

  return command;
};

beforeEach(() => {
  fs.rmSync(mocks.uploadsRoot, { recursive: true, force: true });
  mocks.ffmpeg.mockReset();
});

afterEach(() => {
  fs.rmSync(mocks.uploadsRoot, { recursive: true, force: true });
});

describe("videoPreviewService", () => {
  it("ignore un cache dont la numérotation contient des trous", () => {
    const previewDir = path.join(videoDir, "preview");
    fs.mkdirSync(previewDir, { recursive: true });
    fs.writeFileSync(path.join(previewDir, "frame-02.jpg"), "preview");

    expect(getExistingPreviewFrames(VIDEO_ID)).toEqual([]);
  });

  it("effectue le seek après l'ouverture du segment MPEG-TS", async () => {
    createPlaylist();
    const command = createFfmpegCommand();
    mocks.ffmpeg.mockReturnValue(command);

    await expect(generateVideoPreviewFramesFromMaster({
      videoId: VIDEO_ID,
      masterPlaylistPath,
    })).resolves.toEqual([
      `/uploads/video/${VIDEO_ID}/preview/frame-01.jpg`,
    ]);

    expect(command.seek).toHaveBeenCalledWith(0.1);
    expect(command.outputOptions).toHaveBeenCalledWith(["-q:v 4", "-update 1"]);
  });

  it("retente l'extraction sans seek si le premier essai échoue", async () => {
    createPlaylist();
    const firstCommand = createFfmpegCommand({ error: new Error("no frame") });
    const fallbackCommand = createFfmpegCommand();
    mocks.ffmpeg
      .mockReturnValueOnce(firstCommand)
      .mockReturnValueOnce(fallbackCommand);

    await expect(generateVideoPreviewFramesFromMaster({
      videoId: VIDEO_ID,
      masterPlaylistPath,
    })).resolves.toHaveLength(1);

    expect(firstCommand.seek).toHaveBeenCalledWith(0.1);
    expect(fallbackCommand.seek).not.toHaveBeenCalled();
  });
});
