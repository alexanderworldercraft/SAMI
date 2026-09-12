import crypto from "crypto";
import { updateVoice, deleteVoice } from "../services/voices/crud.js";
import fs from "fs";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import { prisma } from "../services/db.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { aiFeatureAccessMiddleware } from "../middlewares/aiFeatureAccessMiddleware.js";
import { ensureAdmin } from "../services/authz.js";
import { createOriginal, fail, LANGUAGES, queueReplica, serializeVoice, voiceInclude, voicePath, voiceWhere } from "../services/voices/library.js";
import { listAiDubbingWorkers } from "../services/aiDubbing/leaseService.js";

export default async function voiceRoutes(app) {
  app.addHook("preHandler", authMiddleware);
  app.addHook("preHandler", aiFeatureAccessMiddleware);
  const adminOnly = async (req, reply) => { req.voiceAdmin = await ensureAdmin(req, reply); };
  const isAdmin = async req => {
    const user = await prisma.utilisateur.findUnique({ where: { UtilisateurID: Number(req.user.userId) }, select: { GradeID: true } });
    return [1, 2].includes(user?.GradeID);
  };
  app.setErrorHandler((error, req, reply) => {
    if (error.code === "P2034") { error.statusCode = 409; error.message = "Une autre opération a modifié cet audio. Actualisez et réessayez."; }
    if (!error.statusCode || error.statusCode >= 500) req.log.error(error);
    reply.code(error.statusCode || 500).send({ error: error.statusCode ? error.message : "Opération vocale impossible." });
  });
  app.get("/", async req => {
    const admin = await isAdmin(req);
    const page = Math.max(1, Math.min(100000, Number.parseInt(req.query.page, 10) || 1));
    if (req.query.personId && !/^[1-9]\d*$/.test(req.query.personId)) fail("Personne invalide.");
    if (req.query.kind !== undefined && !["ORIGINAL", "AI"].includes(req.query.kind)) fail("Type de voix invalide.");
    const where = voiceWhere({ admin, kind: req.query.kind, personId: req.query.personId, search: String(req.query.search || "").slice(0, 191) });
    const [rows, total] = await Promise.all([
      prisma.voiceAudio.findMany({ where, include: voiceInclude, orderBy: [{ CreatedAt: "desc" }, { VoiceAudioID: "desc" }], take: 24, skip: (page - 1) * 24 }),
      prisma.voiceAudio.count({ where }),
    ]);
    return { items: rows.map(row => serializeVoice(row, admin)), total, page, pages: Math.ceil(total / 24), admin, languages: LANGUAGES };
  });
  app.get("/config", { preHandler: adminOnly }, async () => {
    const workers = await listAiDubbingWorkers();
    return { transcriptionWorkerReady: workers.some(w => w.online && w.ready && w.enabled && !w.draining && w.capabilities?.voiceTranscription === 1), languages: LANGUAGES, workerReady: workers.some(w => w.online && w.ready && w.enabled && !w.draining && w.capabilities?.voiceLibrary === 1) };
  });
  app.post("/originals", { preHandler: adminOnly }, async (req, reply) => {
    let temporary;
    try {
      let body = req.body || {};
      let upload;
      if (req.isMultipart()) {
        body = {};
        for await (const part of req.parts({ limits: { fileSize: 50 * 1024 * 1024, files: 1, fields: 10, fieldSize: 10000 } })) {
          if (part.type === "file") {
            if (part.fieldname !== "audio") fail("Champ audio attendu.");
            temporary = path.join(os.tmpdir(), `sami-voice-${crypto.randomUUID()}`);
            await pipeline(part.file, fs.createWriteStream(temporary, { mode: 0o600 }));
            if (part.file.truncated) fail("Fichier trop volumineux (50 Mo maximum).", 413);
            upload = { path: temporary, name: part.filename || "original.audio" };
          } else body[part.fieldname] = part.value;
        }
        if (!upload) fail("Fichier audio requis.");
      }
      const row = await createOriginal({ body, userId: req.voiceAdmin.userId, upload });
      return reply.code(201).send(serializeVoice(row, true));
    } finally { if (temporary) await fs.promises.rm(temporary, { force: true }); }
  });
  app.post("/:id/replicas", { preHandler: adminOnly }, async (req, reply) => {
    const row = await queueReplica({ originalId: req.params.id, body: req.body || {}, userId: req.voiceAdmin.userId });
    return reply.code(202).send(serializeVoice(row, true));
  });
  app.patch("/:id/visibility", { preHandler: adminOnly }, async req => {
    if (typeof req.body?.public !== "boolean") fail("Visibilité invalide.");
    const changed = await prisma.voiceAudio.updateMany({ where: { VoiceAudioID: req.params.id, Status: "READY", Personne: { EtatID: 1 }, OR: [{ Kind: "ORIGINAL" }, { Kind: "AI", Watermarked: true }] }, data: { IsPublic: req.body.public, PublishedBy: req.voiceAdmin.userId, PublishedAt: new Date() } });
    if (!changed.count) fail("Audio non disponible pour publication.", 409);
    return { public: req.body.public };
  });
  app.get("/:id", async req => {
    const admin = await isAdmin(req);
    const row = await prisma.voiceAudio.findFirst({ where: { ...voiceWhere({ admin }), VoiceAudioID: req.params.id }, include: voiceInclude });
    if (!row) fail("Audio introuvable.", 404);
    return serializeVoice(row, admin);
  });
  app.delete("/:id", { preHandler: adminOnly }, req => deleteVoice({ id: req.params.id }));
  app.patch("/:id", { preHandler: adminOnly }, req => updateVoice({ id: req.params.id, body: req.body, userId: req.voiceAdmin.userId }));
  app.post("/:id/retry", { preHandler: adminOnly }, async req => {
    const changed = await prisma.voiceAudio.updateMany({ where: { VoiceAudioID: req.params.id, Kind: { in: ["AI", "ORIGINAL"] }, Status: "FAILED", Personne: { EtatID: 1 } }, data: { Status: "QUEUED", ErrorMessage: null, LeaseToken: null, LeaseExpiresAt: null, AssignedWorkerID: null } });
    if (!changed.count) fail("Cette réplique ne peut pas être relancée.", 409);
    return { queued: true };
  });
  const audio = download => async (req, reply) => {
    const admin = await isAdmin(req);
    if (download && !admin) fail("Téléchargement réservé aux administrateurs.", 403);
    const row = await prisma.voiceAudio.findFirst({ where: { ...voiceWhere({ admin }), VoiceAudioID: req.params.id, Status: "READY" } });
    if (!row) fail("Audio introuvable.", 404);
    const sourceDownload = download && row.Kind === "ORIGINAL" && row.UploadName;
    const filename = voicePath(row.VoiceAudioID, sourceDownload ? "source" : "audio.wav");
    const stat = await fs.promises.stat(filename).catch(() => null);
    if (!stat?.isFile()) fail("Fichier audio indisponible.", 404);
    reply.header("Cache-Control", "private, no-store").header("X-Content-Type-Options", "nosniff");
    reply.type(sourceDownload ? "application/octet-stream" : "audio/wav");
    const name = sourceDownload ? `ORIGINAL-${row.UploadName}` : `${row.Kind === "AI" ? "IA" : "ORIGINAL"}-${row.VoiceAudioID}.wav`;
    reply.header("Content-Disposition", `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`);
    reply.header("Accept-Ranges", "bytes");
    let start = 0; let end = stat.size - 1;
    if (req.headers.range) {
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!range || !range[1] && !range[2]) return reply.code(416).header("Content-Range", `bytes */${stat.size}`).send();
      start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
      end = range[1] && range[2] ? Math.min(end, Number(range[2])) : end;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) return reply.code(416).header("Content-Range", `bytes */${stat.size}`).send();
      reply.code(206).header("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    }
    return reply.header("Content-Length", end - start + 1).send(fs.createReadStream(filename, { start, end }));
  };
  app.get("/:id/audio", audio(false));
  app.get("/:id/download", audio(true));
}
