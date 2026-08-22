export class AiSubtitleError extends Error {
  constructor(message, { code = "AI_SUBTITLE_ERROR", statusCode = 500, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "AiSubtitleError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const aiSubtitleError = (message, code, statusCode = 500, cause) =>
  new AiSubtitleError(message, { code, statusCode, cause });

export const sendAiSubtitleError = (reply, error, fallback) => {
  const status = Number(error?.statusCode);
  return reply.status(Number.isInteger(status) ? status : 500).send({
    error: error?.message || fallback,
    ...(error?.code ? { code: error.code } : {}),
  });
};
