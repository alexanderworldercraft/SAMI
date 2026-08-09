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
  const isProfileLabelStorageError = error?.code === "P2000"
    && String(error?.meta?.column_name || error?.meta?.columnName || "")
      .toLowerCase() === "profilelabel";
  const normalizedError = isProfileLabelStorageError
    ? new DistributedEncodingError(
      "Le job n'a pas pu être créé car le libellé technique d'une tâche "
        + "d'encodage dépasse la taille acceptée par la base de données.",
      {
        statusCode: 500,
        code: "VIDEO_ENCODING_TASK_PROFILE_LABEL_STORAGE_ERROR",
        retryable: false,
        cause: error,
      }
    )
    : error;
  const rawStatus = Number(normalizedError?.statusCode);
  const statusCode =
    Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599
      ? rawStatus
      : 500;

  if (statusCode >= 500) {
    console.error("[distributed-encoding]", error);
  }

  return reply.status(statusCode).send({
    error: normalizedError?.message || fallbackMessage,
    ...(normalizedError?.code ? { code: normalizedError.code } : {}),
    ...(typeof normalizedError?.retryable === "boolean"
      ? { retryable: normalizedError.retryable }
      : {}),
  });
};
