import fs from "fs";
import { prisma } from "../db.js";

export const ADDVIDEO_DEDUPE_MS = 2000;
export const addVideoDedupeCache = new Map();

export const normalizeLangTag = (value) =>
  (value || "und").toLowerCase().replace(/[^a-z0-9_-]/g, "");

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
