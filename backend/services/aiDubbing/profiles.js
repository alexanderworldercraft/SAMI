import crypto from "crypto";

import { stableStringify } from "../videoTransferSecurity.js";

export const AI_DUBBING_PROFILE_IDS = Object.freeze({
  V5_ALIGNED_QUALITY: "sami-dubbing-v5-aligned-quality",
  V5_STABLE_BOUNDARIES_R1: "sami-dubbing-v5-stable-boundaries-r1",
  V5_ALIGNED_SENTENCES_R2: "sami-dubbing-v5-aligned-sentences-r2",
  V5_FLEXIBLE_TAILS_R3: "sami-dubbing-v5-flexible-tails-r3",
  V5_GUIDED_REFERENCES_R4: "sami-dubbing-v5-guided-references-r4",
  V5_GUIDED_REFERENCES_R4_R1: "sami-dubbing-v5-guided-references-r4-r1",
  V5_GUIDED_REFERENCES_R4_R2: "sami-dubbing-v5-guided-references-r4-r2",
  V5_TRANSLATED_CLAUSES_R5: "sami-dubbing-v5-translated-clauses-r5",
  V5_BOUNDED_SAMPLES_R5_R1: "sami-dubbing-v5-bounded-samples-r5-r1",
  V5_JAPANESE_IDENTITY_R5_R2: "sami-dubbing-v5-japanese-identity-r5-r2",
  V5_JAPANESE_BOUNDED_R5_R3: "sami-dubbing-v5-japanese-bounded-r5-r3",
  V5_ENGLISH_IDENTITY_R5_R4: "sami-dubbing-v5-english-identity-r5-r4",
  V6_CLEAN_PHRASES_R9_R1: "sami-dubbing-v6-clean-phrases-r9-r1",
});

const v5GenerationConfig = Object.freeze({
  schemaVersion: 2,
  seedPolicy: "speaker-stable-retry-v2",
  referencePromptPolicy: "speaker-pure-transcript-aligned-v2",
  dialogueUnitPolicy: "speaker-boundary-merge-v1",
  qualityControl: Object.freeze({
    model: "Systran/faster-whisper-small",
    revision: "536b0662742c02347bc0e980a01041f333bce120",
    maxAttempts: 3,
    maxAcceleration: 1.5,
    suspiciousDurationRatio: 1.2,
    warningCer: 0.2,
    blockingCer: 0.35,
  }),
  qwen3Tts: Object.freeze({
    dtype: "bfloat16",
    attention: "sdpa",
    doSample: true,
    temperature: 0.65,
    topP: 0.85,
    retryTemperature: 0.5,
    retryTopP: 0.8,
    retryRepetitionPenalty: 1.1,
  }),
  chatterbox: Object.freeze({
    exaggeration: 0.5,
    cfgWeight: 0.3,
  }),
});

const v5StableBoundariesConfig = Object.freeze({
  ...v5GenerationConfig,
  schemaVersion: 3,
  dialogueUnitPolicy: "speaker-boundary-stabilized-within-subtitle-v1",
  dialogueSegmentation: Object.freeze({
    minimumSplitPieceSeconds: 0.12,
    preserveStandaloneShortCues: true,
    preserveSubtitleBounds: true,
    attachPunctuationToLexicalTokens: true,
    preferPunctuationBoundaries: true,
    constrainPiecesToLexicalTokenCount: true,
    globalSpeakerSmoothing: false,
  }),
});

const v5AlignedSentencesConfig = Object.freeze({
  ...v5StableBoundariesConfig,
  schemaVersion: 4,
  dialogueUnitPolicy: "source-aligned-sentence-onset-repair-v2",
  sentenceBoundaryRepair: Object.freeze({
    requireExactSourceText: true,
    requireSingleCompleteSentence: true,
    requireTwoSpeakerPieces: true,
    maximumPrefixSeconds: 0.5,
    minimumFirstWordCoverage: 0.5,
    maximumSentenceSeconds: 4,
    maximumBoundaryShiftSeconds: 3,
    requireBoundaryInsideFirstWord: true,
    preserveSubtitleBounds: true,
    reportOriginalAssignments: true,
  }),
});

const v5FlexibleTailsConfig = Object.freeze({
  ...v5AlignedSentencesConfig,
  schemaVersion: 5,
  voiceTiming: Object.freeze({
    strategy: "fixed-onset-minimum-required-tail-v1",
    maximumAcceleration: 1.5,
    preferOriginalWindow: true,
    preserveFollowingCueStarts: true,
    allowDialogueOverlap: true,
    hardLimit: "source-media-end",
    extendPreviewForAcceptedTails: true,
    preserveTextQualityThresholds: true,
  }),
});

const v5GuidedReferencesConfig = Object.freeze({
  ...v5FlexibleTailsConfig,
  schemaVersion: 6,
  manualVoiceReferences: Object.freeze({
    policy: "selected-ranges-only-with-unique-speaker-anchor-mapping-v1",
    minimumSeconds: 2, maximumSeconds: 12, maximumRangesPerSpeaker: 5,
    minimumAnchorCoverage: 0.55, minimumAnchorMargin: 0.15,
    primaryReference: "longest-aligned-selected-range",
    retainAlternativesOnRegeneration: true,
  }),
});

const v5GuidedReferencesR4R1Config = Object.freeze({
  ...v5GuidedReferencesConfig,
  schemaVersion: 7,
  qualityControl: Object.freeze({
    ...v5GuidedReferencesConfig.qualityControl,
    shortUtteranceMaximumLexicalUnits: 4,
    shortInitialGeneration: "deterministic",
    shortRetryGeneration: "ranked-seeded-sampling",
    shortMismatchPolicy: "best-attempt-warning-unless-expansion-v1",
    requireAcousticSpeech: true,
  }),
});

const v5GuidedReferencesR4R2Config = Object.freeze({
  ...v5GuidedReferencesR4R1Config,
  schemaVersion: 8,
  qualityControl: Object.freeze({
    ...v5GuidedReferencesR4R1Config.qualityControl,
    lexicalUnitPolicy: "unicode-words-preserve-apostrophe-contractions-v2",
  }),
});

const v5TranslatedClausesConfig = Object.freeze({
  ...v5GuidedReferencesR4R2Config,
  schemaVersion: 9,
  translationSegmentation: Object.freeze({
    policy: "punctuation-boundaries-only-v1",
    missingBoundaries: "keep-whole-cue-dominant-speaker-with-review",
    assignment: "duration-proportional-clause-boundaries-review-required",
    preserveSourceLanguageSegmentation: true,
  }),
  failureAudio: Object.freeze({ attempts: 3, maxSeconds: 15, sampleRate: 24000, format: "pcm_s16le-mono" }),
});

const v5BoundedSamplesConfig = Object.freeze({
  ...v5TranslatedClausesConfig,
  schemaVersion: 10,
  voiceSamples: Object.freeze({
    policy: "whole-cue-prefer-four-seconds-v1", maximumSourceSeconds: 8,
    maximumCharacters: 120, maximumGeneratedSeconds: 20,
    preserveManualReferences: true, rejectInsteadOfTruncate: true,
  }),
  generationWatchdog: Object.freeze({
    protocol: "external-process-deadline-v1", sampleSeconds: 180, cueSeconds: 600,
    sampleWatermarkSeconds: 60, progressIntervalSeconds: 15,
    retryable: false, diagnosticBeforeCall: true,
  }),
});

const v5JapaneseIdentityConfig = Object.freeze({
  ...v5BoundedSamplesConfig,
  schemaVersion: 11,
  japaneseVoice: Object.freeze({
    promptPolicy: "qwen-speaker-embedding-only-ja-v1",
    preserveReferenceAudio: true,
    otherLanguages: "unchanged-r5-r1",
    qualityPolicy: "every-cue-kana-normalized-bounded-short-review-v1",
    shortMaximumCharacters: 8,
    shortUnconfirmedMaximumSeconds: Object.freeze({ minimum: 1.2, perCharacter: 0.25, padding: 0.5 }),
    shortMismatch: "rank-three-attempts-acoustic-no-text-expansion",
    preserveFlexibleTailsForConfirmedText: true,
  }),
});

const v5JapaneseBoundedConfig = Object.freeze({
  ...v5JapaneseIdentityConfig,
  schemaVersion: 12,
  japaneseGenerationGuard: Object.freeze({
    policy: "text-budget-explicit-talker-eos-before-decode-v1",
    minimumTokens: 96, tokensPerCharacter: 4, paddingTokens: 48, maximumTokens: 720,
    characterPolicy: "nfkc-alphanumeric",
    requireBatchSizeOne: true,
    disableForcedEos: true,
    missingEos: "reject-before-decoding",
    incompatibleRuntime: "fail-closed",
    retries: "existing-three-cue-attempts-no-job-requeue",
    diagnostics: "prompt-talker-eos-decoder-stages-v1",
    otherLanguages: "unchanged-r5-r2",
  }),
});

const v5EnglishIdentityConfig = Object.freeze({
  ...v5JapaneseBoundedConfig,
  schemaVersion: 13,
  englishVoice: Object.freeze({
    promptPolicy: "qwen-speaker-embedding-only-en-v1",
    preserveReferenceAudio: true,
    phases: "samples-preview-full",
    qualityPolicy: "unchanged-r5-r3",
    generationParameters: "unchanged-r5-r3",
    otherLanguages: "unchanged-r5-r3",
  }),
});

const v6R9R1GenerationConfig = Object.freeze({
  schemaVersion: 18,
  seedPolicy: "speaker-reference-stable-retry-v3",
  voiceProfileRegeneration: "target-only-preserve-other-speakers-v1",
  referencePromptPolicy: "single-sentence-refined-speaker-consensus-v5",
  dialogueUnitPolicy: "lexical-word-speaker-hybrid-v6",
  sourceTokenPolicy: "lexical-only-attach-punctuation-v1",
  shortGenerationPolicy: "qwen-greedy-then-ranked-seeded-retries-v2",
  shortDialogueMergePolicy: "same-speaker-or-punctuation-continuation-v1",
  shortUtterancePolicy: "accept-from-40ms-with-quality-reported-spillover-v1",
  dialogueSource: "validated-word-timed-spoken-script-v2",
  mixArchitecture: "background-plus-per-speaker-stems-v1",
  dialogueSegmentation: Object.freeze({
    minimumUnitSeconds: 0.25,
    minimumMergePartSeconds: 0.75,
    shortSpeakerIslandSeconds: 0.5,
    shortSpeakerNeighborGapSeconds: 1,
    splitSubtitleAtDiarizationBoundary: true,
    preserveDisplaySubtitleBlocks: true,
    preferPunctuationBoundaries: true,
    wordTimedSpeakerAssignment: true,
    mergeShortSameSpeakerClauses: true,
    mergeShortPunctuationContinuations: true,
    maximumShortContinuationSeconds: 0.6,
  }),
  hybridSpeakerAssignment: Object.freeze({
    referenceTurns: "sortformer-refined-global",
    baseUncertainCoverage: 0.55,
    baseUncertainMargin: 0.2,
    refinedMinimumCoverage: 0.55,
    refinedMinimumMargin: 0.25,
    refinedDecisiveCoverage: 0.75,
    refinedDecisiveMargin: 0.5,
    allowConfidentRefinedOverride: true,
  }),
  voiceTiming: Object.freeze({
    strategy: "subtitle-start-source-end-v4",
    maxSourceSilenceExtensionSeconds: 1,
    preserveSubtitleDisplayTiming: true,
    neverStartBeforeSubtitle: true,
    useDetectedSpeechOnsetWhenLater: true,
    minimumDetectedOnsetWindowSeconds: 0.25,
    maximumDetectedOnsetDelaySeconds: 0.25,
    keepSubtitleStartWhenSpeakerAlreadyActive: true,
    fallbackToValidatedSubtitleStart: true,
    capAtAdjacentDialogueUnits: true,
    minimumAcceleration: 1,
    maximumAcceleration: 1.3,
    trimGeneratedLeadingSilence: true,
    edgeFadeInMs: 8,
    edgeFadeOutMs: 35,
  }),
  qualityControl: Object.freeze({
    model: "Systran/faster-whisper-small",
    revision: "536b0662742c02347bc0e980a01041f333bce120",
    maxAttempts: 3,
    maxAcceleration: 1.3,
    maxVoiceTailSpilloverSeconds: 1,
    maxTimingBoundaryTrimSeconds: 0.02,
    suspiciousDurationRatio: 1.2,
    transcribeEveryMeaningfulUtterance: true,
    warningCer: 0.2,
    blockingCer: 0.35,
    shortUtteranceMaxLexicalUnits: 4,
    shortMismatchPolicy: "immediate-acoustic-evidence-warning-v3",
    shortAsrMaxWordsPerSecond: 7.5,
    shortAsrMaxCharactersPerSecond: 30,
    shortAcousticEvidence: Object.freeze({
      minimumDurationSeconds: 0.04,
      minimumPeakDbfs: -40,
      minimumRmsDbfs: -50,
      activeFrameDbfs: -45,
    }),
  }),
  qwen3Tts: Object.freeze({
    dtype: "bfloat16",
    attention: "sdpa",
    doSample: true,
    temperature: 0.65,
    topP: 0.85,
    retryTemperature: 0.5,
    retryTopP: 0.8,
    retryRepetitionPenalty: 1.1,
    shortUtteranceDoSample: false,
    shortRetryDoSample: true,
    shortRetryTemperatures: Object.freeze([0.35, 0.45]),
    shortRetryTopP: Object.freeze([0.75, 0.8]),
    selectBestShortAttempt: true,
  }),
  chatterbox: Object.freeze({
    exaggeration: 0.5,
    cfgWeight: 0.3,
  }),
});

const generationConfigHash = (config) => crypto
  .createHash("sha256")
  .update(stableStringify(config))
  .digest("hex");

const createProfile = ({ id, label, description, diarizationModel, generationConfig }) => Object.freeze({
  id,
  label,
  description,
  diarizationModel,
  generationConfig,
  generationConfigHash: generationConfigHash(generationConfig),
});

export const AI_DUBBING_PROFILES = Object.freeze({
  [AI_DUBBING_PROFILE_IDS.V5_ALIGNED_QUALITY]: createProfile({
    id: AI_DUBBING_PROFILE_IDS.V5_ALIGNED_QUALITY,
    label: "V5 — qualité alignée",
    description: "Profil historique Pyannote seul, fenêtres strictes et accélération maximale 1,5×.",
    diarizationModel: "pyannote-speaker-diarization-community-1",
    generationConfig: v5GenerationConfig,
  }),
  [AI_DUBBING_PROFILE_IDS.V5_STABLE_BOUNDARIES_R1]: createProfile({
    id: AI_DUBBING_PROFILE_IDS.V5_STABLE_BOUNDARIES_R1,
    label: "V5 — découpage stabilisé R1",
    description: "Synthèse V5 avec correction des micro-fragments internes aux sous-titres, sans lissage global des intervenants.",
    diarizationModel: "pyannote-speaker-diarization-community-1",
    generationConfig: v5StableBoundariesConfig,
  }),
  [AI_DUBBING_PROFILE_IDS.V5_ALIGNED_SENTENCES_R2]: createProfile({
    id: AI_DUBBING_PROFILE_IDS.V5_ALIGNED_SENTENCES_R2,
    label: "V5 — phrases alignées R2",
    description: "Synthèse V5 avec correction signalée des changements de voix à l'intérieur du premier mot d'une phrase source alignée.",
    diarizationModel: "pyannote-speaker-diarization-community-1",
    generationConfig: v5AlignedSentencesConfig,
  }),
  [AI_DUBBING_PROFILE_IDS.V5_FLEXIBLE_TAILS_R3]: createProfile({
    id: AI_DUBBING_PROFILE_IDS.V5_FLEXIBLE_TAILS_R3,
    label: "V5 — fins souples R3",
    description: "V5 R2 avec départ fixe et prolongation minimale des fins à 1,5× maximum, sans assouplir le contrôle du texte.",
    diarizationModel: "pyannote-speaker-diarization-community-1",
    generationConfig: v5FlexibleTailsConfig,
  }),
  [AI_DUBBING_PROFILE_IDS.V5_GUIDED_REFERENCES_R4]: createProfile({
    id: AI_DUBBING_PROFILE_IDS.V5_GUIDED_REFERENCES_R4,
    label: "V5 — références guidées R4",
    description: "V5 R3 avec sélection optionnelle de passages source par intervenant.",
    diarizationModel: "pyannote-speaker-diarization-community-1",
    generationConfig: v5GuidedReferencesConfig,
  }),
  [AI_DUBBING_PROFILE_IDS.V5_GUIDED_REFERENCES_R4_R1]: createProfile({
    id: AI_DUBBING_PROFILE_IDS.V5_GUIDED_REFERENCES_R4_R1,
    label: "V5 — références guidées R4-R1",
    description: "V5 R4 avec génération déterministe et sélection comparative des courtes répliques.",
    diarizationModel: "pyannote-speaker-diarization-community-1",
    generationConfig: v5GuidedReferencesR4R1Config,
  }),
  [AI_DUBBING_PROFILE_IDS.V5_GUIDED_REFERENCES_R4_R2]: createProfile({
    id: AI_DUBBING_PROFILE_IDS.V5_GUIDED_REFERENCES_R4_R2,
    label: "V5 — références guidées R4-R2",
    description: "V5 R4-R1 avec comptage linguistique des contractions à apostrophe pour le contrôle court.",
    diarizationModel: "pyannote-speaker-diarization-community-1",
    generationConfig: v5GuidedReferencesR4R2Config,
  }),
  [AI_DUBBING_PROFILE_IDS.V5_TRANSLATED_CLAUSES_R5]: createProfile({
    id: AI_DUBBING_PROFILE_IDS.V5_TRANSLATED_CLAUSES_R5,
    label: "V5 — traductions par propositions R5",
    description: "R4-R2 avec frontières de ponctuation pour les traductions et audios de diagnostic privés.",
    diarizationModel: "pyannote-speaker-diarization-community-1",
    generationConfig: v5TranslatedClausesConfig,
  }),
  [AI_DUBBING_PROFILE_IDS.V5_BOUNDED_SAMPLES_R5_R1]: createProfile({
    id: AI_DUBBING_PROFILE_IDS.V5_BOUNDED_SAMPLES_R5_R1,
    label: "V5 — échantillons bornés R5-R1",
    description: "R5 avec échantillons courts entiers, délais par synthèse et diagnostics anticipés.",
    diarizationModel: "pyannote-speaker-diarization-community-1",
    generationConfig: v5BoundedSamplesConfig,
  }),
  [AI_DUBBING_PROFILE_IDS.V5_JAPANESE_IDENTITY_R5_R2]: createProfile({
    id: AI_DUBBING_PROFILE_IDS.V5_JAPANESE_IDENTITY_R5_R2,
    label: "V5 — identité vocale japonaise R5-R2 (test)",
    description: "R5-R1 avec identité vocale seule en japonais et contrôle de chaque réplique ; FR/EN inchangés.",
    diarizationModel: "pyannote-speaker-diarization-community-1",
    generationConfig: v5JapaneseIdentityConfig,
  }),
  [AI_DUBBING_PROFILE_IDS.V5_JAPANESE_BOUNDED_R5_R3]: createProfile({
    id: AI_DUBBING_PROFILE_IDS.V5_JAPANESE_BOUNDED_R5_R3,
    label: "V5 — génération japonaise bornée R5-R3 (test)",
    description: "R5-R2 avec budget de tokens adapté au texte et vérification de fin avant décodage ; FR/EN inchangés.",
    diarizationModel: "pyannote-speaker-diarization-community-1",
    generationConfig: v5JapaneseBoundedConfig,
  }),
  [AI_DUBBING_PROFILE_IDS.V5_ENGLISH_IDENTITY_R5_R4]: createProfile({
    id: AI_DUBBING_PROFILE_IDS.V5_ENGLISH_IDENTITY_R5_R4,
    label: "V5 — identité vocale anglaise R5-R4 (test)",
    description: "R5-R3 avec identité vocale seule en anglais pour les échantillons et rendus ; FR et JP inchangés.",
    diarizationModel: "pyannote-speaker-diarization-community-1",
    generationConfig: v5EnglishIdentityConfig,
  }),
  [AI_DUBBING_PROFILE_IDS.V6_CLEAN_PHRASES_R9_R1]: createProfile({
    id: AI_DUBBING_PROFILE_IDS.V6_CLEAN_PHRASES_R9_R1,
    label: "V6 — phrases propres R9-R1",
    description: "Profil hybride Pyannote/Sortformer, mots horodatés et contrôle renforcé des phrases courtes.",
    diarizationModel: "pyannote-speaker-diarization-community-1+nvidia-diar-sortformer-4spk-v1",
    generationConfig: v6R9R1GenerationConfig,
  }),
});

export const getAiDubbingProfile = (profileId) => {
  const normalized = String(profileId || "").trim();
  const profile = AI_DUBBING_PROFILES[normalized];
  if (profile) return profile;
  const error = new Error(
    `Profil de doublage IA inconnu: ${normalized || "(vide)"}. Profils disponibles: ${Object.keys(
      AI_DUBBING_PROFILES
    ).join(", ")}.`
  );
  error.code = "AI_DUBBING_PROFILE_UNKNOWN";
  throw error;
};
