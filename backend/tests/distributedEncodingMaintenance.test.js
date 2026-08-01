import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cleanupOrphanDistributedEncodingWorkspaces,
  INCOMPLETE_ENCODING_CLEANUP_STEP,
  INCOMPLETE_ENCODING_EXPIRED_STEP,
  isIncompleteEncodingJobStatus,
  recoverIncompleteDistributedEncodingJobs,
} from "../services/distributedEncoding/maintenanceService.js";

const NOW = new Date("2026-07-31T12:00:00.000Z");
const OLD = new Date(NOW.getTime() - 25 * 60 * 60 * 1000);
const temporaryRoots = [];

const makeJob = (overrides = {}) => ({
  VideoEncodingJobID: "11111111-1111-4111-8111-111111111111",
  VideoID: null,
  Status: "INGESTING",
  CurrentStep: "ingest",
  SourceRelativePath: "11111111-1111-4111-8111-111111111111/source/source.mp4",
  StartedAt: null,
  UpdatedAt: OLD,
  Tasks: [],
  ...overrides,
});

const createDatabase = (jobs, updateMany = vi.fn(async () => ({ count: 1 }))) => ({
  videoEncodingJob: {
    findMany: vi.fn(async () => jobs),
    updateMany,
  },
});

const setTreeMtime = async (target, date) => {
  const stats = await fs.promises.lstat(target);
  if (stats.isDirectory() && !stats.isSymbolicLink()) {
    const entries = await fs.promises.readdir(target);
    for (const entry of entries) {
      await setTreeMtime(path.join(target, entry), date);
    }
  }
  await fs.promises.utimes(target, date, date);
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryRoots.splice(0).map((root) =>
    fs.promises.rm(root, { recursive: true, force: true })
  ));
});

describe("maintenance des jobs d'encodage distribués incomplets", () => {
  it("replace en file une planification entièrement matérialisée et encore privée", async () => {
    const job = makeJob({
      Status: "PLANNING",
      CurrentStep: "planning",
      VideoID: 42,
      Tasks: [{ VideoEncodingTaskID: "task-1", Status: "PENDING" }],
    });
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const cleanupReservedVideo = vi.fn();
    const cleanupJobFiles = vi.fn();
    const database = createDatabase([job], updateMany);

    const result = await recoverIncompleteDistributedEncodingJobs({
      now: NOW,
      database,
      planningTimeoutMs: 30 * 60 * 1000,
      sourceExists: () => true,
      getReservationState: async () => ({ active: false, ready: true }),
      cleanupReservedVideo,
      cleanupJobFiles,
    });

    expect(result).toMatchObject({ queued: 1, expired: 0, failed: 0 });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        VideoEncodingJobID: job.VideoEncodingJobID,
        Status: "PLANNING",
      }),
      data: expect.objectContaining({
        Status: "QUEUED",
        CurrentStep: "queued",
      }),
    }));
    expect(cleanupReservedVideo).not.toHaveBeenCalled();
    expect(cleanupJobFiles).not.toHaveBeenCalled();
  });

  it("marque avant nettoyage une ingestion expirée puis termine l'état durable", async () => {
    const job = makeJob({ VideoID: 42 });
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const cleanupReservedVideo = vi.fn();
    const cleanupJobFiles = vi.fn();
    const database = createDatabase([job], updateMany);

    const result = await recoverIncompleteDistributedEncodingJobs({
      now: NOW,
      database,
      ingestingTimeoutMs: 24 * 60 * 60 * 1000,
      getReservationState: async () => ({ active: false, ready: false }),
      cleanupReservedVideo,
      cleanupJobFiles,
    });

    expect(result).toMatchObject({ queued: 0, expired: 1, cleanupPending: 0 });
    expect(updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        Status: "FAILED",
        CurrentStep: INCOMPLETE_ENCODING_CLEANUP_STEP,
      }),
    }));
    expect(cleanupReservedVideo).toHaveBeenCalledWith(42);
    expect(cleanupJobFiles).toHaveBeenCalledWith(job.VideoEncodingJobID);
    expect(updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({
        Status: "FAILED",
        CurrentStep: INCOMPLETE_ENCODING_CLEANUP_STEP,
      }),
      data: expect.objectContaining({
        VideoID: null,
        CurrentStep: INCOMPLETE_ENCODING_EXPIRED_STEP,
      }),
    }));
  });

  it("reprend au passage suivant un nettoyage interrompu sans reclamer le job", async () => {
    const job = makeJob({ VideoID: 42 });
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const database = createDatabase([job], updateMany);
    const cleanupReservedVideo = vi.fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(undefined);
    const cleanupJobFiles = vi.fn();
    const logger = { error: vi.fn() };

    const first = await recoverIncompleteDistributedEncodingJobs({
      now: NOW,
      database,
      getReservationState: async () => ({ active: false, ready: false }),
      cleanupReservedVideo,
      cleanupJobFiles,
      logger,
    });
    expect(first).toMatchObject({ expired: 0, cleanupPending: 1, failed: 1 });
    expect(updateMany).toHaveBeenCalledTimes(1);

    job.Status = "FAILED";
    job.CurrentStep = INCOMPLETE_ENCODING_CLEANUP_STEP;
    const second = await recoverIncompleteDistributedEncodingJobs({
      now: new Date(NOW.getTime() + 1_000),
      database,
      getReservationState: async () => ({ active: false, ready: false }),
      cleanupReservedVideo,
      cleanupJobFiles,
      logger,
    });

    expect(second).toMatchObject({ expired: 1, cleanupPending: 0, failed: 0 });
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany.mock.calls[1][0].data).toMatchObject({
      VideoID: null,
      CurrentStep: INCOMPLETE_ENCODING_EXPIRED_STEP,
    });
  });

  it("identifie INGESTING et PLANNING comme non avançables", () => {
    expect(isIncompleteEncodingJobStatus("INGESTING")).toBe(true);
    expect(isIncompleteEncodingJobStatus("PLANNING")).toBe(true);
    expect(isIncompleteEncodingJobStatus("QUEUED")).toBe(false);
  });
});

describe("nettoyage des workspaces distribués sans job", () => {
  it("supprime après 24 h uniquement les UUID orphelins sans activité récente", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "sami-encoding-maintenance-")
    );
    temporaryRoots.push(root);
    const sourceRoot = path.join(root, "sources");
    const stagingRoot = path.join(root, "staging");
    const orphanId = "11111111-1111-4111-8111-111111111111";
    const recentId = "22222222-2222-4222-8222-222222222222";
    const trackedId = "33333333-3333-4333-8333-333333333333";
    const invalidId = "not-a-job";

    const orphanSource = path.join(sourceRoot, orphanId, "source");
    const orphanStaging = path.join(stagingRoot, orphanId, "attempts");
    const recentSource = path.join(sourceRoot, recentId, "source");
    const trackedSource = path.join(sourceRoot, trackedId, "source");
    const invalidSource = path.join(sourceRoot, invalidId);
    await Promise.all([
      orphanSource,
      orphanStaging,
      recentSource,
      trackedSource,
      invalidSource,
    ].map((directory) => fs.promises.mkdir(directory, { recursive: true })));
    await Promise.all([
      fs.promises.writeFile(path.join(orphanSource, "source.mp4.part"), "old"),
      fs.promises.writeFile(path.join(orphanStaging, "segment.ts"), "old"),
      fs.promises.writeFile(path.join(recentSource, "source.mp4.part"), "active"),
      fs.promises.writeFile(path.join(trackedSource, "source.mp4"), "tracked"),
      fs.promises.writeFile(path.join(invalidSource, "keep.txt"), "invalid"),
    ]);
    await Promise.all([
      setTreeMtime(path.join(sourceRoot, orphanId), OLD),
      setTreeMtime(path.join(stagingRoot, orphanId), OLD),
      setTreeMtime(path.join(sourceRoot, recentId), OLD),
      setTreeMtime(path.join(sourceRoot, trackedId), OLD),
      setTreeMtime(invalidSource, OLD),
    ]);
    await fs.promises.utimes(
      path.join(recentSource, "source.mp4.part"),
      NOW,
      NOW
    );

    const database = {
      videoEncodingJob: {
        findMany: vi.fn(async () => [{ VideoEncodingJobID: trackedId }]),
        findUnique: vi.fn(async () => null),
      },
    };
    const result = await cleanupOrphanDistributedEncodingWorkspaces({
      now: NOW,
      database,
      roots: [sourceRoot, stagingRoot],
      ttlMs: 24 * 60 * 60 * 1000,
    });

    expect(result).toEqual({
      scanned: 3,
      removed: 1,
      recent: 1,
      tracked: 1,
      failed: 0,
    });
    expect(fs.existsSync(path.join(sourceRoot, orphanId))).toBe(false);
    expect(fs.existsSync(path.join(stagingRoot, orphanId))).toBe(false);
    expect(fs.existsSync(path.join(sourceRoot, recentId))).toBe(true);
    expect(fs.existsSync(path.join(sourceRoot, trackedId))).toBe(true);
    expect(fs.existsSync(invalidSource)).toBe(true);
  });
});
