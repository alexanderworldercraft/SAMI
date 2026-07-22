import fs from "fs";
import { Readable } from "stream";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
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
  it("lit un formulaire multipart et stocke la source dans un espace isolé", async () => {
    workspace = createVideoUploadWorkspace();
    const source = Buffer.from("fake-video");
    const io = { emit: vi.fn() };
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
      expect.objectContaining({ stage: "upload", progress: 100 })
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
