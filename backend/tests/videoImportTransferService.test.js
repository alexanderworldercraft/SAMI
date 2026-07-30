import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { PassThrough } from "stream";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  root: `/tmp/sami-video-import-${process.pid}`,
  transfer: null,
  destinationState: 3,
  throwAfterTransactionCommit: false,
  createLog: vi.fn(async () => ({ ok: true })),
  updateStep: vi.fn(async () => ({})),
  fileUpdate: vi.fn(async () => ({})),
  fileUpdateMany: vi.fn(async () => ({ count: 0 })),
  refreshTotals: vi.fn(async () => ({})),
  transferFindMany: vi.fn(async () => []),
  transferFindUnique: vi.fn(async () => ({
    Status: mocks.transfer?.Status,
    CancelRequested: mocks.transfer?.CancelRequested,
    UpdatedAt: mocks.transfer?.UpdatedAt,
  })),
  videoFindMany: vi.fn(async () => []),
  transferUpdateMany: vi.fn(async ({ data }) => {
    if (mocks.transfer) Object.assign(mocks.transfer, data);
    return { count: 1 };
  }),
}));

vi.mock("../controllers/logController.js", () => ({
  createLog: mocks.createLog,
}));

vi.mock("../controllers/appSettingController.js", () => ({
  isContentPreviewActive: vi.fn(async () => false),
  isPreviewLiveActive: vi.fn(async () => false),
}));

vi.mock("../services/video/videoPreviewService.js", () => ({
  generateVideoPreviewFramesFromMaster: vi.fn(),
}));

vi.mock("../services/video/videoPreviewLiveService.js", () => ({
  generateVideoPreviewLiveFromMaster: vi.fn(),
}));

vi.mock("../services/video/videoPaths.js", () => ({
  VIDEO_ROOT: `${mocks.root}/video`,
}));

vi.mock("../services/videoTransferConfig.js", () => ({
  VIDEO_TRANSFER_BLOCK_MARKER: ".sami-transfer-blocked",
  VIDEO_TRANSFER_BLOCKED_ROOT: `${mocks.root}/video/.blocked`,
  VIDEO_TRANSFER_PROTOCOL_VERSION: 1,
  VIDEO_TRANSFER_STAGING_ROOT: `${mocks.root}/video/.transfers`,
  assertPrimaryTransferConfiguration: vi.fn(() => ({
    instanceId: "primary-test",
    role: "primary",
    isPrimary: true,
    sessionTtlHours: 168,
  })),
}));

vi.mock("../services/videoTransferPersistence.js", () => ({
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
  getTransferById: vi.fn(async () => mocks.transfer),
  refreshTransferFileTotals: mocks.refreshTotals,
  setTransferState: vi.fn(async (_id, options) => {
    if (options.status) mocks.transfer.Status = options.status;
    if (options.data) Object.assign(mocks.transfer, options.data);
    return mocks.transfer;
  }),
  transferWithDetails: {},
  updateTransferStep: mocks.updateStep,
}));

vi.mock("../services/db.js", () => {
  const transaction = {
    videoTransfer: {
      findUnique: vi.fn(async () => ({
        Status: mocks.transfer.Status,
        CancelRequested: mocks.transfer.CancelRequested,
      })),
      update: vi.fn(async ({ data }) => {
        Object.assign(mocks.transfer, data);
        return mocks.transfer;
      }),
      create: vi.fn(async ({ data }) => {
        Object.assign(mocks.transfer, data);
        return mocks.transfer;
      }),
    },
    video: {
      findUnique: vi.fn(async () => ({ EtatID: mocks.destinationState })),
      create: vi.fn(async () => ({ VideoID: 99 })),
      update: vi.fn(async ({ data }) => {
        mocks.destinationState = data.EtatID;
        return { VideoID: 99, EtatID: mocks.destinationState };
      }),
      delete: vi.fn(async () => ({})),
    },
    videoGenre: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    videoSubtitle: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    videoAudioTrack: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    videoPersonne: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    videoTransferFile: {
      createMany: vi.fn(async () => ({ count: 3 })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  return {
    prisma: {
      $queryRaw: vi.fn(),
      $transaction: vi.fn(async (callback) => {
        const result = await callback(transaction);
        if (mocks.throwAfterTransactionCommit) {
          throw new Error("ACK MySQL perdu après COMMIT");
        }
        return result;
      }),
      video: {
        findUnique: transaction.video.findUnique,
        findFirst: vi.fn(),
        findMany: mocks.videoFindMany,
        update: transaction.video.update,
      },
      videoTransfer: {
        findUnique: mocks.transferFindUnique,
        findMany: mocks.transferFindMany,
        update: vi.fn(async ({ data }) => {
          Object.assign(mocks.transfer, data);
          return mocks.transfer;
        }),
        updateMany: mocks.transferUpdateMany,
      },
      videoTransferFile: {
        update: mocks.fileUpdate,
        updateMany: mocks.fileUpdateMany,
      },
      utilisateur: {
        findFirst: vi.fn(async () => ({
          UtilisateurID: 1,
          Surnom: "root",
        })),
      },
    },
  };
});

import { ETAT } from "../constants.js";
import {
  cancelImportSession,
  cleanupExpiredVideoTransferStaging,
  createImportSession,
  finalizeImportSession,
  receiveImportFile,
  restoreVideoTransferBlockReservations,
  verifyImportSession,
} from "../services/videoImportTransferService.js";
import {
  sha256String,
  stableStringify,
  validateVideoTransferManifest,
} from "../services/videoTransferSecurity.js";

const TRANSFER_ID = "550e8400-e29b-41d4-a716-446655440000";
const FILE_CONTENTS = {
  "hls/master.m3u8":
    "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100000\nvideo.m3u8\n",
  "hls/video.m3u8":
    "#EXTM3U\n#EXTINF:1.0,\nsegment.ts\n#EXT-X-ENDLIST\n",
  "hls/segment.ts": "segment",
};
const FILES = Object.entries(FILE_CONTENTS).map(
  ([relativePath, content], index) => ({
    id: `file-${index + 1}`,
    relativePath,
    size: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
  })
);
const TOTAL_BYTES = FILES.reduce((total, file) => total + file.size, 0);

const createTransfer = (status) => ({
  VideoTransferID: TRANSFER_ID,
  Direction: "IMPORT",
  SourceInstanceID: "clone-test",
  SourceVideoID: 42,
  DestinationVideoID: 99,
  DestinationSeasonID: null,
  InitiatedByUserID: 1,
  InitiatedByNickname: "root",
  ManifestHash: "a".repeat(64),
  Manifest: {
    version: 1,
    exportTransferId: TRANSFER_ID,
    source: { instanceId: "clone-test", videoId: 42 },
    destinationSeasonId: null,
    initiatedByNickname: "root",
    metadata: {
      title: "Vidéo reçue",
      summary: null,
      premium: false,
      masterPlaylistPath: "hls/master.m3u8",
      posterPath: null,
      destinationGenreIds: [],
      subtitles: [],
      audioTracks: [],
    },
    files: FILES.map((file) => ({
      relativePath: file.relativePath,
      size: String(file.size),
      sha256: file.sha256,
    })),
  },
  Receipt: {
    manifestHash: "a".repeat(64),
    totalFiles: FILES.length,
    totalBytes: String(TOTAL_BYTES),
  },
  Warnings: [],
  Status: status,
  CurrentStep: "finalize",
  Progress: 92,
  TotalFiles: FILES.length,
  TransferredFiles: FILES.length,
  TotalBytes: BigInt(TOTAL_BYTES),
  TransferredBytes: BigInt(TOTAL_BYTES),
  CancelRequested: false,
  Files: FILES.map((file) => ({
      VideoTransferFileID: file.id,
      VideoTransferID: TRANSFER_ID,
      RelativePath: file.relativePath,
      Size: BigInt(file.size),
      Sha256: file.sha256,
      Status: "VERIFIED",
      BytesReceived: BigInt(file.size),
    })),
  Steps: [],
});

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.destinationState = ETAT.BLOCKED;
  mocks.throwAfterTransactionCommit = false;
  mocks.transfer = createTransfer("FINALIZING");
  mocks.transferFindMany.mockResolvedValue([]);
  mocks.transferFindUnique.mockImplementation(async () => ({
    Status: mocks.transfer?.Status,
    CancelRequested: mocks.transfer?.CancelRequested,
    UpdatedAt: mocks.transfer?.UpdatedAt,
  }));
  mocks.videoFindMany.mockResolvedValue([]);
  mocks.fileUpdate.mockImplementation(async () => ({}));
  mocks.fileUpdateMany.mockImplementation(async () => ({ count: 0 }));
  mocks.refreshTotals.mockResolvedValue({});
  mocks.transferUpdateMany.mockImplementation(async ({ data }) => {
    if (mocks.transfer) Object.assign(mocks.transfer, data);
    return { count: 1 };
  });
  await fs.promises.rm(mocks.root, { recursive: true, force: true });
  await fs.promises.mkdir(
    path.join(mocks.root, "video", "99", "hls"),
    { recursive: true }
  );
  for (const [relativePath, content] of Object.entries(FILE_CONTENTS)) {
    await fs.promises.writeFile(
      path.join(mocks.root, "video", "99", ...relativePath.split("/")),
      content
    );
  }
});

afterEach(async () => {
  await fs.promises.rm(mocks.root, { recursive: true, force: true });
});

describe("états critiques d'import vidéo", () => {
  it("reprend FINALIZING depuis le dossier déjà renommé sans relire le staging", async () => {
    const completed = await finalizeImportSession({
      transferId: TRANSFER_ID,
      sourceInstanceId: "clone-test",
      request: { headers: {}, socket: {} },
    });

    expect(completed.Status).toBe("COMPLETED");
    expect(mocks.destinationState).toBe(ETAT.ACTIVE);
    expect(mocks.fileUpdate).not.toHaveBeenCalled();
    await expect(
      fs.promises.access(
        path.join(
          mocks.root,
          "video",
          "99",
          ".sami-transfer-blocked"
        )
      )
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuse l'annulation d'une session FINALIZING sans supprimer les fichiers", async () => {
    const masterPath = path.join(
      mocks.root,
      "video",
      "99",
      "hls",
      "master.m3u8"
    );

    await expect(
      cancelImportSession({
        transferId: TRANSFER_ID,
        sourceInstanceId: "clone-test",
        request: { headers: {}, socket: {} },
      })
    ).rejects.toMatchObject({
      code: "TRANSFER_ALREADY_FINALIZING",
      statusCode: 409,
    });
    await expect(fs.promises.readFile(masterPath, "utf8")).resolves.toBe(
      FILE_CONTENTS["hls/master.m3u8"]
    );
  });

  it("ne rollback pas les fichiers si COMMIT a réussi avant une perte d'ACK", async () => {
    mocks.transfer = createTransfer("VERIFIED");
    mocks.transfer.CurrentStep = "verify";
    mocks.transfer.Progress = 90;
    mocks.throwAfterTransactionCommit = true;
    await fs.promises.rm(
      path.join(mocks.root, "video", "99"),
      { recursive: true, force: true }
    );
    const stagingFiles = path.join(
      mocks.root,
      "video",
      ".transfers",
      TRANSFER_ID,
      "files"
    );
    for (const [relativePath, content] of Object.entries(FILE_CONTENTS)) {
      const target = path.join(stagingFiles, ...relativePath.split("/"));
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, content);
    }

    const completed = await finalizeImportSession({
      transferId: TRANSFER_ID,
      sourceInstanceId: "clone-test",
      request: { headers: {}, socket: {} },
    });

    expect(completed.Status).toBe("COMPLETED");
    expect(mocks.destinationState).toBe(ETAT.ACTIVE);
    await expect(
      fs.promises.readFile(
        path.join(mocks.root, "video", "99", "hls", "master.m3u8"),
        "utf8"
      )
    ).resolves.toBe(FILE_CONTENTS["hls/master.m3u8"]);
    await expect(fs.promises.access(stagingFiles)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("interrompt un PUT qui ne se termine pas avant de nettoyer l'annulation", async () => {
    mocks.transfer = createTransfer("READY");
    mocks.transfer.CurrentStep = "transfer";
    mocks.transfer.Progress = 10;
    mocks.transfer.TransferredFiles = 0;
    mocks.transfer.TransferredBytes = 0n;
    mocks.transfer.Files[0].Status = "PENDING";
    mocks.transfer.Files[0].BytesReceived = 0n;
    const stream = new PassThrough();
    const file = mocks.transfer.Files[0];

    const upload = receiveImportFile({
      transferId: TRANSFER_ID,
      fileId: file.VideoTransferFileID,
      sourceInstanceId: "clone-test",
      stream,
      declaredBodyDigest: file.Sha256,
      declaredContentLength: Number(file.Size),
      request: { headers: {}, socket: {} },
    });
    const uploadOutcome = upload.then(
      () => ({ error: null }),
      (error) => ({ error })
    );
    await vi.waitFor(() => {
      expect(mocks.fileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ Status: "UPLOADING" }),
        })
      );
    });

    const cancelled = await cancelImportSession({
      transferId: TRANSFER_ID,
      sourceInstanceId: "clone-test",
      request: { headers: {}, socket: {} },
    });

    expect((await uploadOutcome).error).toBeTruthy();
    expect(stream.destroyed).toBe(true);
    expect(cancelled.Status).toBe("CANCELLED");
  });

  it("réserve VERIFYING avant d'attendre les PUT actifs et refuse tout nouveau PUT", async () => {
    mocks.transfer = createTransfer("READY");
    mocks.transfer.CurrentStep = "transfer";
    mocks.transfer.Progress = 10;
    mocks.transfer.TransferredFiles = FILES.length - 1;
    mocks.transfer.TransferredBytes = BigInt(
      TOTAL_BYTES - Number(mocks.transfer.Files[0].Size)
    );
    mocks.transfer.Files[0].Status = "PENDING";
    mocks.transfer.Files[0].BytesReceived = 0n;
    mocks.fileUpdate.mockImplementation(async ({ where, data }) => {
      const file = mocks.transfer.Files.find(
        (candidate) =>
          candidate.VideoTransferFileID === where.VideoTransferFileID
      );
      Object.assign(file, data);
      return file;
    });
    mocks.refreshTotals.mockImplementation(async () => {
      const verifiedFiles = mocks.transfer.Files.filter(
        (file) => file.Status === "VERIFIED"
      );
      const transferredBytes = verifiedFiles.reduce(
        (total, file) => total + BigInt(file.Size),
        0n
      );
      Object.assign(mocks.transfer, {
        TransferredFiles: verifiedFiles.length,
        TransferredBytes: transferredBytes,
      });
      return mocks.transfer;
    });

    const stagingFiles = path.join(
      mocks.root,
      "video",
      ".transfers",
      TRANSFER_ID,
      "files"
    );
    for (const file of mocks.transfer.Files.slice(1)) {
      const target = path.join(stagingFiles, ...file.RelativePath.split("/"));
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(
        target,
        FILE_CONTENTS[file.RelativePath]
      );
    }

    const firstFile = mocks.transfer.Files[0];
    const firstStream = new PassThrough();
    const firstUpload = receiveImportFile({
      transferId: TRANSFER_ID,
      fileId: firstFile.VideoTransferFileID,
      sourceInstanceId: "clone-test",
      stream: firstStream,
      declaredBodyDigest: firstFile.Sha256,
      declaredContentLength: Number(firstFile.Size),
      request: { headers: {}, socket: {} },
    });
    await vi.waitFor(() => {
      expect(mocks.fileUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ Status: "UPLOADING" }),
        })
      );
    });

    const verification = verifyImportSession({
      transferId: TRANSFER_ID,
      sourceInstanceId: "clone-test",
      request: { headers: {}, socket: {} },
    });
    await vi.waitFor(() => {
      expect(mocks.transfer.Status).toBe("VERIFYING");
    });

    const lateStream = new PassThrough();
    await expect(
      receiveImportFile({
        transferId: TRANSFER_ID,
        fileId: mocks.transfer.Files[1].VideoTransferFileID,
        sourceInstanceId: "clone-test",
        stream: lateStream,
        declaredBodyDigest: mocks.transfer.Files[1].Sha256,
        declaredContentLength: Number(mocks.transfer.Files[1].Size),
        request: { headers: {}, socket: {} },
      })
    ).rejects.toMatchObject({
      code: "TRANSFER_NOT_WRITABLE",
      statusCode: 409,
    });

    firstStream.end(FILE_CONTENTS[firstFile.RelativePath]);
    await expect(firstUpload).resolves.toMatchObject({ skipped: false });
    await expect(verification).resolves.toMatchObject({
      Status: "VERIFIED",
    });
  });

  it("considère VERIFYING comme déjà revendiqué et ne régresse jamais FINALIZING", async () => {
    mocks.transfer = createTransfer("VERIFYING");
    mocks.transferUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      verifyImportSession({
        transferId: TRANSFER_ID,
        sourceInstanceId: "clone-test",
        request: { headers: {}, socket: {} },
      })
    ).rejects.toMatchObject({
      code: "TRANSFER_VERIFY_CONFLICT",
      statusCode: 409,
    });

    mocks.transfer = createTransfer("FINALIZING");
    mocks.transferUpdateMany.mockClear();
    await expect(
      verifyImportSession({
        transferId: TRANSFER_ID,
        sourceInstanceId: "clone-test",
        request: { headers: {}, socket: {} },
      })
    ).resolves.toMatchObject({ Status: "FINALIZING" });
    expect(mocks.transferUpdateMany).not.toHaveBeenCalled();
  });

  it("restaure puis retire les réservations sidecar selon l'état DB", async () => {
    const reservationPath = path.join(
      mocks.root,
      "video",
      ".blocked",
      "99"
    );
    mocks.transferFindMany.mockResolvedValue([
      {
        VideoTransferID: TRANSFER_ID,
        DestinationVideoID: 99,
        Status: "READY",
      },
    ]);
    mocks.videoFindMany.mockResolvedValue([
      { VideoID: 99, EtatID: ETAT.BLOCKED },
    ]);

    await expect(
      restoreVideoTransferBlockReservations()
    ).resolves.toEqual({ restored: 1, removed: 0 });
    await expect(
      fs.promises.readFile(reservationPath, "utf8")
    ).resolves.toBe(TRANSFER_ID);

    mocks.transferFindMany.mockResolvedValue([
      {
        VideoTransferID: TRANSFER_ID,
        DestinationVideoID: 99,
        Status: "COMPLETED",
      },
    ]);
    mocks.videoFindMany.mockResolvedValue([
      { VideoID: 99, EtatID: ETAT.ACTIVE },
    ]);
    await expect(
      restoreVideoTransferBlockReservations()
    ).resolves.toEqual({ restored: 0, removed: 1 });
    await expect(fs.promises.access(reservationPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("recrée le sidecar lors du retry idempotent après un ACK de création incertain", async () => {
    const existing = createTransfer("READY");
    const normalizedManifest = validateVideoTransferManifest(
      existing.Manifest
    );
    const manifestHash = sha256String(stableStringify(normalizedManifest));
    existing.Manifest = normalizedManifest;
    existing.ManifestHash = manifestHash;
    mocks.transferFindUnique.mockResolvedValue(existing);
    const reservationPath = path.join(
      mocks.root,
      "video",
      ".blocked",
      "99"
    );
    await fs.promises.rm(reservationPath, { force: true });

    await expect(
      createImportSession({
        payload: {
          manifest: normalizedManifest,
          manifestHash,
        },
        sourceInstanceId: "clone-test",
        request: { headers: {}, socket: {} },
      })
    ).resolves.toMatchObject({
      created: false,
      transfer: { VideoTransferID: TRANSFER_ID, Status: "READY" },
    });
    await expect(
      fs.promises.readFile(reservationPath, "utf8")
    ).resolves.toBe(TRANSFER_ID);
  });

  it("conserve le sidecar si le COMMIT de création réussit avant une perte d'ACK", async () => {
    const normalizedManifest = validateVideoTransferManifest(
      createTransfer("READY").Manifest
    );
    const manifestHash = sha256String(stableStringify(normalizedManifest));
    mocks.transfer = createTransfer("READY");
    mocks.transferFindUnique.mockResolvedValue(null);
    mocks.throwAfterTransactionCommit = true;
    const reservationPath = path.join(
      mocks.root,
      "video",
      ".blocked",
      "99"
    );
    await fs.promises.rm(reservationPath, { force: true });

    await expect(
      createImportSession({
        payload: {
          manifest: normalizedManifest,
          manifestHash,
        },
        sourceInstanceId: "clone-test",
        request: { headers: {}, socket: {} },
      })
    ).rejects.toThrow("ACK MySQL perdu après COMMIT");
    await expect(
      fs.promises.readFile(reservationPath, "utf8")
    ).resolves.toBe(mocks.transfer.VideoTransferID);
    expect(mocks.transfer.VideoTransferID).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("n'annule pas un transfert rafraîchi après le snapshot du cleanup", async () => {
    mocks.transfer = createTransfer("TRANSFERRING");
    mocks.transfer.UpdatedAt = new Date();
    const stagingFile = path.join(
      mocks.root,
      "video",
      ".transfers",
      TRANSFER_ID,
      "files",
      "hls",
      "master.m3u8"
    );
    await fs.promises.mkdir(path.dirname(stagingFile), { recursive: true });
    await fs.promises.writeFile(stagingFile, "session reprise");
    mocks.transferFindMany
      .mockResolvedValueOnce([
        {
          VideoTransferID: TRANSFER_ID,
          SourceInstanceID: "clone-test",
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.transferUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      cleanupExpiredVideoTransferStaging()
    ).resolves.toEqual({
      cancelled: 0,
      skipped: 1,
      stagingRemoved: 0,
    });
    await expect(fs.promises.readFile(stagingFile, "utf8")).resolves.toBe(
      "session reprise"
    );
    expect(mocks.transfer.Status).toBe("TRANSFERRING");
  });

  it("ne supprime pas le staging d'une session CANCELLED réinitialisée après le snapshot", async () => {
    mocks.transfer = createTransfer("READY");
    mocks.transfer.UpdatedAt = new Date();
    const stagingFile = path.join(
      mocks.root,
      "video",
      ".transfers",
      TRANSFER_ID,
      "files",
      "hls",
      "master.m3u8"
    );
    await fs.promises.mkdir(path.dirname(stagingFile), { recursive: true });
    await fs.promises.writeFile(stagingFile, "nouvelle session");
    mocks.transferFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { VideoTransferID: TRANSFER_ID },
      ]);

    await expect(
      cleanupExpiredVideoTransferStaging()
    ).resolves.toEqual({
      cancelled: 0,
      skipped: 0,
      stagingRemoved: 0,
    });
    await expect(fs.promises.readFile(stagingFile, "utf8")).resolves.toBe(
      "nouvelle session"
    );
  });
});
