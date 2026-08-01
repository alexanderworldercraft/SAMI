import fs from "fs";
import { Readable } from "stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configureVideoTranscodingExecutables,
  createVideoUploadWorkspace,
  readVideoMultipart,
} from "../services/video/videoTranscodingService.js";

let workspace;

afterEach(() => {
  if (workspace?.root) {
    fs.rmSync(workspace.root, { recursive: true, force: true });
  }
  workspace = undefined;
});

describe("videoTranscodingService", () => {
  it("configure explicitement les exécutables FFmpeg et FFprobe avec espaces", () => {
    const fluentFfmpeg = {
      setFfmpegPath: vi.fn(),
      setFfprobePath: vi.fn(),
    };

    expect(configureVideoTranscodingExecutables({
      fluentFfmpeg,
      env: {
        FFMPEG_PATH: "/Applications/SAMI Tools/ffmpeg",
        FFPROBE_PATH: "/Applications/SAMI Tools/ffprobe",
      },
    })).toEqual({
      ffmpegPath: "/Applications/SAMI Tools/ffmpeg",
      ffprobePath: "/Applications/SAMI Tools/ffprobe",
    });
    expect(fluentFfmpeg.setFfmpegPath).toHaveBeenCalledWith(
      "/Applications/SAMI Tools/ffmpeg"
    );
    expect(fluentFfmpeg.setFfprobePath).toHaveBeenCalledWith(
      "/Applications/SAMI Tools/ffprobe"
    );
  });

  it("lit un formulaire multipart et stocke la source dans un espace isolé", async () => {
    workspace = createVideoUploadWorkspace();
    const source = Buffer.from("fake-video");
    const io = { emit: vi.fn() };
    const processingTimer = {
      snapshot: vi.fn(() => ({
        processingStartedAt: "2026-08-01T10:00:00.000Z",
        processingElapsedMs: 12_345,
      })),
    };
    const request = {
      headers: {
        "content-type": "multipart/form-data; boundary=test",
        "content-length": String(source.length),
      },
      parts: async function* parts() {
        yield { type: "field", fieldname: "Titre", value: "Démo" };
        yield { type: "field", fieldname: "genres", value: "[1,2]" };
        yield {
          type: "file",
          filename: "demo.mp4",
          mimetype: "video/mp4",
          file: Readable.from(source),
        };
      },
    };

    const result = await readVideoMultipart({
      request,
      io,
      processingId: "test-upload",
      processingTimer,
      workspace,
    });

    expect(result.data).toMatchObject({
      titre: "Démo",
      genres: "[1,2]",
      videoOriginalName: "demo.mp4",
    });
    expect(fs.readFileSync(result.videoTempPath)).toEqual(source);
    expect(io.emit).toHaveBeenCalledWith(
      "progress",
      expect.objectContaining({
        stage: "upload",
        progress: 100,
        processingStartedAt: "2026-08-01T10:00:00.000Z",
        processingElapsedMs: 12_345,
      })
    );
  });

  it("rejette une requête qui n'est pas multipart", async () => {
    workspace = createVideoUploadWorkspace();

    await expect(readVideoMultipart({
      request: { headers: { "content-type": "application/json" } },
      io: { emit: vi.fn() },
      processingId: "test-upload",
      workspace,
    })).rejects.toThrow(/multipart/);
  });
});
