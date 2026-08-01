import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { PassThrough } from "stream";

import { afterEach, describe, expect, it, vi } from "vitest";

const sourceMocks = vi.hoisted(() => ({
  getDistributedJobPaths: vi.fn(),
}));

vi.mock("../services/distributedEncoding/sourceService.js", () => ({
  getDistributedJobPaths: sourceMocks.getDistributedJobPaths,
}));

import { receiveEncodingArtifact } from "../services/distributedEncoding/artifactService.js";

const JOB_ID = "550e8400-e29b-41d4-a716-446655440000";
const TASK_ID = "550e8400-e29b-41d4-a716-446655440001";
const ATTEMPT_ID = "550e8400-e29b-41d4-a716-446655440002";
const FILE_ID = "550e8400-e29b-41d4-a716-446655440003";
const WORKER_ID = "Sami-clone-test";
const LEASE_TOKEN = "lease-token-with-more-than-thirty-two-characters";
const temporaryRoots = [];

const sha256 = (value) => crypto
  .createHash("sha256")
  .update(value)
  .digest("hex");

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

const createTemporaryRoot = async () => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "sami-artifact-receive-")
  );
  temporaryRoots.push(root);
  return root;
};

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.promises.rm(root, { recursive: true, force: true })
    )
  );
});

describe("réception d'un artefact d'encodage distribué", () => {
  it("n'abandonne pas une petite playlist reçue pendant l'attente Prisma", async () => {
    const root = await createTemporaryRoot();
    const attemptsRoot = path.join(root, "attempts");
    sourceMocks.getDistributedJobPaths.mockReturnValue({
      attemptsRoot,
      acceptedRoot: path.join(root, "accepted"),
    });

    const playlist = Buffer.from(
      "#EXTM3U\n#EXT-X-VERSION:6\n#EXTINF:4.000000,\n"
      + "segment_000000.ts\n#EXT-X-ENDLIST\n",
      "utf8"
    );
    const relativePath = "hls/720p/playlist.m3u8";
    const artifact = {
      VideoEncodingArtifactFileID: FILE_ID,
      RelativePath: relativePath,
      Size: BigInt(playlist.length),
      Sha256: sha256(playlist),
      Status: "PENDING",
    };
    const task = {
      VideoEncodingTaskID: TASK_ID,
      VideoEncodingJobID: JOB_ID,
      Status: "LEASED",
      AssignedWorkerID: WORKER_ID,
      LeaseGeneration: 1,
      LeaseExpiresAt: new Date(Date.now() + 60_000),
      LeaseTokenHash: sha256(LEASE_TOKEN),
      Job: {},
      Attempts: [{
        VideoEncodingTaskAttemptID: ATTEMPT_ID,
        Files: [artifact],
      }],
    };

    let markUploadStarted;
    let releaseMarkUpload;
    const uploadStarted = new Promise((resolve) => {
      markUploadStarted = resolve;
    });
    const uploadCanContinue = new Promise((resolve) => {
      releaseMarkUpload = resolve;
    });
    const database = {
      videoEncodingTask: {
        findUnique: vi.fn().mockResolvedValue(task),
      },
      videoEncodingArtifactFile: {
        update: vi.fn(async ({ data }) => {
          if (data.Status === "UPLOADING") {
            markUploadStarted();
            await uploadCanContinue;
          }
          return artifact;
        }),
      },
    };
    const stream = new PassThrough();

    const reception = receiveEncodingArtifact({
      taskId: TASK_ID,
      fileId: FILE_ID,
      workerId: WORKER_ID,
      leaseToken: LEASE_TOKEN,
      leaseGeneration: 1,
      stream,
      declaredBodySha256: artifact.Sha256,
      declaredContentLength: playlist.length,
      database,
    });

    // Reproduit un PUT Fastify dont tout le petit corps arrive pendant que le
    // serveur attend l'UPDATE Prisma qui précède l'ouverture du fichier.
    await uploadStarted;
    stream.end(playlist);
    await nextTurn();
    releaseMarkUpload();

    await expect(reception).resolves.toMatchObject({ verified: true });
    const destination = path.join(
      attemptsRoot,
      ATTEMPT_ID,
      "hls",
      "720p",
      "playlist.m3u8"
    );
    await expect(fs.promises.readFile(destination)).resolves.toEqual(playlist);
  });

  it("sérialise deux PUT rejoués et déduplique le second sans altérer la destination", async () => {
    const root = await createTemporaryRoot();
    const attemptsRoot = path.join(root, "attempts");
    sourceMocks.getDistributedJobPaths.mockReturnValue({
      attemptsRoot,
      acceptedRoot: path.join(root, "accepted"),
    });

    const playlist = Buffer.from(
      "#EXTM3U\n#EXT-X-VERSION:6\n#EXTINF:4.000000,\n"
      + "segment_000000.ts\n#EXT-X-ENDLIST\n",
      "utf8"
    );
    const artifact = {
      VideoEncodingArtifactFileID: FILE_ID,
      RelativePath: "hls/720p/playlist.m3u8",
      Size: BigInt(playlist.length),
      Sha256: sha256(playlist),
      Status: "PENDING",
      BytesReceived: 0n,
    };
    const task = {
      VideoEncodingTaskID: TASK_ID,
      VideoEncodingJobID: JOB_ID,
      Status: "LEASED",
      AssignedWorkerID: WORKER_ID,
      LeaseGeneration: 1,
      LeaseExpiresAt: new Date(Date.now() + 60_000),
      LeaseTokenHash: sha256(LEASE_TOKEN),
      Job: {},
      Attempts: [{
        VideoEncodingTaskAttemptID: ATTEMPT_ID,
        Files: [artifact],
      }],
    };
    let markFirstUploadStarted;
    const firstUploadStarted = new Promise((resolve) => {
      markFirstUploadStarted = resolve;
    });
    const database = {
      videoEncodingTask: {
        findUnique: vi.fn().mockImplementation(async () => task),
      },
      videoEncodingArtifactFile: {
        update: vi.fn(async ({ data }) => {
          Object.assign(artifact, {
            ...(data.Status === undefined ? {} : { Status: data.Status }),
            ...(data.BytesReceived === undefined
              ? {}
              : { BytesReceived: BigInt(data.BytesReceived) }),
          });
          if (data.Status === "UPLOADING") markFirstUploadStarted();
          return artifact;
        }),
      },
    };
    const request = {
      taskId: TASK_ID,
      fileId: FILE_ID,
      workerId: WORKER_ID,
      leaseToken: LEASE_TOKEN,
      leaseGeneration: 1,
      declaredBodySha256: artifact.Sha256,
      declaredContentLength: playlist.length,
      database,
    };

    const firstStream = new PassThrough();
    const firstReception = receiveEncodingArtifact({
      ...request,
      stream: firstStream,
    });
    await firstUploadStarted;
    await nextTurn();

    const replayStream = new PassThrough();
    replayStream.end(playlist);
    let replaySettled = false;
    const replayReception = receiveEncodingArtifact({
      ...request,
      stream: replayStream,
    }).finally(() => {
      replaySettled = true;
    });
    await nextTurn();
    expect(replaySettled).toBe(false);

    firstStream.end(playlist);
    const [firstResult, replayResult] = await Promise.all([
      firstReception,
      replayReception,
    ]);

    expect(firstResult).toMatchObject({ verified: true });
    expect(firstResult).not.toHaveProperty("deduped");
    expect(replayResult).toMatchObject({ verified: true, deduped: true });
    expect(artifact).toMatchObject({
      Status: "VERIFIED",
      BytesReceived: BigInt(playlist.length),
    });
    const destination = path.join(
      attemptsRoot,
      ATTEMPT_ID,
      "hls",
      "720p",
      "playlist.m3u8"
    );
    await expect(fs.promises.readFile(destination)).resolves.toEqual(playlist);
  });
});
