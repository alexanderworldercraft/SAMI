import { Readable } from "stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimTask: vi.fn(),
  completeArtifacts: vi.fn(),
  advanceJob: vi.fn(),
  failLease: vi.fn(),
  getActiveLease: vi.fn(),
  heartbeat: vi.fn(),
  listPurgeableSources: vi.fn(),
  openSource: vi.fn(),
  receiveArtifact: vi.fn(),
  registerManifest: vi.fn(),
  releaseLease: vi.fn(),
  renewLease: vi.fn(),
}));

vi.mock("../services/distributedEncoding/artifactService.js", () => ({
  completeEncodingArtifacts: mocks.completeArtifacts,
  getActiveEncodingLease: mocks.getActiveLease,
  receiveEncodingArtifact: mocks.receiveArtifact,
  registerEncodingArtifactManifest: mocks.registerManifest,
}));

vi.mock("../services/distributedEncoding/persistence.js", () => ({
  failEncodingTaskLease: mocks.failLease,
  heartbeatEncodingWorker: mocks.heartbeat,
  listPurgeableEncodingSourceHashesForWorker: mocks.listPurgeableSources,
  releaseEncodingTaskLease: mocks.releaseLease,
  renewEncodingTaskLease: mocks.renewLease,
}));

vi.mock("../services/distributedEncoding/finalizationService.js", () => ({
  advanceDistributedEncodingJob: mocks.advanceJob,
}));

vi.mock("../services/distributedEncoding/scheduler.js", () => ({
  claimNextEncodingTask: mocks.claimTask,
}));

vi.mock("../services/distributedEncoding/sourceService.js", () => ({
  openDistributedSource: mocks.openSource,
}));

import {
  claimInternalVideoEncodingTask,
  completeInternalVideoEncodingTask,
  getInternalVideoEncodingSource,
  registerInternalVideoEncodingArtifacts,
  releaseInternalVideoEncodingTask,
  uploadInternalVideoEncodingArtifact,
} from "../controllers/internalVideoEncodingController.js";

const LEASE_TOKEN = "lease-token-with-more-than-thirty-two-characters";

const createReply = () => {
  const reply = {
    headers: {},
    payload: null,
    statusCode: 200,
    header: vi.fn((name, value) => {
      reply.headers[String(name).toLowerCase()] = String(value);
      return reply;
    }),
    status: vi.fn((statusCode) => {
      reply.statusCode = statusCode;
      return reply;
    }),
    send: vi.fn((payload) => {
      reply.payload = payload;
      return payload;
    }),
  };
  return reply;
};

const authenticatedRequest = (overrides = {}) => ({
  encodingAuth: {
    sourceInstanceId: "clone-01",
    bodySha256: "a".repeat(64),
  },
  headers: {},
  params: {},
  query: {},
  raw: { resume: vi.fn() },
  ...overrides,
});

describe("internalVideoEncodingController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renvoie un claim runtime sérialisé avec l'identité de la source", async () => {
    mocks.claimTask.mockResolvedValue({
      serializedTask: { id: "task-01", profileLabel: "480p" },
      serializedJob: {
        id: "job-01",
        sourceSha256: "b".repeat(64),
        sourceSize: "123456",
        sourceOriginalName: "source.mkv",
      },
      serializedAttempt: { id: "attempt-01" },
      leaseToken: LEASE_TOKEN,
      leaseGeneration: 3,
      leaseExpiresAt: "2026-07-31T13:00:00.000Z",
      renewAfterMs: 30000,
    });
    const reply = createReply();

    await claimInternalVideoEncodingTask(authenticatedRequest(), reply);

    expect(mocks.claimTask).toHaveBeenCalledWith({ instanceId: "clone-01" });
    expect(reply.payload).toEqual({
      lease: expect.objectContaining({
        task: { id: "task-01", profileLabel: "480p" },
        job: expect.objectContaining({ id: "job-01" }),
        attempt: { id: "attempt-01" },
        leaseToken: LEASE_TOKEN,
        leaseGeneration: 3,
        source: {
          jobId: "job-01",
          sha256: "b".repeat(64),
          size: "123456",
          originalName: "source.mkv",
        },
      }),
    });
  });

  it("renvoie lease:null lorsque la file ne contient aucune tâche", async () => {
    mocks.claimTask.mockResolvedValue(null);
    const reply = createReply();

    await claimInternalVideoEncodingTask(authenticatedRequest(), reply);

    expect(reply.payload).toEqual({ lease: null });
  });

  it("vérifie le lease avant d'ouvrir une source partielle", async () => {
    const stream = Readable.from(["source"]);
    mocks.getActiveLease.mockResolvedValue({
      task: {
        VideoEncodingJobID: "job-01",
        Job: {
          VideoEncodingJobID: "job-01",
          SourceRelativePath: "job-01/source/source.mkv",
          SourceSha256: "c".repeat(64),
          SourceSize: 1000n,
        },
      },
    });
    mocks.openSource.mockResolvedValue({
      offset: 100,
      size: 1000,
      length: 900,
      stream,
    });
    const request = authenticatedRequest({
      params: { jobId: "job-01" },
      query: { offset: "100" },
      headers: {
        "x-sami-encoding-task-id": "task-01",
        "x-sami-encoding-lease": LEASE_TOKEN,
        "x-sami-encoding-lease-generation": "3",
      },
    });
    const reply = createReply();

    await getInternalVideoEncodingSource(request, reply);

    expect(mocks.getActiveLease).toHaveBeenCalledWith({
      taskId: "task-01",
      workerId: "clone-01",
      leaseToken: LEASE_TOKEN,
      leaseGeneration: 3,
    });
    expect(mocks.getActiveLease.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.openSource.mock.invocationCallOrder[0]
    );
    expect(mocks.openSource).toHaveBeenCalledWith({
      relativePath: "job-01/source/source.mkv",
      offset: "100",
    });
    expect(reply.statusCode).toBe(206);
    expect(reply.headers).toMatchObject({
      etag: `"${"c".repeat(64)}"`,
      "x-sami-source-size": "1000",
      "accept-ranges": "bytes",
      "content-length": "900",
      "content-range": "bytes 100-999/1000",
    });
    expect(reply.payload).toBe(stream);
  });

  it("refuse une source dont le job ne correspond pas au lease", async () => {
    mocks.getActiveLease.mockResolvedValue({
      task: {
        VideoEncodingJobID: "autre-job",
        Job: {
          VideoEncodingJobID: "autre-job",
          SourceRelativePath: "autre-job/source/source.mkv",
        },
      },
    });
    const reply = createReply();

    await getInternalVideoEncodingSource(
      authenticatedRequest({
        params: { jobId: "job-01" },
        headers: {
          "x-sami-encoding-task-id": "task-01",
          "x-sami-encoding-lease": LEASE_TOKEN,
          "x-sami-encoding-lease-generation": "1",
        },
      }),
      reply
    );

    expect(reply.statusCode).toBe(409);
    expect(reply.payload).toMatchObject({
      code: "DISTRIBUTED_ENCODING_SOURCE_LEASE_MISMATCH",
    });
    expect(mocks.openSource).not.toHaveBeenCalled();
  });

  it("récupère la génération du lease dans le manifeste d'artefacts", async () => {
    mocks.registerManifest.mockResolvedValue({
      manifestHash: "d".repeat(64),
      files: [{ id: "file-01" }],
    });
    const manifest = { leaseGeneration: 4, files: [] };
    const reply = createReply();

    await registerInternalVideoEncodingArtifacts(
      authenticatedRequest({
        params: { taskId: "task-01" },
        body: {
          leaseToken: LEASE_TOKEN,
          manifestHash: "d".repeat(64),
          manifest,
        },
      }),
      reply
    );

    expect(mocks.registerManifest).toHaveBeenCalledWith({
      taskId: "task-01",
      workerId: "clone-01",
      leaseToken: LEASE_TOKEN,
      leaseGeneration: 4,
      manifest,
      manifestHash: "d".repeat(64),
    });
    expect(reply.payload.files).toEqual([{ id: "file-01" }]);
  });

  it("transmet le PUT brut et son empreinte signée au service d'artefacts", async () => {
    mocks.receiveArtifact.mockResolvedValue({
      fileId: "file-01",
      verified: true,
    });
    const raw = { resume: vi.fn() };
    const reply = createReply();
    const request = authenticatedRequest({
      params: { taskId: "task-01", fileId: "file-01" },
      headers: {
        "content-length": "512",
        "x-sami-encoding-lease": LEASE_TOKEN,
        "x-sami-encoding-lease-generation": "2",
      },
      raw,
    });

    await uploadInternalVideoEncodingArtifact(request, reply);

    expect(mocks.receiveArtifact).toHaveBeenCalledWith({
      taskId: "task-01",
      fileId: "file-01",
      workerId: "clone-01",
      leaseToken: LEASE_TOKEN,
      leaseGeneration: 2,
      stream: raw,
      declaredBodySha256: "a".repeat(64),
      declaredContentLength: 512,
    });
    expect(reply.payload).toEqual({ fileId: "file-01", verified: true });
  });

  it("ne permet jamais à un worker d'annuler une tâche lors d'un release", async () => {
    mocks.releaseLease.mockResolvedValue({
      VideoEncodingTaskID: "task-01",
      Status: "RETRY_WAIT",
      Progress: 25,
    });
    const reply = createReply();

    await releaseInternalVideoEncodingTask(
      authenticatedRequest({
        params: { taskId: "task-01" },
        body: {
          leaseToken: LEASE_TOKEN,
          leaseGeneration: 2,
          error: "Arrêt temporaire",
          cancelTask: true,
        },
      }),
      reply
    );

    expect(mocks.releaseLease).toHaveBeenCalledWith({
      taskId: "task-01",
      workerId: "clone-01",
      leaseToken: LEASE_TOKEN,
      leaseGeneration: 2,
      reason: "Arrêt temporaire",
    });
    expect(mocks.releaseLease.mock.calls[0][0]).not.toHaveProperty("cancelTask");
  });

  it("avance le job après validation et demande la purge sur publication complète", async () => {
    mocks.completeArtifacts.mockResolvedValue({
      VideoEncodingTaskID: "task-01",
      VideoEncodingJobID: "job-01",
      Status: "SUCCEEDED",
      Progress: 100,
    });
    mocks.advanceJob.mockResolvedValue({ Status: "COMPLETED" });
    const reply = createReply();

    await completeInternalVideoEncodingTask(
      authenticatedRequest({
        params: { taskId: "task-01" },
        body: {
          leaseToken: LEASE_TOKEN,
          leaseGeneration: 2,
        },
      }),
      reply
    );

    expect(mocks.advanceJob).toHaveBeenCalledWith("job-01");
    expect(reply.payload).toMatchObject({ purgeSource: true });
  });
});
