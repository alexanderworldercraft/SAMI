import { prisma } from "../services/db.js";
import { ensureAdmin, ensureSuperAdmin as ensureSharedSuperAdmin } from "../services/authz.js";
import { ETAT } from "../constants.js";
import { parsePositiveInt } from "../utils/requestParsing.js";
import { createLog } from "./logController.js";

const ACTIVE_ETAT_ID = ETAT.ACTIVE;
const DELETED_ETAT_ID = ETAT.DELETED;

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

const getFirstVideoForSeries = (series) => {
  const seasons = Array.isArray(series?.Saisons) ? series.Saisons : [];
  for (const season of seasons) {
    const episode = season.Episodes?.[0];
    if (episode?.VideoID) return episode;
  }
  return null;
};

const universeContentInclude = {
  Video: {
    include: {
      VideoGenres: { include: { Genre: true } },
    },
  },
  Series: {
    include: {
      SeriesGenres: { include: { Genre: true } },
      Saisons: {
        include: {
          Episodes: {
            where: { EtatID: ACTIVE_ETAT_ID },
            select: { VideoID: true },
            orderBy: { Titre: "asc" },
            take: 1,
          },
        },
        orderBy: { Numero: "asc" },
      },
    },
  },
};

export const formatUniverseContent = (link) => {
  if (link.Video) {
    const video = link.Video;
    if (video.EtatID !== ACTIVE_ETAT_ID || video.SaisonID !== null) return null;
    return {
      UniverseContentID: link.UniverseContentID,
      UniverseItemKey: `content:${link.UniverseContentID}`,
      UniverseItemType: "content",
      Ordre: link.Ordre,
      id: video.VideoID,
      type: "video",
      VideoID: video.VideoID,
      Titre: video.Titre,
      Resumer: video.Resumer,
      Premium: !!video.Premium,
      CheminImage: video.CheminImage,
      CreateDate: video.CreateDate,
      Genres: video.VideoGenres?.map((item) => item.Genre.Nom) || [],
    };
  }

  if (link.Series) {
    const series = link.Series;
    if (series.EtatID !== ACTIVE_ETAT_ID) return null;
    const firstVideo = getFirstVideoForSeries(series);
    return {
      UniverseContentID: link.UniverseContentID,
      UniverseItemKey: `content:${link.UniverseContentID}`,
      UniverseItemType: "content",
      Ordre: link.Ordre,
      id: series.SeriesID,
      type: "series",
      SeriesID: series.SeriesID,
      Titre: series.Titre,
      Resumer: series.Resumer,
      Premium: !!series.Premium,
      CheminImage: series.CheminImage,
      CreateDate: series.CreateDate,
      Genres: series.SeriesGenres?.map((item) => item.Genre.Nom) || [],
      FirstVideoID: firstVideo?.VideoID || null,
      Saisons: series.Saisons?.length || 0,
    };
  }

  return null;
};

export const sortUniverseItems = (items) => [...items].sort((left, right) => {
  const orderDifference = Number(left.Ordre || 0) - Number(right.Ordre || 0);
  if (orderDifference !== 0) return orderDifference;
  return String(left.UniverseItemKey || "").localeCompare(String(right.UniverseItemKey || ""));
});

const normalizeUniverse = (universe, includeItems = false) => {
  const normalized = {
    UniverseID: universe.UniverseID,
    id: universe.UniverseID,
    type: "universe",
    Titre: universe.Titre,
    Resume: universe.Resume,
    EtatID: universe.EtatID,
    CreateDate: universe.CreateDate,
  };

  if (includeItems) {
    const sagas = (universe.UniverseSagas || [])
      .map((link) => ({
        UniverseSagaID: link.UniverseSagaID,
        UniverseItemKey: `saga:${link.UniverseSagaID}`,
        UniverseItemType: "saga",
        Ordre: link.Ordre,
        ...(link.Saga ? normalizeSaga(link.Saga) : {}),
      }))
      .filter((item) => item.SagaID);
    const contents = (universe.UniverseContents || [])
      .map(formatUniverseContent)
      .filter(Boolean);

    normalized.Items = sortUniverseItems([...sagas, ...contents]);
    normalized.Sagas = sagas;
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

const videoWhereForSearch = (search) => ({
  EtatID: ACTIVE_ETAT_ID,
  SaisonID: null,
  ...(search
    ? {
        OR: [
          { Titre: { contains: search } },
          { Resumer: { contains: search } },
        ],
      }
    : {}),
});

const seriesWhereForSearch = (search) => ({
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
  OR: [
    { UniverseSagas: { some: { Saga: { EtatID: ACTIVE_ETAT_ID } } } },
    {
      UniverseContents: {
        some: {
          OR: [
            { Video: videoWhereForSearch("") },
            { Series: seriesWhereForSearch("") },
          ],
        },
      },
    },
  ],
  ...(search
    ? {
        AND: [{
          OR: [
            { Titre: { contains: search } },
            { Resume: { contains: search } },
            { UniverseSagas: { some: { Saga: sagaWhereForSearch(search) } } },
            {
              UniverseContents: {
                some: {
                  OR: [
                    { Video: videoWhereForSearch(search) },
                    { Series: seriesWhereForSearch(search) },
                  ],
                },
              },
            },
          ],
        }],
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

const getNextUniverseOrder = async (universeId) => {
  const [sagaAggregate, contentAggregate] = await Promise.all([
    prisma.universeSaga.aggregate({
      where: { UniverseID: universeId },
      _max: { Ordre: true },
    }),
    prisma.universeContent.aggregate({
      where: { UniverseID: universeId },
      _max: { Ordre: true },
    }),
  ]);

  return Math.max(sagaAggregate._max.Ordre || 0, contentAggregate._max.Ordre || 0) + 1;
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
          UniverseContents: {
            where: {
              OR: [
                { Video: videoWhereForSearch("") },
                { Series: seriesWhereForSearch("") },
              ],
            },
            orderBy: [{ Ordre: "asc" }, { UniverseContentID: "asc" }],
            include: universeContentInclude,
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
            UniverseContents: (universe.UniverseContents || []).filter((link) =>
              textMatchesSearch(
                [
                  link.Video?.Titre,
                  link.Video?.Resumer,
                  link.Series?.Titre,
                  link.Series?.Resumer,
                ],
                search
              )
            ),
          },
          true
        );
      })
      .filter((universe) => universe.Items.length > 0);

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
              Items: sagasWithoutUniverse.map((saga, index) => ({
                UniverseSagaID: `default-${saga.SagaID}`,
                UniverseItemKey: `default-saga:${saga.SagaID}`,
                UniverseItemType: "saga",
                Ordre: index + 1,
                ...normalizeSaga(saga),
              })),
              Sagas: sagasWithoutUniverse.map((saga, index) => ({
                UniverseSagaID: `default-${saga.SagaID}`,
                UniverseItemKey: `default-saga:${saga.SagaID}`,
                UniverseItemType: "saga",
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

export const getUniversesForContent = async (request, reply) => {
  const videoId = parsePositiveInt(request.params?.videoId);
  if (!videoId) return reply.status(400).send({ error: "VideoID invalide." });

  try {
    const video = await prisma.video.findUnique({
      where: { VideoID: videoId },
      select: {
        VideoID: true,
        EtatID: true,
        Saison: {
          select: { SeriesID: true },
        },
      },
    });

    if (!video || video.EtatID !== ACTIVE_ETAT_ID) {
      return reply.status(404).send({ error: "Vidéo introuvable." });
    }

    const membershipFilters = [
      { VideoID: videoId },
      ...(video.Saison?.SeriesID ? [{ SeriesID: video.Saison.SeriesID }] : []),
    ];
    const universes = await prisma.universe.findMany({
      where: {
        EtatID: ACTIVE_ETAT_ID,
        OR: [
          {
            UniverseContents: {
              some: { OR: membershipFilters },
            },
          },
          {
            UniverseSagas: {
              some: {
                Saga: {
                  EtatID: ACTIVE_ETAT_ID,
                  SagaContents: {
                    some: { OR: membershipFilters },
                  },
                },
              },
            },
          },
        ],
      },
      orderBy: [{ Titre: "asc" }, { UniverseID: "asc" }],
      select: {
        UniverseID: true,
        Titre: true,
        Resume: true,
      },
    });

    return reply.send({
      items: universes,
      totalItems: universes.length,
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des univers du contenu :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des univers du contenu." });
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

export const getUniverseAdminCatalog = async (request, reply) => {
  const admin = await ensureUniverseAdmin(request, reply);
  if (!admin) return;

  try {
    const [sagas, videos, series] = await Promise.all([
      prisma.saga.findMany({
        where: { EtatID: ACTIVE_ETAT_ID },
        orderBy: [{ CreateDate: "desc" }, { SagaID: "desc" }],
        select: { SagaID: true, Titre: true, CreateDate: true },
      }),
      prisma.video.findMany({
        where: { EtatID: ACTIVE_ETAT_ID, SaisonID: null },
        orderBy: [{ CreateDate: "desc" }, { VideoID: "desc" }],
        select: { VideoID: true, Titre: true, CreateDate: true },
      }),
      prisma.series.findMany({
        where: { EtatID: ACTIVE_ETAT_ID },
        orderBy: [{ CreateDate: "desc" }, { SeriesID: "desc" }],
        select: { SeriesID: true, Titre: true, CreateDate: true },
      }),
    ]);

    return reply.send({ sagas, videos, series });
  } catch (error) {
    console.error("Erreur lors de la récupération du catalogue univers :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des contenus disponibles." });
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
        UniverseContents: {
          orderBy: [{ Ordre: "asc" }, { UniverseContentID: "asc" }],
          include: universeContentInclude,
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
      Ordre = await getNextUniverseOrder(universeId);
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

export const addUniverseContent = async (request, reply) => {
  const admin = await ensureUniverseAdmin(request, reply);
  if (!admin) return;

  const universeId = parsePositiveInt(request.params?.id);
  const contentType = String(request.body?.type || "").toLowerCase();
  const contentId = parsePositiveInt(request.body?.id);
  const requestedOrder = Number.parseInt(request.body?.Ordre, 10);

  if (!universeId || !contentId || !["video", "series"].includes(contentType)) {
    return reply.status(400).send({ error: "Données de liaison invalides." });
  }

  try {
    const universe = await prisma.universe.findFirst({
      where: { UniverseID: universeId, EtatID: ACTIVE_ETAT_ID },
      select: { UniverseID: true },
    });
    if (!universe) return reply.status(404).send({ error: "Univers introuvable." });

    const isVideo = contentType === "video";
    const content = isVideo
      ? await prisma.video.findFirst({
          where: { VideoID: contentId, EtatID: ACTIVE_ETAT_ID, SaisonID: null },
          select: { VideoID: true },
        })
      : await prisma.series.findFirst({
          where: { SeriesID: contentId, EtatID: ACTIVE_ETAT_ID },
          select: { SeriesID: true },
        });

    if (!content) {
      return reply.status(404).send({
        error: isVideo ? "Film introuvable ou vidéo non autonome." : "Série introuvable.",
      });
    }

    const duplicate = await prisma.universeContent.findFirst({
      where: {
        UniverseID: universeId,
        ...(isVideo ? { VideoID: contentId } : { SeriesID: contentId }),
      },
      select: { UniverseContentID: true },
    });
    if (duplicate) {
      return reply.status(409).send({
        error: isVideo
          ? "Ce film est déjà lié directement à cet univers."
          : "Cette série est déjà liée directement à cet univers.",
      });
    }

    let Ordre = requestedOrder;
    if (!Number.isInteger(Ordre) || Ordre < 1) {
      Ordre = await getNextUniverseOrder(universeId);
    }

    const created = await prisma.universeContent.create({
      data: {
        UniverseID: universeId,
        VideoID: isVideo ? contentId : null,
        SeriesID: isVideo ? null : contentId,
        Ordre,
      },
      include: universeContentInclude,
    });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "universe_content_add",
      VideoID: isVideo ? contentId : null,
      SeriesID: isVideo ? null : contentId,
      Champ: "universe_content",
      NouvelleValeur: String(created.UniverseContentID),
      Meta: {
        universeId,
        universeContentId: created.UniverseContentID,
        contentType,
        contentId,
        order: created.Ordre,
      },
    });

    return reply.status(201).send(formatUniverseContent(created));
  } catch (error) {
    if (error?.code === "P2002") {
      return reply.status(409).send({
        error: contentType === "video"
          ? "Ce film est déjà lié directement à cet univers."
          : "Cette série est déjà liée directement à cet univers.",
      });
    }
    console.error("Erreur lors de l'ajout du contenu à l'univers :", error);
    return reply.status(500).send({ error: "Erreur lors de l'ajout du contenu à l'univers." });
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
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "universe_items_reorder",
      Champ: "universe_items_order",
      NouvelleValeur: JSON.stringify(updates),
      Meta: { universeId, itemType: "saga", items: updates },
    });

    return reply.send({ ok: true });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'ordre univers :", error);
    return reply.status(500).send({ error: "Erreur lors de la mise à jour de l'ordre." });
  }
};

export const updateUniverseItemsOrder = async (request, reply) => {
  const admin = await ensureUniverseAdmin(request, reply);
  if (!admin) return;

  const universeId = parsePositiveInt(request.params?.id);
  const rawItems = Array.isArray(request.body?.items) ? request.body.items : [];
  if (!universeId || rawItems.length === 0) {
    return reply.status(400).send({ error: "Ordre invalide." });
  }

  const items = rawItems.map((item) => ({
    UniverseItemType: String(item?.UniverseItemType || "").toLowerCase(),
    UniverseSagaID: Number(item?.UniverseSagaID),
    UniverseContentID: Number(item?.UniverseContentID),
    Ordre: Number(item?.Ordre),
  }));
  const hasInvalidItem = items.some((item) => (
    !Number.isInteger(item.Ordre)
    || item.Ordre < 1
    || (item.UniverseItemType === "saga" && (!Number.isInteger(item.UniverseSagaID) || item.UniverseSagaID < 1))
    || (item.UniverseItemType === "content" && (!Number.isInteger(item.UniverseContentID) || item.UniverseContentID < 1))
    || !["saga", "content"].includes(item.UniverseItemType)
  ));
  const itemKeys = items.map((item) => (
    item.UniverseItemType === "saga"
      ? `saga:${item.UniverseSagaID}`
      : `content:${item.UniverseContentID}`
  ));

  if (hasInvalidItem || new Set(itemKeys).size !== itemKeys.length) {
    return reply.status(400).send({ error: "Ordre invalide." });
  }

  try {
    const sagaIds = items
      .filter((item) => item.UniverseItemType === "saga")
      .map((item) => item.UniverseSagaID);
    const contentIds = items
      .filter((item) => item.UniverseItemType === "content")
      .map((item) => item.UniverseContentID);
    const [sagaLinks, contentLinks] = await Promise.all([
      sagaIds.length
        ? prisma.universeSaga.findMany({
            where: { UniverseID: universeId, UniverseSagaID: { in: sagaIds } },
            select: { UniverseSagaID: true },
          })
        : [],
      contentIds.length
        ? prisma.universeContent.findMany({
            where: { UniverseID: universeId, UniverseContentID: { in: contentIds } },
            select: { UniverseContentID: true },
          })
        : [],
    ]);

    if (sagaLinks.length !== sagaIds.length || contentLinks.length !== contentIds.length) {
      return reply.status(404).send({ error: "Un élément de l'univers est introuvable." });
    }

    await prisma.$transaction(items.map((item) => (
      item.UniverseItemType === "saga"
        ? prisma.universeSaga.update({
            where: { UniverseSagaID: item.UniverseSagaID },
            data: { Ordre: item.Ordre },
          })
        : prisma.universeContent.update({
            where: { UniverseContentID: item.UniverseContentID },
            data: { Ordre: item.Ordre },
          })
    )));
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "universe_items_reorder",
      Champ: "universe_items_order",
      NouvelleValeur: JSON.stringify(items),
      Meta: { universeId, itemType: "mixed", items },
    });

    return reply.send({ ok: true });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'ordre des éléments de l'univers :", error);
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

export const removeUniverseContent = async (request, reply) => {
  const admin = await ensureUniverseAdmin(request, reply);
  if (!admin) return;

  const universeId = parsePositiveInt(request.params?.id);
  const universeContentId = parsePositiveInt(request.params?.universeContentId);
  if (!universeId || !universeContentId) {
    return reply.status(400).send({ error: "Liaison invalide." });
  }

  try {
    const link = await prisma.universeContent.findFirst({
      where: { UniverseID: universeId, UniverseContentID: universeContentId },
      select: { VideoID: true, SeriesID: true },
    });
    if (!link) return reply.status(404).send({ error: "Liaison introuvable." });

    const result = await prisma.universeContent.deleteMany({
      where: { UniverseID: universeId, UniverseContentID: universeContentId },
    });
    if (result.count === 0) return reply.status(404).send({ error: "Liaison introuvable." });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "universe_content_remove",
      VideoID: link.VideoID,
      SeriesID: link.SeriesID,
      Champ: "universe_content",
      AncienneValeur: String(universeContentId),
      Meta: {
        universeId,
        universeContentId,
        contentType: link.VideoID ? "video" : "series",
        contentId: link.VideoID || link.SeriesID,
      },
    });
    return reply.send({ ok: true });
  } catch (error) {
    console.error("Erreur lors du retrait du contenu de l'univers :", error);
    return reply.status(500).send({ error: "Erreur lors du retrait du contenu de l'univers." });
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
      prisma.universeContent.deleteMany({ where: { UniverseID: universeId } }),
      prisma.universe.delete({ where: { UniverseID: universeId } }),
    ]);

    return reply.send({ ok: true, universe: { UniverseID: universe.UniverseID, Titre: universe.Titre } });
  } catch (error) {
    console.error("Erreur lors de la suppression définitive de l'univers :", error);
    return reply.status(500).send({ error: "Erreur lors de la suppression définitive de l'univers." });
  }
};
