import { createLog } from "../controllers/logController.js";
import { prisma } from "./db.js";
import { TRANSFER_STATUS } from "./videoTransferPersistence.js";

const TRANSFER_ACTIONS = Object.freeze([
  "video_export_started",
  "video_import_started",
  "video_import_database_created",
  "video_transfer_in_progress",
  "video_transfer_completed",
  "video_transfer_failed",
  "video_transfer_cancelled",
]);

const ADVANCED_TRANSFER_STATUSES = new Set([
  TRANSFER_STATUS.VERIFYING,
  TRANSFER_STATUS.VERIFIED,
  TRANSFER_STATUS.FINALIZING,
  TRANSFER_STATUS.COMPLETED,
]);

const logKey = ({ userId, actionName, value }) =>
  `${Number(userId)}|${actionName}|${String(value)}`;

export const getExpectedTransferActions = (transfer) => {
  const actions =
    transfer.Direction === "EXPORT"
      ? ["video_export_started"]
      : transfer.Direction === "IMPORT"
        ? ["video_import_started", "video_import_database_created"]
        : [];

  if (
    Number(transfer.TransferredFiles) > 0
    || ADVANCED_TRANSFER_STATUSES.has(transfer.Status)
  ) {
    actions.push("video_transfer_in_progress");
  }
  if (transfer.Status === TRANSFER_STATUS.COMPLETED) {
    actions.push("video_transfer_completed");
  } else if (transfer.Status === TRANSFER_STATUS.FAILED) {
    actions.push("video_transfer_failed");
  } else if (transfer.Status === TRANSFER_STATUS.CANCELLED) {
    actions.push("video_transfer_cancelled");
  }
  return actions;
};

/**
 * Répare les jalons d'audit manquants après un crash ou une erreur ponctuelle
 * de journalisation. VideoTransfer reste la source de vérité persistante.
 */
export async function reconcileVideoTransferLogs() {
  const [transfers, actions] = await Promise.all([
    prisma.videoTransfer.findMany({
      select: {
        VideoTransferID: true,
        Direction: true,
        SourceInstanceID: true,
        SourceVideoID: true,
        DestinationVideoID: true,
        DestinationSeasonID: true,
        InitiatedByUserID: true,
        Status: true,
        TransferredFiles: true,
        ErrorMessage: true,
      },
    }),
    prisma.action.findMany({
      where: { Nom: { in: [...TRANSFER_ACTIONS] } },
      select: { ActionID: true, Nom: true },
    }),
  ]);

  const actionNameById = new Map(
    actions.map((action) => [action.ActionID, action.Nom])
  );
  const actionIdByName = new Map(
    actions.map((action) => [action.Nom, action.ActionID])
  );
  const logs = actions.length
    ? await prisma.log.findMany({
        where: {
          ActionID: { in: actions.map((action) => action.ActionID) },
          Champ: "video_transfer",
        },
        select: {
          UtilisateurID: true,
          ActionID: true,
          NouvelleValeur: true,
        },
      })
    : [];
  const existingKeys = new Set(
    logs.map((log) =>
      logKey({
        userId: log.UtilisateurID,
        actionName: actionNameById.get(log.ActionID),
        value: log.NouvelleValeur,
      })
    )
  );

  let created = 0;
  let existing = 0;
  let failed = 0;
  let skipped = 0;

  for (const transfer of transfers) {
    const userId = Number(transfer.InitiatedByUserID);
    if (!Number.isInteger(userId) || userId <= 0) {
      skipped += getExpectedTransferActions(transfer).length;
      continue;
    }

    for (const actionName of getExpectedTransferActions(transfer)) {
      if (!actionIdByName.has(actionName)) {
        failed += 1;
        continue;
      }

      const expectedKey = logKey({
        userId,
        actionName,
        value: transfer.VideoTransferID,
      });
      const legacyDatabaseKey =
        actionName === "video_import_database_created"
        && transfer.DestinationVideoID
          ? logKey({
              userId,
              actionName,
              value: transfer.DestinationVideoID,
            })
          : null;
      if (
        existingKeys.has(expectedKey)
        || (legacyDatabaseKey && existingKeys.has(legacyDatabaseKey))
      ) {
        existing += 1;
        continue;
      }

      const importCompleted =
        transfer.Direction === "IMPORT"
        && actionName === "video_transfer_completed";
      const result = await createLog({
        request: null,
        UtilisateurID: userId,
        ActionNom: actionName,
        VideoID:
          transfer.Direction === "EXPORT"
            ? transfer.SourceVideoID
            : importCompleted
              ? transfer.DestinationVideoID
              : null,
        SaisonID: importCompleted
          ? transfer.DestinationSeasonID
          : null,
        Champ: "video_transfer",
        NouvelleValeur: transfer.VideoTransferID,
        Meta: {
          reconciled: true,
          transferId: transfer.VideoTransferID,
          direction: transfer.Direction,
          sourceInstanceId: transfer.SourceInstanceID,
          sourceVideoId: transfer.SourceVideoID,
          destinationVideoId: transfer.DestinationVideoID,
          status: transfer.Status,
          ...(transfer.ErrorMessage
            ? { error: transfer.ErrorMessage }
            : {}),
        },
        DedupeMs: 365 * 24 * 60 * 60 * 1000,
      });
      if (result?.ok) {
        existingKeys.add(expectedKey);
        created += result.deduped ? 0 : 1;
        existing += result.deduped ? 1 : 0;
      } else {
        failed += 1;
      }
    }
  }

  return {
    transfers: transfers.length,
    created,
    existing,
    failed,
    skipped,
  };
}
