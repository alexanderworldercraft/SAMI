const jsonValue = (value) => {
  if (value === undefined || value === null) return value ?? null;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, jsonValue(nested)])
    );
  }
  return value;
};

export const serializeTransferStep = (step) => ({
  id: step.VideoTransferStepID?.toString?.() || String(step.VideoTransferStepID),
  key: step.StepKey,
  label: step.Label,
  statusLabel: step.StatusLabel,
  progress: step.Progress,
  status: step.Status,
  error: step.ErrorMessage || null,
  startedAt: step.StartedAt || null,
  completedAt: step.CompletedAt || null,
  createdAt: step.CreatedAt,
  updatedAt: step.UpdatedAt,
});

export const serializeTransferJob = (transfer) => jsonValue({
  id: transfer.VideoTransferID,
  direction: transfer.Direction,
  sourceInstanceId: transfer.SourceInstanceID,
  sourceVideoId: transfer.SourceVideoID,
  destinationVideoId: transfer.DestinationVideoID,
  destinationSeasonId: transfer.DestinationSeasonID,
  initiatedByUserId: transfer.InitiatedByUserID,
  initiatedByNickname: transfer.InitiatedByNickname,
  remoteTransferId: transfer.RemoteTransferID,
  manifestHash: transfer.ManifestHash,
  status: transfer.Status,
  currentStep: transfer.CurrentStep,
  progress: transfer.Progress,
  totalFiles: transfer.TotalFiles,
  transferredFiles: transfer.TransferredFiles,
  totalBytes: transfer.TotalBytes,
  transferredBytes: transfer.TransferredBytes,
  cancelRequested: transfer.CancelRequested,
  resumeCount: transfer.ResumeCount,
  error: transfer.ErrorMessage,
  warnings: transfer.Warnings || [],
  receipt: transfer.Receipt || null,
  startedAt: transfer.StartedAt,
  completedAt: transfer.CompletedAt,
  createdAt: transfer.CreatedAt,
  updatedAt: transfer.UpdatedAt,
  canResume:
    transfer.Status === "FAILED"
    || (
      transfer.Status === "FINALIZING"
      && Boolean(transfer.ErrorMessage)
    ),
  canCancel: ![
    "FINALIZING",
    "COMPLETED",
    "CANCEL_REQUESTED",
    "CANCELLED",
  ].includes(transfer.Status),
  steps: (transfer.Steps || []).map(serializeTransferStep),
});
