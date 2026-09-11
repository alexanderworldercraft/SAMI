import { ensureAiFeaturesAccepted } from "../services/userAiPreferenceService.js";

export const aiFeatureAccessMiddleware = async (request, reply) => {
  const access = await ensureAiFeaturesAccepted(request, reply);
  if (!access) return reply;
  request.aiFeaturePreference = access.preference;
};
