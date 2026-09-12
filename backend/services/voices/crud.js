import fs from "fs";
import path from "path";
import { prisma } from "../db.js";
import { fail, languageField, serializeVoice, textField, voiceInclude, voicePath } from "./library.js";

export async function updateVoice({ id, body, userId, database = prisma }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail("Modification invalide.");
  const allowed = ["title", "text", "language", "authorizationNote", "authorized", "regenerate"];
  if (!Object.keys(body).length || Object.keys(body).some(key => !allowed.includes(key))) fail("Champ de modification non autorisé.");
  return database.$transaction(async tx => {
    const row = await tx.voiceAudio.findFirst({ where: { VoiceAudioID: id, Personne: { EtatID: 1 } } });
    if (!row) fail("Audio introuvable.", 404);
    if (row.Status === "PROCESSING") fail("Attendez la fin de la génération avant de modifier cet audio.", 409);
    const data = {};
    if (body.title !== undefined) data.Title = textField(body.title, "Titre", 191);
    if (body.text !== undefined) data.Text = row.Kind === "ORIGINAL" && typeof body.text === "string" && !body.text.trim() ? "" : textField(body.text, row.Kind === "AI" ? "Texte à prononcer" : "Transcription originale", row.Kind === "AI" ? 500 : 1000);
    if (body.language !== undefined) data.Language = languageField(body.language);
    const contentChanged = data.Text !== undefined && data.Text !== row.Text || data.Language !== undefined && data.Language !== row.Language;
    if (row.Kind === "AI") {
      if (body.authorizationNote !== undefined || body.authorized !== undefined) fail("L’autorisation d’une réplique provient de son original.");
      if (contentChanged) {
        if (body.regenerate !== true) fail("Confirmez la nouvelle génération après modification du texte ou de la langue.", 409);
        Object.assign(data, { Status: "QUEUED", IsPublic: false, PublishedAt: null, PublishedBy: null, Duration: null, Watermarked: false, ErrorMessage: null, LeaseToken: null, LeaseExpiresAt: null, AssignedWorkerID: null });
      }
    } else {
      if (data.Text === "" && row.Text) Object.assign(data, { Status: "QUEUED", IsPublic: false, PublishedAt: null, PublishedBy: null, Models: { ...row.Models, automaticTranscription: true } });
      if (data.Text && !row.Text && ["QUEUED", "FAILED"].includes(row.Status)) Object.assign(data, { Status: "READY", ErrorMessage: null, LeaseToken: null, LeaseExpiresAt: null, AssignedWorkerID: null });
      if (body.regenerate !== undefined) fail("Un original ne peut pas être régénéré.");
      if (contentChanged && await tx.voiceAudio.count({ where: { OriginalID: id, Status: { in: ["QUEUED", "PROCESSING"] } } })) fail("Une réplique utilise cette référence : attendez la fin de sa génération.", 409);
      if (body.authorizationNote !== undefined) {
        if (body.authorized !== true) fail("Confirmez l’autorisation d’utiliser cette voix.");
        Object.assign(data, { AuthorizationNote: textField(body.authorizationNote, "Justificatif d’autorisation", 2000), AuthorizedBy: userId, AuthorizedAt: new Date() });
      }
    }
    if (!Object.keys(data).length) fail("Aucune modification à enregistrer.");
    const updated = await tx.voiceAudio.update({ where: { VoiceAudioID: id }, data, include: voiceInclude, voicePath });
    return serializeVoice(updated, true);
  }, { isolationLevel: "Serializable" });
}


export async function deleteVoice({ id, database = prisma }) {
  const directory = path.dirname(voicePath(id));
  try {
    await database.$transaction(async tx => {
      const row = await tx.voiceAudio.findFirst({ where: { VoiceAudioID: id, Personne: { EtatID: 1 } } });
      if (!row) fail("Audio introuvable.", 404);
      if (row.Status === "PROCESSING") fail("Attendez la fin de la génération avant de supprimer cet audio.", 409);
      if (await tx.voiceAudio.count({ where: { OriginalID: id } })) fail("Supprimez d’abord les répliques qui utilisent cet original.", 409);
      await tx.voiceAudio.delete({ where: { VoiceAudioID: id } });
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (["P2003", "P2034", "P2025"].includes(error.code)) fail("Cet audio a changé ou reste utilisé. Actualisez la bibliothèque.", 409);
    throw error;
  }
  // Remove only after commit: a rejected deletion must never destroy the audio.
  try { await fs.promises.rm(directory, { recursive: true, force: true }); }
  catch (error) {
    console.error("Nettoyage du fichier vocal supprimé impossible", id, error.code);
    return { deleted: true, warning: "Audio supprimé de la bibliothèque ; le nettoyage de son dossier sur le serveur reste à effectuer." };
  }
  return { deleted: true };
}
