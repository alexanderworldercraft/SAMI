import {
  getHlsProfiles,
  getVideoDurationSeconds,
} from "../../video/videoImportHelpers.js";

export const VIDEO_ENCODING_PLAN_VERSION = 1;
export const VIDEO_ENCODING_SPEC_VERSION = "sami-hls-libx264-aac-v1";
export const HLS_SEGMENT_DURATION_SECONDS = 4;
export const HLS_AUDIO_BITRATE_KBPS = 192;

const asStreamIndex = (value, fieldName) => {
  const index = Number(value);
  if (!Number.isInteger(index) || index < 0) {
    throw new TypeError(`${fieldName} doit être un index de flux FFmpeg valide.`);
  }
  return index;
};

const normalizeOptionalDuration = (value) => {
  const duration = Number(value);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
};

const normalizeAudioRenditions = (audioTracks, targetDurationSeconds) => {
  const renditions = audioTracks.map((track, position) => ({
    label: String(track?.label || `Audio ${position + 1}`).trim(),
    language: String(track?.language || "und").trim() || "und",
    isDefault: Boolean(track?.isDefault),
    order: Number(track?.order),
    sourceIndex: asStreamIndex(
      track?.sourceIndex ?? track?.stream?.index,
      `audioTracks[${position}].sourceIndex`
    ),
    outputChannels: 2,
    sourceDurationSeconds: normalizeOptionalDuration(track?.durationSeconds),
  }));

  for (const rendition of renditions) {
    rendition.silencePaddingSeconds = rendition.sourceDurationSeconds == null
      ? null
      : Math.max(0, targetDurationSeconds - rendition.sourceDurationSeconds);
  }

  const orders = new Set();
  for (const rendition of renditions) {
    if (!Number.isInteger(rendition.order) || rendition.order < 0) {
      throw new TypeError("Chaque piste audio doit avoir un ordre entier positif ou nul.");
    }
    if (orders.has(rendition.order)) {
      throw new TypeError("Deux pistes audio ne peuvent pas partager le même ordre.");
    }
    orders.add(rendition.order);
  }

  return renditions;
};

export function validateVideoEncodingPlan(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    throw new TypeError("Le plan d'encodage vidéo est invalide.");
  }
  if (plan.version !== VIDEO_ENCODING_PLAN_VERSION) {
    throw new TypeError("La version du plan d'encodage vidéo est incompatible.");
  }
  if (plan.specVersion !== VIDEO_ENCODING_SPEC_VERSION) {
    throw new TypeError("La spécification FFmpeg du plan est incompatible.");
  }
  asStreamIndex(plan.videoStreamIndex, "videoStreamIndex");
  asStreamIndex(plan.audioStreamIndex, "audioStreamIndex");
  if (!Number.isFinite(plan.durationSeconds) || plan.durationSeconds <= 0) {
    throw new TypeError("La durée du flux vidéo est introuvable.");
  }

  if (!Array.isArray(plan.profiles) || plan.profiles.length === 0) {
    throw new TypeError("Le plan doit contenir au moins un profil vidéo.");
  }
  for (const profile of plan.profiles) {
    if (
      !profile?.label
      || !Number.isInteger(profile.width)
      || profile.width <= 0
      || !Number.isInteger(profile.height)
      || profile.height <= 0
      || !Number.isFinite(profile.bitrate)
      || profile.bitrate <= 0
    ) {
      throw new TypeError("Un profil vidéo du plan est invalide.");
    }
  }

  if (plan.multiAudio) {
    if (!Array.isArray(plan.audioRenditions) || plan.audioRenditions.length < 2) {
      throw new TypeError("Un plan multi-audio doit contenir plusieurs renditions.");
    }
    if (plan.audioRenditions.filter((track) => track.isDefault).length !== 1) {
      throw new TypeError("Un plan multi-audio doit contenir exactement une piste par défaut.");
    }
  } else if (plan.audioRenditions.length !== 0) {
    throw new TypeError("Un plan audio intégré ne doit pas contenir de renditions séparées.");
  }

  return plan;
}

export function buildVideoEncodingPlan({
  metadata,
  videoStream,
  audioStream,
  audioTracks = [],
  multiAudioEnabled = false,
}) {
  const durationSeconds = getVideoDurationSeconds(metadata, videoStream);
  const normalizedAudioTracks = normalizeAudioRenditions(
    audioTracks,
    durationSeconds
  );
  const multiAudio = Boolean(multiAudioEnabled && normalizedAudioTracks.length > 1);
  const plan = {
    version: VIDEO_ENCODING_PLAN_VERSION,
    specVersion: VIDEO_ENCODING_SPEC_VERSION,
    durationSeconds,
    segmentDurationSeconds: HLS_SEGMENT_DURATION_SECONDS,
    audioBitrateKbps: HLS_AUDIO_BITRATE_KBPS,
    videoStreamIndex: asStreamIndex(videoStream?.index, "videoStream.index"),
    audioStreamIndex: asStreamIndex(audioStream?.index, "audioStream.index"),
    multiAudio,
    profiles: getHlsProfiles(videoStream).map((profile) => ({ ...profile })),
    audioRenditions: multiAudio ? normalizedAudioTracks : [],
  };

  return validateVideoEncodingPlan(plan);
}
