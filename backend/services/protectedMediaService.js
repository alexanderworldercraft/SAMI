import fs from "fs";
import path from "path";

import { ETAT } from "../constants.js";
import { prisma } from "./db.js";
import { serializeUserAiPreference } from "./userAiPreferenceService.js";
import { canAccessPremium, isVideoPremium } from "./video/videoAccess.js";
import { BACKEND_ROOT, VIDEO_ROOT, resolveUploadPath } from "./video/videoPaths.js";

const CONTENT_TYPES = new Map([
  [".m3u8", "application/vnd.apple.mpegurl; charset=utf-8"],
  [".ts", "video/mp2t"],
  [".m4s", "video/iso.segment"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
  [".aac", "audio/aac"],
  [".m4a", "audio/mp4"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/opus"],
  [".wav", "audio/wav"],
  [".vtt", "text/vtt; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

const normalizeStoragePath = (value) =>
  String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");

const isPathInside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

export const protectedVideoMasterPath = (videoId) =>
  `api/media/videos/${Number(videoId)}/master.m3u8`;

export const protectedSubtitlePath = (videoId, subtitleId) =>
  `api/media/videos/${Number(videoId)}/subtitles/${Number(subtitleId)}`;

export const protectedVideoFilePath = (videoId, relativePath) => {
  const encoded = normalizeStoragePath(relativePath)
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  return `/api/media/videos/${Number(videoId)}/files/${encoded}`;
};

const getVideoRelativePath = (videoId, storagePath) => {
  const absolutePath = resolveUploadPath(storagePath);
  const videoRoot = path.join(VIDEO_ROOT, String(videoId));
  if (!absolutePath || !isPathInside(videoRoot, absolutePath)) return null;
  return normalizeStoragePath(path.relative(videoRoot, absolutePath));
};

const getLocalPlaylistReference = ({ videoId, playlistRelativePath, reference }) => {
  const cleanReference = String(reference || "").trim().split(/[?#]/, 1)[0];
  if (!cleanReference || cleanReference.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(cleanReference)) {
    return null;
  }

  const videoRoot = path.join(VIDEO_ROOT, String(videoId));
  let absolutePath;
  if (cleanReference.startsWith("/uploads/video/")) {
    absolutePath = path.resolve(BACKEND_ROOT, cleanReference.slice(1));
  } else if (cleanReference.startsWith("/")) {
    return null;
  } else {
    absolutePath = path.resolve(
      videoRoot,
      path.posix.dirname(normalizeStoragePath(playlistRelativePath)),
      cleanReference
    );
  }

  if (!isPathInside(videoRoot, absolutePath)) return null;
  return normalizeStoragePath(path.relative(videoRoot, absolutePath));
};

const findAiAudioTrackForPath = (relativePath, audioTracks) => {
  const normalizedPath = normalizeStoragePath(relativePath);
  return (audioTracks || []).find((track) => {
    if (track.Origin !== "AI_DUB") return false;
    const playlistPath = getVideoRelativePath(track.VideoID, track.CheminPlaylist);
    if (!playlistPath) return false;
    const trackRoot = path.posix.dirname(playlistPath);
    return normalizedPath === playlistPath || normalizedPath.startsWith(`${trackRoot}/`);
  });
};

export async function getVideoMediaAccess(videoId, userId, { database = prisma } = {}) {
  const parsedVideoId = Number(videoId);
  const parsedUserId = Number(userId);
  if (!Number.isInteger(parsedVideoId) || parsedVideoId <= 0) {
    return { error: { statusCode: 400, message: "VideoID invalide." } };
  }

  const [video, user] = await Promise.all([
    database.video.findUnique({
      where: { VideoID: parsedVideoId },
      include: {
        Saison: { include: { Series: true } },
        VideoAudioTracks: { orderBy: { Ordre: "asc" } },
      },
    }),
    database.utilisateur.findUnique({
      where: { UtilisateurID: parsedUserId },
      select: {
        UtilisateurID: true,
        GradeID: true,
        PremiumEndDate: true,
        AiPreference: true,
      },
    }),
  ]);

  if (!video || video.EtatID !== ETAT.ACTIVE) {
    return { error: { statusCode: 404, message: "Vidéo introuvable." } };
  }
  if (!user) {
    return { error: { statusCode: 401, message: "Utilisateur introuvable." } };
  }
  if (isVideoPremium(video) && !canAccessPremium(user)) {
    return { error: { statusCode: 403, message: "Ce contenu est réservé aux membres Premium." } };
  }

  const aiPreference = serializeUserAiPreference(user.AiPreference);
  return {
    video,
    user,
    aiFeaturesAccepted: aiPreference.status === "ACCEPTED",
  };
}

export function resolveProtectedVideoFile({ videoId, relativePath }) {
  const normalized = normalizeStoragePath(relativePath);
  if (
    !normalized
    || normalized.includes("%")
    || normalized.includes("\\")
    || normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) return null;

  const videoRoot = path.join(VIDEO_ROOT, String(Number(videoId)));
  const absolutePath = path.resolve(videoRoot, normalized);
  if (!isPathInside(videoRoot, absolutePath)) return null;
  if (fs.existsSync(absolutePath)) {
    const realVideoRoot = fs.realpathSync(videoRoot);
    const realPath = fs.realpathSync(absolutePath);
    if (!isPathInside(realVideoRoot, realPath)) return null;
    return { absolutePath: realPath, relativePath: normalized };
  }
  return { absolutePath, relativePath: normalized };
}

export function resolveProtectedVideoStorageFile(videoId, storagePath) {
  const relativePath = getVideoRelativePath(videoId, storagePath);
  return relativePath ? resolveProtectedVideoFile({ videoId, relativePath }) : null;
}

export function rewriteProtectedPlaylist({
  videoId,
  playlistRelativePath,
  content,
  audioTracks = [],
  aiFeaturesAccepted = false,
}) {
  const lines = String(content || "").split(/\r?\n/);
  const rewritten = [];

  for (const line of lines) {
    if (line.startsWith("#EXT-X-MEDIA")) {
      const uriMatch = line.match(/URI="([^"]+)"/i);
      const referencedPath = uriMatch
        ? getLocalPlaylistReference({ videoId, playlistRelativePath, reference: uriMatch[1] })
        : null;
      if (referencedPath && findAiAudioTrackForPath(referencedPath, audioTracks) && !aiFeaturesAccepted) {
        continue;
      }
    }

    if (line.startsWith("#")) {
      rewritten.push(line.replace(/URI="([^"]+)"/gi, (match, reference) => {
        const referencedPath = getLocalPlaylistReference({ videoId, playlistRelativePath, reference });
        return referencedPath ? `URI="${protectedVideoFilePath(videoId, referencedPath)}"` : match;
      }));
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      rewritten.push(line);
      continue;
    }
    const referencedPath = getLocalPlaylistReference({
      videoId,
      playlistRelativePath,
      reference: trimmed,
    });
    rewritten.push(referencedPath ? protectedVideoFilePath(videoId, referencedPath) : line);
  }

  const aiTracks = aiFeaturesAccepted
    ? (audioTracks || []).filter((track) => track.Origin === "AI_DUB")
    : [];
  if (aiTracks.length > 0) {
    const existingGroup = lines
      .filter((line) => line.startsWith("#EXT-X-MEDIA") && /TYPE=AUDIO/i.test(line))
      .map((line) => line.match(/GROUP-ID="([^"]+)"/i)?.[1])
      .find(Boolean);
    const groupId = existingGroup || "sami-audio";
    const currentContent = rewritten.join("\n");
    const additions = [];
    if (!existingGroup) {
      additions.push(
        `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="${groupId}",NAME="Original",DEFAULT=YES,AUTOSELECT=YES`
      );
    }
    for (const track of aiTracks) {
      const playlistPath = getVideoRelativePath(track.VideoID, track.CheminPlaylist);
      if (!playlistPath) continue;
      const protectedPath = protectedVideoFilePath(videoId, playlistPath);
      if (currentContent.includes(protectedPath)) continue;
      const safeLabel = String(track.Label || track.Language || "Doublage IA")
        .replaceAll("\\", " ")
        .replaceAll('"', "'")
        .slice(0, 100);
      const safeLanguage = String(track.Language || "und").replace(/[^a-z0-9-]/gi, "").slice(0, 16) || "und";
      additions.push(
        `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="${groupId}",NAME="${safeLabel}",LANGUAGE="${safeLanguage}",DEFAULT=NO,AUTOSELECT=YES,URI="${protectedPath}"`
      );
    }
    if (additions.length > 0) {
      const insertionIndex = rewritten[0]?.trim() === "#EXTM3U" ? 1 : 0;
      rewritten.splice(insertionIndex, 0, ...additions);
    }
    for (let index = 0; index < rewritten.length; index += 1) {
      if (rewritten[index].startsWith("#EXT-X-STREAM-INF") && !/,AUDIO="[^"]+"/i.test(rewritten[index])) {
        rewritten[index] = `${rewritten[index]},AUDIO="${groupId}"`;
      }
    }
  }

  return rewritten.join("\n");
}

export function isAiAudioFile(relativePath, audioTracks) {
  return Boolean(findAiAudioTrackForPath(relativePath, audioTracks));
}

export function isPrivateAiDubbingArtifact(relativePath) {
  const normalized = normalizeStoragePath(relativePath);
  return /^audio\/ai\/[^/]+\/[^/]+\/(?:preview|profile)(?:\/|$)/i.test(normalized);
}

export function getContentType(filePath) {
  return CONTENT_TYPES.get(path.extname(String(filePath || "")).toLowerCase())
    || "application/octet-stream";
}

export function createFileStreamResponse(filePath, rangeHeader) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return null;
  const base = {
    contentType: getContentType(filePath),
    totalSize: stat.size,
    statusCode: 200,
    contentLength: stat.size,
    contentRange: null,
    stream: fs.createReadStream(filePath),
  };
  const match = String(rangeHeader || "").match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return base;

  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : stat.size - 1;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= stat.size) {
    return { ...base, statusCode: 416, stream: null, contentLength: 0, contentRange: `bytes */${stat.size}` };
  }
  base.stream.destroy();
  return {
    ...base,
    statusCode: 206,
    contentLength: end - start + 1,
    contentRange: `bytes ${start}-${end}/${stat.size}`,
    stream: fs.createReadStream(filePath, { start, end }),
  };
}

export function resolveMusicFile(storagePath) {
  const absolutePath = resolveUploadPath(storagePath);
  const musicRoot = path.join(BACKEND_ROOT, "uploads", "musique");
  if (!absolutePath || !isPathInside(musicRoot, absolutePath)) return null;
  if (fs.existsSync(absolutePath)) {
    const realRoot = fs.realpathSync(musicRoot);
    const realPath = fs.realpathSync(absolutePath);
    if (!isPathInside(realRoot, realPath)) return null;
    return realPath;
  }
  return absolutePath;
}
