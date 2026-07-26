import fs from "fs";
import path from "path";

import { ensureAdmin } from "../services/authz.js";
import { prisma } from "../services/db.js";
import {
  ADDVIDEO_DEDUPE_MS,
  VideoImportValidationError,
  addVideoDedupeCache,
  buildAddVideoProcessingVideoInfo,
  buildAudioTrackPlans,
  cleanupAddVideoTemp,
  getAudioStreams,
  getAutoLanguageGenreNames,
  getVideoStream,
  isDuplicateAddVideo,
  parseOptionalPositiveInt,
  parseRequestedGenreIds,
  selectPreferredAudioStream,
} from "../services/video/videoImportHelpers.js";
import { persistImportedVideo } from "../services/video/videoImportPersistenceService.js";
import {
  VideoTranscodingError,
  createVideoUploadWorkspace,
  extractVideoSubtitles,
  probeVideo,
  readVideoMultipart,
  transcodeVideoToHls,
} from "../services/video/videoTranscodingService.js";
import { generateVideoPreviewFramesFromMaster } from "../services/video/videoPreviewService.js";
import { generateVideoPreviewLiveFromMaster } from "../services/video/videoPreviewLiveService.js";
import {
  isMultipartFileTooLargeError,
  sendMultipartFileTooLarge,
} from "../utils/multipartErrors.js";
import {
  isContentPreviewActive,
  isMultiAudioActive,
  isPreviewLiveActive,
} from "./appSettingController.js";

const ensureVideoAdmin = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  return admin?.userId || null;
};

const getSaisonInfo = async (saisonId) => {
  if (!saisonId) return null;

  const saison = await prisma.saison.findUnique({
    where: { SaisonID: saisonId },
    select: {
      Numero: true,
      Series: {
        select: { Titre: true },
      },
    },
  });

  if (!saison) {
    throw new VideoImportValidationError("La saison sélectionnée est introuvable.");
  }

  return saison;
};

const emitConversionProgress = ({ io, processingId, video, profile, progress, completed, error }) => {
  io.emit("progress", {
    stage: "conversion",
    resolution: profile.label,
    status: error
      ? "conversion-error"
      : completed
        ? "conversion-completed"
        : "conversion",
    processingId,
    video,
    progress,
    ...(error ? { error: error.message } : {}),
  });
};

export const addVideo = async (request, reply, fastify) => {
  let workspace = null;
  let dedupeKey = null;

  try {
    const adminUserId = await ensureVideoAdmin(request, reply);
    if (!adminUserId) return;

    const multiAudioEnabled = await isMultiAudioActive();
    const processingId = `addvideo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    workspace = createVideoUploadWorkspace();

    const { data, videoTempPath } = await readVideoMultipart({
      request,
      io: fastify.io,
      processingId,
      workspace,
    });

    if (!data.titre) {
      throw new VideoImportValidationError("Le titre est obligatoire.");
    }
    if (!videoTempPath) {
      throw new VideoImportValidationError("Aucun fichier vidéo fourni.");
    }

    data.utilisateurID = adminUserId;
    data.SaisonID = parseOptionalPositiveInt(
      data.SaisonID ?? data.saisonID ?? data.saisonId,
      "SaisonID"
    );
    const requestedGenreIds = parseRequestedGenreIds(data.genres);

    const videoFileSize = String(fs.statSync(videoTempPath).size);
    dedupeKey = [
      adminUserId,
      data.videoOriginalName || path.basename(videoTempPath),
      videoFileSize,
    ].join("|");

    const dedupeResult = isDuplicateAddVideo(
      dedupeKey,
      { saisonId: data.SaisonID },
      ADDVIDEO_DEDUPE_MS
    );
    if (data.SaisonID == null && dedupeResult.saisonId != null) {
      data.SaisonID = parseOptionalPositiveInt(dedupeResult.saisonId, "SaisonID");
    }
    if (dedupeResult.duplicate) {
      return reply.send({ ok: true, deduped: true });
    }

    let saisonInfo = await getSaisonInfo(data.SaisonID);
    const metadata = await probeVideo(videoTempPath);
    const subtitleStreams = (metadata.streams || []).filter(
      (stream) => stream.codec_type === "subtitle"
    );
    const subtitleInfos = await extractVideoSubtitles({
      videoPath: videoTempPath,
      subtitleStreams,
      outputDir: workspace.subtitlesDir,
    });
    const audioStream = selectPreferredAudioStream(metadata);
    const audioStreams = getAudioStreams(metadata);
    const audioTracks = buildAudioTrackPlans(audioStreams, audioStream);
    const videoStream = getVideoStream(metadata);

    if (!audioStream) {
      throw new VideoImportValidationError("Aucune piste audio disponible dans le fichier.");
    }
    if (!videoStream) {
      throw new VideoImportValidationError("Aucun flux vidéo disponible dans le fichier.");
    }

    const videoDuration = Number(videoStream.duration);
    for (const track of audioTracks) {
      const audioDuration = Number(track.stream.duration);
      if (
        Number.isFinite(audioDuration)
        && Number.isFinite(videoDuration)
        && Math.abs(audioDuration - videoDuration) > 2
      ) {
        console.warn(
          `[addVideo] Désynchronisation potentielle pour la piste audio ${track.label}.`
        );
      }
    }

    const processingVideoInfo = buildAddVideoProcessingVideoInfo({
      data,
      processingId,
      audioStream,
      audioTracks: multiAudioEnabled ? audioTracks : [],
      subtitleInfos,
      saison: saisonInfo,
    });

    fastify.io.emit("progress", {
      stage: "analysis",
      status: "metadata",
      processingId,
      video: processingVideoInfo,
      progress: 100,
    });

    const transcodingResult = await transcodeVideoToHls({
      videoPath: videoTempPath,
      metadata,
      videoStream,
      audioStream,
      audioTracks,
      multiAudioEnabled,
      outputDir: workspace.hlsDir,
      title: data.titre,
      onProgress: ({ profile, progress, completed, error }) =>
        emitConversionProgress({
          io: fastify.io,
          processingId,
          video: processingVideoInfo,
          profile,
          progress,
          completed,
          error,
        }),
    });
    const autoLanguageGenreNames = getAutoLanguageGenreNames({
      audioStream,
      subtitleStreams,
      multiAudio: transcodingResult.multiAudio,
    });

    const cachedSaisonId = addVideoDedupeCache.get(dedupeKey)?.saisonId;
    if (data.SaisonID == null && cachedSaisonId != null) {
      data.SaisonID = parseOptionalPositiveInt(cachedSaisonId, "SaisonID");
      saisonInfo = await getSaisonInfo(data.SaisonID);
    }

    const { video: updatedVideo, finalHlsDir } = await persistImportedVideo({
      data,
      adminUserId,
      hlsDir: workspace.hlsDir,
      subtitleInfos,
      audioTrackInfos: transcodingResult.audioTracks,
      requestedGenreIds,
      autoLanguageGenreNames,
    });

    try {
      if (await isContentPreviewActive()) {
        await generateVideoPreviewFramesFromMaster({
          videoId: updatedVideo.VideoID,
          masterPlaylistPath: path.join(finalHlsDir, "master.m3u8"),
        });
      }
    } catch (error) {
      console.warn(
        `[addVideo] Prévisualisation non générée pour la vidéo ${updatedVideo.VideoID} :`,
        error.message
      );
    }

    try {
      if (await isPreviewLiveActive()) {
        await generateVideoPreviewLiveFromMaster({
          videoId: updatedVideo.VideoID,
          masterPlaylistPath: path.join(finalHlsDir, "master.m3u8"),
        });
      }
    } catch (error) {
      console.warn(
        `[addVideo] Preview Live non générée pour la vidéo ${updatedVideo.VideoID} :`,
        error.message
      );
    }

    fastify.io.emit("progress", {
      stage: "completed",
      status: "completed",
      processingId,
      video: {
        ...processingVideoInfo,
        saisonNumero: saisonInfo?.Numero ?? processingVideoInfo.saisonNumero,
        seriesTitre: saisonInfo?.Series?.Titre ?? processingVideoInfo.seriesTitre,
        videoId: updatedVideo.VideoID,
      },
      progress: 100,
    });

    return reply.send({
      message: "Vidéo ajoutée avec succès.",
      video: updatedVideo,
    });
  } catch (error) {
    if (dedupeKey) addVideoDedupeCache.delete(dedupeKey);
    if (isMultipartFileTooLargeError(error)) return sendMultipartFileTooLarge(reply);
    if (error instanceof VideoImportValidationError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }
    if (error instanceof VideoTranscodingError) {
      return reply.code(500).send({
        error: error.message,
        reference: error.reference,
        // Compatibilité avec les clients qui affichaient déjà ce champ.
        logPath: error.reference,
      });
    }

    console.error("[addVideo] Erreur lors du traitement :", error);
    return reply.code(500).send({ error: "Erreur lors du traitement de la vidéo." });
  } finally {
    cleanupAddVideoTemp([workspace?.root]);
  }
};
