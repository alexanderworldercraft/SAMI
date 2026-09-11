import fs from "fs";

import { createLog } from "./logController.js";
import { ensureAdmin } from "../services/authz.js";
import { getAiDubbingRuntimeStatus } from "../services/aiDubbing/config.js";
import { listAiDubbingWorkers } from "../services/aiDubbing/leaseService.js";
import {
  addAiDubbingSpeaker,
  approveAiDubbingPreview,
  deleteAiDubbing,
  getAiDubbingJob,
  listAiDubbingJobs,
  publishAiDubbing,
  queueAiDubbingPreview,
  regenerateAiDubbingVoiceProfile,
  rejectAiDubbing,
  retryFailedAiDubbing,
  reviewAiDubbingVoiceProfile,
  serializeAiDubbingJob,
} from "../services/aiDubbing/jobService.js";
import {
  getContentType,
  resolveProtectedVideoStorageFile,
} from "../services/protectedMediaService.js";

const sendError = (reply, error, fallback) => reply.status(error.statusCode || 500).send({
  error: error.statusCode ? error.message : fallback,
  ...(error.code ? { code: error.code } : {}),
});

export const getAiDubbingConfiguration = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;
  const runtime = getAiDubbingRuntimeStatus();
  const workers = await listAiDubbingWorkers();
  return reply.send({
    active: runtime.active,
    ready: runtime.ready,
    error: runtime.error,
    coordinatorReady: runtime.coordinatorReady,
    workerReady: workers.some((worker) => worker.ready && worker.online && worker.enabled && !worker.draining),
    workers,
    languages: [
      { code: "en", label: "Anglais" },
      { code: "fr", label: "Français" },
      { code: "ja", label: "Japonais" },
    ],
    models: {
      engine: runtime.voiceEngine,
      voice: runtime.voiceModel,
      voiceRevision: runtime.voiceModelRevision,
      diarization: runtime.diarizationModel,
      separation: runtime.separationModel,
      pipeline: runtime.pipelineVersion,
    },
    localOnly: true,
    manualReferencesSupported: Boolean(runtime.profile?.generationConfig?.manualVoiceReferences),
    approvals: ["PREVIEW", "FINAL"],
    capabilities: runtime.capabilities,
  });
};

export const getAdminAiDubbingJobs = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;
  try {
    return reply.send(await listAiDubbingJobs({ page: request.query?.page }));
  } catch (error) {
    return sendError(reply, error, "Liste des doublages IA indisponible.");
  }
};

export const requestAiDubbingPreview = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;
  try {
    const queued = await queueAiDubbingPreview({
      videoId: request.params?.videoId,
      targetLanguage: request.body?.language,
      previewStartSeconds: request.body?.previewStartSeconds,
      expectedSpeakerCount: request.body?.expectedSpeakerCount,
      manualVoiceReferences: request.body?.manualVoiceReferences,
      requestedByUserId: admin.userId,
    });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "ai_dubbing_preview_requested",
      VideoID: queued.job.VideoID,
      Champ: "language_preview_start_speakers",
      NouvelleValeur: `${queued.job.TargetLanguage}@${queued.job.PreviewStartSeconds || 0}s#${
        queued.job.ExpectedSpeakerCount || "auto"
      }`,
    });
    return reply.status(queued.alreadyQueued ? 200 : 202).send({
      alreadyQueued: queued.alreadyQueued,
      job: serializeAiDubbingJob(queued.job),
    });
  } catch (error) {
    return sendError(reply, error, "Demande de doublage IA impossible.");
  }
};

export const approvePreview = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;
  try {
    const job = await approveAiDubbingPreview({ jobId: request.params?.jobId, adminUserId: admin.userId });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "ai_dubbing_preview_approved",
      VideoID: job.VideoID,
      Champ: "language",
      NouvelleValeur: job.TargetLanguage,
    });
    return reply.send({ job: serializeAiDubbingJob(job) });
  } catch (error) {
    return sendError(reply, error, "Validation de l'extrait impossible.");
  }
};

export const rejectDubbing = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;
  try {
    const job = await rejectAiDubbing({ jobId: request.params?.jobId, adminUserId: admin.userId });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "ai_dubbing_rejected",
      VideoID: job.VideoID,
      Champ: "language",
      AncienneValeur: job.TargetLanguage,
    });
    return reply.send({ job: serializeAiDubbingJob(job) });
  } catch (error) {
    return sendError(reply, error, "Refus du doublage impossible.");
  }
};

export const reviewVoiceProfile = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;
  try {
    const job = await reviewAiDubbingVoiceProfile({
      jobId: request.params?.jobId,
      speaker: request.params?.speaker,
      accepted: request.body?.accepted,
      adminUserId: admin.userId,
    });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: request.body?.accepted
        ? "ai_dubbing_voice_profile_accepted"
        : "ai_dubbing_voice_profile_rejected",
      VideoID: job.VideoID,
      Champ: "speaker",
      NouvelleValeur: String(request.params?.speaker || ""),
    });
    return reply.send({ job: serializeAiDubbingJob(job) });
  } catch (error) {
    return sendError(reply, error, "Contrôle du profil vocal impossible.");
  }
};

export const regenerateVoiceProfile = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;
  try {
    const job = await regenerateAiDubbingVoiceProfile({
      jobId: request.params?.jobId,
      speaker: request.params?.speaker,
    });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "ai_dubbing_voice_profile_regenerated",
      VideoID: job.VideoID,
      Champ: "speaker",
      AncienneValeur: String(request.params?.speaker || ""),
    });
    return reply.status(202).send({ job: serializeAiDubbingJob(job) });
  } catch (error) {
    return sendError(reply, error, "Régénération du profil vocal impossible.");
  }
};

export const addVoiceSpeaker = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;
  try {
    const job = await addAiDubbingSpeaker({ jobId: request.params?.jobId });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "ai_dubbing_speaker_added",
      VideoID: job.VideoID,
      Champ: "expected_speaker_count",
      NouvelleValeur: String(job.ExpectedSpeakerCount || ""),
    });
    return reply.status(202).send({ job: serializeAiDubbingJob(job) });
  } catch (error) {
    return sendError(reply, error, "Ajout d'un intervenant impossible.");
  }
};

export const retryDubbingAnalysis = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;
  try {
    const job = await retryFailedAiDubbing({ jobId: request.params?.jobId });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "ai_dubbing_analysis_retried",
      VideoID: job.VideoID,
      Champ: "language_job",
      NouvelleValeur: `${job.TargetLanguage}:${job.AiDubbingJobID}`,
    });
    return reply.status(202).send({ job: serializeAiDubbingJob(job) });
  } catch (error) {
    return sendError(reply, error, "Relance de l'analyse du doublage impossible.");
  }
};

export const approveFinal = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;
  try {
    const job = await publishAiDubbing({ jobId: request.params?.jobId, adminUserId: admin.userId });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "ai_dubbing_published",
      VideoID: job.VideoID,
      Champ: "language",
      NouvelleValeur: job.TargetLanguage,
    });
    return reply.send({ job: serializeAiDubbingJob(job) });
  } catch (error) {
    return sendError(reply, error, "Publication du doublage impossible.");
  }
};

export const deleteDubbing = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;
  try {
    const { job, cleanupCompleted } = await deleteAiDubbing({ jobId: request.params?.jobId });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "ai_dubbing_deleted",
      VideoID: job.VideoID,
      Champ: "language_job",
      AncienneValeur: `${job.TargetLanguage}:${job.AiDubbingJobID}`,
    });
    return reply.send({ deleted: true, cleanupCompleted, id: job.AiDubbingJobID });
  } catch (error) {
    return sendError(reply, error, "Suppression du doublage IA impossible.");
  }
};

export const getAiDubbingPreview = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;
  try {
    const job = await getAiDubbingJob(request.params?.jobId);
    const previewPath = resolveProtectedVideoStorageFile(
      job.VideoID,
      job.PreviewRelativePath
    )?.absolutePath;
    if (!previewPath || !fs.existsSync(previewPath)) {
      return reply.status(404).send({ error: "Extrait de doublage introuvable." });
    }
    const stat = await fs.promises.stat(previewPath);
    return reply
      .header("Content-Type", getContentType(previewPath))
      .header("Content-Length", stat.size)
      .header("Cache-Control", "private, no-store")
      .send(fs.createReadStream(previewPath));
  } catch (error) {
    return sendError(reply, error, "Extrait de doublage indisponible.");
  }
};

export const getAiDubbingVoiceSample = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;
  try {
    const job = await getAiDubbingJob(request.params?.jobId);
    const speaker = String(request.params?.speaker || "");
    const sample = Array.isArray(job.VoiceSamples)
      ? job.VoiceSamples.find((item) => String(item?.speaker || "") === speaker)
      : null;
    const samplePath = sample
      ? resolveProtectedVideoStorageFile(job.VideoID, sample.relativePath)?.absolutePath
      : null;
    if (!samplePath || !fs.existsSync(samplePath)) {
      return reply.status(404).send({ error: "Échantillon vocal introuvable." });
    }
    const stat = await fs.promises.stat(samplePath);
    if (!stat.isFile()) {
      return reply.status(404).send({ error: "Échantillon vocal introuvable." });
    }
    return reply
      .header("Content-Type", getContentType(samplePath))
      .header("Content-Length", stat.size)
      .header("Cache-Control", "private, no-store")
      .send(fs.createReadStream(samplePath));
  } catch (error) {
    return sendError(reply, error, "Échantillon vocal indisponible.");
  }
};
