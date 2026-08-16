import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/db.js", () => ({ prisma: { marker: "prisma" } }));
vi.mock("../services/authz.js", () => ({
  ensureAdmin: vi.fn(async () => ({ userId: 3, gradeId: 2 })),
  ensureSuperAdmin: vi.fn(async () => ({ userId: 1, gradeId: 1 })),
}));
vi.mock("../services/personDuplicateService.js", async () => {
  const actual = await vi.importActual("../services/personDuplicateService.js");
  return {
    ...actual,
    getPotentialDuplicatePairs: vi.fn(),
    mergeDuplicatePeople: vi.fn(),
    reviewDuplicatePair: vi.fn(),
  };
});
vi.mock("../prisma/seedPersonneImages.js", () => ({
  createWikimediaClient: vi.fn(),
  runPersonImageSeed: vi.fn(),
}));
vi.mock("../controllers/logController.js", () => ({ createLog: vi.fn() }));

import {
  getPersonDuplicateCandidates,
  mergePersonDuplicates,
  reviewPersonDuplicate,
} from "../controllers/personneController.js";
import { ensureAdmin, ensureSuperAdmin } from "../services/authz.js";
import {
  getPotentialDuplicatePairs,
  mergeDuplicatePeople,
  reviewDuplicatePair,
} from "../services/personDuplicateService.js";
import { createLog } from "../controllers/logController.js";

const createReply = () => {
  const reply = { code: vi.fn(), send: vi.fn(), status: vi.fn() };
  reply.code.mockReturnValue(reply);
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
};

describe("personneController - doublons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ensureAdmin.mockResolvedValue({ userId: 3, gradeId: 2 });
    ensureSuperAdmin.mockResolvedValue({ userId: 1, gradeId: 1 });
    getPotentialDuplicatePairs.mockResolvedValue({ scannedPeople: 2, pairs: [] });
    reviewDuplicatePair.mockResolvedValue({ Decision: "DISTINCT" });
    mergeDuplicatePeople.mockResolvedValue({ keptPersonId: 1, mergedPersonId: 2 });
  });

  it("autorise un administrateur à lancer la vérification", async () => {
    const reply = createReply();
    await getPersonDuplicateCandidates({ user: { userId: 3 } }, reply);

    expect(ensureAdmin).toHaveBeenCalledTimes(1);
    expect(getPotentialDuplicatePairs).toHaveBeenCalledTimes(1);
    expect(reply.send).toHaveBeenCalledWith({ scannedPeople: 2, pairs: [] });
  });

  it("réserve l'enregistrement d'une décision au super-administrateur", async () => {
    const reply = createReply();
    await reviewPersonDuplicate({
      user: { userId: 1 },
      body: { personAId: 2, personBId: 1, decision: "distinct" },
    }, reply);

    expect(ensureSuperAdmin).toHaveBeenCalledTimes(1);
    expect(reviewDuplicatePair).toHaveBeenCalledWith(expect.anything(), {
      personAId: 2,
      personBId: 1,
      decision: "distinct",
      reviewedById: 1,
    });
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      ActionNom: "person_duplicate_review",
      UtilisateurID: 1,
      Meta: { personAId: 2, personBId: 1, decision: "DISTINCT" },
    }));
  });

  it("réserve la fusion au super-administrateur et transmet la fiche à conserver", async () => {
    const reply = createReply();
    await mergePersonDuplicates({
      user: { userId: 1 },
      body: { keepPersonId: 1, mergePersonId: 2 },
    }, reply);

    expect(ensureSuperAdmin).toHaveBeenCalledTimes(1);
    expect(mergeDuplicatePeople).toHaveBeenCalledWith(expect.anything(), {
      keepPersonId: 1,
      mergePersonId: 2,
      reviewedById: 1,
    });
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      ActionNom: "person_duplicate_merge",
      AncienneValeur: "2",
      NouvelleValeur: "1",
    }));
  });
});
