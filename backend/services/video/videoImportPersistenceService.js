import fs from "fs";
import path from "path";

import { ETAT } from "../../constants.js";
import { prisma } from "../db.js";
import { VIDEO_ROOT } from "./videoPaths.js";
import { ensureGenreIdsByNames } from "./videoImportHelpers.js";

const toStoragePath = (...segments) => path.posix.join(...segments.map(String));

const moveImportedFiles = ({
  videoId,
  hlsDir,
  imageTempPath,
  imageExtension,
  subtitleInfos,
}) => {
  const finalVideoDir = path.join(VIDEO_ROOT, String(videoId));
  const finalHlsDir = path.join(finalVideoDir, "hls");
  const finalSubtitleDir = path.join(finalVideoDir, "sousTitre");
  const finalPosterDir = path.join(finalVideoDir, "affiche");

  fs.mkdirSync(finalVideoDir, { recursive: true });
  fs.renameSync(hlsDir, finalHlsDir);

  const subtitles = [];
  if (subtitleInfos.length > 0) {
    fs.mkdirSync(finalSubtitleDir, { recursive: true });
    for (const subtitle of subtitleInfos) {
      const finalPath = path.join(finalSubtitleDir, subtitle.filename);
      fs.renameSync(subtitle.tempPath, finalPath);
      subtitles.push({
        label: subtitle.label,
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

  let posterPath = "";
  if (imageTempPath) {
    fs.mkdirSync(finalPosterDir, { recursive: true });
    const extension = imageExtension || path.extname(imageTempPath) || ".png";
    const filename = `affiche${extension}`;
    fs.renameSync(imageTempPath, path.join(finalPosterDir, filename));
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
  };
};

export async function persistImportedVideo({
  data,
  adminUserId,
  hlsDir,
  subtitleInfos,
  requestedGenreIds,
  autoLanguageGenreNames,
}) {
  const autoGenreIds = await ensureGenreIdsByNames(autoLanguageGenreNames);
  const genreIds = Array.from(new Set([...requestedGenreIds, ...autoGenreIds]));
  let createdVideo = null;
  let importedFiles = null;

  try {
    createdVideo = await prisma.video.create({
      data: {
        Titre: data.titre,
        Resumer: data.resumer || null,
        CheminAcces: toStoragePath("uploads", "video", "pending", "master.m3u8"),
        CheminImage: "",
        // La vidéo ne devient visible qu'une fois les fichiers et relations finalisés.
        EtatID: ETAT.BLOCKED,
        SaisonID: data.SaisonID,
        UtilisateurID: adminUserId,
      },
    });

    importedFiles = moveImportedFiles({
      videoId: createdVideo.VideoID,
      hlsDir,
      imageTempPath: data.imageTempPath,
      imageExtension: data.imageTempExt,
      subtitleInfos,
    });

    const updatedVideo = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.video.update({
        where: { VideoID: createdVideo.VideoID },
        data: {
          CheminAcces: importedFiles.masterPlaylistStoragePath,
          CheminImage: importedFiles.posterPath,
          EtatID: ETAT.ACTIVE,
        },
      });

      if (genreIds.length > 0) {
        await transaction.videoGenre.createMany({
          data: genreIds.map((GenreID) => ({
            VideoID: createdVideo.VideoID,
            GenreID,
          })),
          skipDuplicates: true,
        });
      }

      if (importedFiles.subtitles.length > 0) {
        await transaction.videoSubtitle.createMany({
          data: importedFiles.subtitles.map((subtitle, index) => ({
            Label: subtitle.label || `Subtitle ${index + 1}`,
            CheminSubtitle: subtitle.path,
            VideoID: createdVideo.VideoID,
          })),
        });
      }

      return updated;
    });

    return {
      video: updatedVideo,
      finalHlsDir: importedFiles.finalHlsDir,
    };
  } catch (error) {
    if (createdVideo?.VideoID) {
      await prisma.video.delete({
        where: { VideoID: createdVideo.VideoID },
      }).catch(() => {});
    }
    if (createdVideo?.VideoID) {
      fs.rmSync(path.join(VIDEO_ROOT, String(createdVideo.VideoID)), {
        recursive: true,
        force: true,
      });
    }
    throw error;
  }
}
