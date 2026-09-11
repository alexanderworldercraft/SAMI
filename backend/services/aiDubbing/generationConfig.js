import { AI_DUBBING_PIPELINE_VERSION } from "./constants.js";
import { getAiDubbingProfile } from "./profiles.js";

const defaultProfile = getAiDubbingProfile(AI_DUBBING_PIPELINE_VERSION);

// Alias conservés pour les consommateurs historiques. Les nouvelles tâches
// prennent toujours la configuration et l'empreinte du profil sélectionné.
export const AI_DUBBING_GENERATION_CONFIG = defaultProfile.generationConfig;
export const AI_DUBBING_GENERATION_CONFIG_HASH = defaultProfile.generationConfigHash;

export const getAiDubbingGenerationConfig = (profileId) => (
  getAiDubbingProfile(profileId).generationConfig
);

export const getAiDubbingGenerationConfigHash = (profileId) => (
  getAiDubbingProfile(profileId).generationConfigHash
);
