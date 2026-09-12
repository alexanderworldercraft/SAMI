import crypto from "crypto";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import { prisma } from "../db.js";
import { BACKEND_ROOT } from "../video/videoPaths.js";
import { resolveProtectedVideoStorageFile } from "../protectedMediaService.js";
import { getAiDubbingConfig } from "../aiDubbing/config.js";

export const VOICE_ROOT = path.join(BACKEND_ROOT, "var", "voices");
export const LANGUAGES = [{ code: "fr", label: "Français" }, { code: "en", label: "Anglais" }, { code: "ja", label: "Japonais" }];
export const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
export const voicePath = (id, file = "audio.wav") => {
  if (!/^[a-f0-9-]{36}$/.test(String(id)) || !["audio.wav", "source", "input", "result.wav"].includes(file)) fail("Identifiant audio invalide.");
  return path.join(VOICE_ROOT, id, file);
};
export const voiceWhere = ({ admin = false, personId, kind, search = "" } = {}) => ({
  ...(kind ? { Kind: kind } : {}),
  Personne: { EtatID: 1 },
  ...(admin ? {} : { IsPublic: true, Status: "READY" }),
  ...(personId ? { PersonneID: Number(personId) } : {}),
  ...(search ? { OR: [{ Title: { contains: search } }, { Personne: { Nom: { contains: search } } }, { Personne: { Prenom: { contains: search } } }] } : {}),
});
export const serializeVoice = (row, admin = false) => ({
  id: row.VoiceAudioID, personId: row.PersonneID, person: row.Personne,
  kind: row.Kind, title: row.Title, language: row.Language, text: row.Text,
  public: row.IsPublic, status: row.Status, duration: row.Duration,
  originalId: row.OriginalID && (admin || row.Original?.IsPublic && row.Original?.Status === "READY") ? row.OriginalID : null,
  automaticTranscription: row.Models?.automaticTranscription === true,
  createdAt: row.CreatedAt, watermarked: row.Watermarked,
  ...(admin ? { error: row.ErrorMessage, authorizationNote: row.AuthorizationNote, authorizedBy: row.AuthorizedBy, authorizedAt: row.AuthorizedAt, models: row.Models } : {}),
});
export const voiceInclude = { Personne: { select: { PersonneID: true, Nom: true, Prenom: true, Surnom: true } }, Original: { select: { IsPublic: true, Status: true } } };
export const textField = (value, label, max) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) fail(`${label} requis (maximum ${max} caractères).`);
  return text;
};
export const languageField = value => {
  if (!LANGUAGES.some(item => item.code === value)) fail("Langue non prise en charge.");
  return value;
};
export async function validateOriginal(body, database = prisma) {
  const personId = Number(body.personId);
  if (!Number.isSafeInteger(personId) || personId <= 0) fail("Sélectionnez une personne.");
  if (!await database.personne.findFirst({ where: { PersonneID: personId, EtatID: 1 } })) fail("Personne introuvable.", 404);
  if (body.authorized !== true && body.authorized !== "true") fail("L'autorisation d'utiliser cette voix doit être confirmée.");
  return { PersonneID: personId, Title: textField(body.title, "Titre", 191), Language: languageField(body.language), Text: body.text == null || typeof body.text === "string" && !body.text.trim() ? "" : textField(body.text, "Transcription originale", 1000), AuthorizationNote: textField(body.authorizationNote, "Justificatif d'autorisation", 2000) };
}
const uploadedFormats = "wav,mp3,ogg,flac,mov,matroska,aac,aiff";
export const probeAudio = (filename, upload = false) => new Promise((resolve, reject) => ffmpeg.ffprobe(filename, ["-protocol_whitelist", "file,pipe,crypto,data", ...(upload ? ["-format_whitelist", uploadedFormats] : [])], (error, result) => error ? reject(error) : resolve(result)));
export async function normalizeOriginal({ input, destination, start, end, upload = false }) {
  const probe = await probeAudio(input, upload);
  if (!probe.streams.some(stream => stream.codec_type === "audio")) fail("La source ne contient aucune piste audio.");
  const duration = Number(probe.format.duration);
  const extract = start !== undefined;
  const length = extract ? end - start : duration;
  if (!Number.isFinite(length) || length < 3 || length > 30) fail("Choisissez un extrait de 3 à 30 secondes, avec une seule voix.");
  if (extract && (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || !Number.isFinite(duration) || end > duration + 0.1)) fail("Bornes d'extraction invalides.");
  await new Promise((resolve, reject) => {
    const command = ffmpeg(input);
    command.inputOptions(["-protocol_whitelist file,pipe,crypto,data", ...(upload ? [`-format_whitelist ${uploadedFormats}`] : [])]);
    if (extract) command.seekInput(start).duration(length);
    command.noVideo().audioChannels(1).audioFrequency(24000).audioCodec("pcm_s16le")
      .outputOptions(["-map 0:a:0", "-map_metadata -1"]).output(destination).on("end", resolve).on("error", reject).run();
  });
  return length;
}
export async function createOriginal({ body, userId, upload, database = prisma }) {
  const fields = await validateOriginal(body, database);
  const id = crypto.randomUUID();
  await fs.promises.mkdir(path.dirname(voicePath(id)), { recursive: true, mode: 0o700 });
  try {
    let input;
    let source = {};
    if (upload) {
      input = voicePath(id, "source");
      await fs.promises.copyFile(upload.path, input);
      source.UploadName = path.basename(upload.name).replace(/[\r\n"\\]/g, "_").slice(0, 191);
    } else {
      const videoId = Number(body.videoId);
      if (!Number.isSafeInteger(videoId) || videoId <= 0) fail("Sélectionnez une vidéo.");
      const video = await database.video.findFirst({ where: { VideoID: videoId, EtatID: 1 } });
      input = resolveProtectedVideoStorageFile(videoId, video?.CheminAcces)?.absolutePath;
      if (!video || !input || !fs.existsSync(input)) fail("Vidéo source indisponible.", 404);
      source = { SourceVideoID: videoId, SourceStart: Number(body.start), SourceEnd: Number(body.end) };
    }
    const duration = await normalizeOriginal({ input, destination: voicePath(id), upload: Boolean(upload), ...(upload ? {} : { start: source.SourceStart, end: source.SourceEnd }) });
    return await database.voiceAudio.create({ data: { ...fields, ...source, VoiceAudioID: id, Kind: "ORIGINAL", Status: fields.Text ? "READY" : "QUEUED", Models: fields.Text ? undefined : { automaticTranscription: true }, CreatedBy: userId, AuthorizedBy: userId, Duration: duration }, include: voiceInclude });
  } catch (error) {
    await fs.promises.rm(path.dirname(voicePath(id)), { recursive: true, force: true });
    throw error;
  }
}
export async function queueReplica({ originalId, body, userId, database = prisma }) {
  const original = await database.voiceAudio.findFirst({ where: { VoiceAudioID: originalId, Kind: "ORIGINAL", Status: "READY", Personne: { EtatID: 1 } } });
  if (!original) fail("Voix originale introuvable.", 404);
  const config = getAiDubbingConfig();
  if (!config.active) fail("La génération locale est désactivée sur le serveur.", 503);
  const models = { voiceEngine: config.voiceEngine, voiceModel: config.voiceModel, voiceModelRevision: config.voiceModelRevision, pipeline: config.pipelineVersion, generationConfigHash: config.generationConfigHash };
  return database.voiceAudio.create({ data: {
    VoiceAudioID: crypto.randomUUID(), PersonneID: original.PersonneID, OriginalID: originalId, Kind: "AI",
    Title: textField(body.title, "Titre", 191), Text: textField(body.text, "Texte à prononcer", 500), Language: languageField(body.language),
    Status: "QUEUED", Models: models, CreatedBy: userId, AuthorizedBy: original.AuthorizedBy, AuthorizedAt: original.AuthorizedAt, AuthorizationNote: original.AuthorizationNote,
  }, include: voiceInclude });
}
