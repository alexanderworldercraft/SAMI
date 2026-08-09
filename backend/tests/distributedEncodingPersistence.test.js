import { describe, expect, it, vi } from "vitest";
import {
  consumeEncodingRequestNonce,
  createEncodingTasks,
  failEncodingTaskLease,
  getJobForLifecycle,
  getJobWithDetails,
  hashEncodingLeaseToken,
  heartbeatEncodingWorker,
  listActiveJobs,
  recalculateEncodingJobProgress,
  releaseEncodingTaskLease,
  renewEncodingTaskLease,
  upsertEncodingWorker,
  VIDEO_ENCODING_TASK_PROFILE_LABEL_MAX_LENGTH,
} from "../services/distributedEncoding/persistence.js";
import { canEncodingWorkerClaimTask } from "../services/distributedEncoding/scheduler.js";

describe("persistance de l'encodage distribué", () => {
  it("ne trie pas en SQL les gros manifestes et allège la lecture de maintenance", async () => {
    const findUnique = vi.fn(async () => null);
    const findMany = vi.fn(async () => []);
    const database = {
      videoEncodingJob: { findUnique, findMany },
    };

    await getJobWithDetails("job-01", { database });
    await getJobForLifecycle("job-01", { database });
    await listActiveJobs({ database });

    for (const query of [findUnique.mock.calls[0][0], findMany.mock.calls[0][0]]) {
      expect(query.include.Tasks).not.toHaveProperty("orderBy");
      expect(query.include.Tasks.include.Attempts).toBe(true);
    }

    const lifecycleQuery = findUnique.mock.calls[1][0];
    expect(lifecycleQuery.include.Tasks).not.toHaveProperty("orderBy");
    expect(lifecycleQuery.include.Tasks.select).not.toHaveProperty("Attempts");
    expect(lifecycleQuery.include.Tasks.select).not.toHaveProperty("ArtifactManifest");
  });

  it("refuse un libellé technique trop long avant l'écriture Prisma", async () => {
    const createMany = vi.fn();
    const profileLabel = "x".repeat(
      VIDEO_ENCODING_TASK_PROFILE_LABEL_MAX_LENGTH + 1
    );

    expect(() => createEncodingTasks("job-01", [{
      id: "task-01",
      key: "audio-0",
      kind: "AUDIO_RENDITION",
      profileLabel,
      specHash: "a".repeat(64),
    }], {
      database: { videoEncodingTask: { createMany } },
    })).toThrow(expect.objectContaining({
      code: "VIDEO_ENCODING_TASK_PROFILE_LABEL_TOO_LONG",
      statusCode: 500,
      retryable: false,
    }));
    expect(createMany).not.toHaveBeenCalled();
  });

  it("ajoute un worker désactivé par défaut et impose un seul slot en V1", async () => {
    const upsert = vi.fn(async (query) => query);
    await upsertEncodingWorker({
      instanceId: "clone-01",
      role: "clone",
      pipelineVersion: "sami-hls-libx264-aac-v1",
      maxSlots: 8,
    }, {
      database: { videoEncodingWorker: { upsert } },
    });

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        VideoEncodingWorkerID: "clone-01",
        Role: "CLONE",
        Enabled: false,
        MaxSlots: 1,
      }),
      update: expect.objectContaining({ MaxSlots: 1 }),
    }));
  });

  it("refuse le heartbeat d'un worker absent ou désactivé", async () => {
    const database = {
      videoEncodingWorker: {
        updateMany: vi.fn(async () => ({ count: 0 })),
      },
    };
    await expect(heartbeatEncodingWorker("unknown", {}, { database }))
      .rejects.toMatchObject({ code: "ENCODING_WORKER_NOT_ENABLED" });
  });

  it("conserve le classement de performance configuré par le super administrateur", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const database = {
      videoEncodingWorker: {
        updateMany,
        findUnique: vi.fn(async () => ({
          VideoEncodingWorkerID: "Sami-clone-macbookair15",
          PerformanceScore: 100,
        })),
      },
    };

    await heartbeatEncodingWorker("Sami-clone-macbookair15", {
      performanceScore: 8,
      supportsH264: true,
      supportsAac: true,
    }, { database });

    expect(updateMany.mock.calls[0][0].data).not.toHaveProperty("PerformanceScore");
  });

  it("n'élargit jamais le plafond de résolution administrateur lors d'un heartbeat", async () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    const storedWorker = {
      VideoEncodingWorkerID: "clone-01",
      Role: "CLONE",
      Enabled: true,
      Draining: false,
      ProtocolVersion: 1,
      PipelineVersion: "sami-hls-libx264-aac-v1",
      MaxNominalHeight: 720,
      SupportsH264: true,
      SupportsAac: true,
      LastHeartbeatAt: now,
    };
    const updateMany = vi.fn(async ({ data }) => {
      Object.assign(storedWorker, data);
      return { count: 1 };
    });
    const database = {
      videoEncodingWorker: {
        updateMany,
        findUnique: vi.fn(async () => storedWorker),
      },
    };

    await heartbeatEncodingWorker("clone-01", {
      protocolVersion: 1,
      pipelineVersion: "sami-hls-libx264-aac-v1",
      maxNominalHeight: 4320,
      supportsH264: true,
      supportsAac: true,
    }, { now, database });

    expect(updateMany.mock.calls[0][0].data).not.toHaveProperty("MaxNominalHeight");
    expect(storedWorker.MaxNominalHeight).toBe(720);
    expect(canEncodingWorkerClaimTask({
      worker: storedWorker,
      task: {
        VideoEncodingTaskID: "task-1080",
        Kind: "VIDEO_PROFILE",
        NominalHeight: 1080,
        Status: "PENDING",
        AttemptCount: 0,
        MaxAttempts: 3,
        Job: {
          PipelineVersion: "sami-hls-libx264-aac-v1",
          Status: "QUEUED",
          CancelRequested: false,
        },
      },
      cloneWorkers: [storedWorker],
      now,
    })).toBe(false);
  });

  it("renouvelle avec le hash du jeton et la génération de fencing exacts", async () => {
    const token = "lease-token-abcdefghijklmnopqrstuvwxyz-012345";
    const updateTask = vi.fn(async () => ({ count: 1 }));
    const updateAttempt = vi.fn(async () => ({ count: 1 }));
    const updateWorker = vi.fn(async () => ({ count: 1 }));
    const storedTask = { VideoEncodingTaskID: "task-1" };
    const tx = {
      videoEncodingTask: {
        updateMany: updateTask,
        findUnique: vi.fn(async () => storedTask),
      },
      videoEncodingTaskAttempt: { updateMany: updateAttempt },
      videoEncodingWorker: { updateMany: updateWorker },
    };
    const database = { $transaction: (callback) => callback(tx) };

    await expect(renewEncodingTaskLease({
      taskId: "task-1",
      workerId: "clone-01",
      leaseToken: token,
      leaseGeneration: 7,
      progress: 41,
      phase: "ENCODING",
    }, { now: new Date("2026-07-31T12:00:00.000Z"), database }))
      .resolves.toBe(storedTask);
    expect(updateTask).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        LeaseTokenHash: hashEncodingLeaseToken(token),
        LeaseGeneration: 7,
      }),
      data: expect.objectContaining({ Progress: 41, Phase: "ENCODING" }),
    }));
    expect(updateAttempt).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ LeaseGeneration: 7 }),
    }));
    expect(updateWorker).toHaveBeenCalledWith({
      where: {
        VideoEncodingWorkerID: "clone-01",
        Enabled: true,
      },
      data: { LastHeartbeatAt: new Date("2026-07-31T12:00:00.000Z") },
    });
  });

  it("traduit une collision de nonce persistant en rejet de replay", async () => {
    const database = {
      videoEncodingRequestNonce: {
        create: vi.fn(async () => {
          const error = new Error("unique");
          error.code = "P2002";
          throw error;
        }),
      },
    };
    await expect(consumeEncodingRequestNonce({
      workerId: "clone-01",
      nonce: "nonce-abcdefghijklmnop",
      expiresAt: new Date(Date.now() + 60_000),
    }, { database })).rejects.toMatchObject({
      code: "ENCODING_NONCE_REPLAYED",
    });
  });

  it("réarme un échec avec le backoff 15s puis marque l'attempt FAILED", async () => {
    const instant = new Date("2026-07-31T12:00:00.000Z");
    const token = "lease-token-abcdefghijklmnopqrstuvwxyz-012345";
    const taskFindUnique = vi.fn()
      .mockResolvedValueOnce({ AttemptCount: 1, MaxAttempts: 3 })
      .mockResolvedValueOnce({ VideoEncodingTaskID: "task-1" });
    const taskUpdateMany = vi.fn(async () => ({ count: 1 }));
    const attemptUpdateMany = vi.fn(async () => ({ count: 1 }));
    const tx = {
      videoEncodingTask: {
        findUnique: taskFindUnique,
        updateMany: taskUpdateMany,
      },
      videoEncodingTaskAttempt: { updateMany: attemptUpdateMany },
    };

    await failEncodingTaskLease({
      taskId: "task-1",
      workerId: "clone-01",
      leaseToken: token,
      leaseGeneration: 2,
      errorMessage: "ffmpeg failed",
    }, {
      now: instant,
      database: { $transaction: (callback) => callback(tx) },
    });

    expect(taskUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        LeaseTokenHash: hashEncodingLeaseToken(token),
        LeaseGeneration: 2,
      }),
      data: expect.objectContaining({
        Status: "RETRY_WAIT",
        NextEligibleAt: new Date(instant.getTime() + 15_000),
        ArtifactManifest: null,
        ArtifactManifestHash: null,
      }),
    }));
    expect(attemptUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ Status: "FAILED" }),
    }));
  });

  it("libère un second attempt avec le backoff 60s et le marque CANCELLED", async () => {
    const instant = new Date("2026-07-31T12:00:00.000Z");
    const taskUpdateMany = vi.fn(async () => ({ count: 1 }));
    const attemptUpdateMany = vi.fn(async () => ({ count: 1 }));
    const tx = {
      videoEncodingTask: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ AttemptCount: 2, MaxAttempts: 3 })
          .mockResolvedValueOnce({ VideoEncodingTaskID: "task-1" }),
        updateMany: taskUpdateMany,
      },
      videoEncodingTaskAttempt: { updateMany: attemptUpdateMany },
    };

    await releaseEncodingTaskLease({
      taskId: "task-1",
      workerId: "clone-01",
      leaseToken: "lease-token-abcdefghijklmnopqrstuvwxyz-012345",
      leaseGeneration: 3,
      reason: "worker shutdown",
    }, {
      now: instant,
      database: { $transaction: (callback) => callback(tx) },
    });

    expect(taskUpdateMany.mock.calls[0][0].data).toMatchObject({
      Status: "RETRY_WAIT",
      NextEligibleAt: new Date(instant.getTime() + 60_000),
    });
    expect(attemptUpdateMany.mock.calls[0][0].data.Status).toBe("CANCELLED");
  });

  it("recalcule la progression d'un job en pondérant les tâches requises", async () => {
    const update = vi.fn(async ({ data }) => data);
    const database = {
      videoEncodingTask: {
        findMany: vi.fn(async () => [
          { Weight: 1n, Progress: 100, Status: "SUCCEEDED" },
          { Weight: 3n, Progress: 50, Status: "LEASED" },
        ]),
      },
      videoEncodingJob: { update },
    };

    await recalculateEncodingJobProgress("job-1", { database });
    expect(update).toHaveBeenCalledWith({
      where: { VideoEncodingJobID: "job-1" },
      data: { Progress: 62 },
    });
  });
});
