import { prisma } from "../services/db.js";
import { ensureAdmin, ensureSuperAdmin as ensureSharedSuperAdmin } from "../services/authz.js";
import { ETAT } from "../constants.js";
import { isTruthyValue, parsePositiveInt } from "../utils/requestParsing.js";

const ACTIVE_ETAT_ID = ETAT.ACTIVE;
const DELETED_ETAT_ID = ETAT.DELETED;
const isTruthy = isTruthyValue;

const ensureUniverseAdmin = async (request, reply) => {
  return ensureAdmin(request, reply);
};

const ensureSuperAdmin = async (request, reply) => {
  return ensureSharedSuperAdmin(request, reply);
};

const normalizeSaga = (saga) => ({
  SagaID: saga.SagaID,
  id: saga.SagaID,
  type: "saga",
  Titre: saga.Titre,
  Resumer: saga.Resumer,
  CheminImage: saga.CheminImage,
  EtatID: saga.EtatID,
  Premium: !!saga.Premium,
  CreateDate: saga.CreateDate,
  Genres: [],
});

const normalizeUniverse = (universe, includeSagas = false) => {
  const normalized = {
    UniverseID: universe.UniverseID,
    id: universe.UniverseID,
    type: "universe",
    Titre: universe.Titre,
    Resume: universe.Resume,
    EtatID: universe.EtatID,
    CreateDate: universe.CreateDate,
  };

  if (includeSagas) {
    normalized.Sagas = (universe.UniverseSagas || [])
      .map((link) => ({
        UniverseSagaID: link.UniverseSagaID,
        Ordre: link.Ordre,
        ...(link.Saga ? normalizeSaga(link.Saga) : {}),
      }))
      .filter((item) => item.SagaID);
  }

  return normalized;
};

const sagaWhereForSearch = (search) => ({
  EtatID: ACTIVE_ETAT_ID,
  ...(search
    ? {
        OR: [
          { Titre: { contains: search } },
          { Resumer: { contains: search } },
        ],
      }
    : {}),
});

const universeWhereForSearch = (search) => ({
  EtatID: ACTIVE_ETAT_ID,
  UniverseSagas: {
    some: {
      Saga: { EtatID: ACTIVE_ETAT_ID },
    },
  },
  ...(search
    ? {
        OR: [
          { Titre: { contains: search } },
          { Resume: { contains: search } },
          { UniverseSagas: { some: { Saga: sagaWhereForSearch(search) } } },
        ],
      }
    : {}),
});

const textMatchesSearch = (values, search) => {
  if (!search) return true;
  const normalizedSearch = search.toLowerCase();
  return values
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedSearch));
};

const sagaOrderByForSort = (sort) => {
  if (sort === "recent") return { CreateDate: "desc" };
  if (sort === "ancien") return { CreateDate: "asc" };
  if (sort === "za") return { Titre: "desc" };
  return { Titre: "asc" };
};

export const getUniverses = async (request, reply) => {
  const search = String(request.query?.search || "").trim();
  const sort = String(request.query?.sort || "az").toLowerCase();

  try {
    const [universes, sagasWithoutUniverse] = await Promise.all([
      prisma.universe.findMany({
        where: universeWhereForSearch(search),
        orderBy:
          sort === "recent"
            ? { CreateDate: "desc" }
            : sort === "ancien"
              ? { CreateDate: "asc" }
              : sort === "za"
                ? { Titre: "desc" }
                : { Titre: "asc" },
        include: {
          UniverseSagas: {
            where: { Saga: { EtatID: ACTIVE_ETAT_ID } },
            orderBy: [{ Ordre: "asc" }, { UniverseSagaID: "asc" }],
            include: { Saga: true },
          },
        },
      }),
      prisma.saga.findMany({
        where: {
          ...sagaWhereForSearch(search),
          UniverseSagas: {
            none: {
              Universe: { EtatID: ACTIVE_ETAT_ID },
            },
          },
        },
        orderBy: sagaOrderByForSort(sort),
      }),
    ]);

    const normalizedUniverses = universes
      .map((universe) => {
        const universeMatches = textMatchesSearch([universe.Titre, universe.Resume], search);
        if (universeMatches || !search) return normalizeUniverse(universe, true);

        return normalizeUniverse(
          {
            ...universe,
            UniverseSagas: (universe.UniverseSagas || []).filter((link) =>
              textMatchesSearch([link.Saga?.Titre, link.Saga?.Resumer], search)
            ),
          },
          true
        );
      })
      .filter((universe) => universe.Sagas.length > 0);

    const items = [
      ...normalizedUniverses,
      ...(sagasWithoutUniverse.length > 0
        ? [
            {
              UniverseID: 0,
              id: 0,
              type: "universe",
              Titre: "Univers par défaut",
              Resume: "Sagas qui ne sont rattachées à aucun univers.",
              EtatID: ACTIVE_ETAT_ID,
              CreateDate: null,
              Sagas: sagasWithoutUniverse.map((saga, index) => ({
                UniverseSagaID: `default-${saga.SagaID}`,
                Ordre: index + 1,
                ...normalizeSaga(saga),
              })),
            },
          ]
        : []),
    ];

    return reply.send({
      items,
      totalItems: items.length,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des univers :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des univers." });
  }
};

export const getAdminUniverses = async (request, reply) => {
  const admin = await ensureUniverseAdmin(request, reply);
  if (!admin) return;

  try {
    const universes = await prisma.universe.findMany({
      where: { EtatID: ACTIVE_ETAT_ID },
      orderBy: { UniverseID: "desc" },
      select: {
        UniverseID: true,
        Titre: true,
        Resume: true,
        EtatID: true,
      },
    });

    return reply.send(universes);
  } catch (error) {
    console.error("Erreur lors de la récupération admin des univers :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des univers." });
  }
};

export const getDeletedUniverses = async (request, reply) => {
  const admin = await ensureSuperAdmin(request, reply);
  if (!admin) return;

  try {
    const universes = await prisma.universe.findMany({
      where: { EtatID: DELETED_ETAT_ID },
      orderBy: { UniverseID: "desc" },
      select: {
        UniverseID: true,
        Titre: true,
        Resume: true,
        EtatID: true,
      },
    });

    return reply.send(universes);
  } catch (error) {
    console.error("Erreur lors de la récupération des univers en corbeille :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des univers en corbeille." });
  }
};

export const getUniverseAdminDetails = async (request, reply) => {
  const admin = await ensureUniverseAdmin(request, reply);
  if (!admin) return;

  const universeId = parsePositiveInt(request.params?.id);
  if (!universeId) return reply.status(400).send({ error: "UniverseID invalide." });

  try {
    const universe = await prisma.universe.findUnique({
      where: { UniverseID: universeId },
      include: {
        UniverseSagas: {
          orderBy: [{ Ordre: "asc" }, { UniverseSagaID: "asc" }],
          include: { Saga: true },
        },
      },
    });

    if (!universe) return reply.status(404).send({ error: "Univers introuvable." });
    return reply.send(normalizeUniverse(universe, true));
  } catch (error) {
    console.error("Erreur lors de la récupération admin de l'univers :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération de l'univers." });
  }
};

export const createUniverse = async (request, reply) => {
  const admin = await ensureUniverseAdmin(request, reply);
  if (!admin) return;

  const Titre = String(request.body?.Titre || "").trim();
  const Resume = typeof request.body?.Resume === "string" ? request.body.Resume : "";
  const EtatID = parsePositiveInt(request.body?.EtatID) || ACTIVE_ETAT_ID;

  if (!Titre) return reply.status(400).send({ error: "Le titre de l'univers est requis." });

  try {
    const universe = await prisma.universe.create({
      data: { Titre, Resume, EtatID },
    });
    return reply.status(201).send(universe);
  } catch (error) {
    console.error("Erreur lors de la création de l'univers :", error);
    return reply.status(500).send({ error: "Erreur lors de la création de l'univers." });
  }
};

export const updateUniverse = async (request, reply) => {
  const admin = await ensureUniverseAdmin(request, reply);
  if (!admin) return;

  const universeId = parsePositiveInt(request.params?.id);
  if (!universeId) return reply.status(400).send({ error: "UniverseID invalide." });

  const data = {};
  if (typeof request.body?.Titre === "string") data.Titre = request.body.Titre.trim();
  if (typeof request.body?.Resume === "string") data.Resume = request.body.Resume;
  if (Number.isInteger(Number(request.body?.EtatID))) data.EtatID = Number(request.body.EtatID);

  if ("Titre" in data && !data.Titre) {
    return reply.status(400).send({ error: "Le titre ne peut pas être vide." });
  }

  try {
    const updated = await prisma.universe.update({
      where: { UniverseID: universeId },
      data,
    });
    return reply.send(updated);
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'univers :", error);
    return reply.status(500).send({ error: "Erreur lors de la mise à jour de l'univers." });
  }
};

export const addUniverseSaga = async (request, reply) => {
  const admin = await ensureUniverseAdmin(request, reply);
  if (!admin) return;

  const universeId = parsePositiveInt(request.params?.id);
  const sagaId = parsePositiveInt(request.body?.SagaID);
  const requestedOrder = Number.parseInt(request.body?.Ordre, 10);

  if (!universeId || !sagaId) {
    return reply.status(400).send({ error: "Données de liaison invalides." });
  }

  try {
    const [universe, saga] = await Promise.all([
      prisma.universe.findUnique({ where: { UniverseID: universeId }, select: { UniverseID: true } }),
      prisma.saga.findUnique({ where: { SagaID: sagaId }, select: { SagaID: true, EtatID: true } }),
    ]);

    if (!universe) return reply.status(404).send({ error: "Univers introuvable." });
    if (!saga || saga.EtatID === DELETED_ETAT_ID) return reply.status(404).send({ error: "Saga introuvable." });

    const duplicate = await prisma.universeSaga.findFirst({
      where: { UniverseID: universeId, SagaID: sagaId },
      select: { UniverseSagaID: true },
    });
    if (duplicate) return reply.status(409).send({ error: "Cette saga est déjà liée à cet univers." });

    let Ordre = requestedOrder;
    if (!Number.isInteger(Ordre) || Ordre < 1) {
      const aggregate = await prisma.universeSaga.aggregate({
        where: { UniverseID: universeId },
        _max: { Ordre: true },
      });
      Ordre = (aggregate._max.Ordre || 0) + 1;
    }

    const created = await prisma.universeSaga.create({
      data: { UniverseID: universeId, SagaID: sagaId, Ordre },
      include: { Saga: true },
    });

    return reply.status(201).send({
      UniverseSagaID: created.UniverseSagaID,
      Ordre: created.Ordre,
      ...normalizeSaga(created.Saga),
    });
  } catch (error) {
    console.error("Erreur lors de l'ajout de la saga à l'univers :", error);
    return reply.status(500).send({ error: "Erreur lors de l'ajout de la saga à l'univers." });
  }
};

export const updateUniverseSagaOrder = async (request, reply) => {
  const admin = await ensureUniverseAdmin(request, reply);
  if (!admin) return;

  const universeId = parsePositiveInt(request.params?.id);
  const items = Array.isArray(request.body?.items) ? request.body.items : [];
  if (!universeId || items.length === 0) {
    return reply.status(400).send({ error: "Ordre invalide." });
  }

  try {
    const updates = items
      .map((item) => ({
        UniverseSagaID: Number(item.UniverseSagaID),
        Ordre: Number(item.Ordre),
      }))
      .filter((item) => Number.isInteger(item.UniverseSagaID) && Number.isInteger(item.Ordre) && item.Ordre > 0);

    if (updates.length === 0) {
      return reply.status(400).send({ error: "Ordre invalide." });
    }

    await prisma.$transaction(
      updates.map((item) =>
        prisma.universeSaga.updateMany({
          where: {
            UniverseID: universeId,
            UniverseSagaID: item.UniverseSagaID,
          },
          data: { Ordre: item.Ordre },
        })
      )
    );

    return reply.send({ ok: true });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'ordre univers :", error);
    return reply.status(500).send({ error: "Erreur lors de la mise à jour de l'ordre." });
  }
};

export const removeUniverseSaga = async (request, reply) => {
  const admin = await ensureUniverseAdmin(request, reply);
  if (!admin) return;

  const universeId = parsePositiveInt(request.params?.id);
  const universeSagaId = parsePositiveInt(request.params?.universeSagaId);
  if (!universeId || !universeSagaId) {
    return reply.status(400).send({ error: "Liaison invalide." });
  }

  try {
    const result = await prisma.universeSaga.deleteMany({
      where: { UniverseID: universeId, UniverseSagaID: universeSagaId },
    });
    if (result.count === 0) return reply.status(404).send({ error: "Liaison introuvable." });
    return reply.send({ ok: true });
  } catch (error) {
    console.error("Erreur lors du retrait de la saga de l'univers :", error);
    return reply.status(500).send({ error: "Erreur lors du retrait de la saga de l'univers." });
  }
};

export const softDeleteUniverse = async (request, reply) => {
  const admin = await ensureUniverseAdmin(request, reply);
  if (!admin) return;

  const universeId = parsePositiveInt(request.params?.id);
  if (!universeId) return reply.status(400).send({ error: "UniverseID invalide." });

  try {
    const updated = await prisma.universe.update({
      where: { UniverseID: universeId },
      data: { EtatID: DELETED_ETAT_ID },
    });
    return reply.send({ ok: true, universe: updated });
  } catch (error) {
    console.error("Erreur lors de la mise en corbeille de l'univers :", error);
    return reply.status(500).send({ error: "Erreur lors de la mise en corbeille de l'univers." });
  }
};

export const restoreUniverse = async (request, reply) => {
  const admin = await ensureSuperAdmin(request, reply);
  if (!admin) return;

  const universeId = parsePositiveInt(request.params?.id);
  if (!universeId) return reply.status(400).send({ error: "UniverseID invalide." });

  try {
    const updated = await prisma.universe.update({
      where: { UniverseID: universeId },
      data: { EtatID: ACTIVE_ETAT_ID },
    });
    return reply.send({ ok: true, universe: updated });
  } catch (error) {
    console.error("Erreur lors de la restauration de l'univers :", error);
    return reply.status(500).send({ error: "Erreur lors de la restauration de l'univers." });
  }
};

export const permanentlyDeleteUniverse = async (request, reply) => {
  const admin = await ensureSuperAdmin(request, reply);
  if (!admin) return;

  const universeId = parsePositiveInt(request.params?.id);
  if (!universeId) return reply.status(400).send({ error: "UniverseID invalide." });

  try {
    const universe = await prisma.universe.findUnique({
      where: { UniverseID: universeId },
      select: { UniverseID: true, Titre: true, EtatID: true },
    });
    if (!universe) return reply.status(404).send({ error: "Univers introuvable." });
    if (universe.EtatID !== DELETED_ETAT_ID) {
      return reply.status(409).send({ error: "L'univers doit être dans la corbeille avant suppression définitive." });
    }

    await prisma.$transaction([
      prisma.universeSaga.deleteMany({ where: { UniverseID: universeId } }),
      prisma.universe.delete({ where: { UniverseID: universeId } }),
    ]);

    return reply.send({ ok: true, universe: { UniverseID: universe.UniverseID, Titre: universe.Titre } });
  } catch (error) {
    console.error("Erreur lors de la suppression définitive de l'univers :", error);
    return reply.status(500).send({ error: "Erreur lors de la suppression définitive de l'univers." });
  }
};
