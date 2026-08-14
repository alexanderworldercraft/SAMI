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
    seriesPersonne: { deleteMany: vi.fn() },
    videoPersonne: { deleteMany: vi.fn() },
  },
}));

vi.mock("../services/authz.js", () => ({
  ensureAdmin: vi.fn(async () => ({ userId: 3, gradeId: 2 })),
  ensureSuperAdmin: vi.fn(async () => ({ userId: 1, gradeId: 1 })),
}));

import {
  getAdminPeople,
  getDeletedPeople,
  permanentlyDeletePersonne,
  restorePersonne,
  searchPeople,
  softDeletePersonne,
  updatePersonne,
} from "../controllers/personneController.js";
import { prisma } from "../services/db.js";

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
    prisma.personne.findFirst.mockResolvedValue({ PersonneID: 12 });
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
      select: { PersonneID: true },
    });
    expect(prisma.personne.update).toHaveBeenCalledWith({
      where: { PersonneID: 12 },
      data: { Nom: "Lovelace", Prenom: "Ada", Surnom: null },
    });
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
  });

  it("restaure uniquement une personne présente dans la corbeille", async () => {
    const reply = createReply();
    await restorePersonne({ user: { userId: 1 }, params: { id: "12" } }, reply);

    expect(prisma.personne.updateMany).toHaveBeenCalledWith({
      where: { PersonneID: 12, EtatID: 2 },
      data: { EtatID: 1 },
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
  });
});
