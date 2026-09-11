export const AI_SUBTITLE_REPETITIVE_TRANSCRIPTION =
  "AI_SUBTITLE_REPETITIVE_TRANSCRIPTION";

const MINIMUM_SEGMENTS_FOR_REPETITION_CHECK = 40;
const MAXIMUM_CONSECUTIVE_IDENTICAL_SEGMENTS = 8;
const MINIMUM_DOMINANT_OCCURRENCES = 20;
const MAXIMUM_DOMINANT_RATIO = 0.35;
const MINIMUM_SEGMENTS_FOR_UNIQUE_RATIO_CHECK = 100;
const MINIMUM_UNIQUE_RATIO = 0.08;

const normalizeText = (value) => String(value || "")
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[\p{P}\p{S}\s]+/gu, " ")
  .trim();

export const analyzeAiTranscriptQuality = (segments) => {
  const normalized = (Array.isArray(segments) ? segments : [])
    .map((segment) => normalizeText(segment?.text))
    .filter(Boolean);
  const occurrences = new Map();
  let dominantText = "";
  let dominantCount = 0;
  let previousText = null;
  let consecutiveCount = 0;
  let maximumConsecutiveCount = 0;

  normalized.forEach((text) => {
    const count = (occurrences.get(text) || 0) + 1;
    occurrences.set(text, count);
    if (count > dominantCount) {
      dominantCount = count;
      dominantText = text;
    }
    consecutiveCount = text === previousText ? consecutiveCount + 1 : 1;
    previousText = text;
    maximumConsecutiveCount = Math.max(maximumConsecutiveCount, consecutiveCount);
  });

  const segmentCount = normalized.length;
  return {
    segmentCount,
    uniqueCount: occurrences.size,
    uniqueRatio: segmentCount ? occurrences.size / segmentCount : 1,
    dominantText,
    dominantCount,
    dominantRatio: segmentCount ? dominantCount / segmentCount : 0,
    maximumConsecutiveCount,
  };
};

export const assertAiTranscriptQuality = (segments, { label = "transcription" } = {}) => {
  const analysis = analyzeAiTranscriptQuality(segments);
  const enoughSegments = analysis.segmentCount >= MINIMUM_SEGMENTS_FOR_REPETITION_CHECK;
  const hasConsecutiveLoop =
    analysis.maximumConsecutiveCount >= MAXIMUM_CONSECUTIVE_IDENTICAL_SEGMENTS;
  const hasDominantLoop =
    analysis.dominantCount >= MINIMUM_DOMINANT_OCCURRENCES
    && analysis.dominantRatio >= MAXIMUM_DOMINANT_RATIO;
  const hasTooFewUniqueSegments =
    analysis.segmentCount >= MINIMUM_SEGMENTS_FOR_UNIQUE_RATIO_CHECK
    && analysis.uniqueRatio <= MINIMUM_UNIQUE_RATIO;

  if (enoughSegments && (hasConsecutiveLoop || hasDominantLoop || hasTooFewUniqueSegments)) {
    const error = new Error(
      `La ${label} IA a été refusée car elle contient une répétition anormale `
      + `(${analysis.dominantCount} occurrences sur ${analysis.segmentCount} segments).`
    );
    error.name = "AiSubtitleQualityError";
    error.code = AI_SUBTITLE_REPETITIVE_TRANSCRIPTION;
    error.statusCode = 422;
    error.retryable = false;
    error.analysis = analysis;
    throw error;
  }

  return analysis;
};
