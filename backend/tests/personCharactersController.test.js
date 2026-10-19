import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/db.js", () => ({ prisma: {} }));
vi.mock("../services/authz.js", () => ({ ensureAdmin: vi.fn(), ensureSuperAdmin: vi.fn() }));
vi.mock("../services/personCharacterService.js", async () => ({
  ...await vi.importActual("../services/personCharacterService.js"),
  replacePersonCharacters: vi.fn(),
}));
vi.mock("../controllers/logController.js", () => ({ createLog: vi.fn() }));

import { updatePersonCharacters } from "../controllers/personneController.js";
import { ensureAdmin } from "../services/authz.js";
import { PersonCharacterError, replacePersonCharacters } from "../services/personCharacterService.js";
import { createLog } from "../controllers/logController.js";

const reply = () => {
  const result = { code: vi.fn(), send: vi.fn() };
  result.code.mockReturnValue(result);
  return result;
};
const request = { params: { id: "7" }, body: { type: "series", contenuId: 12, Personnages: ["Nouveau"] } };

describe("mise à jour des personnages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAdmin.mockResolvedValue({ userId: 3 });
    replacePersonCharacters.mockResolvedValue({ Personnages: ["Nouveau"], previous: ["Ancien"] });
  });

  it("n'effectue aucune écriture sans droits administrateur", async () => {
    ensureAdmin.mockResolvedValue(null);
    await updatePersonCharacters(request, reply());
    expect(replacePersonCharacters).not.toHaveBeenCalled();
    expect(createLog).not.toHaveBeenCalled();
  });

  it("enregistre et journalise la correction pour le contenu choisi", async () => {
    const response = reply();
    await updatePersonCharacters(request, response);
    expect(replacePersonCharacters).toHaveBeenCalledWith(expect.anything(), {
      personId: 7, type: "series", contentId: 12, characters: ["Nouveau"],
    });
    expect(response.send).toHaveBeenCalledWith({ Personnages: ["Nouveau"] });
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      ActionNom: "person_update", Champ: "Personnages", AncienneValeur: '["Ancien"]', NouvelleValeur: '["Nouveau"]',
    }));
  });

  it("retourne l'erreur de validation sans succès ni journal de modification", async () => {
    replacePersonCharacters.mockRejectedValue(new PersonCharacterError("Lien acteur introuvable.", 404));
    const response = reply();
    await updatePersonCharacters(request, response);
    expect(response.code).toHaveBeenCalledWith(404);
    expect(createLog).not.toHaveBeenCalled();
  });
});
