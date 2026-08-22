import { describe, expect, it, vi } from "vitest";

import { claimNextAiSubtitleJob } from "../services/aiSubtitles/jobService.js";

const config = {
  pipelineVersion: "sami-ai-subtitles-v1",
  leaseDurationMs: 120_000,
  leaseRenewIntervalMs: 30_000,
};

const onlineWorker = (id, score) => ({
  AiSubtitleWorkerID: id,
  Ready: true,
  PipelineVersion: config.pipelineVersion,
  PerformanceScore: score,
  LastHeartbeatAt: new Date("2026-08-22T08:00:00.000Z"),
  Registry: { Enabled: true, Draining: false },
});

const createDatabase = ({ workers, queuedJobs = [], encodingBusy = 0 }) => {
  let findManyCall = 0;
  const database = {
    aiSubtitleWorker: { findMany: vi.fn(async () => workers) },
    videoEncodingTask: { count: vi.fn(async () => encodingBusy) },
    aiSubtitleJob: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async (args) => {
        findManyCall += 1;
        if (args.where?.Status === "QUEUED") return queuedJobs;
        return [];
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => ({
        ...queuedJobs[0],
        Status: "LEASED",
        AssignedWorkerID: workers[0]?.AiSubtitleWorkerID,
        AttemptCount: 1,
        LeaseGeneration: 1,
      })),
    },
  };
  database.$transaction = vi.fn(async (callback) => callback(database));
  return { database, findManyCall: () => findManyCall };
};

describe("ordonnanceur des sous-titres IA", () => {
  it("réserve la première tâche au worker libre le plus performant", async () => {
    const { database } = createDatabase({
      workers: [onlineWorker("rtx-3090", 100), onlineWorker("rtx-3070", 80)],
    });
    const claim = await claimNextAiSubtitleJob({
      workerId: "rtx-3070",
      now: new Date("2026-08-22T08:00:10.000Z"),
      database,
      config,
    });
    expect(claim).toBeNull();
    expect(database.aiSubtitleJob.updateMany).not.toHaveBeenCalled();
  });

  it("attribue une vidéo entière avec un bail au meilleur worker", async () => {
    const queued = {
      AiSubtitleJobID: "019c0000-0000-7000-8000-000000000001",
      VideoID: 42,
      TargetLanguage: "fr",
      Status: "QUEUED",
      LeaseGeneration: 0,
      AttemptCount: 0,
      StartedAt: null,
      Video: {
        AiTranscript: {
          SourceLanguage: "en",
          Segments: [{ start: 0, end: 1, text: "Hello" }],
        },
      },
    };
    const { database } = createDatabase({
      workers: [onlineWorker("rtx-3090", 100)],
      queuedJobs: [queued],
    });
    const claim = await claimNextAiSubtitleJob({
      workerId: "rtx-3090",
      now: new Date("2026-08-22T08:00:10.000Z"),
      database,
      config,
    });
    expect(claim.leaseToken).toHaveLength(43);
    expect(claim.leaseGeneration).toBe(1);
    expect(database.aiSubtitleJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ AssignedWorkerID: "rtx-3090", Status: "LEASED" }),
    }));
  });

  it("attend le meilleur worker lorsqu'il termine un encodage vidéo", async () => {
    const { database } = createDatabase({
      workers: [onlineWorker("rtx-3090", 100), onlineWorker("rtx-3070", 80)],
      encodingBusy: 1,
    });
    const claim = await claimNextAiSubtitleJob({
      workerId: "rtx-3090",
      now: new Date("2026-08-22T08:00:10.000Z"),
      database,
      config,
    });
    expect(claim).toBeNull();
    expect(database.videoEncodingTask.count).toHaveBeenCalled();
    expect(database.aiSubtitleJob.updateMany).not.toHaveBeenCalled();
  });

  it("bascule vers le worker suivant lorsque le meilleur est hors ligne", async () => {
    const queued = {
      AiSubtitleJobID: "019c0000-0000-7000-8000-000000000002",
      VideoID: 43,
      TargetLanguage: "fr",
      Status: "QUEUED",
      LeaseGeneration: 0,
      AttemptCount: 0,
      StartedAt: null,
      Video: { AiTranscript: { SourceLanguage: "en", Segments: [] } },
    };
    const offlineBest = {
      ...onlineWorker("rtx-3090", 100),
      LastHeartbeatAt: new Date("2026-08-22T07:00:00.000Z"),
    };
    const { database } = createDatabase({
      workers: [offlineBest, onlineWorker("rtx-3070", 80)],
      queuedJobs: [queued],
    });
    database.aiSubtitleJob.findUnique.mockResolvedValue({
      ...queued,
      Status: "LEASED",
      AssignedWorkerID: "rtx-3070",
      AttemptCount: 1,
      LeaseGeneration: 1,
    });
    const claim = await claimNextAiSubtitleJob({
      workerId: "rtx-3070",
      now: new Date("2026-08-22T08:00:10.000Z"),
      database,
      config,
    });
    expect(claim.job.AssignedWorkerID).toBe("rtx-3070");
  });
});
