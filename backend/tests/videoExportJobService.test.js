import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createLog: vi.fn(async () => ({ ok: true })),
  findVideo: vi.fn(),
  updateMany: vi.fn(async () => ({ count: 1 })),
  getTransferById: vi.fn(),
  setTransferState: vi.fn(async () => ({})),
  updateTransferStep: vi.fn(async () => ({})),
  refreshTransferFileTotals: vi.fn(async () => ({
    TotalBytes: 0n,
    TransferredBytes: 0n,
    TotalFiles: 0,
    TransferredFiles: 0,
  })),
  capabilities: vi.fn(),
  genres: vi.fn(async () => []),
  series: vi.fn(async () => []),
  seasons: vi.fn(async () => []),
  createSession: vi.fn(),
  uploadFile: vi.fn(),
  verifySession: vi.fn(),
  finalizeSession: vi.fn(),
  cancelSession: vi.fn(),
  getSession: vi.fn(),
  transferFindMany: vi.fn(async () => []),
  transferFindUnique: vi.fn(),
}));

vi.mock("../controllers/logController.js", () => ({
  createLog: mocks.createLog,
}));

vi.mock("../services/db.js", () => ({
  prisma: {
    video: { findFirst: mocks.findVideo },
    videoTransfer: {
      updateMany: mocks.updateMany,
      findUnique: mocks.transferFindUnique,
      findMany: mocks.transferFindMany,
      update: vi.fn(async () => ({})),
    },
    videoTransferFile: {
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("../services/videoTransferConfig.js", () => ({
  VIDEO_TRANSFER_PROTOCOL_VERSION: 1,
  assertCloneTransferConfiguration: vi.fn(() => ({
    role: "clone",
    instanceId: "clone-test",
    primaryBaseUrl: new URL("https://primary.test"),
    sharedSecret: "0123456789abcdef0123456789abcdef",
    requestTimeoutMs: 120_000,
    sessionTtlHours: 168,
    concurrency: 2,
  })),
}));

vi.mock("../services/videoTransferPersistence.js", () => ({
  RECOVERABLE_EXPORT_STATUSES: [
    "QUEUED",
    "PREPARING",
    "TRANSFERRING",
    "VERIFYING",
    "VERIFIED",
    "FINALIZING",
  ],
  TRANSFER_FILE_STATUS: {
    PENDING: "PENDING",
    UPLOADING: "UPLOADING",
    VERIFIED: "VERIFIED",
    FAILED: "FAILED",
  },
  TRANSFER_STATUS: {
    QUEUED: "QUEUED",
    PREPARING: "PREPARING",
    CREATING_REMOTE: "CREATING_REMOTE",
    READY: "READY",
    TRANSFERRING: "TRANSFERRING",
    VERIFYING: "VERIFYING",
    VERIFIED: "VERIFIED",
    FINALIZING: "FINALIZING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCEL_REQUESTED: "CANCEL_REQUESTED",
    CANCELLED: "CANCELLED",
  },
  TRANSFER_STEP_STATUS: {
    PENDING: "PENDING",
    RUNNING: "RUNNING",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    CANCELLED: "CANCELLED",
  },
  getTransferById: mocks.getTransferById,
  refreshTransferFileTotals: mocks.refreshTransferFileTotals,
  setTransferState: mocks.setTransferState,
  transferWithDetails: {},
  updateTransferStep: mocks.updateTransferStep,
}));

vi.mock("../services/videoTransferRemoteClient.js", () => ({
  fetchPrimaryCapabilities: mocks.capabilities,
  fetchPrimaryGenres: mocks.genres,
  fetchPrimarySeries: mocks.series,
  fetchPrimarySeriesSeasons: mocks.seasons,
  createPrimaryImportSession: mocks.createSession,
  uploadPrimaryImportFile: mocks.uploadFile,
  verifyPrimaryImportSession: mocks.verifySession,
  finalizePrimaryImportSession: mocks.finalizeSession,
  cancelPrimaryImportSession: mocks.cancelSession,
  getPrimaryImportSession: mocks.getSession,
}));

vi.mock("../services/video/videoPaths.js", () => ({
  VIDEO_ROOT: "/tmp/sami-video-export-tests",
}));

import {
  cancelExportJob,
  getPrimaryPreflightForVideo,
  recoverInterruptedExportJobs,
  resumeExportJob,
  waitForExportJob,
} from "../services/videoExportJobService.js";
import { serializeTransferJob } from "../services/videoTransferSerializer.js";

const sourceVideo = {
  VideoID: 42,
  Titre: "Vidéo test",
  Resumer: null,
  Premium: false,
  VideoGenres: [
    { GenreID: 7, Genre: { GenreID: 7, Nom: "Science-fiction" } },
  ],
  VideoSubtitles: [],
  VideoAudioTracks: [],
};

const exportJob = (status) => ({
  VideoTransferID: "550e8400-e29b-41d4-a716-446655440000",
  Direction: "EXPORT",
  SourceInstanceID: "clone-test",
  SourceVideoID: 42,
  DestinationSeasonID: null,
  InitiatedByUserID: 1,
  InitiatedByNickname: "root",
  Manifest: { request: { destinationSeasonId: null, genreIds: [] } },
  Status: status,
  CurrentStep: "preflight",
  Progress: 0,
  CancelRequested: false,
  Steps: [],
});

describe("jobs d'export vidéo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findVideo.mockResolvedValue(sourceVideo);
    mocks.genres.mockResolvedValue([]);
    mocks.series.mockResolvedValue([]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.transferFindMany.mockResolvedValue([]);
    mocks.transferFindUnique.mockResolvedValue({
      Status: "QUEUED",
      CancelRequested: false,
    });
  });

  it("refuse un endpoint qui ne s'annonce pas comme principal compatible", async () => {
    mocks.capabilities.mockResolvedValue({
      ready: true,
      role: "clone",
      instanceId: "other-clone",
      protocolVersion: 1,
    });

    await expect(
      getPrimaryPreflightForVideo({ videoId: 42 })
    ).rejects.toMatchObject({
      code: "PRIMARY_CAPABILITIES_INVALID",
      statusCode: 503,
    });
  });

  it("refuse une boucle vers la même instance", async () => {
    mocks.capabilities.mockResolvedValue({
      ready: true,
      role: "primary",
      instanceId: "clone-test",
      protocolVersion: 1,
    });

    await expect(
      getPrimaryPreflightForVideo({ videoId: 42 })
    ).rejects.toMatchObject({
      code: "TRANSFER_INSTANCE_LOOP",
      statusCode: 409,
    });
  });

  it("réarme uniquement un job FAILED avant de le replacer dans la file", async () => {
    mocks.capabilities.mockResolvedValue({
      ready: false,
      role: "primary",
      instanceId: "primary-test",
      protocolVersion: 1,
    });
    const job = exportJob("FAILED");
    mocks.getTransferById.mockImplementation(async () => job);
    let resumeClaim = true;
    mocks.updateMany.mockImplementation(async ({ data }) => {
      if (resumeClaim) {
        resumeClaim = false;
        Object.assign(job, data);
      }
      return { count: 1 };
    });

    const resumed = await resumeExportJob({
      transferId: job.VideoTransferID,
      user: { UtilisateurID: 1, Surnom: "root" },
    });

    expect(resumed.Status).toBe("QUEUED");
    expect(mocks.updateMany.mock.calls[0][0]).toMatchObject({
      where: {
        Direction: "EXPORT",
        SourceInstanceID: "clone-test",
        Status: "FAILED",
      },
      data: {
        Status: "QUEUED",
        CancelRequested: false,
        ResumeCount: { increment: 1 },
      },
    });
    await vi.waitFor(() => {
      expect(mocks.capabilities).toHaveBeenCalled();
    });
  });

  it("refuse l'annulation dès que le job est FINALIZING", async () => {
    mocks.getTransferById.mockResolvedValue(exportJob("FINALIZING"));

    await expect(
      cancelExportJob({
        transferId: exportJob("FINALIZING").VideoTransferID,
        user: { UtilisateurID: 1, Surnom: "root" },
      })
    ).rejects.toMatchObject({
      code: "EXPORT_NOT_CANCELLABLE",
      statusCode: 409,
    });
    expect(mocks.cancelSession).not.toHaveBeenCalled();
  });

  it("réconcilie FINALIZING depuis le principal sans relire la source locale", async () => {
    const job = {
      ...exportJob("FINALIZING"),
      CurrentStep: "finalize",
      Progress: 92,
      RemoteTransferID: "660e8400-e29b-41d4-a716-446655440000",
      DestinationVideoID: 99,
    };
    mocks.getTransferById.mockImplementation(async () => job);
    mocks.transferFindUnique.mockImplementation(async () => ({
      Status: job.Status,
      CancelRequested: job.CancelRequested,
    }));
    mocks.updateMany.mockImplementation(async ({ data }) => {
      Object.assign(job, data);
      return { count: 1 };
    });
    mocks.transferFindMany.mockResolvedValue([
      {
        VideoTransferID: job.VideoTransferID,
        Status: "FINALIZING",
        InitiatedByUserID: 1,
        InitiatedByNickname: "root",
      },
    ]);
    mocks.capabilities.mockResolvedValue({
      ready: true,
      role: "primary",
      instanceId: "primary-test",
      protocolVersion: 1,
    });
    mocks.getSession.mockResolvedValue({
      transfer: {
        id: job.RemoteTransferID,
        status: "COMPLETED",
        destinationVideoId: 99,
        receipt: { totalFiles: 3 },
        warnings: [],
      },
    });

    await expect(recoverInterruptedExportJobs()).resolves.toBe(1);
    await waitForExportJob(job.VideoTransferID);

    expect(job.Status).toBe("COMPLETED");
    expect(mocks.getSession).toHaveBeenCalledWith({
      transferId: job.RemoteTransferID,
      signal: expect.any(AbortSignal),
    });
    expect(mocks.findVideo).not.toHaveBeenCalled();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.uploadFile).not.toHaveBeenCalled();
    expect(mocks.verifySession).not.toHaveBeenCalled();
    expect(mocks.finalizeSession).not.toHaveBeenCalled();
  });

  it("autorise la reprise manuelle d'un FINALIZING en erreur sans le réinitialiser", async () => {
    const job = {
      ...exportJob("FINALIZING"),
      CurrentStep: "finalize",
      Progress: 92,
      ErrorMessage: "timeout après publication distante",
      RemoteTransferID: "660e8400-e29b-41d4-a716-446655440000",
    };
    mocks.getTransferById.mockImplementation(async () => job);
    mocks.transferFindUnique.mockImplementation(async () => ({
      Status: job.Status,
      CancelRequested: job.CancelRequested,
    }));
    mocks.updateMany.mockImplementation(async ({ data }) => {
      Object.assign(job, data);
      return { count: 1 };
    });
    mocks.capabilities.mockResolvedValue({
      ready: true,
      role: "primary",
      instanceId: "primary-test",
      protocolVersion: 1,
    });
    mocks.getSession.mockResolvedValue({
      transfer: {
        id: job.RemoteTransferID,
        status: "COMPLETED",
        destinationVideoId: 99,
        receipt: {},
        warnings: [],
      },
    });

    await resumeExportJob({
      transferId: job.VideoTransferID,
      user: { UtilisateurID: 1, Surnom: "root" },
    });
    expect(mocks.updateMany.mock.calls[0][0]).toMatchObject({
      where: {
        Status: "FINALIZING",
        ErrorMessage: { not: null },
      },
      data: {
        Status: "FINALIZING",
        CurrentStep: "finalize",
        ErrorMessage: null,
        ResumeCount: { increment: 1 },
      },
    });
    await waitForExportJob(job.VideoTransferID);
    expect(job.Status).toBe("COMPLETED");
    expect(mocks.findVideo).not.toHaveBeenCalled();
  });

  it("expose canResume uniquement pour FINALIZING lorsqu'une erreur est présente", () => {
    expect(
      serializeTransferJob({
        ...exportJob("FINALIZING"),
        ErrorMessage: "timeout",
      }).canResume
    ).toBe(true);
    expect(
      serializeTransferJob({
        ...exportJob("FINALIZING"),
        ErrorMessage: null,
      }).canResume
    ).toBe(false);
  });

  it("retrouve par idempotence une création distante sans ACK avant de l'annuler", async () => {
    const job = {
      ...exportJob("READY"),
      ManifestHash: "a".repeat(64),
      Manifest: {
        version: 1,
        source: { instanceId: "clone-test", videoId: 42 },
      },
      RemoteTransferID: null,
    };
    mocks.getTransferById.mockImplementation(async () => job);
    mocks.updateMany.mockImplementation(async ({ data }) => {
      Object.assign(job, data);
      return { count: 1 };
    });
    mocks.createSession.mockResolvedValue({
      transfer: {
        id: "660e8400-e29b-41d4-a716-446655440000",
        destinationVideoId: 99,
      },
    });
    mocks.cancelSession.mockResolvedValue({
      transfer: { status: "CANCELLED" },
    });

    await expect(
      cancelExportJob({
        transferId: job.VideoTransferID,
        user: { UtilisateurID: 1, Surnom: "root" },
      })
    ).resolves.toMatchObject({ Status: "CANCELLED" });
    expect(mocks.createSession).toHaveBeenCalledWith({
      manifest: job.Manifest,
      manifestHash: job.ManifestHash,
    });
    expect(mocks.cancelSession).toHaveBeenCalledWith({
      transferId: "660e8400-e29b-41d4-a716-446655440000",
    });
    expect(job.RemoteTransferID).toBe(
      "660e8400-e29b-41d4-a716-446655440000"
    );
  });
});
