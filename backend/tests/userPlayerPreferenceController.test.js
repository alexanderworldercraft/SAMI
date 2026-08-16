import { beforeEach, describe, expect, it, vi } from "vitest";

const { playerPreferenceRepository } = vi.hoisted(() => ({
  playerPreferenceRepository: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("../services/db.js", () => ({
  prisma: {
    userPlayerPreference: playerPreferenceRepository,
  },
}));
vi.mock("../controllers/logController.js", () => ({ createLog: vi.fn() }));

const {
  DEFAULT_PLAYER_PREFERENCES,
  userPlayerPreferenceController,
  validatePlayerPreferences,
} = await import("../controllers/userPlayerPreferenceController.js");
const { createLog } = await import("../controllers/logController.js");

const createReply = () => ({
  status: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
});

describe("userPlayerPreferenceController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retourne les valeurs par défaut tant que le compte n'est pas initialisé", async () => {
    playerPreferenceRepository.findUnique.mockResolvedValue(null);
    const reply = createReply();

    await userPlayerPreferenceController.get({ user: { userId: 14 } }, reply);

    expect(playerPreferenceRepository.findUnique).toHaveBeenCalledWith({
      where: { UtilisateurID: 14 },
    });
    expect(reply.send).toHaveBeenCalledWith({
      initialized: false,
      preferences: DEFAULT_PLAYER_PREFERENCES,
    });
  });

  it("enregistre toutes les préférences sur l'utilisateur authentifié", async () => {
    const preferences = {
      ambientLightEnabled: false,
      ambientLightMode: "advanced",
      ambientLightRefreshRate: 24,
      ambientLightGridSize: 7,
    };
    playerPreferenceRepository.upsert.mockResolvedValue({
      UtilisateurID: 14,
      AmbientLightEnabled: false,
      AmbientLightMode: "advanced",
      AmbientLightRefreshRate: 24,
      AmbientLightGridSize: 7,
    });
    playerPreferenceRepository.findUnique.mockResolvedValue({
      UtilisateurID: 14,
      AmbientLightEnabled: true,
      AmbientLightMode: "classic",
      AmbientLightRefreshRate: 6,
      AmbientLightGridSize: 3,
    });
    const reply = createReply();

    await userPlayerPreferenceController.update(
      { user: { userId: 14 }, body: preferences },
      reply
    );

    expect(playerPreferenceRepository.upsert).toHaveBeenCalledWith({
      where: { UtilisateurID: 14 },
      create: {
        UtilisateurID: 14,
        AmbientLightEnabled: false,
        AmbientLightMode: "advanced",
        AmbientLightRefreshRate: 24,
        AmbientLightGridSize: 7,
      },
      update: {
        AmbientLightEnabled: false,
        AmbientLightMode: "advanced",
        AmbientLightRefreshRate: 24,
        AmbientLightGridSize: 7,
      },
    });
    expect(reply.send).toHaveBeenCalledWith({ preferences });
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      UtilisateurID: 14,
      ActionNom: "player_preferences_update",
      Champ: "player_preferences",
      AncienneValeur: JSON.stringify(DEFAULT_PLAYER_PREFERENCES),
      NouvelleValeur: JSON.stringify(preferences),
    }));
  });

  it("refuse les fréquences et tailles de grille hors contrat", () => {
    expect(validatePlayerPreferences({
      ...DEFAULT_PLAYER_PREFERENCES,
      ambientLightRefreshRate: 96,
    }).error).toMatch(/fréquence/i);
    expect(validatePlayerPreferences({
      ...DEFAULT_PLAYER_PREFERENCES,
      ambientLightGridSize: 10,
    }).error).toMatch(/grille/i);
  });
});
