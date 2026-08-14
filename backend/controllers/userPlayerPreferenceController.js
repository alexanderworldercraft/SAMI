import { prisma } from "../services/db.js";

export const AMBIENT_LIGHT_MODES = ["classic", "advanced"];
export const AMBIENT_LIGHT_REFRESH_RATES = [3, 6, 12, 24, 48, 60];

export const DEFAULT_PLAYER_PREFERENCES = Object.freeze({
  ambientLightEnabled: true,
  ambientLightMode: "classic",
  ambientLightRefreshRate: 6,
  ambientLightGridSize: 3,
});

const serializePreferences = (preferences) => ({
  ambientLightEnabled: preferences.AmbientLightEnabled,
  ambientLightMode: preferences.AmbientLightMode,
  ambientLightRefreshRate: preferences.AmbientLightRefreshRate,
  ambientLightGridSize: preferences.AmbientLightGridSize,
});

export const validatePlayerPreferences = (input) => {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { error: "Préférences du lecteur invalides." };
  }

  const preferences = {
    ambientLightEnabled: input.ambientLightEnabled,
    ambientLightMode: input.ambientLightMode,
    ambientLightRefreshRate: input.ambientLightRefreshRate,
    ambientLightGridSize: input.ambientLightGridSize,
  };

  if (typeof preferences.ambientLightEnabled !== "boolean") {
    return { error: "L'activation de l'ambiance doit être un booléen." };
  }
  if (!AMBIENT_LIGHT_MODES.includes(preferences.ambientLightMode)) {
    return { error: "Le mode d'ambiance doit être classic ou advanced." };
  }
  if (!AMBIENT_LIGHT_REFRESH_RATES.includes(preferences.ambientLightRefreshRate)) {
    return { error: "La fréquence d'ambiance est invalide." };
  }
  if (
    !Number.isInteger(preferences.ambientLightGridSize)
    || preferences.ambientLightGridSize < 3
    || preferences.ambientLightGridSize > 9
  ) {
    return { error: "La grille d'ambiance doit être comprise entre 3 et 9." };
  }

  return { preferences };
};

export const userPlayerPreferenceController = {
  async get(request, reply) {
    try {
      const userId = Number(request.user?.userId);
      const storedPreferences = await prisma.userPlayerPreference.findUnique({
        where: { UtilisateurID: userId },
      });

      return reply.send({
        initialized: Boolean(storedPreferences),
        preferences: storedPreferences
          ? serializePreferences(storedPreferences)
          : DEFAULT_PLAYER_PREFERENCES,
      });
    } catch (error) {
      console.error("Erreur lors du chargement des préférences du lecteur :", error);
      return reply.status(500).send({ error: "Impossible de charger les préférences du lecteur." });
    }
  },

  async update(request, reply) {
    const validation = validatePlayerPreferences(request.body);
    if (validation.error) {
      return reply.status(400).send({ error: validation.error });
    }

    try {
      const userId = Number(request.user?.userId);
      const preferences = validation.preferences;
      const data = {
        AmbientLightEnabled: preferences.ambientLightEnabled,
        AmbientLightMode: preferences.ambientLightMode,
        AmbientLightRefreshRate: preferences.ambientLightRefreshRate,
        AmbientLightGridSize: preferences.ambientLightGridSize,
      };
      const storedPreferences = await prisma.userPlayerPreference.upsert({
        where: { UtilisateurID: userId },
        create: { UtilisateurID: userId, ...data },
        update: data,
      });

      return reply.send({ preferences: serializePreferences(storedPreferences) });
    } catch (error) {
      console.error("Erreur lors de l'enregistrement des préférences du lecteur :", error);
      return reply.status(500).send({ error: "Impossible d'enregistrer les préférences du lecteur." });
    }
  },
};
