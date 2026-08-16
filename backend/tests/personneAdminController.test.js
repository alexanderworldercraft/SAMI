import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/db.js", () => ({
  prisma: {
    $transaction: vi.fn(async (operations) => Promise.all(operations)),
    personne: {
      delete: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    personDuplicateReview: { findFirst: vi.fn() },
    seriesPersonne: { deleteMany: vi.fn() },
    videoPersonne: { deleteMany: vi.fn() },
  },
}));

vi.mock("../services/authz.js", () => ({
  ensureAdmin: vi.fn(async () => ({ userId: 3, gradeId: 2 })),
  ensureSuperAdmin: vi.fn(async () => ({ userId: 1, gradeId: 1 })),
}));
vi.mock("../controllers/logController.js", () => ({ createLog: vi.fn() }));

import {
  deletePersonnePhoto,
  getAdminPeople,
  getDeletedPeople,
  permanentlyDeletePersonne,
  restorePersonne,
  searchPeople,
  softDeletePersonne,
  updatePersonne,
} from "../controllers/personneController.js";
import { prisma } from "../services/db.js";
import { createLog } from "../controllers/logController.js";

const createReply = () => {
  const reply = { code: vi.fn(), send: vi.fn(), status: vi.fn() };
  reply.code.mockReturnValue(reply);
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
};

describe("personneController - administration et corbeille", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.personne.findMany.mockResolvedValue([]);
    prisma.personne.updateMany.mockResolvedValue({ count: 1 });
    prisma.personne.update.mockResolvedValue({ PersonneID: 12, Nom: "Lovelace", Prenom: "Ada" });
    prisma.personne.findFirst.mockResolvedValue({
      PersonneID: 12,
      Nom: "Byron",
      Prenom: "Ada",
      Surnom: null,
    });
    prisma.personDuplicateReview.findFirst.mockResolvedValue(null);
    prisma.videoPersonne.deleteMany.mockResolvedValue({ count: 2 });
    prisma.seriesPersonne.deleteMany.mockResolvedValue({ count: 1 });
    prisma.personne.delete.mockResolvedValue({ PersonneID: 12 });
  });

  it("liste uniquement les personnes actives pour l'administration", async () => {
    const reply = createReply();
    await getAdminPeople({ user: { userId: 3 } }, reply);

    expect(prisma.personne.findMany).toHaveBeenCalledWith({
      where: { EtatID: 1 },
      orderBy: { PersonneID: "desc" },
      select: {
        PersonneID: true,
        Nom: true,
        Prenom: true,
        Surnom: true,
        CheminImage: true,
        ImageStatut: true,
        EtatID: true,
        CreateDate: true,
      },
    });
  });

  it("exclut les personnes supprimées de la recherche publique", async () => {
    const reply = createReply();
    await searchPeople({ query: { search: "Ada" } }, reply);

    expect(prisma.personne.findMany).toHaveBeenCalledWith({
      where: {
        EtatID: 1,
        OR: [
          { Nom: { contains: "Ada" } },
          { Prenom: { contains: "Ada" } },
          { Surnom: { contains: "Ada" } },
        ],
      },
      orderBy: [{ Prenom: "asc" }, { Nom: "asc" }],
    });
  });

  it("réserve la liste de corbeille aux personnes supprimées", async () => {
    const reply = createReply();
    await getDeletedPeople({ user: { userId: 1 } }, reply);

    expect(prisma.personne.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { EtatID: 2 },
      orderBy: { PersonneID: "desc" },
    }));
  });

  it("modifie l'identité d'une personne active", async () => {
    const reply = createReply();
    await updatePersonne({
      user: { userId: 3 },
      params: { id: "12" },
      body: { Nom: " Lovelace ", Prenom: " Ada ", Surnom: "  " },
    }, reply);

    expect(prisma.personne.findFirst).toHaveBeenCalledWith({
      where: { PersonneID: 12, EtatID: 1 },
      select: { PersonneID: true, Nom: true, Prenom: true, Surnom: true },
    });
    expect(prisma.personne.update).toHaveBeenCalledWith({
      where: { PersonneID: 12 },
      data: { Nom: "Lovelace", Prenom: "Ada", Surnom: null },
    });
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      ActionNom: "person_update",
      UtilisateurID: 3,
      Meta: { personId: 12 },
    }));
  });

  it("place une personne active dans la corbeille sans effacer ses associations", async () => {
    const reply = createReply();
    await softDeletePersonne({ user: { userId: 3 }, params: { id: "12" } }, reply);

    expect(prisma.personne.updateMany).toHaveBeenCalledWith({
      where: { PersonneID: 12, EtatID: 1 },
      data: { EtatID: 2 },
    });
    expect(prisma.videoPersonne.deleteMany).not.toHaveBeenCalled();
    expect(prisma.seriesPersonne.deleteMany).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith({ ok: true });
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      ActionNom: "person_soft_delete",
      Meta: { personId: 12 },
    }));
  });

  it("journalise le retrait de la photo d'une personne", async () => {
    prisma.personne.findFirst.mockResolvedValue({
      CheminImage: "uploads/people/12/ada.webp",
      ImageStatut: "CUSTOM",
    });
    prisma.personne.update.mockResolvedValue({ CheminImage: null, ImageStatut: "DEFAULT" });
    const reply = createReply();

    await deletePersonnePhoto({ user: { userId: 3 }, params: { id: "12" } }, reply);

    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      UtilisateurID: 3,
      ActionNom: "person_photo_delete",
      AncienneValeur: "uploads/people/12/ada.webp",
      Meta: { personId: 12 },
    }));
  });

  it("restaure uniquement une personne présente dans la corbeille", async () => {
    const reply = createReply();
    await restorePersonne({ user: { userId: 1 }, params: { id: "12" } }, reply);

    expect(prisma.personne.updateMany).toHaveBeenCalledWith({
      where: { PersonneID: 12, EtatID: 2 },
      data: { EtatID: 1 },
    });
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      ActionNom: "person_restore",
      UtilisateurID: 1,
    }));
  });

  it("refuse de restaurer une fiche secondaire déjà fusionnée", async () => {
    prisma.personDuplicateReview.findFirst.mockResolvedValue({ PersonDuplicateReviewID: 4 });
    const reply = createReply();

    await restorePersonne({ user: { userId: 1 }, params: { id: "12" } }, reply);

    expect(prisma.personne.updateMany).not.toHaveBeenCalled();
    expect(reply.code).toHaveBeenCalledWith(409);
    expect(reply.send).toHaveBeenCalledWith({
      error: "Cette personne a été fusionnée et ne peut pas être restaurée.",
      code: "MERGED_PERSON_CANNOT_BE_RESTORED",
    });
  });

  it("efface les associations avant la suppression définitive", async () => {
    const reply = createReply();
    await permanentlyDeletePersonne({ user: { userId: 1 }, params: { id: "12" } }, reply);

    expect(prisma.personne.findFirst).toHaveBeenCalledWith({
      where: { PersonneID: 12, EtatID: 2 },
      select: { PersonneID: true },
    });
    expect(prisma.videoPersonne.deleteMany).toHaveBeenCalledWith({ where: { PersonneID: 12 } });
    expect(prisma.seriesPersonne.deleteMany).toHaveBeenCalledWith({ where: { PersonneID: 12 } });
    expect(prisma.personne.delete).toHaveBeenCalledWith({ where: { PersonneID: 12 } });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(reply.send).toHaveBeenCalledWith({ ok: true });
    expect(createLog).toHaveBeenCalledWith(expect.objectContaining({
      ActionNom: "person_delete",
      Meta: { personId: 12, permanent: true },
    }));
  });
});
