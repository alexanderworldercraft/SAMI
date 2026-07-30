import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transfers: [],
  actions: [],
  logs: [],
  createLog: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../controllers/logController.js", () => ({
  createLog: mocks.createLog,
}));

vi.mock("../services/db.js", () => ({
  prisma: {
    videoTransfer: {
      findMany: vi.fn(async () => mocks.transfers),
    },
    action: {
      findMany: vi.fn(async () => mocks.actions),
    },
    log: {
      findMany: vi.fn(async () => mocks.logs),
    },
  },
}));

import {
  getExpectedTransferActions,
  reconcileVideoTransferLogs,
} from "../services/videoTransferLogReconciliation.js";

const ACTION_NAMES = [
  "video_export_started",
  "video_import_started",
  "video_import_database_created",
  "video_transfer_in_progress",
  "video_transfer_completed",
  "video_transfer_failed",
  "video_transfer_cancelled",
];

const transfer = (overrides = {}) => ({
  VideoTransferID: "550e8400-e29b-41d4-a716-446655440000",
  Direction: "EXPORT",
  SourceInstanceID: "clone-test",
  SourceVideoID: 42,
  DestinationVideoID: 99,
  DestinationSeasonID: null,
  InitiatedByUserID: 7,
  Status: "COMPLETED",
  TransferredFiles: 3,
  ErrorMessage: null,
  ...overrides,
});

describe("réconciliation des Actions de transfert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transfers = [];
    mocks.logs = [];
    mocks.actions = ACTION_NAMES.map((Nom, index) => ({
      ActionID: index + 1,
      Nom,
    }));
  });

  it("déduit les jalons persistants depuis l'état du job", () => {
    expect(getExpectedTransferActions(transfer())).toEqual([
      "video_export_started",
      "video_transfer_in_progress",
      "video_transfer_completed",
    ]);
    expect(
      getExpectedTransferActions(
        transfer({
          Direction: "IMPORT",
          Status: "CANCELLED",
          TransferredFiles: 0,
        })
      )
    ).toEqual([
      "video_import_started",
      "video_import_database_created",
      "video_transfer_cancelled",
    ]);
  });

  it("recrée les Actions manquantes des deux serveurs", async () => {
    mocks.transfers = [
      transfer(),
      transfer({
        VideoTransferID: "550e8400-e29b-41d4-a716-446655440001",
        Direction: "IMPORT",
        Status: "FAILED",
        TransferredFiles: 1,
      }),
    ];

    const result = await reconcileVideoTransferLogs();

    expect(result).toMatchObject({
      transfers: 2,
      created: 7,
      failed: 0,
    });
    expect(mocks.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        ActionNom: "video_transfer_completed",
        VideoID: 42,
        NouvelleValeur: "550e8400-e29b-41d4-a716-446655440000",
      })
    );
    expect(mocks.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        ActionNom: "video_import_database_created",
        VideoID: null,
        NouvelleValeur: "550e8400-e29b-41d4-a716-446655440001",
      })
    );
  });

  it("respecte un ancien log database_created indexé par la vidéo destination", async () => {
    const imported = transfer({
      Direction: "IMPORT",
      Status: "READY",
      TransferredFiles: 0,
    });
    mocks.transfers = [imported];
    const databaseAction = mocks.actions.find(
      (action) => action.Nom === "video_import_database_created"
    );
    const importAction = mocks.actions.find(
      (action) => action.Nom === "video_import_started"
    );
    mocks.logs = [
      {
        UtilisateurID: 7,
        ActionID: databaseAction.ActionID,
        NouvelleValeur: "99",
      },
      {
        UtilisateurID: 7,
        ActionID: importAction.ActionID,
        NouvelleValeur: imported.VideoTransferID,
      },
    ];

    const result = await reconcileVideoTransferLogs();

    expect(result.created).toBe(0);
    expect(result.existing).toBe(2);
    expect(mocks.createLog).not.toHaveBeenCalled();
  });
});
