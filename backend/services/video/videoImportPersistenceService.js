import fs from "fs";
import path from "path";

import { ETAT } from "../../constants.js";
import { prisma } from "../db.js";
import { VIDEO_TRANSFER_BLOCK_MARKER } from "../videoTransferConfig.js";
import { VIDEO_ROOT } from "./videoPaths.js";
import { ensureGenreIdsByNames } from "./videoImportHelpers.js";

const toStoragePath = (...segments) => path.posix.join(...segments.map(String));

const reservedVideoData = ({ data, adminUserId }) => ({
  Titre: data.titre,
  Resumer: data.resumer || null,
  CheminAcces: toStoragePath("uploads", "video", "pending", "master.m3u8"),
  CheminImage: "",
  EtatID: ETAT.BLOCKED,
  SaisonID: data.SaisonID,
  UtilisateurID: adminUserId,
});

const writeReservationMarker = ({ videoId, videoRoot = VIDEO_ROOT }) => {
  const finalVideoDir = path.join(videoRoot, String(videoId));
  fs.mkdirSync(finalVideoDir, { recursive: true });
  fs.writeFileSync(
    path.join(finalVideoDir, VIDEO_TRANSFER_BLOCK_MARKER),
    "SAMI distributed import publication in progress\n",
    { flag: "wx" }
  );
  return finalVideoDir;
};

const moveFileIfNeeded = (sourcePath, destinationPath) => {
  const sourceExists = Boolean(sourcePath && fs.existsSync(sourcePath));
  const destinationExists = fs.existsSync(destinationPath);
  if (sourceExists && destinationExists) {
    throw new Error(`La destination ${destinationPath} existe déjà.`);
  }
  if (sourceExists) fs.renameSync(sourcePath, destinationPath);
  if (!sourceExists && !destinationExists) {
    throw new Error(`Le fichier temporaire ${sourcePath || "(inconnu)"} est introuvable.`);
  }
};

const moveImportedFiles = ({
  videoId,
  hlsDir,
  imageTempPath,
  imageExtension,
  subtitleInfos,
  audioTrackInfos,
}) => {
  const finalVideoDir = path.join(VIDEO_ROOT, String(videoId));
  const finalHlsDir = path.join(finalVideoDir, "hls");
  const finalSubtitleDir = path.join(finalVideoDir, "sousTitre");
  const finalPosterDir = path.join(finalVideoDir, "affiche");

  fs.mkdirSync(finalVideoDir, { recursive: true });
  const sourceHlsExists = Boolean(hlsDir && fs.existsSync(hlsDir));
  const finalHlsExists = fs.existsSync(finalHlsDir);
  if (sourceHlsExists && finalHlsExists) {
    throw new Error("Le dossier HLS final existe déjà.");
  }
  if (sourceHlsExists) fs.renameSync(hlsDir, finalHlsDir);
  if (!sourceHlsExists && !finalHlsExists) {
    throw new Error("Le dossier HLS temporaire est introuvable.");
  }

  const subtitles = [];
  if (subtitleInfos.length > 0) {
    fs.mkdirSync(finalSubtitleDir, { recursive: true });
    for (const subtitle of subtitleInfos) {
      const finalPath = path.join(finalSubtitleDir, subtitle.filename);
      moveFileIfNeeded(subtitle.tempPath, finalPath);
      subtitles.push({
        label: subtitle.label,
        language: subtitle.language || null,
        type: subtitle.type || "FULL",
        path: toStoragePath(
          "uploads",
          "video",
          videoId,
          "sousTitre",
          subtitle.filename
        ),
      });
    }
  }

  const audioTracks = audioTrackInfos.map((track) => ({
    ...track,
    path: toStoragePath(
      "uploads",
      "video",
      videoId,
      "hls",
      String(track.relativePlaylist).replace(/\\/g, "/")
    ),
  }));

  let posterPath = "";
  if (imageTempPath) {
    fs.mkdirSync(finalPosterDir, { recursive: true });
    const extension = imageExtension || path.extname(imageTempPath) || ".png";
    const filename = `affiche${extension}`;
    moveFileIfNeeded(imageTempPath, path.join(finalPosterDir, filename));
    posterPath = toStoragePath("uploads", "video", videoId, "affiche", filename);
  }

  return {
    finalVideoDir,
    finalHlsDir,
    masterPlaylistStoragePath: toStoragePath(
      "uploads",
      "video",
      videoId,
      "hls",
      "master.m3u8"
    ),
    posterPath,
    subtitles,
    audioTracks,
  };
};

export async function reserveImportedVideo({
  data,
  adminUserId,
  database = prisma,
  videoRoot = VIDEO_ROOT,
}) {
  const video = await database.video.create({
    data: reservedVideoData({ data, adminUserId }),
  });

  const finalVideoDir = path.join(videoRoot, String(video.VideoID));
  try {
    writeReservationMarker({ videoId: video.VideoID, videoRoot });
  } catch (error) {
    await database.video.delete({ where: { VideoID: video.VideoID } }).catch(() => {});
    fs.rmSync(finalVideoDir, { recursive: true, force: true });
    throw error;
  }

  return video;
}

/**
 * Crée la vidéo bloquée et la rattache au job dans le même commit. Un crash
 * avant le marqueur disque laisse ainsi une relation récupérable par la
 * maintenance, jamais une ligne Video orpheline impossible à attribuer.
 */
export async function reserveImportedVideoForEncodingJob({
  data,
  adminUserId,
  jobId,
  database = prisma,
  videoRoot = VIDEO_ROOT,
}) {
  const normalizedJobId = String(jobId || "").trim();
  if (!normalizedJobId) throw new TypeError("jobId est requis.");

  const video = await database.$transaction(async (transaction) => {
    const created = await transaction.video.create({
      data: reservedVideoData({ data, adminUserId }),
    });
    const linked = await transaction.videoEncodingJob.updateMany({
      where: {
        VideoEncodingJobID: normalizedJobId,
        Status: "PLANNING",
        VideoID: null,
      },
      data: { VideoID: created.VideoID },
    });
    if (linked.count !== 1) {
      throw new Error("Le job d'encodage n'est plus réservable.");
    }
    return created;
  });

  const finalVideoDir = path.join(videoRoot, String(video.VideoID));
  try {
    writeReservationMarker({ videoId: video.VideoID, videoRoot });
  } catch (error) {
    await database.$transaction(async (transaction) => {
      await transaction.videoEncodingJob.updateMany({
        where: {
          VideoEncodingJobID: normalizedJobId,
          VideoID: video.VideoID,
          Status: "PLANNING",
        },
        data: { VideoID: null },
      });
      await transaction.video.deleteMany({
        where: { VideoID: video.VideoID, EtatID: ETAT.BLOCKED },
      });
    }).catch(() => {});
    fs.rmSync(finalVideoDir, { recursive: true, force: true });
    throw error;
  }

  return video;
}

export async function cleanupReservedImportedVideo(videoId) {
  const parsedVideoId = Number(videoId);
  if (!Number.isInteger(parsedVideoId) || parsedVideoId <= 0) return;
  const deleted = await prisma.video.deleteMany({
    where: {
      VideoID: parsedVideoId,
      EtatID: ETAT.BLOCKED,
    },
  });
  if (deleted.count === 0) {
    const current = await prisma.video.findUnique({
      where: { VideoID: parsedVideoId },
      select: { EtatID: true },
    });
    if (current) {
      throw new Error(
        "La vidéo réservée n'est plus bloquée et ne peut pas être supprimée."
      );
    }
  }
  fs.rmSync(path.join(VIDEO_ROOT, String(parsedVideoId)), {
    recursive: true,
    force: true,
  });
}

export async function finalizeReservedImportedVideo({
  videoId,
  hlsDir,
  subtitleInfos,
  audioTrackInfos = [],
  genreIds,
  imageTempPath,
  imageExtension,
}) {
  const parsedVideoId = Number(videoId);
  if (!Number.isInteger(parsedVideoId) || parsedVideoId <= 0) {
    throw new Error("VideoID réservé invalide.");
  }

  const importedFiles = moveImportedFiles({
    videoId: parsedVideoId,
    hlsDir,
    imageTempPath,
    imageExtension,
    subtitleInfos,
    audioTrackInfos,
  });

  const updatedVideo = await prisma.$transaction(async (transaction) => {
    const current = await transaction.video.findUnique({
      where: { VideoID: parsedVideoId },
      select: { EtatID: true },
    });
    if (!current) throw new Error("La vidéo réservée est introuvable.");

    await transaction.videoGenre.deleteMany({ where: { VideoID: parsedVideoId } });
    await transaction.videoSubtitle.deleteMany({ where: { VideoID: parsedVideoId } });
    await transaction.videoAudioTrack.deleteMany({ where: { VideoID: parsedVideoId } });

    if (genreIds.length > 0) {
      await transaction.videoGenre.createMany({
        data: genreIds.map((GenreID) => ({ VideoID: parsedVideoId, GenreID })),
        skipDuplicates: true,
      });
    }
    if (importedFiles.subtitles.length > 0) {
      await transaction.videoSubtitle.createMany({
        data: importedFiles.subtitles.map((subtitle, index) => ({
          Label: subtitle.label || `Subtitle ${index + 1}`,
          CheminSubtitle: subtitle.path,
          Language: subtitle.language || null,
          Type: subtitle.type || "FULL",
          Origin: "IMPORTED",
          VideoID: parsedVideoId,
        })),
      });
    }
    if (importedFiles.audioTracks.length > 0) {
      await transaction.videoAudioTrack.createMany({
        data: importedFiles.audioTracks.map((track) => ({
          Label: track.label,
          Language: track.language === "und" ? null : track.language,
          CheminPlaylist: track.path,
          IsDefault: track.isDefault,
          Ordre: track.order,
          VideoID: parsedVideoId,
        })),
      });
    }

    return transaction.video.update({
      where: { VideoID: parsedVideoId },
      data: {
        CheminAcces: importedFiles.masterPlaylistStoragePath,
        CheminImage: importedFiles.posterPath,
        EtatID: ETAT.ACTIVE,
      },
    });
  });

  fs.rmSync(
    path.join(importedFiles.finalVideoDir, VIDEO_TRANSFER_BLOCK_MARKER),
    { force: true }
  );

  return { video: updatedVideo, finalHlsDir: importedFiles.finalHlsDir };
}

export async function persistImportedVideo({
  data,
  adminUserId,
  hlsDir,
  subtitleInfos,
  audioTrackInfos = [],
  requestedGenreIds,
  autoLanguageGenreNames,
}) {
  const autoGenreIds = await ensureGenreIdsByNames(autoLanguageGenreNames);
  const genreIds = Array.from(new Set([...requestedGenreIds, ...autoGenreIds]));
  let createdVideo = null;

  try {
    createdVideo = await reserveImportedVideo({ data, adminUserId });
    return finalizeReservedImportedVideo({
      videoId: createdVideo.VideoID,
      hlsDir,
      subtitleInfos,
      audioTrackInfos,
      genreIds,
      imageTempPath: data.imageTempPath,
      imageExtension: data.imageTempExt,
    });
  } catch (error) {
    if (createdVideo?.VideoID) {
      await cleanupReservedImportedVideo(createdVideo.VideoID);
    }
    throw error;
  }
}
