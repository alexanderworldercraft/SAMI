import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelJob: vi.fn(),
  createJob: vi.fn(),
  createLog: vi.fn(),
  deleteWorker: vi.fn(),
  ensureSuperAdmin: vi.fn(),
  getConfig: vi.fn(),
  getJob: vi.fn(),
  getRetention: vi.fn(),
  listJobs: vi.fn(),
  listWorkers: vi.fn(),
  patchWorker: vi.fn(),
  registerWorker: vi.fn(),
  resumeJob: vi.fn(),
  updateConfig: vi.fn(),
}));

vi.mock("../services/authz.js", () => ({
  ensureSuperAdmin: mocks.ensureSuperAdmin,
}));

vi.mock("../controllers/logController.js", () => ({
  createLog: mocks.createLog,
}));

vi.mock("../services/distributedEncoding/jobService.js", () => ({
  createDistributedVideoJob: mocks.createJob,
  deleteDistributedEncodingWorker: mocks.deleteWorker,
  getDistributedEncodingPublicConfig: mocks.getConfig,
  getDistributedVideoJob: mocks.getJob,
  getDistributedEncodingRetentionSnapshot: mocks.getRetention,
  listDistributedEncodingWorkers: mocks.listWorkers,
  listDistributedVideoJobs: mocks.listJobs,
  patchDistributedEncodingWorker: mocks.patchWorker,
  registerDistributedEncodingWorker: mocks.registerWorker,
  requestDistributedVideoJobCancellation: mocks.cancelJob,
  resumeDistributedVideoJob: mocks.resumeJob,
  updateDistributedEncodingPublicConfig: mocks.updateConfig,
}));

import {
  createVideoEncodingWorker,
  createVideoEncodingJob,
  getVideoEncodingConfig,
  getVideoEncodingJob,
  getVideoEncodingJobs,
  removeVideoEncodingWorker,
  updateVideoEncodingWorker,
  updateVideoEncodingConfig,
} from "../controllers/videoEncodingController.js";

const createReply = () => {
  const reply = {
    statusCode: 200,
    payload: null,
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

describe("videoEncodingController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureSuperAdmin.mockResolvedValue({ userId: 7, gradeId: 1 });
    mocks.createLog.mockResolvedValue({ ok: true });
  });

  it("vérifie le superadmin avant toute lecture de configuration", async () => {
    mocks.ensureSuperAdmin.mockImplementationOnce(async (_request, reply) => {
      reply.status(403).send({ error: "Accès réservé au super administrateur." });
      return null;
    });
    const reply = createReply();

    await getVideoEncodingConfig({ user: { userId: 9 } }, reply);

    expect(reply.statusCode).toBe(403);
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });

  it("refuse un toggle non booléen après le contrôle d'accès", async () => {
    const reply = createReply();

    await updateVideoEncodingConfig(
      { user: { userId: 7 }, body: { enabled: "oui" } },
      reply
    );

    expect(mocks.ensureSuperAdmin).toHaveBeenCalledTimes(1);
    expect(reply.statusCode).toBe(400);
    expect(reply.payload).toMatchObject({
      code: "INVALID_DISTRIBUTED_ENCODING_SETTING",
    });
    expect(mocks.getConfig).not.toHaveBeenCalled();
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });

  it("met à jour le toggle et écrit un log d'audit", async () => {
    mocks.getConfig.mockResolvedValue({ enabled: false });
    mocks.updateConfig.mockResolvedValue({
      enabled: true,
      operational: true,
      instanceId: "primary-01",
    });
    const request = {
      user: { userId: 7 },
      body: { enabled: true },
      headers: {},
    };
    const reply = createReply();

    await updateVideoEncodingConfig(request, reply);

    expect(mocks.updateConfig).toHaveBeenCalledWith(true);
    expect(mocks.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        request,
        UtilisateurID: 7,
        ActionNom: "distributed_encoding_toggle",
        AncienneValeur: "false",
        NouvelleValeur: "true",
      })
    );
    expect(reply.payload).toMatchObject({ enabled: true, operational: true });
  });

  it("crée un job multipart, sérialise la réponse et renvoie 202", async () => {
    mocks.createJob.mockResolvedValue({
      VideoEncodingJobID: "job-01",
      VideoID: 42,
      Status: "QUEUED",
      Progress: 0,
      SourceOriginalName: "source.mkv",
      SourceSize: 1234n,
      SourceSha256: "a".repeat(64),
      RequestSnapshot: {},
      PipelineVersion: "pipeline-v1",
      EncodingSpecHash: "b".repeat(64),
      Warnings: [],
      Tasks: [],
    });
    const request = {
      user: { userId: 7 },
      headers: { "content-type": "multipart/form-data" },
    };
    const reply = createReply();

    await createVideoEncodingJob(request, reply);

    expect(mocks.createJob).toHaveBeenCalledWith({
      request,
      adminUserId: 7,
    });
    expect(reply.statusCode).toBe(202);
    expect(reply.payload.job).toMatchObject({
      id: "job-01",
      videoId: 42,
      status: "QUEUED",
      sourceSize: "1234",
    });
    expect(mocks.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        ActionNom: "distributed_encoding_job_started",
        Champ: "distributed_encoding_job",
        VideoID: 42,
        NouvelleValeur: "job-01",
      })
    );
  });

  it("renvoie une erreur exploitable au front si ProfileLabel dépasse la colonne", async () => {
    const prismaError = Object.assign(new Error("Value too long"), {
      code: "P2000",
      meta: {
        modelName: "VideoEncodingTask",
        column_name: "ProfileLabel",
      },
    });
    mocks.createJob.mockRejectedValue(prismaError);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const reply = createReply();

    await createVideoEncodingJob({ user: { userId: 7 }, headers: {} }, reply);

    expect(reply.statusCode).toBe(500);
    expect(reply.payload).toEqual({
      error: "Le job n'a pas pu être créé car le libellé technique d'une tâche "
        + "d'encodage dépasse la taille acceptée par la base de données.",
      code: "VIDEO_ENCODING_TASK_PROFILE_LABEL_STORAGE_ERROR",
      retryable: false,
    });
    expect(consoleError).toHaveBeenCalledWith("[distributed-encoding]", prismaError);
    consoleError.mockRestore();
  });

  it("journalise les créations, modifications et retraits du registre", async () => {
    mocks.registerWorker.mockResolvedValue({ id: "Sami-clone-aero15XC" });
    mocks.patchWorker.mockResolvedValue({
      id: "Sami-clone-aero15XC",
      enabled: false,
    });
    mocks.deleteWorker.mockResolvedValue({ deleted: false, disabled: true });

    await createVideoEncodingWorker(
      { body: { instanceId: "Sami-clone-aero15XC" } },
      createReply()
    );
    await updateVideoEncodingWorker(
      {
        params: { workerId: "Sami-clone-aero15XC" },
        body: { enabled: false },
      },
      createReply()
    );
    await removeVideoEncodingWorker(
      { params: { workerId: "Sami-clone-aero15XC" } },
      createReply()
    );

    expect(mocks.createLog).toHaveBeenCalledTimes(3);
    expect(mocks.createLog).toHaveBeenNthCalledWith(1, expect.objectContaining({
      ActionNom: "distributed_encoding_worker_updated",
      NouvelleValeur: "Sami-clone-aero15XC",
      Meta: expect.objectContaining({ operation: "created" }),
    }));
    expect(mocks.createLog).toHaveBeenNthCalledWith(3, expect.objectContaining({
      Meta: expect.objectContaining({ operation: "disabled" }),
    }));
  });

  it("traduit scope=active et borne limit pour la liste", async () => {
    mocks.listJobs.mockResolvedValue({
      jobs: [{ id: "job-actif" }],
      pagination: { page: 2, limit: 100, total: 101, totalPages: 2 },
    });
    const reply = createReply();

    await getVideoEncodingJobs(
      { query: { scope: "active", page: "2", limit: "999" } },
      reply
    );

    expect(mocks.listJobs).toHaveBeenCalledWith({
      active: true,
      page: 2,
      limit: 100,
    });
    expect(reply.payload).toEqual({
      jobs: [{ id: "job-actif" }],
      pagination: { page: 2, limit: 100, total: 101, totalPages: 2 },
    });
    expect(mocks.getRetention).not.toHaveBeenCalled();
  });

  it("ajoute l'état de rétention uniquement lorsqu'il est demandé", async () => {
    mocks.listJobs.mockResolvedValue({
      jobs: [],
      pagination: { page: 1, limit: 25, total: 0, totalPages: 1 },
    });
    mocks.getRetention.mockResolvedValue({
      artifactRetentionDays: 1,
      jobRetentionDays: 30,
    });
    const reply = createReply();

    await getVideoEncodingJobs(
      { query: { page: "invalide", limit: "25", includeRetention: "true" } },
      reply
    );

    expect(mocks.listJobs).toHaveBeenCalledWith({
      active: false,
      page: 1,
      limit: 25,
    });
    expect(mocks.getRetention).toHaveBeenCalledTimes(1);
    expect(reply.payload.retention).toEqual({
      artifactRetentionDays: 1,
      jobRetentionDays: 30,
    });
  });

  it("renvoie un contrat 404 stable pour un job absent", async () => {
    mocks.getJob.mockResolvedValue(null);
    const reply = createReply();

    await getVideoEncodingJob({ params: { jobId: "absent" } }, reply);

    expect(reply.statusCode).toBe(404);
    expect(reply.payload).toEqual({
      error: "Job d'encodage introuvable.",
      code: "VIDEO_ENCODING_JOB_NOT_FOUND",
    });
  });
});
