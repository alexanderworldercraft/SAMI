import fs from "fs";
import crypto from "crypto";
import path from "path";
import ffmpeg from "fluent-ffmpeg";

import { prisma } from "../db.js";
import { resolveUploadPath, VIDEO_ROOT } from "../video/videoPaths.js";
import { resolveProtectedVideoStorageFile } from "../protectedMediaService.js";
import { getAiDubbingConfig } from "./config.js";
import { AI_DUBBING_STATUS } from "./constants.js";
import { retainUntargetedVoiceSample } from "./resultService.js";
import { assertManualVoiceReferenceManifest } from "./manualReferences.js";
import { runAiDubbingCommand } from "./commandRunner.js";
export { runAiDubbingCommand, terminateDubbingProcessTree } from "./commandRunner.js";

const runningJobs = new Map();
const PREVIEW_DURATION_SECONDS = 45;

const isInside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const sha256File = (filename) => {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filename));
  return hash.digest("hex");
};

const copyValidatedVoiceProfile = async ({ sourceRoot, destinationRoot, expectedChecksum, manualVoiceReferences }) => {
  const manifestSource = path.join(sourceRoot, "manifest.json");
  if (!fs.existsSync(manifestSource) || sha256File(manifestSource) !== String(expectedChecksum || "")) {
    throw new Error("Le manifeste du profil vocal généré est absent ou invalide.");
  }
  const manifest = JSON.parse(await fs.promises.readFile(manifestSource, "utf8"));
  assertManualVoiceReferenceManifest(manifest, manualVoiceReferences);
  if (manifest.schemaVersion !== 2 || !Object.keys(manifest.references || {}).length) {
    throw new Error("Le profil vocal généré ne contient aucune référence exploitable.");
  }
  const files = [{ source: manifestSource, relative: "manifest.json" }];
  for (const entry of Object.values(manifest.references)) {
    const relative = String(entry?.path || "");
    const source = path.resolve(sourceRoot, relative);
    if (!relative || !isInside(sourceRoot, source) || !fs.existsSync(source)) {
      throw new Error("Le profil vocal généré contient un chemin de référence invalide.");
    }
    const stat = await fs.promises.lstat(source);
    if (!stat.isFile() || stat.isSymbolicLink() || sha256File(source) !== String(entry.sha256 || "")) {
      throw new Error("Une référence vocale générée est absente ou invalide.");
    }
    files.push({ source, relative });
  }
  await fs.promises.rm(destinationRoot, { recursive: true, force: true });
  for (const file of files) {
    const destination = path.join(destinationRoot, file.relative);
    await fs.promises.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fs.promises.copyFile(file.source, destination);
  }
  return manifest;
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

const markFailed = async (jobId, error, database) => {
  await database.aiDubbingJob.updateMany({
    where: {
      AiDubbingJobID: String(jobId),
      Status: { in: [AI_DUBBING_STATUS.PROCESSING_PREVIEW, AI_DUBBING_STATUS.PROCESSING_FULL] },
    },
    data: {
      Status: AI_DUBBING_STATUS.FAILED,
      Phase: "FAILED",
      ErrorMessage: String(error?.message || error).slice(0, 10_000),
    },
  });
};

export const buildAiDubbingRuntimeInput = ({
  job,
  preview,
  sourcePlaylist,
  targetSubtitle,
}) => {
  const regenerationTarget = preview && Array.isArray(job.VoiceSamples)
    ? String(job.VoiceSamples.find((sample) => sample?.regenerationRequested === true)?.speaker || "") || null
    : null;
  return ({
    schemaVersion: 4,
    phase: preview ? "preview" : "full",
    videoId: job.VideoID,
    sourcePlaylist,
    targetSubtitle,
    targetLanguage: job.TargetLanguage,
    previewDurationSeconds: PREVIEW_DURATION_SECONDS,
    previewStartSeconds: preview ? Math.max(0, Number(job.PreviewStartSeconds) || 0) : 0,
    expectedSpeakerCount: Number(job.ExpectedSpeakerCount) || null,
    manualVoiceReferences: job.ManualVoiceReferences || null,
    rejectedVoiceReferences: preview && Array.isArray(job.RejectedVoiceReferences)
      ? job.RejectedVoiceReferences
      : [],
    regenerationTarget,
    voiceProfilePath: preview && !regenerationTarget ? null : job.voiceProfileAbsolutePath,
    voiceProfileChecksum: preview && !regenerationTarget ? null : job.VoiceProfileChecksum,
    models: {
      voiceEngine: job.VoiceEngine,
      voiceModel: job.VoiceModel,
      voiceModelRevision: job.VoiceModelRevision,
      diarization: job.DiarizationModel,
      separation: job.SeparationModel,
      pipeline: job.PipelineVersion,
    },
    generationConfigHash: job.GenerationConfigHash,
    requirements: {
      localOnly: true,
      preserveBackground: true,
      cloneClosestSpeakerVoices: true,
      watermarkRequired: true,
    },
  });
};

async function processAiDubbingJob(jobId, { database = prisma, env = process.env } = {}) {
  const config = getAiDubbingConfig(env);
  const initial = await database.aiDubbingJob.findUnique({
    where: { AiDubbingJobID: String(jobId) },
  });
  if (!initial) return;
  const preview = initial.Status === AI_DUBBING_STATUS.QUEUED_PREVIEW;
  const full = initial.Status === AI_DUBBING_STATUS.QUEUED_FULL;
  if (!preview && !full) return;

  const processingStatus = preview
    ? AI_DUBBING_STATUS.PROCESSING_PREVIEW
    : AI_DUBBING_STATUS.PROCESSING_FULL;
  const locked = await database.aiDubbingJob.updateMany({
    where: { AiDubbingJobID: initial.AiDubbingJobID, Status: initial.Status },
    data: { Status: processingStatus, Progress: 1, ErrorMessage: null },
  });
  if (locked.count !== 1) return;

  const workspace = path.join(config.workRoot, initial.AiDubbingJobID, preview ? "preview" : "full");
  try {
    await fs.promises.rm(workspace, { recursive: true, force: true });
    await fs.promises.mkdir(workspace, { recursive: true, mode: 0o700 });
    const video = await database.video.findUnique({ where: { VideoID: initial.VideoID } });
    const subtitle = await database.videoSubtitle.findFirst({
      where: { VideoID: initial.VideoID, Language: initial.TargetLanguage },
      orderBy: [{ Origin: "asc" }, { CreateDate: "desc" }],
    });
    const sourcePlaylist = resolveProtectedVideoStorageFile(
      initial.VideoID,
      video?.CheminAcces
    )?.absolutePath;
    const targetSubtitle = resolveProtectedVideoStorageFile(
      initial.VideoID,
      subtitle?.CheminSubtitle
    )?.absolutePath;
    if (!sourcePlaylist || !targetSubtitle || !fs.existsSync(sourcePlaylist) || !fs.existsSync(targetSubtitle)) {
      throw new Error("La vidéo source ou le sous-titre cible est introuvable.");
    }
    const regenerationTarget = preview && Array.isArray(initial.VoiceSamples)
      ? initial.VoiceSamples.find((sample) => sample?.regenerationRequested === true)?.speaker || null
      : null;
    const voiceProfileAbsolutePath = full || regenerationTarget
      ? resolveProtectedVideoStorageFile(initial.VideoID, initial.VoiceProfileRelativePath)?.absolutePath
      : null;
    if ((full || regenerationTarget) && (
      !voiceProfileAbsolutePath
      || !fs.existsSync(voiceProfileAbsolutePath)
      || !initial.VoiceProfileChecksum
    )) {
      throw new Error("Les profils vocaux verrouillés sont absents ; le traitement est bloqué.");
    }
    const inputPath = path.join(workspace, "input.json");
    const outputPath = path.join(workspace, "output.json");
    await fs.promises.writeFile(inputPath, JSON.stringify(buildAiDubbingRuntimeInput({
      job: { ...initial, voiceProfileAbsolutePath },
      preview,
      sourcePlaylist,
      targetSubtitle,
    })), { encoding: "utf8", mode: 0o600 });

    await runAiDubbingCommand(config.command, [
      "--phase", preview ? "preview" : "full",
      "--input", inputPath,
      "--output", outputPath,
    ], {
      cwd: workspace,
      onProgress: async ({ progress, stage }) => {
        const nextProgress = Math.max(2, Math.min(99, Number.parseInt(progress, 10) || 0));
        await database.aiDubbingJob.updateMany({
          where: {
            AiDubbingJobID: initial.AiDubbingJobID,
            Status: processingStatus,
            Progress: { lt: nextProgress },
          },
          data: {
            Progress: nextProgress,
            ...(String(stage || "").trim() ? { Phase: String(stage).slice(0, 32) } : {}),
          },
        });
      },
    });
    const result = JSON.parse(await fs.promises.readFile(outputPath, "utf8"));
    const audioPath = path.resolve(String(result.audioPath || ""));
    if (!isInside(workspace, audioPath) || !fs.existsSync(audioPath)) {
      throw new Error("Le runtime de doublage n'a pas produit de fichier audio valide dans son espace de travail.");
    }
    if (result.watermarked !== true) {
      throw new Error("Le runtime n'a pas confirmé le watermark du fichier synthétique.");
    }
    if (full && (
      String(result.voiceProfileChecksum || "") !== String(initial.VoiceProfileChecksum || "")
      || Number(result.speakerCount) !== Number(initial.SpeakerCount)
    )) {
      throw new Error("La piste complète ne confirme pas les profils vocaux précédemment validés.");
    }

    if (preview) {
      const extension = [".m4a", ".mp3", ".ogg", ".wav"].includes(path.extname(audioPath).toLowerCase())
        ? path.extname(audioPath).toLowerCase()
        : ".wav";
      const previewDir = path.join(
        VIDEO_ROOT,
        String(initial.VideoID),
        "audio",
        "ai",
        initial.TargetLanguage,
        initial.AiDubbingJobID,
        "preview"
      );
      await fs.promises.mkdir(previewDir, { recursive: true });
      const finalPreviewPath = path.join(previewDir, `preview${extension}`);
      await fs.promises.copyFile(audioPath, finalPreviewPath);
      const generatedProfilePath = path.resolve(String(result.voiceProfilePath || ""));
      if (!isInside(workspace, generatedProfilePath)) {
        throw new Error("Le runtime a produit ses profils vocaux hors de l'espace de travail autorisé.");
      }
      const profileDir = path.join(
        VIDEO_ROOT,
        String(initial.VideoID),
        "audio",
        "ai",
        initial.TargetLanguage,
        initial.AiDubbingJobID,
        "profile"
      );
      const voiceProfile = await copyValidatedVoiceProfile({
        sourceRoot: generatedProfilePath,
        destinationRoot: profileDir,
        expectedChecksum: result.voiceProfileChecksum,
        manualVoiceReferences: initial.ManualVoiceReferences,
      });
      const generatedSamples = Array.isArray(result.voiceSamples) ? result.voiceSamples : [];
      const expectedSpeakers = new Set(voiceProfile.speakers || []);
      const sampleSpeakers = new Set(generatedSamples.map((sample) => String(sample?.speaker || "")));
      const expectedSampleSpeakers = regenerationTarget
        ? new Set([String(regenerationTarget)])
        : expectedSpeakers;
      if (
        generatedSamples.length !== expectedSampleSpeakers.size
        || sampleSpeakers.size !== expectedSampleSpeakers.size
        || [...expectedSampleSpeakers].some((speaker) => !sampleSpeakers.has(speaker))
      ) {
        throw new Error("Les échantillons de validation ne couvrent pas les profils vocaux attendus.");
      }
      const generatedSamplesBySpeaker = new Map(
        generatedSamples.map((sample) => [String(sample?.speaker || ""), sample])
      );
      const storedVoiceSamples = [];
      const retainedSamples = new Map(
        (initial.VoiceSamples || []).map((sample) => [String(sample?.speaker || ""), sample])
      );
      for (const speakerValue of expectedSpeakers) {
        const speaker = String(speakerValue);
        const retainedSample = retainUntargetedVoiceSample({
          speaker,
          regenerationTarget,
          retained: retainedSamples.get(speaker),
          reference: voiceProfile.references?.[speaker],
        });
        if (retainedSample) {
          const retainedPath = resolveUploadPath(retainedSample.relativePath);
          if (!retainedPath || !fs.existsSync(retainedPath)) {
            throw new Error(`Le profil verrouillé ${speaker} ne peut pas être conservé.`);
          }
          storedVoiceSamples.push(retainedSample);
          continue;
        }
        if (regenerationTarget && speaker !== regenerationTarget) {
          throw new Error(`Le profil verrouillé ${speaker} ne correspond plus à sa référence.`);
        }
        const sample = generatedSamplesBySpeaker.get(speaker);
        if (!sample) {
          throw new Error(`L'échantillon vocal ${speaker} est absent.`);
        }
        const safeSpeaker = speaker.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "speaker";
        const source = path.resolve(String(sample.audioPath || ""));
        if (
          !isInside(workspace, source)
          || !fs.existsSync(source)
          || !(Number(sample.watermarkConfidence) >= 0.5)
        ) {
          throw new Error(`L'échantillon vocal ${speaker} est absent ou non watermarqué.`);
        }
        const relativePath = path.posix.join(
          "uploads", "video", String(initial.VideoID), "audio", "ai",
          initial.TargetLanguage, initial.AiDubbingJobID, "preview", "voices", `${safeSpeaker}.wav`
        );
        const destination = path.join(previewDir, "voices", `${safeSpeaker}.wav`);
        await fs.promises.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
        await fs.promises.copyFile(source, destination);
        storedVoiceSamples.push({
          speaker,
          sourceStart: Math.max(0, Number(sample.sourceStart) || 0),
          referenceSourceStart: Math.max(0, Number(voiceProfile.references?.[speaker]?.sourceStart) || 0),
          referenceSourceEnd: Math.max(0, Number(voiceProfile.references?.[speaker]?.sourceEnd) || 0),
          referenceSha256: String(voiceProfile.references?.[speaker]?.sha256 || ""),
          text: String(sample.text || "").slice(0, 500),
          reviewStatus: "PENDING",
          reviewedByUserId: null,
          reviewedAt: null,
          relativePath,
        });
      }
      await database.aiDubbingJob.update({
        where: { AiDubbingJobID: initial.AiDubbingJobID },
        data: {
          Status: AI_DUBBING_STATUS.PREVIEW_REVIEW,
          Phase: "PREVIEW_REVIEW",
          Progress: 100,
          SourceLanguage: result.sourceLanguage || null,
          PreviewRelativePath: path.posix.join(
            "uploads", "video", String(initial.VideoID), "audio", "ai",
            initial.TargetLanguage, initial.AiDubbingJobID, "preview", `preview${extension}`
          ),
          VoiceProfileRelativePath: path.posix.join(
            "uploads", "video", String(initial.VideoID), "audio", "ai",
            initial.TargetLanguage, initial.AiDubbingJobID, "profile"
          ),
          VoiceProfileChecksum: String(result.voiceProfileChecksum),
          SpeakerCount: Array.isArray(voiceProfile.speakers) ? voiceProfile.speakers.length : null,
          VoiceSamples: storedVoiceSamples,
          Watermarked: true,
        },
      });
      return;
    }

    const finalDir = path.join(
      VIDEO_ROOT,
      String(initial.VideoID),
      "hls",
      "audio",
      "ai",
      initial.TargetLanguage,
      initial.AiDubbingJobID
    );
    await fs.promises.rm(finalDir, { recursive: true, force: true });
    const playlistPath = await encodeAudioHls({ inputPath: audioPath, outputDir: finalDir });
    await database.aiDubbingJob.update({
      where: { AiDubbingJobID: initial.AiDubbingJobID },
      data: {
        Status: AI_DUBBING_STATUS.FINAL_REVIEW,
        Phase: "FINAL_REVIEW",
        Progress: 100,
        SourceLanguage: result.sourceLanguage || initial.SourceLanguage,
        FinalPlaylistPath: path.posix.join(
          "uploads", "video", String(initial.VideoID), "hls", "audio", "ai",
          initial.TargetLanguage, initial.AiDubbingJobID, path.basename(playlistPath)
        ),
        Watermarked: true,
      },
    });
  } catch (error) {
    await markFailed(initial.AiDubbingJobID, error, database);
    throw error;
  } finally {
    await fs.promises.rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

export function scheduleAiDubbingJob(jobId, options = {}) {
  const key = String(jobId);
  if (runningJobs.has(key)) return runningJobs.get(key);
  const promise = processAiDubbingJob(key, options)
    .catch((error) => console.error(`Doublage IA ${key} échoué :`, error))
    .finally(() => runningJobs.delete(key));
  runningJobs.set(key, promise);
  return promise;
}

export async function recoverQueuedAiDubbingJobs({ database = prisma } = {}) {
  const jobs = await database.aiDubbingJob.findMany({
    where: { Status: { in: [AI_DUBBING_STATUS.QUEUED_PREVIEW, AI_DUBBING_STATUS.QUEUED_FULL] } },
    select: { AiDubbingJobID: true },
  });
  jobs.forEach((job) => scheduleAiDubbingJob(job.AiDubbingJobID, { database }));
  return jobs.length;
}
