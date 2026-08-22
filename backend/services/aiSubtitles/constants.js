export const AI_SUBTITLE_SETTING_KEY = "ai_subtitles";
export const AI_SUBTITLE_SIGNATURE_DOMAIN = "SAMI-AI-SUBTITLES-V1";
export const AI_SUBTITLE_PROTOCOL_VERSION = 1;
export const AI_SUBTITLE_PIPELINE_VERSION = "sami-ai-subtitles-v1";

export const AI_SUBTITLE_JOB_STATUS = Object.freeze({
  QUEUED: "QUEUED",
  PREPARING: "PREPARING",
  LEASED: "LEASED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
});

export const AI_SUBTITLE_PHASE = Object.freeze({
  QUEUED: "queued",
  PREPARING_AUDIO: "preparing_audio",
  DOWNLOADING: "downloading",
  TRANSCRIBING: "transcribing",
  TRANSLATING: "translating",
  PUBLISHING: "publishing",
  COMPLETED: "completed",
  FAILED: "failed",
});

export const AI_SUBTITLE_OFFLINE_AFTER_MS = 45_000;
export const AI_SUBTITLE_HEARTBEAT_INTERVAL_MS = 15_000;
export const AI_SUBTITLE_LEASE_DURATION_MS = 2 * 60 * 1000;
export const AI_SUBTITLE_LEASE_RENEW_INTERVAL_MS = 30_000;
export const AI_SUBTITLE_CLAIM_INTERVAL_MS = 10_000;
export const AI_SUBTITLE_WORKER_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
export const AI_SUBTITLE_RETRY_BACKOFF_MS = Object.freeze([
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
]);

export const AI_SUBTITLE_LANGUAGES = Object.freeze([
  { code: "fr", label: "Français" },
  { code: "en", label: "Anglais" },
  { code: "es", label: "Espagnol" },
  { code: "de", label: "Allemand" },
  { code: "it", label: "Italien" },
  { code: "pt", label: "Portugais" },
  { code: "nl", label: "Néerlandais" },
  { code: "ja", label: "Japonais" },
  { code: "ko", label: "Coréen" },
  { code: "zh", label: "Chinois" },
  { code: "ru", label: "Russe" },
  { code: "ar", label: "Arabe" },
  { code: "pl", label: "Polonais" },
  { code: "tr", label: "Turc" },
  { code: "hi", label: "Hindi" },
]);

export const AI_SUBTITLE_LANGUAGE_CODES = new Set(
  AI_SUBTITLE_LANGUAGES.map(({ code }) => code)
);
