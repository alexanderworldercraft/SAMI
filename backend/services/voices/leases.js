import crypto from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "../db.js";
import { fail, probeAudio, voicePath } from "./library.js";
import { AI_DUBBING_OFFLINE_AFTER_MS } from "../aiDubbing/constants.js";

const leaseMs = 120000;
const hash = value => crypto.createHash("sha256").update(String(value)).digest("hex");
export async function recoverVoiceLeases(database = prisma) {
  return database.voiceAudio.updateMany({ where: { Status: "PROCESSING", LeaseExpiresAt: { lt: new Date() } }, data: { Status: "FAILED", ErrorMessage: "Le worker a perdu son bail. Une relance manuelle est nécessaire.", LeaseToken: null } });
}
export async function claimVoice(workerId, database = prisma) {
  const now = new Date();
  await recoverVoiceLeases(database);
  return database.$transaction(async tx => {
    const worker = await tx.aiDubbingWorker.findUnique({ where: { AiDubbingWorkerID: workerId }, include: { Registry: true } });
    if (!worker?.Ready || !worker.Registry?.Enabled || worker.Registry.Draining || worker.Role !== "CLONE" || worker.Capabilities?.voiceLibrary !== 1 || !worker.LastHeartbeatAt || now - worker.LastHeartbeatAt > AI_DUBBING_OFFLINE_AFTER_MS) return null;
    const busy = await Promise.all([
      tx.voiceAudio.count({ where: { AssignedWorkerID: workerId, Status: "PROCESSING", LeaseExpiresAt: { gt: now } } }),
      tx.aiDubbingJob.count({ where: { AssignedWorkerID: workerId, Status: { in: ["PROCESSING_PREVIEW", "PROCESSING_FULL"] }, LeaseExpiresAt: { gt: now } } }),
      tx.aiSubtitleJob.count({ where: { AssignedWorkerID: workerId, Status: "LEASED", LeaseExpiresAt: { gt: now } } }),
      tx.videoEncodingTask.count({ where: { AssignedWorkerID: workerId, Status: "LEASED", LeaseExpiresAt: { gt: now } } }),
    ]);
    if (busy.some(Boolean)) return null;
    const candidates = await tx.voiceAudio.findMany({ where: { Kind: "AI", Status: "QUEUED", Personne: { EtatID: 1 } }, include: { Original: true }, orderBy: { CreatedAt: "asc" }, take: 50 });
    const row = candidates.find(row => row.Models?.voiceEngine === worker.Engine && row.Models?.voiceModel === worker.Model && (row.Models?.voiceModelRevision || null) === (worker.ModelRevision || null) && row.Models?.pipeline === worker.PipelineVersion && row.Models?.generationConfigHash === worker.Capabilities?.profile?.generationConfigHash);
    if (!row) return null;
    const token = crypto.randomBytes(32).toString("hex");
    const changed = await tx.voiceAudio.updateMany({ where: { VoiceAudioID: row.VoiceAudioID, Status: "QUEUED" }, data: { Status: "PROCESSING", AssignedWorkerID: workerId, LeaseToken: hash(token), LeaseExpiresAt: new Date(now.getTime() + leaseMs) } });
    if (!changed.count) return null;
    const reference = await fs.promises.readFile(voicePath(row.OriginalID));
    return { id: row.VoiceAudioID, token, text: row.Text, language: row.Language, models: row.Models, referenceText: row.Original.Text, reference: reference.toString("base64"), referenceSha256: crypto.createHash("sha256").update(reference).digest("hex") };
  }, { isolationLevel: "Serializable" });
}
export const leaseWhere = (workerId, id, token) => ({ VoiceAudioID: id, AssignedWorkerID: workerId, LeaseToken: hash(token), Status: "PROCESSING", LeaseExpiresAt: { gt: new Date() } });
export async function renewVoice(workerId, id, token, database = prisma) {
  const result = await database.voiceAudio.updateMany({ where: leaseWhere(workerId, id, token), data: { LeaseExpiresAt: new Date(Date.now() + leaseMs) } });
  if (!result.count) fail("Bail vocal expiré.", 409);
  return { renewed: true };
}
export async function finishVoice(workerId, id, body, database = prisma) {
  const where = leaseWhere(workerId, id, body.token);
  if (!await database.voiceAudio.findFirst({ where })) fail("Bail vocal expiré.", 409);
  if (body.error) {
    const changed = await database.voiceAudio.updateMany({ where, data: { Status: "FAILED", ErrorMessage: String(body.error).slice(0, 4000), LeaseToken: null, LeaseExpiresAt: null } });
    if (!changed.count) fail("Bail vocal expiré.", 409);
    return { failed: true };
  }
  if (body.watermarked !== true || !(body.watermarkConfidence >= 0.5) || typeof body.audio !== "string" || body.audio.length > 20 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.audio)) fail("Sortie vocale invalide ou non watermarquée.");
  const audio = Buffer.from(body.audio, "base64");
  if (audio.subarray(0, 4).toString() !== "RIFF" || audio.subarray(8, 12).toString() !== "WAVE") fail("Format WAV requis.");
  const directory = path.dirname(voicePath(id));
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  // One immutable output per lease; stale uploads can never replace a newer retry.
  const temporary = path.join(directory, `${hash(body.token)}.wav`);
  try {
    await fs.promises.writeFile(temporary, audio, { mode: 0o600 });
    const probe = await probeAudio(temporary);
    const duration = Number(probe.format.duration);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 180 || !probe.streams.some(s => s.codec_type === "audio")) fail("Durée audio invalide.");
    await database.$transaction(async tx => {
      const updated = await tx.voiceAudio.updateMany({ where: leaseWhere(workerId, id, body.token), data: { Status: "READY", Duration: duration, Watermarked: true, LeaseToken: null, LeaseExpiresAt: null, ErrorMessage: null } });
      if (!updated.count) fail("Bail vocal expiré.", 409);
      await fs.promises.rename(temporary, voicePath(id));
    });
    return { ready: true };
  } finally { await fs.promises.rm(temporary, { force: true }); }
}
