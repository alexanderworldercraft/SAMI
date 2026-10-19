import crypto from "crypto";

import { describe, expect, it, vi } from "vitest";

import {
  claimNextAiSubtitleJob,
  failAiSubtitleLease,
  approveAiSubtitlePrimary,
  getAiSubtitleWorkers,
} from "../services/aiSubtitles/jobService.js";

const config = {
  pipelineVersion: "sami-ai-subtitles-v2-contextual-quality-r3-word-timing",
  leaseDurationMs: 120_000,
  leaseRenewIntervalMs: 30_000,
};

const onlineWorker = (id, score, role = "CLONE") => ({
  Role: role,
  AiSubtitleWorkerID: id,
  Ready: true,
  PipelineVersion: config.pipelineVersion,
  PerformanceScore: score,
  LastHeartbeatAt: new Date("2026-08-22T08:00:00.000Z"),
  Registry: { VideoEncodingWorkerID: id, Role: role, Enabled: true, Draining: false,
    ProtocolVersion: 1, PipelineVersion: "sami-hls-libx264-aac-v1", MaxNominalHeight: 2160,
    SupportsH264: true, SupportsAac: true, LastHeartbeatAt: new Date("2026-08-22T08:00:00.000Z") },
});

const createDatabase = ({ workers, queuedJobs = [], encodingBusy = 0, encodingTasks = [] }) => {
  let findManyCall = 0;
  const database = {
    voiceAudio: { count: vi.fn(async () => 0) },
    aiDubbingJob: { count: vi.fn(async () => 0) },
    aiSubtitleWorker: { findMany: vi.fn(async () => workers) },
    videoEncodingWorker: { findMany: vi.fn(async () => workers.map((worker) => worker.Registry)) },
    videoEncodingTask: { count: vi.fn(async () => encodingBusy), findMany: vi.fn(async () => encodingTasks) },
    aiSubtitleJob: {
      count: vi.fn(async () => 0),
      findMany: vi.fn(async (args) => {
        findManyCall += 1;
        if (args.where?.Status === "QUEUED") return queuedJobs.filter((job) =>
          !args.where.PrimaryApprovedAt || job.PrimaryApprovedAt != null);
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

const now = new Date("2026-08-22T08:00:10.000Z");
const queuedJob = (approved = false) => ({
  AiSubtitleJobID: "job-approval", VideoID: 42, TargetLanguage: "fr", Status: "QUEUED",
  LeaseGeneration: 0, PrimaryApprovedAt: approved ? now : null,
  Video: { AiTranscript: { PipelineVersion: config.pipelineVersion } },
});
const pendingEncoding = (height = 1080) => ({
  VideoEncodingTaskID: "encoding-pending", Kind: "VIDEO_PROFILE", NominalHeight: height,
  Status: "PENDING", AttemptCount: 0, MaxAttempts: 3, CreatedAt: now,
  Job: { Status: "QUEUED", PipelineVersion: "sami-hls-libx264-aac-v1", CancelRequested: false },
});

describe("priorité des clones et autorisation du primary", () => {
  it("laisse un autre clone travailler lorsqu’Aero a déjà un sous-titre et l’indique disponible", async () => {
    const { database } = createDatabase({ workers: [onlineWorker("aero", 100), onlineWorker("mac", 60)], queuedJobs: [queuedJob()] });
    database.aiSubtitleJob.count.mockImplementation(async ({ where }) => {
      expect(where.AssignedWorkerID).toBeDefined();
      return where.AssignedWorkerID === "aero" ? 1 : 0;
    });
    expect(await claimNextAiSubtitleJob({ workerId: "mac", database, config, now })).not.toBeNull();
    const workers = await getAiSubtitleWorkers({ database, config, now });
    expect(workers.find((worker) => worker.id === "aero")).toMatchObject({ available: false, activeJobs: 1 });
    expect(workers.find((worker) => worker.id === "mac")).toMatchObject({ available: true });
  });

  it("attribue deux sous-titres distincts à deux clones sans doubler le travail d’un clone", async () => {
    const workers = [onlineWorker("aero", 100), onlineWorker("pc-fixe", 80)];
    const jobs = [
      { ...queuedJob(), AiSubtitleJobID: "job-a", VideoID: 42 },
      { ...queuedJob(), AiSubtitleJobID: "job-b", VideoID: 43 },
    ];
    const { database } = createDatabase({ workers });
    database.aiSubtitleJob.findMany.mockImplementation(async ({ where }) => jobs.filter((job) => job.Status === where.Status && job.Status !== "LEASED"));
    database.aiSubtitleJob.count.mockImplementation(async ({ where }) => {
      expect(where.AssignedWorkerID).toBeDefined();
      return jobs.filter((job) => job.Status === "LEASED" && job.AssignedWorkerID === where.AssignedWorkerID).length;
    });
    database.aiSubtitleJob.updateMany.mockImplementation(async ({ where, data }) => {
      const job = jobs.find((job) => job.AiSubtitleJobID === where.AiSubtitleJobID && job.Status === where.Status && job.LeaseGeneration === where.LeaseGeneration);
      if (!job) return { count: 0 };
      Object.assign(job, data);
      return { count: 1 };
    });
    database.aiSubtitleJob.findUnique.mockImplementation(async ({ where }) => jobs.find((job) => job.AiSubtitleJobID === where.AiSubtitleJobID));
    const first = await claimNextAiSubtitleJob({ workerId: "aero", database, config, now });
    const second = await claimNextAiSubtitleJob({ workerId: "pc-fixe", database, config, now });
    expect(first.job.AiSubtitleJobID).toBe("job-a");
    expect(second.job.AiSubtitleJobID).toBe("job-b");
    expect(await claimNextAiSubtitleJob({ workerId: "aero", database, config, now })).toBeNull();
    expect(jobs.map((job) => job.AssignedWorkerID)).toEqual(["aero", "pc-fixe"]);
  });

  it("ne choisit pas un clone qui réalise déjà un doublage", async () => {
    const { database } = createDatabase({ workers: [onlineWorker("aero", 100)], queuedJobs: [queuedJob()] });
    database.aiDubbingJob.count.mockResolvedValue(1);
    expect(await claimNextAiSubtitleJob({ workerId: "aero", database, config, now })).toBeNull();
  });
  it("exclut le primary, même autorisé et plus rapide, lorsqu’un clone compatible est connecté", async () => {
    const { database } = createDatabase({ workers: [onlineWorker("primary", 1000, "PRIMARY"), onlineWorker("clone", 1)], queuedJobs: [queuedJob(true)] });
    expect(await claimNextAiSubtitleJob({ workerId: "primary", database, config, now })).toBeNull();
    expect(await claimNextAiSubtitleJob({ workerId: "clone", database, config, now })).not.toBeNull();
  });

  it("ne bascule pas sur le primary lorsque le clone connecté est occupé", async () => {
    const { database } = createDatabase({ workers: [onlineWorker("primary", 1000, "PRIMARY"), onlineWorker("clone", 1)], encodingBusy: 1, queuedJobs: [queuedJob(true)] });
    expect(await claimNextAiSubtitleJob({ workerId: "primary", database, config, now })).toBeNull();
  });

  it("exige une autorisation propre au sous-titre avant d’attribuer le primary", async () => {
    const { database } = createDatabase({ workers: [onlineWorker("primary", 1000, "PRIMARY")], queuedJobs: [queuedJob()] });
    expect(await claimNextAiSubtitleJob({ workerId: "primary", database, config, now })).toBeNull();
    const approved = createDatabase({ workers: [onlineWorker("primary", 1000, "PRIMARY")], queuedJobs: [queuedJob(true)] });
    expect(await claimNextAiSubtitleJob({ workerId: "primary", database: approved.database, config, now })).not.toBeNull();
  });

  it("priorise un encodage compatible en attente et laisse les sous-titres passer si la résolution est incompatible", async () => {
    const worker = onlineWorker("clone", 1);
    worker.Registry.MaxNominalHeight = 720;
    const compatible = createDatabase({ workers: [worker], queuedJobs: [queuedJob()], encodingTasks: [pendingEncoding(720)] });
    expect(await claimNextAiSubtitleJob({ workerId: "clone", database: compatible.database, config, now })).toBeNull();
    const incompatible = createDatabase({ workers: [worker], queuedJobs: [queuedJob()], encodingTasks: [pendingEncoding(1080)] });
    expect(await claimNextAiSubtitleJob({ workerId: "clone", database: incompatible.database, config, now })).not.toBeNull();
  });

  it("attribue un sous-titre au clone libre suivant lorsque le plus rapide doit encoder", async () => {
    const { database } = createDatabase({ workers: [onlineWorker("fast", 100), onlineWorker("free", 1)], queuedJobs: [queuedJob()] });
    database.videoEncodingTask.count.mockImplementation(async ({ where }) => where.AssignedWorkerID === "fast" ? 1 : 0);
    expect(await claimNextAiSubtitleJob({ workerId: "free", database, config, now })).not.toBeNull();
  });

  it("n’exclut pas le primary pour un clone hors ligne ou avec un runtime incompatible", async () => {
    for (const clone of [
      { ...onlineWorker("old", 1), LastHeartbeatAt: new Date(now.getTime() - 60_000) },
      { ...onlineWorker("old", 1), PipelineVersion: "old" },
      { ...onlineWorker("old", 1), Ready: false },
    ]) {
      const { database } = createDatabase({ workers: [onlineWorker("primary", 100, "PRIMARY"), clone], queuedJobs: [queuedJob(true)] });
      expect(await claimNextAiSubtitleJob({ workerId: "primary", database, config, now })).not.toBeNull();
    }
  });

  it("refuse l’autorisation si un clone est revenu et enregistre sinon l’admin et la date serveur", async () => {
    const { database } = createDatabase({ workers: [onlineWorker("clone", 1)], queuedJobs: [queuedJob()] });
    await expect(approveAiSubtitlePrimary("job-approval", 7, { database, config, now })).rejects.toMatchObject({ statusCode: 409 });
    expect(database.aiSubtitleJob.updateMany).not.toHaveBeenCalled();
    database.aiSubtitleWorker.findMany.mockResolvedValue([]);
    await approveAiSubtitlePrimary("job-approval", 7, { database, config, now });
    expect(database.aiSubtitleJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AiSubtitleJobID: "job-approval", Status: { in: ["QUEUED", "PREPARING"] } }),
      data: { PrimaryApprovedAt: now, PrimaryApprovedByUserID: 7 },
    }));
  });

  it("affiche la vraie disponibilité et conserve un clone connecté comme éligible même pendant un encodage", async () => {
    const { database } = createDatabase({ workers: [onlineWorker("clone", 1)], encodingTasks: [pendingEncoding()] });
    const [worker] = await getAiSubtitleWorkers({ database, config, now });
    expect(worker).toMatchObject({ id: "clone", role: "CLONE", eligible: true, available: false, unavailableReason: "Priorité à l’encodage" });
  });
});

describe("ordonnanceur des sous-titres IA", () => {
  it("attend la fin d'une réplique vocale sur le worker", async () => {
    const { database } = createDatabase({ workers: [onlineWorker("rtx-3090", 100)] });
    database.voiceAudio.count.mockResolvedValue(1);
    expect(await claimNextAiSubtitleJob({ workerId: "rtx-3090", now: new Date("2026-08-22T08:00:10.000Z"), database, config })).toBeNull();
    expect(database.aiSubtitleJob.updateMany).not.toHaveBeenCalled();
  });
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
          PipelineVersion: config.pipelineVersion,
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
      data: expect.objectContaining({
        AssignedWorkerID: "rtx-3090",
        Status: "LEASED",
        Phase: "translating",
      }),
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

  it("retranscrit une ancienne transcription créée par le pipeline V1", async () => {
    const queued = {
      AiSubtitleJobID: "019c0000-0000-7000-8000-000000000004",
      VideoID: 11,
      TargetLanguage: "fr",
      Status: "QUEUED",
      SourceRelativePath: "sources/job/source.wav",
      LeaseGeneration: 0,
      AttemptCount: 0,
      StartedAt: null,
      Video: {
        AiTranscript: {
          SourceLanguage: "fr",
          Segments: [{ start: 0, end: 1, text: "Ancien transcript" }],
          PipelineVersion: "sami-ai-subtitles-v1",
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

    expect(claim.job.Video.AiTranscript).toBeNull();
    expect(database.aiSubtitleJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ Phase: "transcribing" }),
    }));
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
      Video: {
        AiTranscript: {
          SourceLanguage: "en",
          Segments: [],
          PipelineVersion: config.pipelineVersion,
        },
      },
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

  it("arrête immédiatement un job dont la transcription est non réessayable", async () => {
    const leaseToken = "quality-lease-token";
    const job = {
      AiSubtitleJobID: "019c0000-0000-7000-8000-000000000003",
      VideoID: 11,
      Status: "LEASED",
      Phase: "TRANSCRIBING",
      AssignedWorkerID: "mac-clone",
      LeaseTokenHash: crypto.createHash("sha256").update(leaseToken).digest("hex"),
      LeaseGeneration: 2,
      LeaseExpiresAt: new Date(Date.now() + 60_000),
      AttemptCount: 1,
      MaxAttempts: 3,
      SourceRelativePath: null,
    };
    const database = {
      aiSubtitleJob: {
        findUnique: vi.fn().mockResolvedValue(job),
        update: vi.fn(async ({ data }) => ({ ...job, ...data })),
      },
    };

    await failAiSubtitleLease({
      jobId: job.AiSubtitleJobID,
      workerId: "mac-clone",
      leaseToken,
      leaseGeneration: 2,
      errorMessage: "Répétition anormale",
      retryable: false,
      database,
    });

    expect(database.aiSubtitleJob.update).toHaveBeenCalledWith({
      where: { AiSubtitleJobID: job.AiSubtitleJobID },
      data: expect.objectContaining({
        Status: "FAILED",
        Phase: "failed",
        NextEligibleAt: null,
        CompletedAt: expect.any(Date),
      }),
    });
  });
});
