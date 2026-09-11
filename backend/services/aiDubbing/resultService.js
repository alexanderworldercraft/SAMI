import crypto from "crypto";
import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";

import { prisma } from "../db.js";
import { resolveUploadPath, VIDEO_ROOT } from "../video/videoPaths.js";
import { AI_DUBBING_STATUS } from "./constants.js";
import { assertManualVoiceReferenceManifest } from "./manualReferences.js";

const isInside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const sha256FileSync = (filename) => {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filename));
  return hash.digest("hex");
};

const encodeAudioHls = ({ inputPath, outputDir }) => new Promise((resolve, reject) => {
  fs.mkdirSync(outputDir, { recursive: true });
  const playlistPath = path.join(outputDir, "playlist.m3u8");
  const segmentPath = path.join(outputDir, "segment_%05d.ts");
  ffmpeg(inputPath)
    .outputOptions([
      "-vn",
      "-c:a aac",
      "-ac 2",
      "-ar 48000",
      "-b:a 192k",
      "-hls_time 4",
      "-hls_playlist_type vod",
      `-hls_segment_filename ${segmentPath}`,
    ])
    .output(playlistPath)
    .on("end", () => resolve(playlistPath))
    .on("error", reject)
    .run();
});

const assertResultIdentity = (job, result) => {
  if (result?.watermarked !== true || !(Number(result.watermarkConfidence) >= 0.5)) {
    throw new Error("Le clone n'a pas confirmé un watermark Perth exploitable.");
  }
  const expected = {
    voiceEngine: job.VoiceEngine,
    voiceModel: job.VoiceModel,
    voiceModelRevision: job.VoiceModelRevision || null,
    generationConfigHash: job.GenerationConfigHash || null,
  };
  const received = {
    voiceEngine: String(result.voiceEngine || ""),
    voiceModel: String(result.voiceModel || ""),
    voiceModelRevision: result.voiceModelRevision || null,
    generationConfigHash: result.generationConfigHash || null,
  };
  for (const key of Object.keys(expected)) {
    if (expected[key] !== received[key]) {
      throw new Error(`Le clone a changé ${key} entre l'attribution et le rendu.`);
    }
  }
};

export const normalizeQualityReport = (value) => {
  if (!value || value.schemaVersion !== 1) {
    throw new Error("Le clone n'a renvoyé aucun rapport qualité vocal exploitable.");
  }
  const warnings = Array.isArray(value.warnings) ? value.warnings.slice(0, 100).map((warning) => ({
    sourceStart: Math.max(0, Number(warning?.sourceStart) || 0),
    speaker: String(warning?.speaker || "").slice(0, 80),
    expected: String(warning?.expected || "").slice(0, 500),
    recognized: String(warning?.recognized || "").slice(0, 500),
    durationRatio: Number(warning?.durationRatio) || 0,
    originalDurationRatio: Number(warning?.originalDurationRatio) || 0,
    timingExtensionSeconds: Math.max(0, Number(warning?.timingExtensionSeconds) || 0),
    timingOverlapSeconds: Math.max(0, Number(warning?.timingOverlapSeconds) || 0),
    timingBoundaryTrimSeconds: Math.max(0, Number(warning?.timingBoundaryTrimSeconds) || 0),
    attempts: Math.max(1, Number(warning?.attempts) || 1),
    cer: warning?.cer == null ? null : Number(warning.cer),
    selectedBestShortAttempt: warning?.selectedBestShortAttempt === true,
    shortCerMismatchAccepted: warning?.shortCerMismatchAccepted === true,
    translationBoundaryReview: ["clause_assignment_heuristic", "unsplit_translation_dominant_speaker"].includes(warning?.translationBoundaryReview)
      ? warning.translationBoundaryReview : null,
    candidateAttempts: Math.max(0, Math.min(3, Number(warning?.candidateAttempts) || 0)),
    severity: warning?.severity === "warning" ? "warning" : "info",
  })) : [];
  const scriptWarnings = Array.isArray(value.script?.warnings)
    ? value.script.warnings.slice(0, 100).map((warning) => ({
      sourceStart: Math.max(0, Number(warning?.sourceStart) || 0),
      flags: Array.isArray(warning?.flags)
        ? warning.flags.slice(0, 20).map((flag) => String(flag).slice(0, 80))
        : [],
      sourceConfidence: warning?.sourceConfidence == null
        ? null
        : Math.max(0, Math.min(1, Number(warning.sourceConfidence) || 0)),
      displayText: String(warning?.displayText || "").slice(0, 500),
    }))
    : [];
  return {
    schemaVersion: 1,
    utteranceCount: Math.max(0, Number(value.utteranceCount) || 0),
    retriedCount: Math.max(0, Number(value.retriedCount) || 0),
    validatedCount: Math.max(0, Number(value.validatedCount) || 0),
    warnings,
    script: {
      schemaVersion: 1,
      strategy: String(value.script?.strategy || "legacy-vtt").slice(0, 120),
      cueCount: Math.max(0, Number(value.script?.cueCount) || 0),
      warningCount: Math.max(0, Number(value.script?.warningCount) || scriptWarnings.length),
      warnings: scriptWarnings,
    },
    speakerStems: Array.isArray(value.speakerStems)
      ? value.speakerStems.slice(0, 30).map((speaker) => String(speaker).slice(0, 80))
      : [],
    backgroundStem: String(value.backgroundStem || "").slice(0, 80) || null,
  };
};

export const retainUntargetedVoiceSample = ({
  speaker,
  regenerationTarget,
  retained,
  reference,
} = {}) => {
  if (!regenerationTarget || speaker === regenerationTarget || !retained) return null;
  if (String(retained.referenceSha256 || "") !== String(reference?.sha256 || "")) return null;
  return {
    speaker: String(speaker),
    sourceStart: Math.max(0, Number(retained.sourceStart) || 0),
    referenceSourceStart: Math.max(0, Number(retained.referenceSourceStart) || 0),
    referenceSourceEnd: Math.max(0, Number(retained.referenceSourceEnd) || 0),
    referenceSha256: String(retained.referenceSha256 || ""),
    text: String(retained.text || "").slice(0, 500),
    reviewStatus: String(retained.reviewStatus || "PENDING"),
    reviewedByUserId: retained.reviewedByUserId == null
      ? null
      : Number(retained.reviewedByUserId),
    reviewedAt: retained.reviewedAt || null,
    relativePath: String(retained.relativePath || ""),
  };
};

const copyPreviewProfile = async ({ job, result, files, beforeCommit = null }) => {
  const manifestArtifact = Object.values(files).find((entry) => entry.kind === "profile-manifest");
  if (!manifestArtifact || sha256FileSync(manifestArtifact.absolutePath) !== result.voiceProfileChecksum) {
    throw new Error("Le manifeste vocal renvoyé par le clone est invalide.");
  }
  const manifest = JSON.parse(await fs.promises.readFile(manifestArtifact.absolutePath, "utf8"));
  assertManualVoiceReferenceManifest(manifest, job.ManualVoiceReferences);
  if (manifest.schemaVersion !== 2 || manifest.voiceEngine !== job.VoiceEngine) {
    throw new Error("Le profil vocal ne correspond pas au moteur attribué.");
  }
  if (
    manifest.voiceModel !== job.VoiceModel
    || (manifest.voiceModelRevision || null) !== (job.VoiceModelRevision || null)
    || (manifest.generationConfigHash || null) !== (job.GenerationConfigHash || null)
  ) {
    throw new Error("Le profil vocal ne verrouille pas le modèle et ses paramètres.");
  }
  const profileDir = path.join(
    VIDEO_ROOT,
    String(job.VideoID),
    "audio",
    "ai",
    job.TargetLanguage,
    job.AiDubbingJobID,
    "profile"
  );
  const temporaryDir = `${profileDir}.${crypto.randomUUID()}.tmp`;
  await fs.promises.mkdir(temporaryDir, { recursive: true, mode: 0o700 });
  try {
    await fs.promises.copyFile(manifestArtifact.absolutePath, path.join(temporaryDir, "manifest.json"));
    for (const [speaker, reference] of Object.entries(manifest.references || {})) {
      const artifact = Object.values(files).find((entry) => (
        entry.kind === "profile-reference" && entry.speaker === speaker
      ));
      const relative = String(reference?.path || "");
      const destination = path.resolve(temporaryDir, ...relative.split("/"));
      if (
        !artifact
        || !relative
        || !isInside(temporaryDir, destination)
        || artifact.sha256 !== String(reference.sha256 || "")
      ) {
        throw new Error(`La référence vocale ${speaker} est absente ou invalide.`);
      }
      await fs.promises.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      await fs.promises.copyFile(artifact.absolutePath, destination);
    }
    if (typeof beforeCommit === "function") await beforeCommit(manifest);
    await fs.promises.rm(profileDir, { recursive: true, force: true });
    await fs.promises.rename(temporaryDir, profileDir);
  } catch (error) {
    await fs.promises.rm(temporaryDir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
  return { manifest, profileDir };
};

export async function promoteAiDubbingResult({
  job,
  result,
  files,
  database = prisma,
} = {}) {
  assertResultIdentity(job, result);
  const qualityReport = normalizeQualityReport(result.qualityReport);
  const audio = Object.values(files).find((entry) => entry.kind === "audio");
  if (!audio) throw new Error("Le clone n'a renvoyé aucune piste audio.");
  const preview = job.Status === AI_DUBBING_STATUS.PROCESSING_PREVIEW;
  if (preview) {
    const regenerationTarget = Array.isArray(job.VoiceSamples)
      ? String(job.VoiceSamples.find((sample) => sample?.regenerationRequested === true)?.speaker || "")
      : "";
    const retainedSamples = new Map((job.VoiceSamples || []).map((sample) => [String(sample?.speaker || ""), sample]));
    const { manifest } = await copyPreviewProfile({
      job,
      result,
      files,
      beforeCommit: regenerationTarget ? async (nextManifest) => {
        for (const speaker of (nextManifest.speakers || []).map(String)) {
          if (speaker === regenerationTarget) continue;
          const retainedSample = retainUntargetedVoiceSample({
            speaker,
            regenerationTarget,
            retained: retainedSamples.get(speaker),
            reference: nextManifest.references?.[speaker],
          });
          const retainedPath = retainedSample
            ? resolveUploadPath(retainedSample.relativePath)
            : null;
          if (!retainedPath || !fs.existsSync(retainedPath)) {
            throw new Error(`Le profil verrouillé ${speaker} ne peut pas être conservé.`);
          }
        }
      } : null,
    });
    const speakers = Array.isArray(manifest.speakers) ? manifest.speakers.map(String) : [];
    if (!speakers.length || Number(result.speakerCount) !== speakers.length) {
      throw new Error("Le nombre de profils vocaux renvoyé par le clone est incohérent.");
    }
    const previewDir = path.join(
      VIDEO_ROOT,
      String(job.VideoID),
      "audio",
      "ai",
      job.TargetLanguage,
      job.AiDubbingJobID,
      "preview"
    );
    await fs.promises.mkdir(path.join(previewDir, "voices"), { recursive: true, mode: 0o700 });
    const finalPreviewPath = path.join(previewDir, "preview.wav");
    await fs.promises.copyFile(audio.absolutePath, finalPreviewPath);
    const samplesBySpeaker = new Map((result.voiceSamples || []).map((sample) => [String(sample.speaker), sample]));
    const storedVoiceSamples = [];
    for (const speaker of speakers) {
      const retained = retainedSamples.get(speaker);
      const retainedSample = retainUntargetedVoiceSample({
        speaker,
        regenerationTarget,
        retained,
        reference: manifest.references?.[speaker],
      });
      if (retainedSample) {
        const retainedPath = resolveUploadPath(retainedSample.relativePath);
        if (
          !retainedPath
          || !fs.existsSync(retainedPath)
        ) {
          throw new Error(`Le profil verrouillé ${speaker} ne peut pas être conservé.`);
        }
        storedVoiceSamples.push(retainedSample);
        continue;
      }
      if (regenerationTarget && speaker !== regenerationTarget) {
        throw new Error(`Le profil verrouillé ${speaker} ne correspond plus à sa référence.`);
      }
      const sample = samplesBySpeaker.get(speaker);
      const artifact = sample
        ? files[String(sample.artifactId || "")]
        : null;
      if (
        !artifact
        || artifact.kind !== "voice-sample"
        || artifact.speaker !== speaker
        || !(Number(sample.watermarkConfidence) >= 0.5)
      ) {
        throw new Error(`L'échantillon de contrôle ${speaker} est absent ou non watermarqué.`);
      }
      const safeSpeaker = speaker.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "speaker";
      const destination = path.join(previewDir, "voices", `${safeSpeaker}.wav`);
      await fs.promises.copyFile(artifact.absolutePath, destination);
      storedVoiceSamples.push({
        speaker,
        sourceStart: Math.max(0, Number(sample.sourceStart) || 0),
        referenceSourceStart: Math.max(0, Number(manifest.references?.[speaker]?.sourceStart) || 0),
        referenceSourceEnd: Math.max(0, Number(manifest.references?.[speaker]?.sourceEnd) || 0),
        referenceSha256: String(manifest.references?.[speaker]?.sha256 || ""),
        text: String(sample.text || "").slice(0, 500),
        reviewStatus: "PENDING",
        reviewedByUserId: null,
        reviewedAt: null,
        relativePath: path.posix.join(
          "uploads", "video", String(job.VideoID), "audio", "ai",
          job.TargetLanguage, job.AiDubbingJobID, "preview", "voices", `${safeSpeaker}.wav`
        ),
      });
    }
    return database.aiDubbingJob.update({
      where: { AiDubbingJobID: job.AiDubbingJobID },
      data: {
        Status: AI_DUBBING_STATUS.PREVIEW_REVIEW,
        Phase: "PREVIEW_REVIEW",
        Progress: 100,
        SourceLanguage: result.sourceLanguage || null,
        PreviewRelativePath: path.posix.join(
          "uploads", "video", String(job.VideoID), "audio", "ai",
          job.TargetLanguage, job.AiDubbingJobID, "preview", "preview.wav"
        ),
        VoiceProfileRelativePath: path.posix.join(
          "uploads", "video", String(job.VideoID), "audio", "ai",
          job.TargetLanguage, job.AiDubbingJobID, "profile"
        ),
        VoiceProfileChecksum: String(result.voiceProfileChecksum),
        SpeakerCount: speakers.length,
        VoiceSamples: storedVoiceSamples,
        QualityReport: qualityReport,
        PreferredWorkerID: job.AssignedWorkerID,
        AssignedWorkerID: null,
        LeaseTokenHash: null,
        LeaseExpiresAt: null,
        NextEligibleAt: null,
        Watermarked: true,
        ErrorMessage: null,
        CompletedAt: new Date(),
      },
    });
  }

  if (
    String(result.voiceProfileChecksum || "") !== String(job.VoiceProfileChecksum || "")
    || Number(result.speakerCount) !== Number(job.SpeakerCount)
  ) {
    throw new Error("La piste complète ne confirme pas les profils vocaux validés.");
  }
  const finalDir = path.join(
    VIDEO_ROOT,
    String(job.VideoID),
    "hls",
    "audio",
    "ai",
    job.TargetLanguage,
    job.AiDubbingJobID
  );
  await fs.promises.rm(finalDir, { recursive: true, force: true });
  const playlistPath = await encodeAudioHls({ inputPath: audio.absolutePath, outputDir: finalDir });
  return database.aiDubbingJob.update({
    where: { AiDubbingJobID: job.AiDubbingJobID },
    data: {
      Status: AI_DUBBING_STATUS.FINAL_REVIEW,
      Phase: "FINAL_REVIEW",
      Progress: 100,
      SourceLanguage: result.sourceLanguage || job.SourceLanguage,
      QualityReport: qualityReport,
      FinalPlaylistPath: path.posix.join(
        "uploads", "video", String(job.VideoID), "hls", "audio", "ai",
        job.TargetLanguage, job.AiDubbingJobID, path.basename(playlistPath)
      ),
      AssignedWorkerID: null,
      LeaseTokenHash: null,
      LeaseExpiresAt: null,
      NextEligibleAt: null,
      Watermarked: true,
      ErrorMessage: null,
      CompletedAt: new Date(),
    },
  });
}
