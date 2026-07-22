import fs from "fs";
import { prisma } from "../db.js";

export const ADDVIDEO_DEDUPE_MS = 2000;
export const addVideoDedupeCache = new Map();

export const normalizeLangTag = (value) =>
  (value || "und").toLowerCase().replace(/[^a-z0-9_-]/g, "");

export class VideoImportValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "VideoImportValidationError";
    this.statusCode = 400;
  }
}

export const parseOptionalPositiveInt = (value, fieldName) => {
  if (value === undefined || value === null || String(value).trim() === "") return null;

  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw new VideoImportValidationError(`${fieldName} doit être un entier positif.`);
  }

  return normalized;
};

export const parseRequestedGenreIds = (value) => {
  let genres = value;
  if (typeof genres === "string") {
    const normalized = genres.trim();
    if (!normalized) return [];

    try {
      genres = JSON.parse(normalized);
    } catch {
      throw new VideoImportValidationError("Le champ genres doit contenir un tableau JSON valide.");
    }
  }

  if (genres === undefined || genres === null) return [];
  if (!Array.isArray(genres)) {
    throw new VideoImportValidationError("Le champ genres doit être un tableau.");
  }

  return Array.from(
    new Set(
      genres
        .map((genreId) => Number(genreId))
        .filter((genreId) => Number.isInteger(genreId) && genreId > 0)
    )
  );
};

const DEFAULT_AUDIO_PREFERENCES = [
  { languages: ["jap", "jpn", "ja"] },
  { languages: ["fra", "fre", "fr"], description: "vff" },
  { languages: ["fra", "fre", "fr"], description: "fre" },
  { languages: ["fra", "fre", "fr"], description: "vfq" },
  { languages: ["fra", "fre", "fr"] },
];

export const selectPreferredAudioStream = (
  metadata,
  preferences = DEFAULT_AUDIO_PREFERENCES
) => {
  const audioStreams = (metadata?.streams || []).filter(
    (stream) => stream.codec_type === "audio"
  );

  for (const preference of preferences) {
    const match = audioStreams.find((stream) => {
      const language = normalizeLangTag(stream.tags?.language);
      const title = String(stream.tags?.title || "").toLowerCase();
      const languageMatches = preference.languages.includes(language);
      const descriptionMatches = preference.description
        ? title.includes(preference.description)
        : true;
      return languageMatches && descriptionMatches;
    });

    if (match) return match;
  }

  return audioStreams[0] || null;
};

export const getVideoStream = (metadata) =>
  (metadata?.streams || []).find((stream) => stream.codec_type === "video") || null;

export const timemarkToSeconds = (timemark) => {
  if (!timemark) return 0;

  const parts = String(timemark).split(":");
  const seconds = Number.parseFloat(parts.pop() || "0");
  const minutes = Number.parseInt(parts.pop() || "0", 10);
  const hours = Number.parseInt(parts.pop() || "0", 10);
  const total = seconds + minutes * 60 + hours * 3600;
  return Number.isFinite(total) ? total : 0;
};

const HLS_PROFILES = [
  { label: "240p", width: 426, bitrate: 500 },
  { label: "360p", width: 640, bitrate: 1000 },
  { label: "480p", width: 854, bitrate: 1500 },
  { label: "720p", width: 1280, bitrate: 4500 },
  { label: "1080p", width: 1920, bitrate: 12000 },
  { label: "4K", width: 3840, bitrate: 25000 },
];

const toEvenInteger = (value) => Math.max(2, Math.round(value / 2) * 2);

export const getHlsProfiles = (videoStream) => {
  const sourceWidth = Number(videoStream?.width);
  const sourceHeight = Number(videoStream?.height);
  if (!Number.isFinite(sourceWidth) || sourceWidth <= 0) {
    throw new VideoImportValidationError("La largeur du flux vidéo est introuvable.");
  }

  const aspectRatio = Number.isFinite(sourceHeight) && sourceHeight > 0
    ? sourceHeight / sourceWidth
    : 9 / 16;
  const profiles = HLS_PROFILES.filter((profile) => profile.width <= sourceWidth);

  if (profiles.length === 0) {
    profiles.push({
      label: "source",
      width: toEvenInteger(sourceWidth),
      bitrate: 500,
    });
  }

  return profiles.map((profile) => ({
    ...profile,
    height: toEvenInteger(profile.width * aspectRatio),
  }));
};

export const buildMasterPlaylist = (playlists) => {
  const variants = playlists.map(({ resolutionPlaylist, bitrate, width, height }) => {
    const playlistPath = String(resolutionPlaylist).replace(/\\/g, "/");
    return `#EXT-X-STREAM-INF:BANDWIDTH=${bitrate * 1000},RESOLUTION=${width}x${height}\n${playlistPath}`;
  });

  return `#EXTM3U\n\n${variants.join("\n")}`;
};

const buildAddVideoAudioLabel = (stream) => {
  if (!stream) return "Non detecte";
  const parts = [
    stream.tags?.language,
    stream.tags?.title,
    stream.codec_name,
    stream.channels ? `${stream.channels} canaux` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" - ") : `Flux ${stream.index}`;
};

export const buildAddVideoProcessingVideoInfo = ({ data, processingId, audioStream, subtitleInfos, saison }) => ({
  processingId,
  titre: data.titre || data.videoOriginalName || "Video sans titre",
  audio: buildAddVideoAudioLabel(audioStream),
  subtitles:
    subtitleInfos.length > 0
      ? subtitleInfos.map((subtitle) => subtitle.label).filter(Boolean)
      : [],
  saisonNumero: saison?.Numero ?? null,
  seriesTitre: saison?.Series?.Titre ?? null,
});

export const isDuplicateAddVideo = (key, meta = {}, windowMs = ADDVIDEO_DEDUPE_MS) => {
  const now = Date.now();
  const lastSeen = addVideoDedupeCache.get(key);
  if (lastSeen && now - lastSeen.ts < windowMs) {
    if (meta.saisonId != null && lastSeen.saisonId == null) {
      lastSeen.saisonId = meta.saisonId;
    }
    return { duplicate: true, saisonId: lastSeen.saisonId };
  }
  addVideoDedupeCache.set(key, { ts: now, saisonId: meta.saisonId ?? null });
  for (const [k, entry] of addVideoDedupeCache.entries()) {
    if (now - entry.ts > windowMs) addVideoDedupeCache.delete(k);
  }
  return { duplicate: false, saisonId: meta.saisonId ?? null };
};

export const cleanupAddVideoTemp = (paths = []) => {
  for (const target of paths) {
    if (!target) continue;
    try {
      fs.rmSync(target, { recursive: true, force: true });
    } catch (err) {
      console.warn("Nettoyage temp échoué :", err.message);
    }
  }
};

const FRENCH_LANG_CODES = new Set(["fr", "fra", "fre", "frf", "vff", "vfq"]);
const JAPANESE_LANG_CODES = new Set(["ja", "jp", "jpn", "jap"]);
const getStreamLanguage = (stream) => normalizeLangTag(stream?.tags?.language);

const getAudioLanguageGenre = (stream) => {
  const language = getStreamLanguage(stream);
  if (!language || language === "und") return null;
  if (FRENCH_LANG_CODES.has(language)) return "FR";
  if (JAPANESE_LANG_CODES.has(language)) return "JP";
  return "VO";
};

const hasFrenchSubtitle = (subtitleStreams = []) =>
  subtitleStreams.some((stream) => FRENCH_LANG_CODES.has(getStreamLanguage(stream)));

export const getAutoLanguageGenreNames = ({ audioStream, subtitleStreams }) => {
  const names = new Set();
  const audioGenre = getAudioLanguageGenre(audioStream);
  if (audioGenre) names.add(audioGenre);
  if (audioGenre && audioGenre !== "FR" && hasFrenchSubtitle(subtitleStreams)) {
    names.add("VOSTFR");
  }
  return Array.from(names);
};

export const ensureGenreIdsByNames = async (genreNames = []) => {
  const names = Array.from(new Set(
    genreNames
      .map((name) => String(name || "").trim())
      .filter(Boolean)
  ));

  if (names.length === 0) return [];

  const existingGenres = await prisma.genre.findMany({
    where: { Nom: { in: names } },
    select: { GenreID: true, Nom: true },
  });

  const existingByName = new Map(
    existingGenres.map((genre) => [genre.Nom.toLowerCase(), genre])
  );

  const createdGenres = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (existingByName.has(key)) continue;

    const genre = await prisma.genre.create({ data: { Nom: name } });
    existingByName.set(key, genre);
    createdGenres.push(genre);
    console.log("[addVideo] Genre auto créé :", name);
  }

  return [...existingGenres, ...createdGenres].map((genre) => genre.GenreID);
};
