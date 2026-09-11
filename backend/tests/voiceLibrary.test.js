import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import multipart from "@fastify/multipart";
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

const db = vi.hoisted(() => ({
  utilisateur: { findUnique: vi.fn() }, userAiPreference: { findUnique: vi.fn() },
  voiceAudio: { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  personne: { findFirst: vi.fn() },
}));
vi.mock("../services/db.js", () => ({ prisma: db }));
vi.mock("../middlewares/authMiddleware.js", () => ({ authMiddleware: async (req, reply) => {
  if (!req.headers["x-user"]) return reply.code(401).send({ error: "Connexion requise" });
  req.user = { userId: Number(req.headers["x-user"]) };
} }));
import voiceRoutes from "../routes/voiceRoutes.js";
import { AI_DISCLOSURE_VERSION } from "../services/userAiPreferenceService.js";
import { normalizeOriginal, serializeVoice, validateOriginal, voicePath } from "../services/voices/library.js";
import { finishVoice, renewVoice } from "../services/voices/leases.js";

const app = Fastify();
await app.register(multipart);
await app.register(voiceRoutes, { prefix: "/voices" });
afterAll(() => app.close());
beforeEach(() => {
  vi.clearAllMocks();
  db.utilisateur.findUnique.mockResolvedValue({ GradeID: 3 });
  db.userAiPreference.findUnique.mockResolvedValue({ Accepted: true, DisclosureVersion: AI_DISCLOSURE_VERSION });
  db.voiceAudio.findMany.mockResolvedValue([]); db.voiceAudio.count.mockResolvedValue(0);
});
describe("accès à la bibliothèque vocale", () => {
  it.each(["/voices", "/voices/123/audio", "/voices/123/download"])("refuse les visiteurs : %s", async url => {
    expect((await app.inject({ url })).statusCode).toBe(401);
    expect(db.voiceAudio.findMany).not.toHaveBeenCalled();
  });
  it.each([false, null])("bloque aussi les fichiers quand le consentement vaut %s", async accepted => {
    db.userAiPreference.findUnique.mockResolvedValue(accepted === null ? null : { Accepted: accepted, DisclosureVersion: AI_DISCLOSURE_VERSION });
    for (const url of ["/voices", "/voices/123/audio", "/voices/123/download"]) {
      expect((await app.inject({ url, headers: { "x-user": "7" } })).statusCode).toBe(accepted === null ? 428 : 403);
    }
    expect(db.voiceAudio.findFirst).not.toHaveBeenCalled();
  });
  it("ne liste que les audios publiés et prêts pour un utilisateur", async () => {
    expect((await app.inject({ url: "/voices?personId=4", headers: { "x-user": "7" } })).statusCode).toBe(200);
    expect(db.voiceAudio.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ IsPublic: true, Status: "READY", PersonneID: 4 }) }));
  });
  it("réserve création, génération, publication et téléchargement aux admins", async () => {
    for (const [method, url, payload] of [["POST", "/voices/originals", {}], ["POST", "/voices/123/replicas", {}], ["PATCH", "/voices/123/visibility", { public: true }], ["POST", "/voices/123/retry", {}], ["GET", "/voices/123/download"]]) {
      expect((await app.inject({ method, url, payload, headers: { "x-user": "7" } })).statusCode).toBe(403);
    }
    expect(db.voiceAudio.create).not.toHaveBeenCalled();
    expect(db.voiceAudio.updateMany).not.toHaveBeenCalled();
  });
  it.each([1, 2])("les grades administrateurs %s voient les audios privés", async GradeID => {
    db.utilisateur.findUnique.mockResolvedValue({ GradeID });
    expect((await app.inject({ url: "/voices", headers: { "x-user": "7" } })).json().admin).toBe(true);
    expect(db.voiceAudio.findMany.mock.calls[0][0].where.IsPublic).toBeUndefined();
  });
  it("n'expose ni original privé ni justificatif dans une réplique publique", () => {
    const row = { OriginalID: "private", Original: { IsPublic: false, Status: "READY" }, AuthorizationNote: "confidentiel", LeaseToken: "secret" };
    expect(serializeVoice(row)).toMatchObject({ originalId: null });
    expect(JSON.stringify(serializeVoice(row))).not.toMatch(/confidentiel|secret|private/);
    expect(serializeVoice({ ...row, Original: { IsPublic: true, Status: "READY" } }).originalId).toBe("private");
  });
  it("refuse un consentement antérieur à l'ajout des voix", async () => {
    db.userAiPreference.findUnique.mockResolvedValue({ Accepted: true, DisclosureVersion: "2026-08-23-v1" });
    expect((await app.inject({ url: "/voices", headers: { "x-user": "7" } })).statusCode).toBe(428);
  });
});
describe("intégrité des originaux et des générations", () => {
  it("importe un fichier, le conserve intact et sert l'écoute par plages et le téléchargement admin", async () => {
    db.utilisateur.findUnique.mockResolvedValue({ GradeID: 2 });
    db.personne.findFirst.mockResolvedValue({ PersonneID: 4 });
    let saved;
    db.voiceAudio.create.mockImplementation(async ({ data }) => { saved = { ...data, IsPublic: false, Status: "READY" }; return saved; });
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sami-voice-upload-"));
    try {
      const source = path.join(directory, "source.wav");
      execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", source]);
      const bytes = fs.readFileSync(source);
      const boundary = "sami-voice-upload-test";
      const fields = { personId: "4", title: "Référence", language: "fr", text: "Bonjour", authorized: "true", authorizationNote: "Accord de test" };
      const payload = Buffer.concat([
        Buffer.from(Object.entries(fields).map(([key, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`).join("")),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="audio"; filename="reference.wav"\r\nContent-Type: audio/wav\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      const response = await app.inject({ method: "POST", url: "/voices/originals", headers: { "x-user": "7", "content-type": `multipart/form-data; boundary=${boundary}` }, payload });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ kind: "ORIGINAL", public: false });
      expect(fs.readFileSync(voicePath(saved.VoiceAudioID, "source"))).toEqual(bytes);
      db.voiceAudio.findFirst.mockResolvedValue(saved);
      const listen = await app.inject({ url: `/voices/${saved.VoiceAudioID}/audio`, headers: { "x-user": "7", range: "bytes=0-43" } });
      expect(listen.statusCode).toBe(206);
      expect(listen.rawPayload.length).toBe(44);
      expect(listen.headers["cache-control"]).toBe("private, no-store");
      const download = await app.inject({ url: `/voices/${saved.VoiceAudioID}/download`, headers: { "x-user": "7" } });
      expect(download.rawPayload).toEqual(bytes);
      expect(download.headers["content-disposition"]).toContain("attachment");
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
      if (saved) fs.rmSync(path.dirname(voicePath(saved.VoiceAudioID)), { recursive: true, force: true });
    }
  });
  it("exige une personne active, une transcription et une autorisation", async () => {
    db.personne.findFirst.mockResolvedValue({ PersonneID: 4 });
    const body = { personId: 4, title: "Référence", language: "fr", text: "Bonjour", authorized: true, authorizationNote: "Accord enregistré" };
    await expect(validateOriginal(body)).resolves.toMatchObject({ PersonneID: 4 });
    await expect(validateOriginal({ ...body, authorized: false })).rejects.toMatchObject({ statusCode: 400 });
    await expect(validateOriginal({ ...body, text: "" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(validateOriginal({ ...body, language: "invalid" })).rejects.toMatchObject({ statusCode: 400 });
    db.personne.findFirst.mockResolvedValue(null);
    await expect(validateOriginal(body)).rejects.toMatchObject({ statusCode: 404 });
  });
  it("rejette le renouvellement et la sortie d'un ancien bail", async () => {
    db.voiceAudio.updateMany.mockResolvedValue({ count: 0 });
    db.voiceAudio.findFirst.mockResolvedValue(null);
    await expect(renewVoice("clone", "id", "old", db)).rejects.toMatchObject({ statusCode: 409 });
    await expect(finishVoice("clone", "id", { token: "old", audio: "abc" }, db)).rejects.toMatchObject({ statusCode: 409 });
  });
  it("refuse une sortie sans watermark avant toute écriture", async () => {
    db.voiceAudio.findFirst.mockResolvedValue({ VoiceAudioID: "id" });
    await expect(finishVoice("clone", "id", { token: "valid", audio: "YWJj", watermarked: false }, db)).rejects.toMatchObject({ statusCode: 400 });
  });
  it("normalise un vrai extrait et refuse une plage hors du média", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sami-voice-test-"));
    try {
      const source = path.join(directory, "source.wav");
      execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=5", source]);
      const before = fs.readFileSync(source);
      await expect(normalizeOriginal({ input: source, destination: path.join(directory, "audio.wav"), upload: true })).resolves.toBe(5);
      expect(fs.readFileSync(source)).toEqual(before);
      await expect(normalizeOriginal({ input: source, destination: path.join(directory, "bad.wav"), start: 3, end: 8 })).rejects.toMatchObject({ statusCode: 400 });
      const playlist = path.join(directory, "input.m3u8");
      fs.writeFileSync(playlist, `#EXTM3U\n#EXT-X-TARGETDURATION:5\n#EXTINF:5,\n${source}\n#EXT-X-ENDLIST\n`);
      await expect(normalizeOriginal({ input: playlist, destination: path.join(directory, "bad.wav"), upload: true })).rejects.toThrow();
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
});
