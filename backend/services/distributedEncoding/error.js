export class DistributedEncodingError extends Error {
  constructor(
    message,
    {
      statusCode = 400,
      code = "DISTRIBUTED_ENCODING_ERROR",
      retryable = false,
      cause,
    } = {}
  ) {
    super(message, cause ? { cause } : undefined);
    this.name = "DistributedEncodingError";
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
  }
}

export const distributedEncodingError = (
  message,
  code,
  statusCode = 400,
  options = {}
) =>
  new DistributedEncodingError(message, {
    ...options,
    code,
    statusCode,
  });

export const toDistributedEncodingHttpError = (
  reply,
  error,
  fallbackMessage = "Le traitement distribué a échoué."
) => {
  const rawStatus = Number(error?.statusCode);
  const statusCode =
    Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599
      ? rawStatus
      : 500;

  if (statusCode >= 500) {
    console.error("[distributed-encoding]", error);
  }

  return reply.status(statusCode).send({
    error: error?.message || fallbackMessage,
    ...(error?.code ? { code: error.code } : {}),
    ...(typeof error?.retryable === "boolean"
      ? { retryable: error.retryable }
      : {}),
  });
};
