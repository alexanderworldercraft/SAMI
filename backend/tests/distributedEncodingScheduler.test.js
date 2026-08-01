import { describe, expect, it } from "vitest";
import {
  buildInitialTaskPreferences,
  canEncodingWorkerClaimTask,
  claimNextEncodingTask,
  isEncodingWorkerOnline,
  isPrimaryHighResolutionFallbackReady,
} from "../services/distributedEncoding/scheduler.js";

const pipelineVersion = "sami-hls-libx264-aac-v1";
const now = new Date("2026-07-31T12:00:00.000Z");

const worker = (id, role, performanceScore, overrides = {}) => ({
  VideoEncodingWorkerID: id,
  Role: role,
  Enabled: true,
  Draining: false,
  ProtocolVersion: 1,
  PipelineVersion: pipelineVersion,
  MaxNominalHeight: 2160,
  SupportsH264: true,
  SupportsAac: true,
  PerformanceScore: performanceScore,
  LastHeartbeatAt: now,
  ActiveLeaseCount: 0,
  ...overrides,
});

const task = (height, overrides = {}) => ({
  VideoEncodingTaskID: `task-${height}`,
  Kind: "VIDEO_PROFILE",
  NominalHeight: height,
  Weight: BigInt(height),
  Priority: 0,
  Status: "PENDING",
  AttemptCount: 0,
  MaxAttempts: 3,
  CreatedAt: new Date(now.getTime() - 60_000),
  Job: {
    VideoEncodingJobID: "job-1",
    PipelineVersion: pipelineVersion,
    Status: "QUEUED",
    CancelRequested: false,
    CreatedAt: new Date(now.getTime() - 60_000),
  },
  ...overrides,
});

describe("scheduler d'encodage distribué", () => {
  it("réserve la plus petite résolution au principal et la plus lourde au clone le plus rapide", () => {
    const primary = worker("primary", "PRIMARY", 1, {
      MaxNominalHeight: 2160,
    });
    const fast = worker("clone-fast", "CLONE", 10);
    const slow = worker("clone-slow", "CLONE", 2);
    const preferences = buildInitialTaskPreferences({
      workers: [slow, primary, fast],
      tasks: [task(240), task(360), task(480), task(1080)],
      now,
    });

    expect(preferences.map(({ taskId, workerId }) => ({ taskId, workerId })))
      .toEqual([
        { taskId: "task-1080", workerId: "clone-fast" },
        { taskId: "task-480", workerId: "clone-slow" },
        { taskId: "task-240", workerId: "primary" },
      ]);
    expect(preferences.every(
      ({ expiresAt }) => expiresAt.getTime() === now.getTime() + 45_000
    )).toBe(true);
  });

  it("laisse le primary libre lorsque les clones couvrent toute la première vague", () => {
    const preferences = buildInitialTaskPreferences({
      workers: [
        worker("primary", "PRIMARY", 1),
        worker("clone-fast", "CLONE", 10),
        worker("clone-slow", "CLONE", 2),
      ],
      tasks: [task(240), task(360)],
      now,
    });

    expect(preferences.map(({ taskId, workerId }) => ({ taskId, workerId })))
      .toEqual([
        { taskId: "task-360", workerId: "clone-fast" },
        { taskId: "task-240", workerId: "clone-slow" },
      ]);
  });

  it("ne préattribue pas la suite aux workers encore réservés par la première vague", () => {
    const primary = worker("primary", "PRIMARY", 1);
    const fast = worker("clone-fast", "CLONE", 10, { ActiveLeaseCount: 1 });
    const slow = worker("clone-slow", "CLONE", 2);
    const remainingTasks = [task(360), task(480)];

    expect(buildInitialTaskPreferences({
      workers: [primary, fast, slow],
      tasks: remainingTasks,
      now,
      reservedWorkerIds: new Set(["primary", "clone-slow"]),
    })).toEqual([]);

    const afterFastFinished = buildInitialTaskPreferences({
      workers: [{ ...fast, ActiveLeaseCount: 0 }, primary, slow],
      tasks: remainingTasks,
      now,
      reservedWorkerIds: new Set(["primary", "clone-slow"]),
    });
    expect(afterFastFinished.map(({ taskId, workerId }) => ({ taskId, workerId })))
      .toEqual([{ taskId: "task-480", workerId: "clone-fast" }]);
  });

  it("bascule une haute résolution au principal exactement après cinq minutes sans heartbeat clone", () => {
    const primary = worker("primary", "PRIMARY", 1, {
      MaxNominalHeight: 360,
    });
    const highTask = task(1080, {
      CreatedAt: new Date(now.getTime() - 10 * 60_000),
    });
    const cloneHeartbeat = worker("clone-01", "CLONE", 2, {
      LastHeartbeatAt: new Date(now.getTime() - 5 * 60_000),
    });

    expect(isPrimaryHighResolutionFallbackReady({
      task: highTask,
      cloneWorkers: [cloneHeartbeat],
      now: new Date(now.getTime() - 1),
    })).toBe(false);
    expect(isPrimaryHighResolutionFallbackReady({
      task: highTask,
      cloneWorkers: [cloneHeartbeat],
      now,
    })).toBe(true);
    expect(canEncodingWorkerClaimTask({
      worker: primary,
      task: highTask,
      cloneWorkers: [cloneHeartbeat],
      now,
    })).toBe(true);
  });

  it("un heartbeat tardif bloque immédiatement les prochains fallbacks sans préempter les leases", () => {
    const primary = worker("primary", "PRIMARY", 1);
    const highTask = task(1080, {
      CreatedAt: new Date(now.getTime() - 10 * 60_000),
    });
    const lateClone = worker("clone-late", "CLONE", 3, {
      LastHeartbeatAt: new Date(now.getTime() - 1_000),
    });

    expect(canEncodingWorkerClaimTask({
      worker: primary,
      task: highTask,
      cloneWorkers: [lateClone],
      now,
    })).toBe(false);
    expect(canEncodingWorkerClaimTask({
      worker: lateClone,
      task: highTask,
      cloneWorkers: [lateClone],
      now,
    })).toBe(true);
  });

  it("garde les rendus audio primaryOnly sur le serveur principal en V1", () => {
    const audioTask = task(0, {
      Kind: "AUDIO_RENDITION",
      Spec: { primaryOnly: true },
      VideoEncodingTaskID: "audio-main",
    });
    const primary = worker("primary", "PRIMARY", 1);
    const clone = worker("clone-01", "CLONE", 2);

    expect(canEncodingWorkerClaimTask({
      worker: clone,
      task: audioTask,
      cloneWorkers: [clone],
      now,
    })).toBe(false);
    expect(canEncodingWorkerClaimTask({
      worker: primary,
      task: audioTask,
      cloneWorkers: [clone],
      now,
    })).toBe(true);
  });

  it("n'attribue une variante avec audio intégré qu'à un clone capable d'encoder AAC", () => {
    const h264Only = worker("clone-h264", "CLONE", 2, {
      SupportsAac: false,
    });
    const integratedAudioTask = task(720, {
      Spec: { includeAudio: true },
    });
    const videoOnlyTask = task(720, {
      VideoEncodingTaskID: "task-video-only",
      Spec: { includeAudio: false },
    });

    expect(canEncodingWorkerClaimTask({
      worker: h264Only,
      task: integratedAudioTask,
      cloneWorkers: [h264Only],
      now,
    })).toBe(false);
    expect(canEncodingWorkerClaimTask({
      worker: h264Only,
      task: videoOnlyTask,
      cloneWorkers: [h264Only],
      now,
    })).toBe(true);
  });

  it("déclare un worker hors ligne à 45 secondes et respecte une préférence active", () => {
    const clone = worker("clone-01", "CLONE", 2, {
      LastHeartbeatAt: new Date(now.getTime() - 45_000),
    });
    expect(isEncodingWorkerOnline(clone, { now })).toBe(true);
    expect(isEncodingWorkerOnline({
      ...clone,
      LastHeartbeatAt: new Date(now.getTime() - 45_001),
    }, { now })).toBe(false);

    expect(canEncodingWorkerClaimTask({
      worker: clone,
      task: task(720, {
        PreferredWorkerID: "clone-02",
        PreferenceExpiresAt: new Date(now.getTime() + 1),
      }),
      cloneWorkers: [clone],
      now,
    })).toBe(false);
  });

  it("claim atomiquement une tâche avec une nouvelle génération et retourne le contrat worker", async () => {
    const primary = worker("primary", "PRIMARY", 1);
    const queuedTask = {
      ...task(240),
      VideoEncodingJobID: "job-1",
      ProfileLabel: "240p",
      AssignedWorkerID: null,
      PreferredWorkerID: null,
      PreferenceExpiresAt: null,
      LeaseGeneration: 0,
      AttemptCount: 0,
      StartedAt: null,
    };
    queuedTask.Job.StartedAt = null;

    const taskFindMany = async (query) => {
      if (query.select?.AssignedWorkerID) return [];
      return [queuedTask];
    };
    const taskUpdateMany = async ({ data }) => {
      if (data.PreferredWorkerID) {
        queuedTask.PreferredWorkerID = data.PreferredWorkerID;
        queuedTask.PreferenceExpiresAt = data.PreferenceExpiresAt;
        return { count: 1 };
      }
      if (data.Status === "LEASED") {
        queuedTask.Status = "LEASED";
        queuedTask.AssignedWorkerID = data.AssignedWorkerID;
        queuedTask.LeaseGeneration += data.LeaseGeneration.increment;
        queuedTask.AttemptCount += data.AttemptCount.increment;
        queuedTask.LeaseExpiresAt = data.LeaseExpiresAt;
        return { count: 1 };
      }
      return { count: 0 };
    };
    const tx = {
      videoEncodingWorker: {
        findUnique: async () => primary,
        findMany: async () => [primary],
      },
      videoEncodingTask: {
        count: async () => 0,
        findMany: taskFindMany,
        updateMany: taskUpdateMany,
        findUnique: async () => queuedTask,
      },
      videoEncodingTaskAttempt: {
        create: async ({ data }) => data,
      },
      videoEncodingJob: {
        update: async ({ data }) => {
          queuedTask.Job.NoCloneSinceAt = data.NoCloneSinceAt;
          return queuedTask.Job;
        },
        updateMany: async () => ({ count: 1 }),
      },
    };

    const claim = await claimNextEncodingTask({
      instanceId: "primary",
      now,
      database: { $transaction: (callback) => callback(tx) },
      tokenFactory: () => "lease-token-abcdefghijklmnopqrstuvwxyz-012345",
    });

    expect(claim).toMatchObject({
      task: { VideoEncodingTaskID: "task-240", LeaseGeneration: 1 },
      job: { VideoEncodingJobID: "job-1" },
      attempt: {
        VideoEncodingTaskID: "task-240",
        VideoEncodingWorkerID: "primary",
        AttemptNumber: 1,
        LeaseGeneration: 1,
        Status: "RUNNING",
      },
      leaseGeneration: 1,
      renewAfterMs: 30_000,
      serializedTask: { id: "task-240", leaseGeneration: 1 },
      serializedJob: { id: "job-1" },
      serializedAttempt: {
        taskId: "task-240",
        workerId: "primary",
        leaseGeneration: 1,
      },
    });
  });
});
