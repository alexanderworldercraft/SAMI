import { parsePositiveInt } from "../utils/requestParsing.js";
import {
  authenticateVideoExportPassword,
  createVideoExportChallenge,
  getActiveSuperAdmin,
  verifyVideoExportChallenge,
} from "../services/videoExportAuthorization.js";
import {
  assertCloneTransferConfiguration,
  getVideoTransferPublicConfig,
} from "../services/videoTransferConfig.js";
import {
  cancelExportJob,
  createExportJob,
  getExportJob,
  getExportJobForVideo,
  getPrimaryPreflightForVideo,
  getPrimarySeasons,
  resumeExportJob,
} from "../services/videoExportJobService.js";
import { serializeTransferJob } from "../services/videoTransferSerializer.js";

const sendTransferError = (reply, error, fallbackMessage) => {
  const statusCode = Number(error?.statusCode);
  const safeStatus =
    Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599
      ? statusCode
      : 500;
  if (safeStatus >= 500) {
    console.error("[video-export]", error);
  }
  return reply.status(safeStatus).send({
    error: error?.message || fallbackMessage,
    ...(error?.code ? { code: error.code } : {}),
  });
};

const getRequestUserId = (request) => Number(request.user?.userId);

export const getVideoExportConfig = async (request, reply) => {
  try {
    await getActiveSuperAdmin(getRequestUserId(request));
    return reply.send(getVideoTransferPublicConfig());
  } catch (error) {
    return sendTransferError(
      reply,
      error,
      "Impossible de lire la configuration d'export."
    );
  }
};

export const authorizeVideoExport = async (request, reply) => {
  const videoId = parsePositiveInt(request.params?.videoId);
  if (!videoId) {
    return reply.status(400).send({ error: "VideoID invalide." });
  }

  try {
    const user = await authenticateVideoExportPassword({
      userId: getRequestUserId(request),
      currentPassword: request.body?.currentPassword,
    });
    assertCloneTransferConfiguration();
    const preflight = await getPrimaryPreflightForVideo({ videoId });
    const authorization = createVideoExportChallenge({
      userId: user.UtilisateurID,
      videoId,
    });

    return reply.send({
      challenge: authorization.challenge,
      expiresAt: authorization.expiresAt,
      principal: preflight.principal,
      genres: preflight.genres,
      selectedGenreIds: preflight.selectedGenreIds,
      missingGenreNames: preflight.missingGenreNames,
      series: preflight.series,
    });
  } catch (error) {
    return sendTransferError(
      reply,
      error,
      "Impossible d'autoriser l'export de la vidéo."
    );
  }
};

export const getPrimarySeriesSeasons = async (request, reply) => {
  const seriesId = parsePositiveInt(request.params?.seriesId);
  if (!seriesId) {
    return reply.status(400).send({ error: "SeriesID invalide." });
  }

  try {
    await getActiveSuperAdmin(getRequestUserId(request));
    assertCloneTransferConfiguration();
    const seasons = await getPrimarySeasons(seriesId);
    return reply.send({ seasons });
  } catch (error) {
    return sendTransferError(
      reply,
      error,
      "Impossible de récupérer les saisons du serveur principal."
    );
  }
};

export const startVideoExport = async (request, reply) => {
  const videoId = parsePositiveInt(request.params?.videoId);
  if (!videoId) {
    return reply.status(400).send({ error: "VideoID invalide." });
  }

  try {
    await getActiveSuperAdmin(getRequestUserId(request));
    assertCloneTransferConfiguration();
    const user = await verifyVideoExportChallenge({
      challenge: request.body?.challenge,
      requestUserId: getRequestUserId(request),
      videoId,
    });
    const destinationSeasonId =
      request.body?.destinationSeasonId === null
      || request.body?.destinationSeasonId === undefined
      || request.body?.destinationSeasonId === ""
        ? null
        : parsePositiveInt(request.body.destinationSeasonId);
    if (
      request.body?.destinationSeasonId !== null
      && request.body?.destinationSeasonId !== undefined
      && request.body?.destinationSeasonId !== ""
      && !destinationSeasonId
    ) {
      return reply.status(400).send({ error: "SaisonID de destination invalide." });
    }

    const rawGenreIds = request.body?.genreIds;
    if (!Array.isArray(rawGenreIds)) {
      return reply.status(400).send({ error: "genreIds doit être un tableau." });
    }
    const normalizedGenreIds = rawGenreIds.map((genreId) => Number(genreId));
    if (
      normalizedGenreIds.some(
        (genreId) => !Number.isInteger(genreId) || genreId <= 0
      )
    ) {
      return reply.status(400).send({
        error: "La sélection de genres est invalide.",
        code: "INVALID_DESTINATION_GENRES",
      });
    }
    const genreIds = Array.from(
      new Set(normalizedGenreIds)
    );

    const job = await createExportJob({
      videoId,
      destinationSeasonId,
      genreIds,
      user,
      request,
    });
    return reply.status(202).send({ job: serializeTransferJob(job) });
  } catch (error) {
    return sendTransferError(
      reply,
      error,
      "Impossible de démarrer l'export de la vidéo."
    );
  }
};

export const getVideoExportStatus = async (request, reply) => {
  try {
    await getActiveSuperAdmin(getRequestUserId(request));
    const job = await getExportJob(request.params?.transferId);
    if (!job) {
      return reply.status(404).send({ error: "Export introuvable." });
    }
    return reply.send({ job: serializeTransferJob(job) });
  } catch (error) {
    return sendTransferError(
      reply,
      error,
      "Impossible de récupérer l'état de l'export."
    );
  }
};

export const getVideoExportForVideo = async (request, reply) => {
  const videoId = parsePositiveInt(request.params?.videoId);
  if (!videoId) {
    return reply.status(400).send({ error: "VideoID invalide." });
  }

  try {
    await getActiveSuperAdmin(getRequestUserId(request));
    const job = await getExportJobForVideo(videoId);
    return reply.send({ job: job ? serializeTransferJob(job) : null });
  } catch (error) {
    return sendTransferError(
      reply,
      error,
      "Impossible de récupérer l'export associé à cette vidéo."
    );
  }
};

export const resumeVideoExport = async (request, reply) => {
  try {
    const user = await authenticateVideoExportPassword({
      userId: getRequestUserId(request),
      currentPassword: request.body?.currentPassword,
    });
    assertCloneTransferConfiguration();
    const job = await resumeExportJob({
      transferId: request.params?.transferId,
      user,
    });
    return reply.status(202).send({ job: serializeTransferJob(job) });
  } catch (error) {
    return sendTransferError(
      reply,
      error,
      "Impossible de reprendre l'export."
    );
  }
};

export const cancelVideoExport = async (request, reply) => {
  try {
    const user = await getActiveSuperAdmin(getRequestUserId(request));
    const job = await cancelExportJob({
      transferId: request.params?.transferId,
      user,
    });
    return reply.status(202).send({ job: serializeTransferJob(job) });
  } catch (error) {
    return sendTransferError(
      reply,
      error,
      "Impossible d'annuler l'export."
    );
  }
};
