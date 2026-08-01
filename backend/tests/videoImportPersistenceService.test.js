import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ETAT } from "../constants.js";
import { VIDEO_TRANSFER_BLOCK_MARKER } from "../services/videoTransferConfig.js";
import {
  reserveImportedVideoForEncodingJob,
} from "../services/video/videoImportPersistenceService.js";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    fs.promises.rm(root, { recursive: true, force: true })
  ));
});

const createDatabase = ({ linkCount = 1 } = {}) => {
  const transaction = {
    video: {
      create: vi.fn(async () => ({ VideoID: 42 })),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    videoEncodingJob: {
      updateMany: vi.fn(async () => ({ count: linkCount })),
    },
  };
  return {
    transaction,
    database: {
      $transaction: vi.fn((callback) => callback(transaction)),
    },
  };
};

describe("réservation atomique d'une vidéo d'encodage distribué", () => {
  it("crée et rattache la vidéo dans la même transaction avant le marqueur", async () => {
    const videoRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "sami-video-reservation-")
    );
    temporaryRoots.push(videoRoot);
    const { database, transaction } = createDatabase();

    await expect(reserveImportedVideoForEncodingJob({
      data: { titre: "Film", resumer: "Résumé", SaisonID: null },
      adminUserId: 7,
      jobId: "11111111-1111-4111-8111-111111111111",
      database,
      videoRoot,
    })).resolves.toEqual({ VideoID: 42 });

    expect(database.$transaction).toHaveBeenCalledTimes(1);
    expect(transaction.videoEncodingJob.updateMany).toHaveBeenCalledWith({
      where: {
        VideoEncodingJobID: "11111111-1111-4111-8111-111111111111",
        Status: "PLANNING",
        VideoID: null,
      },
      data: { VideoID: 42 },
    });
    expect(fs.existsSync(
      path.join(videoRoot, "42", VIDEO_TRANSFER_BLOCK_MARKER)
    )).toBe(true);
  });

  it("annule la réservation si le marqueur privé ne peut pas être créé", async () => {
    const videoRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "sami-video-reservation-")
    );
    temporaryRoots.push(videoRoot);
    const videoDir = path.join(videoRoot, "42");
    await fs.promises.mkdir(videoDir);
    await fs.promises.writeFile(
      path.join(videoDir, VIDEO_TRANSFER_BLOCK_MARKER),
      "collision"
    );
    const { database, transaction } = createDatabase();

    await expect(reserveImportedVideoForEncodingJob({
      data: { titre: "Film", SaisonID: null },
      adminUserId: 7,
      jobId: "11111111-1111-4111-8111-111111111111",
      database,
      videoRoot,
    })).rejects.toMatchObject({ code: "EEXIST" });

    expect(database.$transaction).toHaveBeenCalledTimes(2);
    expect(transaction.videoEncodingJob.updateMany).toHaveBeenLastCalledWith({
      where: {
        VideoEncodingJobID: "11111111-1111-4111-8111-111111111111",
        VideoID: 42,
        Status: "PLANNING",
      },
      data: { VideoID: null },
    });
    expect(transaction.video.deleteMany).toHaveBeenCalledWith({
      where: { VideoID: 42, EtatID: ETAT.BLOCKED },
    });
    expect(fs.existsSync(videoDir)).toBe(false);
  });
});
