import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  repository: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
}));

vi.mock("../services/db.js", () => ({
  prisma: { userAiPreference: mocks.repository },
}));
vi.mock("../controllers/logController.js", () => ({ createLog: vi.fn() }));

const {
  AI_DISCLOSURE_VERSION,
  getUserAiPreference,
  serializeUserAiPreference,
} = await import("../services/userAiPreferenceService.js");
const { userAiPreferenceController } = await import("../controllers/userAiPreferenceController.js");
const { createLog } = await import("../controllers/logController.js");

const createReply = () => ({
  status: vi.fn().mockReturnThis(),
  send: vi.fn().mockReturnThis(),
});

describe("préférence utilisateur pour les fonctions IA", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exige une nouvelle réponse lorsque le texte d'information change de version", () => {
    const result = serializeUserAiPreference({
      Accepted: true,
      DisclosureVersion: "ancienne-version",
      DecidedAt: new Date("2026-08-01T10:00:00Z"),
      UpdateDate: new Date("2026-08-01T10:00:00Z"),
    });
    expect(result.status).toBe("UNANSWERED");
    expect(result.accepted).toBeNull();
    expect(result.disclosureVersion).toBe(AI_DISCLOSURE_VERSION);
  });

  it("retourne l'état non répondu quand aucun choix n'est enregistré", async () => {
    mocks.repository.findUnique.mockResolvedValue(null);
    await expect(getUserAiPreference(31)).resolves.toMatchObject({
      status: "UNANSWERED",
      accepted: null,
    });
  });

  it("enregistre aussi explicitement un refus et le journalise", async () => {
    mocks.repository.findUnique.mockResolvedValue({
      Accepted: true,
      DisclosureVersion: AI_DISCLOSURE_VERSION,
    });
    mocks.repository.upsert.mockResolvedValue({
      Accepted: false,
      DisclosureVersion: AI_DISCLOSURE_VERSION,
      DecidedAt: new Date("2026-08-23T10:00:00Z"),
      UpdateDate: new Date("2026-08-23T10:00:00Z"),
    });
    const reply = createReply();
    await userAiPreferenceController.update({
      user: { userId: 31 },
      body: { accepted: false },
    }, reply);

    expect(mocks.repository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { UtilisateurID: 31 },
      create: expect.objectContaining({ Accepted: false, DisclosureVersion: AI_DISCLOSURE_VERSION }),
      update: expect.objectContaining({ Accepted: false, DisclosureVersion: AI_DISCLOSURE_VERSION }),
    }));
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
      status: "REFUSED",
      accepted: false,
    }));
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      UtilisateurID: 31,
      ActionNom: "ai_features_preference_update",
      AncienneValeur: "ACCEPTED",
      NouvelleValeur: "REFUSED",
    }));
  });
});
