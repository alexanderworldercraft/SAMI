import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createLog: vi.fn(),
  findActions: vi.fn(),
  findJobs: vi.fn(),
  findLogs: vi.fn(),
  findVideos: vi.fn(),
}));

vi.mock("../controllers/logController.js", () => ({
  createLog: mocks.createLog,
}));

vi.mock("../services/db.js", () => ({
  prisma: {
    action: { findMany: mocks.findActions },
    log: { findMany: mocks.findLogs },
    video: { findMany: mocks.findVideos },
    videoEncodingJob: { findMany: mocks.findJobs },
  },
}));

import {
  getExpectedDistributedEncodingJobActions,
  reconcileDistributedEncodingLogs,
} from "../services/distributedEncoding/logReconciliation.js";

describe("distributedEncodingLogReconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findActions.mockResolvedValue([
      { ActionID: 1, Nom: "distributed_encoding_job_started" },
      { ActionID: 2, Nom: "distributed_encoding_job_completed" },
      { ActionID: 3, Nom: "distributed_encoding_job_failed" },
      { ActionID: 4, Nom: "distributed_encoding_job_cancelled" },
    ]);
    mocks.findLogs.mockResolvedValue([]);
    mocks.findVideos.mockImplementation(async ({ where }) => (
      where.VideoID.in.map((VideoID) => ({ VideoID }))
    ));
    mocks.createLog.mockResolvedValue({ ok: true, deduped: false });
  });

  it("déduit les jalons attendus depuis le statut persistant", () => {
    expect(getExpectedDistributedEncodingJobActions({ Status: "RUNNING" }))
      .toEqual(["distributed_encoding_job_started"]);
    expect(getExpectedDistributedEncodingJobActions({ Status: "COMPLETED" }))
      .toEqual([
        "distributed_encoding_job_started",
        "distributed_encoding_job_completed",
      ]);
    expect(getExpectedDistributedEncodingJobActions({ Status: "CANCELLED" }))
      .toEqual([
        "distributed_encoding_job_started",
        "distributed_encoding_job_cancelled",
      ]);
  });

  it("recrée les logs absents sans dupliquer un jalon existant", async () => {
    mocks.findJobs.mockResolvedValue([
      {
        VideoEncodingJobID: "job-running",
        VideoID: 41,
        InitiatedByUserID: 7,
        Status: "RUNNING",
        SourceOriginalName: "running.mkv",
        ErrorMessage: null,
      },
      {
        VideoEncodingJobID: "job-completed",
        VideoID: 42,
        InitiatedByUserID: 7,
        Status: "COMPLETED",
        SourceOriginalName: "completed.mkv",
        ErrorMessage: null,
      },
    ]);
    mocks.findLogs.mockResolvedValue([
      {
        UtilisateurID: 7,
        ActionID: 1,
        NouvelleValeur: "job-running",
      },
    ]);

    const result = await reconcileDistributedEncodingLogs();

    expect(result).toEqual({
      jobs: 2,
      created: 2,
      existing: 1,
      failed: 0,
      skipped: 0,
    });
    expect(mocks.createLog).toHaveBeenCalledTimes(2);
    expect(mocks.createLog).toHaveBeenCalledWith(expect.objectContaining({
      ActionNom: "distributed_encoding_job_completed",
      Champ: "distributed_encoding_job",
      NouvelleValeur: "job-completed",
      VideoID: 42,
    }));
  });

  it("ignore proprement les anciens jobs sans initiateur", async () => {
    mocks.findJobs.mockResolvedValue([{
      VideoEncodingJobID: "job-system",
      VideoID: null,
      InitiatedByUserID: null,
      Status: "FAILED",
      SourceOriginalName: "source.mkv",
      ErrorMessage: "erreur",
    }]);

    await expect(reconcileDistributedEncodingLogs()).resolves.toMatchObject({
      created: 0,
      skipped: 2,
    });
    expect(mocks.createLog).not.toHaveBeenCalled();
  });

  it("conserve dans Meta la vidéo supprimée sans violer la clé étrangère du log", async () => {
    mocks.findJobs.mockResolvedValue([{
      VideoEncodingJobID: "job-cancelled",
      VideoID: 404,
      InitiatedByUserID: 7,
      Status: "CANCELLED",
      SourceOriginalName: "cancelled.mkv",
      ErrorMessage: null,
    }]);
    mocks.findVideos.mockResolvedValue([]);

    await expect(reconcileDistributedEncodingLogs()).resolves.toMatchObject({
      created: 2,
      failed: 0,
    });
    expect(mocks.createLog).toHaveBeenCalledTimes(2);
    expect(mocks.createLog).toHaveBeenCalledWith(expect.objectContaining({
      VideoID: null,
      Meta: expect.objectContaining({
        jobId: "job-cancelled",
        deletedVideoId: 404,
      }),
    }));
  });
});
