import fs from "fs";

import { prisma } from "../services/db.js";
import {
  createFileStreamResponse,
  getVideoMediaAccess,
  isAiAudioFile,
  isPrivateAiDubbingArtifact,
  resolveMusicFile,
  resolveProtectedVideoFile,
  resolveProtectedVideoStorageFile,
  rewriteProtectedPlaylist,
} from "../services/protectedMediaService.js";

const sendAccessError = (reply, error) =>
  reply.status(error.statusCode).send({ error: error.message });

const sendStream = (request, reply, filePath, { noStore = false } = {}) => {
  if (!filePath || !fs.existsSync(filePath)) {
    return reply.status(404).send({ error: "Fichier introuvable." });
  }
  const response = createFileStreamResponse(filePath, request.headers.range);
  if (!response) return reply.status(404).send({ error: "Fichier introuvable." });

  reply
    .status(response.statusCode)
    .header("Content-Type", response.contentType)
    .header("Accept-Ranges", "bytes")
    .header("Content-Length", response.contentLength)
    .header("Cache-Control", noStore ? "private, no-store" : "private, max-age=60");
  if (response.contentRange) reply.header("Content-Range", response.contentRange);
  if (!response.stream) return reply.send();
  return reply.send(response.stream);
};

const getAccess = async (request, reply) => {
  const access = await getVideoMediaAccess(request.params.videoId, request.user?.userId);
  if (access.error) {
    sendAccessError(reply, access.error);
    return null;
  }
  return access;
};

export const protectedMediaController = {
  async master(request, reply) {
    const access = await getAccess(request, reply);
    if (!access) return;
    const resolvedMaster = resolveProtectedVideoStorageFile(
      access.video.VideoID,
      access.video.CheminAcces
    );
    const masterPath = resolvedMaster?.absolutePath;
    if (!masterPath || !fs.existsSync(masterPath)) {
      return reply.status(404).send({ error: "Playlist HLS introuvable." });
    }
    const relativePath = resolvedMaster.relativePath;
    const content = rewriteProtectedPlaylist({
      videoId: access.video.VideoID,
      playlistRelativePath: relativePath,
      content: fs.readFileSync(masterPath, "utf8"),
      audioTracks: access.video.VideoAudioTracks,
      aiFeaturesAccepted: access.aiFeaturesAccepted && request.query?.originalOnly !== "1",
    });
    return reply
      .header("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8")
      .header("Cache-Control", "private, no-store")
      .send(content);
  },

  async file(request, reply) {
    const access = await getAccess(request, reply);
    if (!access) return;
    const resolved = resolveProtectedVideoFile({
      videoId: access.video.VideoID,
      relativePath: request.params["*"],
    });
    if (!resolved || !fs.existsSync(resolved.absolutePath)) {
      return reply.status(404).send({ error: "Fichier introuvable." });
    }
    if (isPrivateAiDubbingArtifact(resolved.relativePath)) {
      return reply.status(404).send({ error: "Fichier introuvable." });
    }
    const aiFile = isAiAudioFile(resolved.relativePath, access.video.VideoAudioTracks);
    if (aiFile && !access.aiFeaturesAccepted) {
      return reply.status(403).send({
        error: "Vous avez choisi de ne pas accéder aux fonctionnalités IA de SAMI.",
        code: "AI_FEATURES_NOT_ACCEPTED",
      });
    }
    if (/\.m3u8$/i.test(resolved.absolutePath)) {
      const content = rewriteProtectedPlaylist({
        videoId: access.video.VideoID,
        playlistRelativePath: resolved.relativePath,
        content: fs.readFileSync(resolved.absolutePath, "utf8"),
        audioTracks: access.video.VideoAudioTracks,
        aiFeaturesAccepted: access.aiFeaturesAccepted,
      });
      return reply
        .header("Content-Type", "application/vnd.apple.mpegurl; charset=utf-8")
        .header("Cache-Control", "private, no-store")
        .send(content);
    }
    return sendStream(request, reply, resolved.absolutePath, { noStore: aiFile });
  },

  async subtitle(request, reply) {
    const access = await getAccess(request, reply);
    if (!access) return;
    const subtitleId = Number(request.params.subtitleId);
    const subtitle = await prisma.videoSubtitle.findFirst({
      where: { VideoSubtitleID: subtitleId, VideoID: access.video.VideoID },
    });
    if (!subtitle) return reply.status(404).send({ error: "Sous-titre introuvable." });
    if (subtitle.Origin === "AI" && !access.aiFeaturesAccepted) {
      return reply.status(403).send({
        error: "Vous avez choisi de ne pas accéder aux fonctionnalités IA de SAMI.",
        code: "AI_FEATURES_NOT_ACCEPTED",
      });
    }
    const resolvedSubtitle = resolveProtectedVideoStorageFile(
      access.video.VideoID,
      subtitle.CheminSubtitle
    );
    return sendStream(request, reply, resolvedSubtitle?.absolutePath, {
      noStore: subtitle.Origin === "AI",
    });
  },

  async music(request, reply) {
    const musicId = Number(request.params.musicId);
    if (!Number.isInteger(musicId) || musicId <= 0) {
      return reply.status(400).send({ error: "MusiqueID invalide." });
    }
    const music = await prisma.musique.findUnique({ where: { MusiqueID: musicId } });
    if (!music) return reply.status(404).send({ error: "Musique introuvable." });
    return sendStream(request, reply, resolveMusicFile(music.CheminAcces));
  },
};
