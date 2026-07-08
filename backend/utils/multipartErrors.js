export function isMultipartFileTooLargeError(error) {
  return error?.statusCode === 413
    || error?.code === "FST_REQ_FILE_TOO_LARGE"
    || /file size/i.test(error?.message || "");
}

export function sendMultipartFileTooLarge(reply) {
  return reply.status(413).send({ error: "Fichier trop volumineux." });
}
