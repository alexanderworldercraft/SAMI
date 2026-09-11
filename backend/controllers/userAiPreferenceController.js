import { createLog } from "./logController.js";
import {
  getUserAiPreference,
  setUserAiPreference,
} from "../services/userAiPreferenceService.js";

export const userAiPreferenceController = {
  async get(request, reply) {
    try {
      return reply.send(await getUserAiPreference(request.user?.userId));
    } catch (error) {
      console.error("Chargement de la préférence IA impossible :", error);
      return reply.status(500).send({ error: "Impossible de charger votre choix concernant l'IA." });
    }
  },

  async update(request, reply) {
    if (typeof request.body?.accepted !== "boolean") {
      return reply.status(400).send({ error: "accepted doit être un booléen." });
    }
    try {
      const userId = Number(request.user?.userId);
      const previous = await getUserAiPreference(userId);
      const preference = await setUserAiPreference(userId, request.body.accepted);
      await createLog({
        request,
        UtilisateurID: userId,
        ActionNom: "ai_features_preference_update",
        Champ: "ai_features",
        AncienneValeur: previous.status,
        NouvelleValeur: preference.status,
      });
      return reply.send(preference);
    } catch (error) {
      console.error("Enregistrement de la préférence IA impossible :", error);
      return reply.status(error.statusCode || 500).send({
        error: error.statusCode ? error.message : "Impossible d'enregistrer votre choix concernant l'IA.",
      });
    }
  },
};
