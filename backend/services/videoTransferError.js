export class VideoTransferError extends Error {
  constructor(
    message,
    {
      statusCode = 400,
      code = "VIDEO_TRANSFER_ERROR",
      cause,
    } = {}
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = "VideoTransferError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const asVideoTransferError = (
  error,
  fallbackMessage,
  fallbackCode = "VIDEO_TRANSFER_FAILED"
) => {
  if (error instanceof VideoTransferError) return error;
  return new VideoTransferError(fallbackMessage, {
    statusCode: 500,
    code: fallbackCode,
    cause: error,
  });
};

