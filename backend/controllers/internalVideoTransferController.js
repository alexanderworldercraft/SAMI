import { parsePositiveInt } from "../utils/requestParsing.js";
import {
  cancelImportSession,
  createImportSession,
  finalizeImportSession,
  getImportSession,
  getPrimaryCapabilities,
  getPrimaryGenres,
  getPrimarySeries,
  getPrimarySeriesSeasons,
  receiveImportFile,
  verifyImportSession,
} from "../services/videoImportTransferService.js";
import { serializeTransferJob } from "../services/videoTransferSerializer.js";

const sendInternalError = (reply, error, fallbackMessage) => {
  const statusCode = Number(error?.statusCode);
  const safeStatus =
    Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599
      ? statusCode
      : 500;
  if (safeStatus >= 500) {
    console.error("[internal-video-transfer]", error);
  }
  return reply.status(safeStatus).send({
    error: error?.message || fallbackMessage,
    ...(error?.code ? { code: error.code } : {}),
  });
};

export const getInternalCapabilities = async (_request, reply) => {
  try {
    return reply.send(await getPrimaryCapabilities());
  } catch (error) {
    return sendInternalError(
      reply,
      error,
      "Le serveur principal n'est pas prêt à recevoir un transfert."
    );
  }
};

export const getInternalGenres = async (_request, reply) => {
  try {
    return reply.send({ genres: await getPrimaryGenres() });
  } catch (error) {
    return sendInternalError(reply, error, "Impossible de récupérer les genres.");
  }
};

export const getInternalSeries = async (_request, reply) => {
  try {
    return reply.send({ series: await getPrimarySeries() });
  } catch (error) {
    return sendInternalError(reply, error, "Impossible de récupérer les séries.");
  }
};

export const getInternalSeriesSeasons = async (request, reply) => {
  const seriesId = parsePositiveInt(request.params?.seriesId);
  if (!seriesId) {
    return reply.status(400).send({ error: "SeriesID invalide." });
  }

  try {
    return reply.send({
      seasons: await getPrimarySeriesSeasons(seriesId),
    });
  } catch (error) {
    return sendInternalError(reply, error, "Impossible de récupérer les saisons.");
  }
};

export const createInternalVideoTransferSession = async (request, reply) => {
  try {
    const result = await createImportSession({
      payload: request.body,
      sourceInstanceId: request.transferAuth?.sourceInstanceId,
      request,
    });
    return reply.status(result.created ? 201 : 200).send({
      created: result.created,
      transfer: serializeTransferJob(result.transfer),
      files: result.files,
    });
  } catch (error) {
    return sendInternalError(
      reply,
      error,
      "Impossible de créer la session d'import."
    );
  }
};

export const getInternalVideoTransferStatus = async (request, reply) => {
  try {
    const transfer = await getImportSession({
      transferId: request.params?.transferId,
      sourceInstanceId: request.transferAuth?.sourceInstanceId,
    });
    if (!transfer) {
      return reply.status(404).send({ error: "Transfert introuvable." });
    }
    return reply.send({ transfer: serializeTransferJob(transfer) });
  } catch (error) {
    return sendInternalError(
      reply,
      error,
      "Impossible de récupérer la session d'import."
    );
  }
};

export const uploadInternalVideoTransferFile = async (request, reply) => {
  try {
    const contentLengthHeader = request.headers["content-length"];
    const contentLength =
      contentLengthHeader === undefined
        ? null
        : Number(contentLengthHeader);
    const result = await receiveImportFile({
      transferId: request.params?.transferId,
      fileId: request.params?.fileId,
      sourceInstanceId: request.transferAuth?.sourceInstanceId,
      stream: request.raw,
      declaredBodyDigest: request.transferAuth?.bodySha256,
      declaredContentLength: contentLength,
      request,
    });
    return reply.send(result);
  } catch (error) {
    return sendInternalError(
      reply,
      error,
      "Impossible de recevoir le fichier."
    );
  }
};

export const verifyInternalVideoTransfer = async (request, reply) => {
  try {
    const transfer = await verifyImportSession({
      transferId: request.params?.transferId,
      sourceInstanceId: request.transferAuth?.sourceInstanceId,
      request,
    });
    return reply.send({ transfer: serializeTransferJob(transfer) });
  } catch (error) {
    return sendInternalError(
      reply,
      error,
      "La vérification du transfert a échoué."
    );
  }
};

export const finalizeInternalVideoTransfer = async (request, reply) => {
  try {
    const transfer = await finalizeImportSession({
      transferId: request.params?.transferId,
      sourceInstanceId: request.transferAuth?.sourceInstanceId,
      request,
    });
    return reply.send({ transfer: serializeTransferJob(transfer) });
  } catch (error) {
    return sendInternalError(
      reply,
      error,
      "La finalisation du transfert a échoué."
    );
  }
};

export const cancelInternalVideoTransfer = async (request, reply) => {
  try {
    const transfer = await cancelImportSession({
      transferId: request.params?.transferId,
      sourceInstanceId: request.transferAuth?.sourceInstanceId,
      request,
    });
    return reply.send({ transfer: serializeTransferJob(transfer) });
  } catch (error) {
    return sendInternalError(
      reply,
      error,
      "L'annulation du transfert a échoué."
    );
  }
};
