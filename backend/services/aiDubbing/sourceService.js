import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";

import { getFfmpegExecutable } from "../distributedEncoding/ffmpeg/index.js";
import { resolveProtectedVideoStorageFile } from "../protectedMediaService.js";
import { stableStringify } from "../videoTransferSecurity.js";
import { parseWebVtt } from "../aiSubtitles/vtt.js";
import { assertAiDubbingConfig } from "./config.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,119}$/i;

const requireJobId = (value) => {
  const id = String(value || "");
  if (!UUID_PATTERN.test(id)) throw new TypeError("AiDubbingJobID invalide.");
  return id;
};

const isInside = (root, candidate) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
};

const run = (command, args, { signal } = {}) => new Promise((resolve, reject) => {
  execFile(command, args, {
    windowsHide: true,
    shell: false,
    signal,
    maxBuffer: 4 * 1024 * 1024,
  }, (error, stdout, stderr) => {
    if (error) {
      error.message = `${error.message}${stderr ? ` : ${String(stderr).slice(-1500)}` : ""}`;
      reject(error);
      return;
    }
    resolve(stdout);
  });
});

export const sha256File = (filename) => new Promise((resolve, reject) => {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filename);
  stream.on("data", (chunk) => hash.update(chunk));
  stream.on("error", reject);
  stream.on("end", () => resolve(hash.digest("hex")));
});

const describeFile = async ({ id, kind, absolutePath, relativePath, speaker = null }) => {
  const stats = await fs.promises.stat(absolutePath);
  if (!stats.isFile()) throw new Error(`L'entrée ${id} n'est pas un fichier.`);
  return {
    id,
    kind,
    relativePath: String(relativePath).replaceAll(path.sep, "/"),
    size: stats.size,
    sha256: await sha256File(absolutePath),
    ...(speaker ? { speaker } : {}),
  };
};

const transcriptConfidence = (segments) => {
  const values = segments.flatMap((segment) => {
    const wordValues = Array.isArray(segment?.words)
      ? segment.words
        .filter((word) => word?.confidence != null)
        .map((word) => Number(word.confidence))
        .filter(Number.isFinite)
      : [];
    if (wordValues.length) return wordValues;
    const value = segment?.confidence == null ? Number.NaN : Number(segment.confidence);
    return Number.isFinite(value) ? [value] : [];
  });
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const sourceWordsForRange = (segments, start, end) => segments
  .flatMap((segment) => (Array.isArray(segment?.words) ? segment.words : []))
  .map((word) => {
    const wordStart = Number(word?.start);
    const wordEnd = Number(word?.end);
    const text = String(word?.text || "").replace(/\s+/g, " ").trim();
    const confidence = Number(word?.confidence);
    if (
      !Number.isFinite(wordStart)
      || !Number.isFinite(wordEnd)
      || wordEnd <= wordStart
      || !text
      || wordEnd <= start
      || wordStart >= end
    ) return null;
    return {
      start: wordStart,
      end: wordEnd,
      text,
      ...(Number.isFinite(confidence)
        ? { confidence: Math.max(0, Math.min(1, confidence)) }
        : {}),
    };
  })
  .filter(Boolean)
  .sort((left, right) => left.start - right.start || left.end - right.end);

export const buildAiDubbingVoiceScript = ({ targetSegments, sourceTranscript } = {}) => {
  if (!Array.isArray(targetSegments) || !targetSegments.length) {
    throw new TypeError("Le script vocal exige au moins une réplique cible.");
  }
  const sourceSegments = Array.isArray(sourceTranscript?.Segments)
    ? sourceTranscript.Segments
    : Array.isArray(sourceTranscript?.segments) ? sourceTranscript.segments : [];
  const cues = targetSegments.map((target, index) => {
    const start = Number(target.start);
    const end = Number(target.end);
    const displayText = String(target.text || "").replace(/\s+/g, " ").trim();
    const overlapping = sourceSegments.filter((segment) => (
      Number(segment?.end) > start && Number(segment?.start) < end
    ));
    const sourceWords = sourceWordsForRange(overlapping, start, end);
    const sourceText = overlapping
      .map((segment) => String(segment?.text || "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const confidence = transcriptConfidence(overlapping);
    const flags = [];
    if (!sourceText) flags.push("missing_source_evidence");
    if (confidence != null && confidence < 0.55) flags.push("low_source_confidence");
    if (displayText.length > 0 && end - start < 0.4) flags.push("very_short_voice_window");
    return {
      id: `cue-${String(index + 1).padStart(5, "0")}`,
      start,
      end,
      speechStart: sourceWords.length ? sourceWords[0].start : start,
      speechEnd: sourceWords.length ? sourceWords.at(-1).end : end,
      sourceText,
      sourceWords,
      displayText,
      spokenText: displayText,
      sourceConfidence: confidence == null ? null : Number(confidence.toFixed(4)),
      flags,
    };
  });
  return {
    schemaVersion: 2,
    sourceLanguage: sourceTranscript?.SourceLanguage || sourceTranscript?.sourceLanguage || null,
    strategy: "validated-subtitle-word-timed-spoken-script-v2",
    cueCount: cues.length,
    warningCount: cues.filter((cue) => cue.flags.length > 0).length,
    cues,
  };
};

export const getAiDubbingSourceRoot = (jobId, config = assertAiDubbingConfig()) => {
  const root = path.resolve(config.sourceRoot, requireJobId(jobId));
  if (!isInside(config.sourceRoot, root)) throw new TypeError("Chemin source de doublage invalide.");
  return root;
};

const copyVoiceProfile = async ({
  videoId,
  profileRelativePath,
  destinationRoot,
  manifestRelativeRoot = "profile",
}) => {
  const sourceRoot = resolveProtectedVideoStorageFile(videoId, profileRelativePath)?.absolutePath;
  const manifestPath = sourceRoot ? path.join(sourceRoot, "manifest.json") : null;
  if (!sourceRoot || !manifestPath || !fs.existsSync(manifestPath)) {
    throw new Error("Le profil vocal validé est introuvable sur le primary.");
  }
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 2 || !Object.keys(manifest.references || {}).length) {
    throw new Error("Le manifeste vocal validé est invalide.");
  }
  await fs.promises.mkdir(destinationRoot, { recursive: true, mode: 0o700 });
  const copied = [];
  const copyOne = async ({ id, kind, relativePath, speaker }) => {
    const source = path.resolve(sourceRoot, relativePath);
    if (!isInside(sourceRoot, source) || !fs.existsSync(source)) {
      throw new Error("Le profil vocal contient un chemin hors périmètre.");
    }
    const stats = await fs.promises.lstat(source);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error("Le profil vocal contient un fichier non autorisé.");
    }
    const destination = path.resolve(destinationRoot, relativePath);
    if (!isInside(destinationRoot, destination)) throw new Error("Destination de profil invalide.");
    await fs.promises.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
    await fs.promises.copyFile(source, destination);
    copied.push(await describeFile({
      id,
      kind,
      absolutePath: destination,
      relativePath: `${manifestRelativeRoot}/${relativePath}`,
      speaker,
    }));
  };
  await copyOne({ id: "profile-manifest", kind: "profile-manifest", relativePath: "manifest.json" });
  for (const [speaker, entry] of Object.entries(manifest.references)) {
    const safe = String(speaker).replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "speaker";
    await copyOne({
      id: `profile-reference-${safe}`,
      kind: "profile-reference",
      relativePath: String(entry?.path || ""),
      speaker,
    });
  }
  return copied;
};

export async function prepareAiDubbingInput({
  job,
  videoPath,
  subtitlePath,
  sourceTranscript,
  signal,
  config,
} = {}) {
  const runtimeConfig = config || assertAiDubbingConfig();
  const root = getAiDubbingSourceRoot(job.AiDubbingJobID, runtimeConfig);
  const audioPath = path.join(root, "source.wav");
  const partialAudioPath = path.join(root, "source.partial.wav");
  const targetPath = path.join(root, "target.vtt");
  const transcriptPath = path.join(root, "source-transcript.json");
  const voiceScriptPath = path.join(root, "voice-script.json");
  const source = resolveProtectedVideoStorageFile(job.VideoID, videoPath)?.absolutePath;
  const subtitle = resolveProtectedVideoStorageFile(job.VideoID, subtitlePath)?.absolutePath;
  if (!source || !subtitle || !fs.existsSync(source) || !fs.existsSync(subtitle)) {
    throw new Error("La vidéo source ou le sous-titre cible est introuvable sur le primary.");
  }
  await fs.promises.mkdir(root, { recursive: true, mode: 0o700 });
  await fs.promises.rm(partialAudioPath, { force: true });
  if (!fs.existsSync(audioPath)) {
    await run(getFfmpegExecutable(), [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", source,
      "-map", "0:a:0", "-vn", "-ac", "2", "-ar", "48000",
      "-c:a", "pcm_f32le", partialAudioPath,
    ], { signal });
    await fs.promises.rename(partialAudioPath, audioPath);
  }
  await fs.promises.copyFile(subtitle, targetPath);
  const transcriptPayload = sourceTranscript ? {
    sourceLanguage: sourceTranscript.SourceLanguage,
    segments: sourceTranscript.Segments,
  } : null;
  await fs.promises.writeFile(transcriptPath, JSON.stringify(transcriptPayload), {
    encoding: "utf8",
    mode: 0o600,
  });
  const targetSegments = parseWebVtt(await fs.promises.readFile(targetPath, "utf8"));
  const voiceScript = buildAiDubbingVoiceScript({
    targetSegments,
    sourceTranscript,
  });
  await fs.promises.writeFile(voiceScriptPath, JSON.stringify(voiceScript), {
    encoding: "utf8",
    mode: 0o600,
  });
  const files = [
    await describeFile({ id: "source-audio", kind: "source-audio", absolutePath: audioPath, relativePath: "source.wav" }),
    await describeFile({ id: "target-subtitle", kind: "target-subtitle", absolutePath: targetPath, relativePath: "target.vtt" }),
    await describeFile({ id: "source-transcript", kind: "source-transcript", absolutePath: transcriptPath, relativePath: "source-transcript.json" }),
    await describeFile({ id: "voice-script", kind: "voice-script", absolutePath: voiceScriptPath, relativePath: "voice-script.json" }),
  ];
  const regenerationTarget = job.Status === "QUEUED_PREVIEW" && Array.isArray(job.VoiceSamples)
    ? job.VoiceSamples.find((sample) => sample?.regenerationRequested === true)?.speaker || null
    : null;
  if (job.Status === "QUEUED_FULL") {
    files.push(...await copyVoiceProfile({
      videoId: job.VideoID,
      profileRelativePath: job.VoiceProfileRelativePath,
      destinationRoot: path.join(root, "profile"),
    }));
  } else if (regenerationTarget) {
    files.push(...await copyVoiceProfile({
      videoId: job.VideoID,
      profileRelativePath: job.VoiceProfileRelativePath,
      destinationRoot: path.join(root, "previous-profile"),
      manifestRelativeRoot: "previous-profile",
    }));
  }
  const manifest = {
    schemaVersion: 1,
    phase: job.Status === "QUEUED_FULL" ? "full" : "preview",
    regenerationTarget: regenerationTarget ? String(regenerationTarget) : null,
    files,
  };
  return {
    manifest,
    manifestHash: crypto.createHash("sha256").update(stableStringify(manifest)).digest("hex"),
  };
}

const requireManifestFile = (manifest, fileId) => {
  const id = String(fileId || "");
  if (!FILE_ID_PATTERN.test(id)) throw new TypeError("Identifiant de fichier de doublage invalide.");
  const entry = Array.isArray(manifest?.files)
    ? manifest.files.find((file) => file?.id === id)
    : null;
  if (!entry) {
    const error = new Error("Entrée de doublage introuvable.");
    error.statusCode = 404;
    throw error;
  }
  return entry;
};

export async function openAiDubbingInputAsset({ job, fileId, offset = 0, config } = {}) {
  const runtimeConfig = config || assertAiDubbingConfig();
  const entry = requireManifestFile(job.InputManifest, fileId);
  const root = getAiDubbingSourceRoot(job.AiDubbingJobID, runtimeConfig);
  const absolute = path.resolve(root, ...String(entry.relativePath).split("/"));
  if (!isInside(root, absolute)) throw new TypeError("Entrée de doublage hors périmètre.");
  const stats = await fs.promises.stat(absolute);
  const parsedOffset = Number(offset);
  if (!Number.isSafeInteger(parsedOffset) || parsedOffset < 0 || parsedOffset > stats.size) {
    const error = new Error("Offset de doublage invalide.");
    error.statusCode = 416;
    throw error;
  }
  if (stats.size !== Number(entry.size) || await sha256File(absolute) !== entry.sha256) {
    throw new Error("L'entrée de doublage a changé après sa préparation.");
  }
  return {
    entry,
    size: stats.size,
    offset: parsedOffset,
    length: stats.size - parsedOffset,
    stream: fs.createReadStream(absolute, { start: parsedOffset }),
  };
}

export const cleanupAiDubbingInput = async (jobId, config) => {
  const root = getAiDubbingSourceRoot(jobId, config);
  await fs.promises.rm(root, { recursive: true, force: true });
};
