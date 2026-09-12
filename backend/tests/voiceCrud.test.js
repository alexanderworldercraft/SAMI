import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { updateVoice, deleteVoice } from "../services/voices/crud.js";
import { voicePath } from "../services/voices/library.js";
let database, row;
const directories = [];
beforeEach(() => {
  row = { VoiceAudioID: crypto.randomUUID(), Kind: "AI", Status: "READY", Title: "Présentation", Text: "Bonjour", Language: "fr", IsPublic: true, Watermarked: true };
  database = { voiceAudio: {
    findFirst: vi.fn(async () => row), count: vi.fn(async () => 0),
    update: vi.fn(async ({ data }) => ({ ...row, ...data })), delete: vi.fn(async () => row),
  } };
  database.$transaction = vi.fn(fn => fn(database));
});
afterEach(() => { for (const dir of directories.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const update = body => updateVoice({ id: row.VoiceAudioID, body, userId: 7, database });
describe("édition de voix", () => {
  it("renomme une réplique sans altérer sa publication ni son audio", async () => {
    const result = await update({ title: "Nouveau titre" });
    expect(result).toMatchObject({ title: "Nouveau titre", public: true, status: "READY" });
    expect(database.voiceAudio.update.mock.calls[0][0].data).toEqual({ Title: "Nouveau titre" });
  });
  it("exige une confirmation avant de régénérer et retire la publication", async () => {
    await expect(update({ text: "Bonsoir" })).rejects.toMatchObject({ statusCode: 409 });
    expect(database.voiceAudio.update).not.toHaveBeenCalled();
    expect(await update({ text: "Bonsoir", regenerate: true })).toMatchObject({ text: "Bonsoir", status: "QUEUED", public: false, watermarked: false });
    expect(database.voiceAudio.update.mock.calls[0][0].data).toMatchObject({ LeaseToken: null, AssignedWorkerID: null, Duration: null, PublishedAt: null });
  });
  it.each([{ text: "x".repeat(501) }, { language: "xx" }, { personId: 3 }, { kind: "ORIGINAL" }, { public: true }, { authorizationNote: "autre" }])("refuse les données invalides ou les champs protégés : %j", async body => {
    await expect(update(body)).rejects.toMatchObject({ statusCode: 400 });
    expect(database.voiceAudio.update).not.toHaveBeenCalled();
  });
  it("protège une référence en cours d’utilisation et trace une autorisation corrigée", async () => {
    row.Kind = "ORIGINAL";
    database.voiceAudio.count.mockResolvedValue(1);
    await expect(update({ text: "Transcription corrigée" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(update({ authorizationNote: "Nouvel accord" })).rejects.toMatchObject({ statusCode: 400 });
    await update({ authorizationNote: "Nouvel accord", authorized: true });
    expect(database.voiceAudio.update.mock.calls[0][0].data).toMatchObject({ AuthorizationNote: "Nouvel accord", AuthorizedBy: 7, AuthorizedAt: expect.any(Date) });
  });
  it("effacer une transcription originale déclenche sa reconnaissance et retire la publication", async () => {
    row.Kind = "ORIGINAL";
    expect(await update({ text: "" })).toMatchObject({ text: "", status: "QUEUED", public: false, automaticTranscription: true });
  });
  it("une transcription manuelle remplace une demande automatique en attente", async () => {
    row.Kind = "ORIGINAL"; row.Text = ""; row.Status = "QUEUED";
    expect(await update({ text: "Paroles exactes" })).toMatchObject({ text: "Paroles exactes", status: "READY" });
  });
  it("refuse les modifications pendant une génération", async () => {
    row.Status = "PROCESSING";
    await expect(update({ title: "Autre" })).rejects.toMatchObject({ statusCode: 409 });
  });
});
describe("suppression de voix", () => {
  it.each(["PROCESSING", "REFERENCED"])("conserve le fichier et la ligne lorsque la suppression est bloquée : %s", async state => {
    if (state === "PROCESSING") row.Status = state;
    else database.voiceAudio.count.mockResolvedValue(2);
    const file = voicePath(row.VoiceAudioID);
    directories.push(path.dirname(file)); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "original");
    await expect(deleteVoice({ id: row.VoiceAudioID, database })).rejects.toMatchObject({ statusCode: 409 });
    expect(database.voiceAudio.delete).not.toHaveBeenCalled();
    expect(fs.readFileSync(file, "utf8")).toBe("original");
  });
  it("supprime le dossier après la validation de la transaction", async () => {
    const file = voicePath(row.VoiceAudioID);
    directories.push(path.dirname(file)); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "audio");
    database.voiceAudio.delete.mockImplementation(async () => { expect(fs.existsSync(file)).toBe(true); return row; });
    expect(await deleteVoice({ id: row.VoiceAudioID, database })).toEqual({ deleted: true });
    expect(fs.existsSync(path.dirname(file))).toBe(false);
  });
  it("conserve les fichiers si la base refuse une suppression concurrente", async () => {
    const file = voicePath(row.VoiceAudioID);
    directories.push(path.dirname(file)); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "audio");
    database.voiceAudio.delete.mockRejectedValue({ code: "P2003" });
    await expect(deleteVoice({ id: row.VoiceAudioID, database })).rejects.toMatchObject({ statusCode: 409 });
    expect(fs.existsSync(file)).toBe(true);
  });
});
