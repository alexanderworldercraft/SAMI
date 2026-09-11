import crypto from "crypto";
import fs from "fs";
import path from "path";
import { Prisma } from "@prisma/client";

import { ETAT } from "../../constants.js";
import { prisma } from "../db.js";
import { AI_DISCLOSURE_VERSION } from "../userAiPreferenceService.js";
import { aiLanguageLabel, normalizeAiLanguage } from "../aiSubtitles/language.js";
import {
  ACTIVE_AI_DUBBING_STATUSES,
  AI_DUBBING_LANGUAGES,
  AI_DUBBING_STATUS,
} from "./constants.js";
import { getAiDubbingRuntimeStatus } from "./config.js";
import { cleanupAiDubbingInput } from "./sourceService.js";
import { resolveProtectedVideoStorageFile } from "../protectedMediaService.js";
import { VIDEO_ROOT } from "../video/videoPaths.js";
import { normalizeManualVoiceReferences } from "./manualReferences.js";

const { randomUUID } = crypto;
const SUPPORTED_LANGUAGES = new Set(AI_DUBBING_LANGUAGES.map((language) => language.code));
const PREVIEW_DURATION_SECONDS = 45;
const MAX_PREVIEW_START_SECONDS = 7 * 24 * 60 * 60;
const MAX_EXPECTED_SPEAKER_COUNT = 30;
const VOICE_PROFILE_REVIEW_STATUS = Object.freeze({
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
});

export const normalizeAiDubbingPreviewStartSeconds = (value) => {
  if (value === undefined || value === null || value === "") return 0;
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_PREVIEW_START_SECONDS) {
    const error = new Error("Le début de l'extrait doit être un nombre entier de secondes positif.");
    error.statusCode = 400;
    error.code = "AI_DUBBING_INVALID_PREVIEW_START";
    throw error;
  }
  return seconds;
};

export const normalizeAiDubbingExpectedSpeakerCount = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > MAX_EXPECTED_SPEAKER_COUNT) {
    const error = new Error(
      `Le nombre d'intervenants doit être un entier compris entre 1 et ${MAX_EXPECTED_SPEAKER_COUNT}.`
    );
    error.statusCode = 400;
    error.code = "AI_DUBBING_INVALID_SPEAKER_COUNT";
    throw error;
  }
  return count;
};

const jobInclude = {
  Video: { select: { VideoID: true, Titre: true, CheminImage: true } },
  RequestedBy: { select: { UtilisateurID: true, Surnom: true } },
  PreviewApprovedBy: { select: { UtilisateurID: true, Surnom: true } },
  FinalApprovedBy: { select: { UtilisateurID: true, Surnom: true } },
  GeneratedAudioTrack: true,
};

const serializeVoiceSamples = (job) => Array.isArray(job?.VoiceSamples)
  ? job.VoiceSamples.map((sample, index) => ({
    speaker: String(sample?.speaker || `SPEAKER_${index}`),
    sourceStart: Number(sample?.sourceStart) || 0,
    referenceSourceStart: Number(sample?.referenceSourceStart) || 0,
    referenceSourceEnd: Number(sample?.referenceSourceEnd) || 0,
    text: String(sample?.text || ""),
    reviewStatus: Object.values(VOICE_PROFILE_REVIEW_STATUS).includes(sample?.reviewStatus)
      ? sample.reviewStatus
      : VOICE_PROFILE_REVIEW_STATUS.PENDING,
    reviewedAt: sample?.reviewedAt || null,
    url: `/api/ai-dubbing/jobs/${job.AiDubbingJobID}/voice-samples/${encodeURIComponent(
      String(sample?.speaker || `SPEAKER_${index}`)
    )}`,
  }))
  : [];

const voiceProfilesAreAccepted = (job) => (
  Number(job?.SpeakerCount) > 0
  && Array.isArray(job?.VoiceSamples)
  && job.VoiceSamples.length === Number(job.SpeakerCount)
  && job.VoiceSamples.every((sample) => sample?.reviewStatus === VOICE_PROFILE_REVIEW_STATUS.ACCEPTED)
);

export const serializeAiDubbingJob = (job) => job && ({
  id: job.AiDubbingJobID,
  video: job.Video ? {
    id: job.Video.VideoID,
    title: job.Video.Titre,
    image: job.Video.CheminImage,
  } : { id: job.VideoID },
  targetLanguage: job.TargetLanguage,
  targetLanguageLabel: aiLanguageLabel(job.TargetLanguage),
  sourceLanguage: job.SourceLanguage,
  status: job.Status,
  phase: job.Phase,
  progress: job.Progress,
  previewStartSeconds: job.PreviewStartSeconds || 0,
  expectedSpeakerCount: Number(job.ExpectedSpeakerCount) || null,
  manualVoiceReferences: job.ManualVoiceReferences || null,
  previewEndSeconds: (job.PreviewStartSeconds || 0) + PREVIEW_DURATION_SECONDS,
  error: job.ErrorMessage,
  previewAvailable: Boolean(job.PreviewRelativePath),
  previewUrl: job.PreviewRelativePath ? `/api/ai-dubbing/jobs/${job.AiDubbingJobID}/preview` : null,
  voiceProfilesLocked: Boolean(
    job.VoiceProfileRelativePath
    && job.VoiceProfileChecksum
    && Number(job.SpeakerCount) > 0
    && Array.isArray(job.VoiceSamples)
    && job.VoiceSamples.length === Number(job.SpeakerCount)
  ),
  voiceProfilesAccepted: voiceProfilesAreAccepted(job),
  speakerCount: Number(job.SpeakerCount) || 0,
  voiceSamples: serializeVoiceSamples(job),
  qualityReport: job.QualityReport || null,
  finalReady: Boolean(job.FinalPlaylistPath),
  publishedTrackId: job.GeneratedAudioTrack?.VideoAudioTrackID || null,
  publishedTrackLabel: job.GeneratedAudioTrack?.Label || null,
  publishedTrackIsDefault: Boolean(job.GeneratedAudioTrack?.IsDefault),
  disclosureVersion: job.DisclosureVersion,
  watermarked: Boolean(job.Watermarked),
  models: {
    engine: job.VoiceEngine,
    voice: job.VoiceModel,
    voiceRevision: job.VoiceModelRevision,
    diarization: job.DiarizationModel,
    separation: job.SeparationModel,
    pipeline: job.PipelineVersion,
    generationConfigHash: job.GenerationConfigHash,
  },
  assignedWorkerId: job.AssignedWorkerID,
  preferredWorkerId: job.PreferredWorkerID,
  attemptCount: job.AttemptCount,
  requestedBy: job.RequestedBy || null,
  previewApprovedBy: job.PreviewApprovedBy || null,
  previewApprovedAt: job.PreviewApprovedAt,
  finalApprovedBy: job.FinalApprovedBy || null,
  finalApprovedAt: job.FinalApprovedAt,
  createdAt: job.CreatedAt,
  updatedAt: job.UpdatedAt,
});

export async function listAiDubbingJobs({ page = 1, database = prisma } = {}) {
  const pageSize = 40;
  const requestedPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const total = await database.aiDubbingJob.count();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(requestedPage, totalPages);
  const jobs = await database.aiDubbingJob.findMany({
    orderBy: [{ CreatedAt: "desc" }],
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    include: jobInclude,
  });
  return {
    jobs: jobs.map(serializeAiDubbingJob),
    pagination: { page: currentPage, pageSize, total, totalPages },
  };
}

export async function getAiDubbingJob(jobId, { database = prisma } = {}) {
  const job = await database.aiDubbingJob.findUnique({
    where: { AiDubbingJobID: String(jobId || "") },
    include: jobInclude,
  });
  if (!job) {
    const error = new Error("Tâche de doublage IA introuvable.");
    error.statusCode = 404;
    throw error;
  }
  return job;
}

export async function queueAiDubbingPreview({
  videoId,
  targetLanguage,
  previewStartSeconds,
  expectedSpeakerCount,
  manualVoiceReferences,
  requestedByUserId,
  database = prisma,
  env = process.env,
}) {
  const runtime = getAiDubbingRuntimeStatus(env);
  if (!runtime.ready) {
    const error = new Error(runtime.error);
    error.statusCode = 409;
    error.code = "AI_DUBBING_RUNTIME_NOT_READY";
    throw error;
  }
  const parsedVideoId = Number(videoId);
  const language = normalizeAiLanguage(targetLanguage);
  const normalizedPreviewStartSeconds = normalizeAiDubbingPreviewStartSeconds(previewStartSeconds);
  const normalizedExpectedSpeakerCount = normalizeAiDubbingExpectedSpeakerCount(expectedSpeakerCount);
  const normalizedManualReferences = normalizeManualVoiceReferences(manualVoiceReferences, normalizedExpectedSpeakerCount);
  if (normalizedManualReferences && !runtime.profile.generationConfig.manualVoiceReferences) {
    throw Object.assign(new Error("Le profil actif ne prend pas en charge les références guidées. Activez par exemple le profil V5 R5 sur le primary et le clone."), { statusCode: 409 });
  }
  if (!Number.isInteger(parsedVideoId) || parsedVideoId <= 0) {
    const error = new Error("VideoID invalide.");
    error.statusCode = 400;
    throw error;
  }
  if (!SUPPORTED_LANGUAGES.has(language)) {
    const error = new Error("La première version du doublage IA accepte uniquement l'anglais, le français et le japonais.");
    error.statusCode = 400;
    throw error;
  }
  const video = await database.video.findFirst({
    where: { VideoID: parsedVideoId, EtatID: ETAT.ACTIVE },
    select: {
      VideoID: true,
      VideoSubtitles: { where: { Language: language }, select: { VideoSubtitleID: true } },
    },
  });
  if (!video) {
    const error = new Error("Vidéo introuvable.");
    error.statusCode = 404;
    throw error;
  }
  if (!video.VideoSubtitles.length) {
    const error = new Error("Un sous-titre validé dans la langue cible est requis avant le doublage.");
    error.statusCode = 409;
    error.code = "AI_DUBBING_TARGET_SUBTITLE_REQUIRED";
    throw error;
  }
  const existing = await database.aiDubbingJob.findFirst({
    where: {
      VideoID: parsedVideoId,
      TargetLanguage: language,
      Status: { in: ACTIVE_AI_DUBBING_STATUSES },
    },
    include: jobInclude,
  });
  if (existing) return { job: existing, alreadyQueued: true };

  const job = await database.aiDubbingJob.create({
    data: {
      AiDubbingJobID: randomUUID(),
      VideoID: parsedVideoId,
      TargetLanguage: language,
      RequestedByUserID: Number(requestedByUserId),
      Status: AI_DUBBING_STATUS.QUEUED_PREVIEW,
      Phase: "QUEUED",
      Progress: 0,
      PreviewStartSeconds: normalizedPreviewStartSeconds,
      ExpectedSpeakerCount: normalizedExpectedSpeakerCount,
      ManualVoiceReferences: normalizedManualReferences || Prisma.DbNull,
      VoiceEngine: runtime.voiceEngine,
      VoiceModel: runtime.voiceModel,
      VoiceModelRevision: runtime.voiceModelRevision,
      DiarizationModel: runtime.diarizationModel,
      SeparationModel: runtime.separationModel,
      PipelineVersion: runtime.pipelineVersion,
      GenerationConfigHash: runtime.generationConfigHash,
      DisclosureVersion: AI_DISCLOSURE_VERSION,
      Watermarked: true,
    },
    include: jobInclude,
  });
  return { job, alreadyQueued: false };
}

const transition = async ({ jobId, expectedStatus, data, database = prisma }) => {
  const updated = await database.aiDubbingJob.updateMany({
    where: { AiDubbingJobID: String(jobId), Status: expectedStatus },
    data,
  });
  if (updated.count !== 1) {
    const error = new Error("L'état de la tâche de doublage a changé. Rechargez la liste.");
    error.statusCode = 409;
    throw error;
  }
  return getAiDubbingJob(jobId, { database });
};

export const approveAiDubbingPreview = async ({ jobId, adminUserId, database = prisma }) => {
  const job = await getAiDubbingJob(jobId, { database });
  if (
    job.Status !== AI_DUBBING_STATUS.PREVIEW_REVIEW
    || !job.VoiceProfileRelativePath
    || !job.VoiceProfileChecksum
    || !(Number(job.SpeakerCount) > 0)
    || !Array.isArray(job.VoiceSamples)
    || job.VoiceSamples.length !== Number(job.SpeakerCount)
  ) {
    const error = new Error(
      "Cet extrait provient de l'ancien workflow instable ou ne possède aucun profil vocal verrouillé."
    );
    error.statusCode = 409;
    error.code = "AI_DUBBING_VOICE_PROFILE_REQUIRED";
    throw error;
  }
  if (!voiceProfilesAreAccepted(job)) {
    const error = new Error("Chaque profil vocal doit être explicitement accepté avant la génération complète.");
    error.statusCode = 409;
    error.code = "AI_DUBBING_VOICE_PROFILES_NOT_ACCEPTED";
    throw error;
  }
  return transition({
    jobId,
    expectedStatus: AI_DUBBING_STATUS.PREVIEW_REVIEW,
    data: {
      Status: AI_DUBBING_STATUS.QUEUED_FULL,
      Phase: "QUEUED",
      Progress: 0,
      InputManifest: Prisma.DbNull,
      InputManifestHash: null,
      ArtifactManifest: Prisma.DbNull,
      ArtifactManifestHash: null,
      QualityReport: Prisma.DbNull,
      AssignedWorkerID: null,
      LeaseTokenHash: null,
      LeaseExpiresAt: null,
      NextEligibleAt: null,
      AttemptCount: 0,
      CompletedAt: null,
      PreviewApprovedByUserID: Number(adminUserId),
      PreviewApprovedAt: new Date(),
      ErrorMessage: null,
    },
    database,
  });
};

const requirePreviewVoiceProfile = (job, speaker) => {
  if (job.Status !== AI_DUBBING_STATUS.PREVIEW_REVIEW || !Array.isArray(job.VoiceSamples)) {
    const error = new Error("Les profils vocaux ne peuvent être modifiés que pendant le contrôle de l'extrait.");
    error.statusCode = 409;
    error.code = "AI_DUBBING_VOICE_PROFILE_REVIEW_UNAVAILABLE";
    throw error;
  }
  const normalizedSpeaker = String(speaker || "");
  const index = job.VoiceSamples.findIndex((sample) => String(sample?.speaker || "") === normalizedSpeaker);
  if (index < 0) {
    const error = new Error("Profil vocal introuvable.");
    error.statusCode = 404;
    error.code = "AI_DUBBING_VOICE_PROFILE_NOT_FOUND";
    throw error;
  }
  return { index, speaker: normalizedSpeaker, sample: job.VoiceSamples[index] };
};

export async function reviewAiDubbingVoiceProfile({
  jobId,
  speaker,
  accepted,
  adminUserId,
  database = prisma,
}) {
  if (typeof accepted !== "boolean") {
    const error = new Error("La décision du profil vocal doit être explicite.");
    error.statusCode = 400;
    error.code = "AI_DUBBING_INVALID_VOICE_PROFILE_REVIEW";
    throw error;
  }
  const job = await getAiDubbingJob(jobId, { database });
  const profile = requirePreviewVoiceProfile(job, speaker);
  const voiceSamples = job.VoiceSamples.map((sample, index) => index === profile.index ? {
    ...sample,
    reviewStatus: accepted
      ? VOICE_PROFILE_REVIEW_STATUS.ACCEPTED
      : VOICE_PROFILE_REVIEW_STATUS.REJECTED,
    reviewedByUserId: Number(adminUserId),
    reviewedAt: new Date().toISOString(),
  } : sample);
  const updated = await database.aiDubbingJob.updateMany({
    where: { AiDubbingJobID: job.AiDubbingJobID, Status: AI_DUBBING_STATUS.PREVIEW_REVIEW },
    data: { VoiceSamples: voiceSamples },
  });
  if (updated.count !== 1) {
    const error = new Error("L'état du doublage a changé. Rechargez la liste.");
    error.statusCode = 409;
    throw error;
  }
  return getAiDubbingJob(jobId, { database });
}

const requireCurrentAiDubbingRuntime = (env = process.env) => {
  const runtime = getAiDubbingRuntimeStatus(env);
  if (!runtime.ready) {
    const error = new Error(runtime.error || "Le runtime de doublage IA R4 n'est pas prêt.");
    error.statusCode = 409;
    error.code = "AI_DUBBING_RUNTIME_NOT_READY";
    throw error;
  }
  return runtime;
};

const assertAiDubbingJobMatchesRuntimeProfile = (job, runtime) => {
  if (
    job.PipelineVersion !== runtime.pipelineVersion
    || job.GenerationConfigHash !== runtime.generationConfigHash
  ) {
    const error = new Error(
      "Ce doublage appartient à un autre profil algorithmique. Réactivez ce profil "
      + "sur le primary et le clone, ou supprimez ce job puis recréez-le."
    );
    error.statusCode = 409;
    error.code = "AI_DUBBING_PROFILE_MISMATCH";
    throw error;
  }
};

const previewRequeueData = ({
  expectedSpeakerCount,
  rejectedVoiceReferences,
  runtime,
  preservedProfiles = null,
}) => ({
  Status: AI_DUBBING_STATUS.QUEUED_PREVIEW,
  Phase: "QUEUED",
  Progress: 0,
  ExpectedSpeakerCount: expectedSpeakerCount,
  VoiceEngine: runtime.voiceEngine,
  VoiceModel: runtime.voiceModel,
  VoiceModelRevision: runtime.voiceModelRevision,
  DiarizationModel: runtime.diarizationModel,
  SeparationModel: runtime.separationModel,
  PipelineVersion: runtime.pipelineVersion,
  GenerationConfigHash: runtime.generationConfigHash,
  PreviewRelativePath: preservedProfiles?.previewRelativePath || null,
  VoiceProfileRelativePath: preservedProfiles?.voiceProfileRelativePath || null,
  VoiceProfileChecksum: preservedProfiles?.voiceProfileChecksum || null,
  SpeakerCount: preservedProfiles?.speakerCount || null,
  VoiceSamples: preservedProfiles?.voiceSamples || Prisma.DbNull,
  RejectedVoiceReferences: rejectedVoiceReferences,
  QualityReport: Prisma.DbNull,
  FinalPlaylistPath: null,
  InputManifest: Prisma.DbNull,
  InputManifestHash: null,
  ArtifactManifest: Prisma.DbNull,
  ArtifactManifestHash: null,
  AssignedWorkerID: null,
  PreferredWorkerID: null,
  LeaseTokenHash: null,
  LeaseExpiresAt: null,
  NextEligibleAt: null,
  AttemptCount: 0,
  ErrorMessage: null,
  PreviewApprovedByUserID: null,
  PreviewApprovedAt: null,
  FinalApprovedByUserID: null,
  FinalApprovedAt: null,
  StartedAt: null,
  CompletedAt: null,
});

const requeuePreviewAnalysis = async ({
  job,
  data,
  database,
  expectedStatus = AI_DUBBING_STATUS.PREVIEW_REVIEW,
}) => {
  const updated = await database.aiDubbingJob.updateMany({
    where: { AiDubbingJobID: job.AiDubbingJobID, Status: expectedStatus },
    data,
  });
  if (updated.count !== 1) {
    const error = new Error("L'état du doublage a changé. Rechargez la liste.");
    error.statusCode = 409;
    throw error;
  }
  await cleanupAiDubbingInput(job.AiDubbingJobID).catch(() => {});
  return getAiDubbingJob(job.AiDubbingJobID, { database });
};

export async function retryFailedAiDubbing({
  jobId, database = prisma, env = process.env,
}) {
  const job = await getAiDubbingJob(jobId, { database });
  if (job.Status !== AI_DUBBING_STATUS.FAILED) {
    const error = new Error("Seul un doublage en échec peut relancer son analyse.");
    error.statusCode = 409;
    error.code = "AI_DUBBING_RETRY_UNAVAILABLE";
    throw error;
  }
  const runtime = requireCurrentAiDubbingRuntime(env);
  const targetedRetry = Array.isArray(job.VoiceSamples)
    && job.VoiceSamples.some((sample) => sample?.regenerationRequested === true);
  if (job.ManualVoiceReferences && !runtime.profile.generationConfig.manualVoiceReferences) {
    throw Object.assign(new Error("Cette préparation guidée nécessite un profil V5 R4 compatible sur le primary et le clone."), { statusCode: 409 });
  }
  if (targetedRetry) assertAiDubbingJobMatchesRuntimeProfile(job, runtime);
  return requeuePreviewAnalysis({
    job,
    database,
    expectedStatus: AI_DUBBING_STATUS.FAILED,
    data: previewRequeueData({
      expectedSpeakerCount: Number(job.ExpectedSpeakerCount) || Number(job.SpeakerCount) || null,
      rejectedVoiceReferences: Array.isArray(job.RejectedVoiceReferences)
        ? job.RejectedVoiceReferences
        : [],
      runtime,
      preservedProfiles: targetedRetry ? {
        previewRelativePath: job.PreviewRelativePath,
        voiceProfileRelativePath: job.VoiceProfileRelativePath,
        voiceProfileChecksum: job.VoiceProfileChecksum,
        speakerCount: Number(job.SpeakerCount) || null,
        voiceSamples: job.VoiceSamples,
      } : null,
    }),
  });
}

export async function regenerateAiDubbingVoiceProfile({
  jobId, speaker, database = prisma, env = process.env,
}) {
  const job = await getAiDubbingJob(jobId, { database });
  const { sample } = requirePreviewVoiceProfile(job, speaker);
  let reference = sample;
  if (!(Number(sample?.referenceSourceEnd) > Number(sample?.referenceSourceStart))) {
    const profileRoot = resolveProtectedVideoStorageFile(
      job.VideoID,
      job.VoiceProfileRelativePath
    )?.absolutePath;
    const manifestPath = profileRoot ? path.join(profileRoot, "manifest.json") : null;
    if (manifestPath && fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8"));
      const storedReference = manifest?.references?.[String(sample?.speaker || speaker)];
      if (storedReference) {
        reference = {
          ...sample,
          referenceSourceStart: storedReference.sourceStart,
          referenceSourceEnd: storedReference.sourceEnd,
          referenceSha256: storedReference.sha256,
        };
      }
    }
  }
  const start = Number(reference?.referenceSourceStart);
  const end = Number(reference?.referenceSourceEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    const error = new Error("Cette ancienne référence ne contient pas les repères nécessaires à sa régénération.");
    error.statusCode = 409;
    error.code = "AI_DUBBING_VOICE_REFERENCE_RANGE_REQUIRED";
    throw error;
  }
  const rejected = Array.isArray(job.RejectedVoiceReferences)
    ? [...job.RejectedVoiceReferences]
    : [];
  rejected.push({
    sourceStart: start,
    sourceEnd: end,
    speaker: String(sample.speaker || speaker),
    sha256: String(reference.referenceSha256 || "") || null,
  });
  if (job.ManualVoiceReferences) {
    const selected = job.ManualVoiceReferences.find(group => group.speaker === String(sample.speaker || speaker));
    const remaining = selected?.ranges.some(range => !rejected.some(previous => (
      Math.max(range.start, Number(previous.sourceStart)) < Math.min(range.end, Number(previous.sourceEnd))
    )));
    if (!remaining) {
      throw Object.assign(new Error("Aucun autre passage choisi n'est disponible pour cet intervenant. Créez une nouvelle préparation guidée avec d'autres passages ; les profils actuels restent conservés."), {
        statusCode: 409, code: "AI_DUBBING_MANUAL_ALTERNATIVES_EXHAUSTED",
      });
    }
  }
  const runtime = requireCurrentAiDubbingRuntime(env);
  assertAiDubbingJobMatchesRuntimeProfile(job, runtime);
  const preservedVoiceSamples = job.VoiceSamples.map((voiceSample) => ({
    ...voiceSample,
    regenerationRequested: String(voiceSample?.speaker || "") === String(sample.speaker || speaker),
  }));
  return requeuePreviewAnalysis({
    job,
    database,
    data: previewRequeueData({
      expectedSpeakerCount: Number(job.ExpectedSpeakerCount) || Number(job.SpeakerCount) || null,
      rejectedVoiceReferences: rejected,
      runtime,
      preservedProfiles: {
        previewRelativePath: job.PreviewRelativePath,
        voiceProfileRelativePath: job.VoiceProfileRelativePath,
        voiceProfileChecksum: job.VoiceProfileChecksum,
        speakerCount: Number(job.SpeakerCount) || null,
        voiceSamples: preservedVoiceSamples,
      },
    }),
  });
}

export async function addAiDubbingSpeaker({ jobId, database = prisma, env = process.env }) {
  const job = await getAiDubbingJob(jobId, { database });
  if (job.ManualVoiceReferences) {
    throw Object.assign(new Error("Pour ajouter une voix à une préparation guidée, créez une nouvelle préparation avec les passages de tous les intervenants."), { statusCode: 409 });
  }
  if (job.Status !== AI_DUBBING_STATUS.PREVIEW_REVIEW) {
    const error = new Error("Un intervenant ne peut être ajouté que pendant le contrôle des profils.");
    error.statusCode = 409;
    error.code = "AI_DUBBING_ADD_SPEAKER_UNAVAILABLE";
    throw error;
  }
  const currentCount = Number(job.ExpectedSpeakerCount) || Number(job.SpeakerCount) || 0;
  const expectedSpeakerCount = normalizeAiDubbingExpectedSpeakerCount(currentCount + 1);
  const runtime = requireCurrentAiDubbingRuntime(env);
  return requeuePreviewAnalysis({
    job,
    database,
    data: previewRequeueData({
      expectedSpeakerCount,
      rejectedVoiceReferences: Array.isArray(job.RejectedVoiceReferences)
        ? job.RejectedVoiceReferences
        : [],
      runtime,
    }),
  });
}

export async function rejectAiDubbing({ jobId, adminUserId, database = prisma }) {
  const updated = await database.aiDubbingJob.updateMany({
    where: {
      AiDubbingJobID: String(jobId),
      Status: { in: [AI_DUBBING_STATUS.PREVIEW_REVIEW, AI_DUBBING_STATUS.FINAL_REVIEW] },
    },
    data: {
      Status: AI_DUBBING_STATUS.REJECTED,
      Phase: "REJECTED",
      ErrorMessage: `Refusé par l'administrateur ${Number(adminUserId)}.`,
    },
  });
  if (updated.count !== 1) {
    const error = new Error("Seule une piste en attente de validation peut être refusée.");
    error.statusCode = 409;
    throw error;
  }
  const job = await getAiDubbingJob(jobId, { database });
  await cleanupAiDubbingInput(job.AiDubbingJobID).catch(() => {});
  return job;
}

export async function publishAiDubbing({ jobId, adminUserId, database = prisma }) {
  const job = await getAiDubbingJob(jobId, { database });
  if (job.Status !== AI_DUBBING_STATUS.FINAL_REVIEW || !job.FinalPlaylistPath) {
    const error = new Error("La piste complète doit être prête et validée avant publication.");
    error.statusCode = 409;
    throw error;
  }
  if (!job.Watermarked || job.DisclosureVersion !== AI_DISCLOSURE_VERSION) {
    const error = new Error("La piste ne fournit pas les garanties de transparence requises.");
    error.statusCode = 409;
    throw error;
  }
  if (
    !job.VoiceProfileRelativePath
    || !job.VoiceProfileChecksum
    || !(Number(job.SpeakerCount) > 0)
    || !Array.isArray(job.VoiceSamples)
    || job.VoiceSamples.length !== Number(job.SpeakerCount)
  ) {
    const error = new Error("La piste complète ne réutilise aucun profil vocal préalablement validé.");
    error.statusCode = 409;
    error.code = "AI_DUBBING_VOICE_PROFILE_REQUIRED";
    throw error;
  }
  if (!voiceProfilesAreAccepted(job)) {
    const error = new Error("La piste complète ne possède pas une validation explicite pour chaque profil vocal.");
    error.statusCode = 409;
    error.code = "AI_DUBBING_VOICE_PROFILES_NOT_ACCEPTED";
    throw error;
  }
  await database.$transaction(async (tx) => {
    const aggregate = await tx.videoAudioTrack.aggregate({
      where: { VideoID: job.VideoID },
      _max: { Ordre: true },
    });
    await tx.videoAudioTrack.create({
      data: {
        VideoID: job.VideoID,
        Label: `${aiLanguageLabel(job.TargetLanguage)} — doublage IA`,
        Language: job.TargetLanguage,
        CheminPlaylist: job.FinalPlaylistPath,
        IsDefault: false,
        Origin: "AI_DUB",
        Synthetic: true,
        DisclosureVersion: AI_DISCLOSURE_VERSION,
        PipelineVersion: job.PipelineVersion,
        AiDubbingJobID: job.AiDubbingJobID,
        Ordre: (aggregate._max.Ordre ?? -1) + 1,
      },
    });
    await tx.aiDubbingJob.update({
      where: { AiDubbingJobID: job.AiDubbingJobID },
      data: {
        Status: AI_DUBBING_STATUS.PUBLISHED,
        Phase: "PUBLISHED",
        Progress: 100,
        FinalApprovedByUserID: Number(adminUserId),
        FinalApprovedAt: new Date(),
      },
    });
  });
  return getAiDubbingJob(jobId, { database });
}

const DELETABLE_AI_DUBBING_STATUSES = new Set([
  AI_DUBBING_STATUS.PREVIEW_REVIEW,
  AI_DUBBING_STATUS.FINAL_REVIEW,
  AI_DUBBING_STATUS.PUBLISHED,
  AI_DUBBING_STATUS.REJECTED,
  AI_DUBBING_STATUS.FAILED,
]);

const removeStoredAiDubbing = async (job) => {
  const roots = [
    path.join(
      VIDEO_ROOT, String(job.VideoID), "audio", "ai",
      String(job.TargetLanguage), String(job.AiDubbingJobID)
    ),
    path.join(
      VIDEO_ROOT, String(job.VideoID), "hls", "audio", "ai",
      String(job.TargetLanguage), String(job.AiDubbingJobID)
    ),
  ];
  await Promise.all(roots.map((root) => fs.promises.rm(root, { recursive: true, force: true })));
  await cleanupAiDubbingInput(job.AiDubbingJobID);
};

export async function deleteAiDubbing({ jobId, database = prisma } = {}) {
  const job = await getAiDubbingJob(jobId, { database });
  if (!DELETABLE_AI_DUBBING_STATUSES.has(job.Status)) {
    const error = new Error("Une génération en attente ou en cours ne peut pas être supprimée.");
    error.statusCode = 409;
    error.code = "AI_DUBBING_DELETE_BUSY";
    throw error;
  }
  const track = job.GeneratedAudioTrack;
  if (track && (track.Origin !== "AI_DUB" || track.Synthetic !== true)) {
    const error = new Error("La piste liée n'est pas identifiée comme un doublage IA SAMI.");
    error.statusCode = 409;
    error.code = "AI_DUBBING_DELETE_UNSAFE_TRACK";
    throw error;
  }
  if (track?.IsDefault) {
    const error = new Error("Choisissez d'abord une autre piste audio par défaut avant la suppression.");
    error.statusCode = 409;
    error.code = "AI_DUBBING_DELETE_DEFAULT_TRACK";
    throw error;
  }
  await database.$transaction(async (tx) => {
    if (track) {
      await tx.videoAudioTrack.delete({
        where: { VideoAudioTrackID: track.VideoAudioTrackID },
      });
    }
    await tx.aiDubbingJob.delete({ where: { AiDubbingJobID: job.AiDubbingJobID } });
  });
  let cleanupCompleted = true;
  await removeStoredAiDubbing(job).catch((error) => {
    cleanupCompleted = false;
    console.error(`[ai-dubbing] nettoyage incomplet après suppression ${job.AiDubbingJobID}`, error);
  });
  return { job, cleanupCompleted };
}

export const AI_DUBBING_JOB_INCLUDE = jobInclude;
