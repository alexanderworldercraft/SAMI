import { prisma } from "./db.js";

export const TRANSFER_STATUS = Object.freeze({
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
});

export const TRANSFER_FILE_STATUS = Object.freeze({
  PENDING: "PENDING",
  UPLOADING: "UPLOADING",
  VERIFIED: "VERIFIED",
  FAILED: "FAILED",
});

export const TRANSFER_STEP_STATUS = Object.freeze({
  PENDING: "PENDING",
  RUNNING: "RUNNING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
});

export const TERMINAL_TRANSFER_STATUSES = new Set([
  TRANSFER_STATUS.COMPLETED,
  TRANSFER_STATUS.CANCELLED,
]);

export const RECOVERABLE_EXPORT_STATUSES = [
  TRANSFER_STATUS.QUEUED,
  TRANSFER_STATUS.PREPARING,
  TRANSFER_STATUS.CREATING_REMOTE,
  TRANSFER_STATUS.READY,
  TRANSFER_STATUS.TRANSFERRING,
  TRANSFER_STATUS.VERIFYING,
  TRANSFER_STATUS.VERIFIED,
  TRANSFER_STATUS.FINALIZING,
];

export const transferWithDetails = {
  Files: { orderBy: { RelativePath: "asc" } },
  Steps: { orderBy: { CreatedAt: "asc" } },
};

const clampProgress = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
};

export const getTransferById = (transferId) =>
  prisma.videoTransfer.findUnique({
    where: { VideoTransferID: transferId },
    include: transferWithDetails,
  });

export async function updateTransferStep({
  transferId,
  stepKey,
  label,
  statusLabel,
  progress = 0,
  status = TRANSFER_STEP_STATUS.RUNNING,
  errorMessage = null,
}) {
  const now = new Date();
  const normalizedProgress = clampProgress(progress);
  const completed =
    status === TRANSFER_STEP_STATUS.COMPLETED
    || status === TRANSFER_STEP_STATUS.FAILED
    || status === TRANSFER_STEP_STATUS.CANCELLED;

  const existing = await prisma.videoTransferStep.findUnique({
    where: {
      VideoTransferID_StepKey: {
        VideoTransferID: transferId,
        StepKey: stepKey,
      },
    },
    select: { StartedAt: true },
  });

  return prisma.videoTransferStep.upsert({
    where: {
      VideoTransferID_StepKey: {
        VideoTransferID: transferId,
        StepKey: stepKey,
      },
    },
    create: {
      VideoTransferID: transferId,
      StepKey: stepKey,
      Label: label,
      StatusLabel: statusLabel,
      Progress: normalizedProgress,
      Status: status,
      ErrorMessage: errorMessage,
      StartedAt: status === TRANSFER_STEP_STATUS.PENDING ? null : now,
      CompletedAt: completed ? now : null,
    },
    update: {
      Label: label,
      StatusLabel: statusLabel,
      Progress: normalizedProgress,
      Status: status,
      ErrorMessage: errorMessage,
      ...(
        status !== TRANSFER_STEP_STATUS.PENDING && !existing?.StartedAt
          ? { StartedAt: now }
          : {}
      ),
      CompletedAt: completed ? now : null,
    },
  });
}

export async function setTransferState(
  transferId,
  {
    status,
    currentStep,
    progress,
    errorMessage,
    cancelRequested,
    completed = false,
    data = {},
  }
) {
  return prisma.videoTransfer.update({
    where: { VideoTransferID: transferId },
    data: {
      ...data,
      ...(status ? { Status: status } : {}),
      ...(currentStep !== undefined ? { CurrentStep: currentStep } : {}),
      ...(progress !== undefined ? { Progress: clampProgress(progress) } : {}),
      ...(errorMessage !== undefined ? { ErrorMessage: errorMessage } : {}),
      ...(cancelRequested !== undefined ? { CancelRequested: cancelRequested } : {}),
      ...(completed ? { CompletedAt: new Date() } : {}),
    },
  });
}

export async function refreshTransferFileTotals(transferId) {
  const files = await prisma.videoTransferFile.findMany({
    where: { VideoTransferID: transferId },
    select: { Status: true, Size: true, BytesReceived: true },
  });

  const verified = files.filter(
    (file) => file.Status === TRANSFER_FILE_STATUS.VERIFIED
  );
  const transferredBytes = verified.reduce(
    (total, file) => total + BigInt(file.Size),
    0n
  );
  const totalBytes = files.reduce(
    (total, file) => total + BigInt(file.Size),
    0n
  );
  const progress =
    totalBytes > 0n
      ? Number((transferredBytes * 100n) / totalBytes)
      : files.length > 0 && verified.length === files.length
        ? 100
        : 0;

  return prisma.videoTransfer.update({
    where: { VideoTransferID: transferId },
    data: {
      TotalFiles: files.length,
      TransferredFiles: verified.length,
      TotalBytes: totalBytes,
      TransferredBytes: transferredBytes,
      ...(progress > 0 ? { Progress: progress } : {}),
    },
  });
}
