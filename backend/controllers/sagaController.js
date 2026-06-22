import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../services/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.join(__dirname, "..");
const UPLOADS_ROOT = path.join(BACKEND_ROOT, "uploads");
const SAGA_ROOT = path.join(UPLOADS_ROOT, "saga");
const TEMP_ROOT = path.join(UPLOADS_ROOT, "tmp");
const ACTIVE_ETAT_ID = 1;
const DELETED_ETAT_ID = 2;

const allowedImageExts = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".avif",
  ".heic",
  ".heif",
  ".jfif",
  ".bmp",
  ".tif",
  ".tiff",
]);

const mimeToExt = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/jfif": ".jpg",
  "image/bmp": ".bmp",
  "image/tiff": ".tiff",
};

const parsePositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const intValue = Math.floor(parsed);
  return intValue > 0 ? intValue : null;
};

const isTruthy = (value) => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());

const ensureSagaAdmin = async (request, reply) => {
  const userId = Number(request.user?.userId);
  if (!Number.isInteger(userId)) {
    reply.code(401).send({ error: "Non autorisé." });
    return null;
  }

  const user = await prisma.utilisateur.findUnique({
    where: { UtilisateurID: userId },
    select: { GradeID: true },
  });

  if (!user || (user.GradeID !== 1 && user.GradeID !== 2)) {
    reply.status(403).send({ error: "Accès réservé aux administrateurs." });
    return null;
  }

  return { userId, gradeId: user.GradeID };
};

const ensureSuperAdmin = async (request, reply) => {
  const admin = await ensureSagaAdmin(request, reply);
  if (!admin) return null;
  if (admin.gradeId !== 1) {
    reply.status(403).send({ error: "Accès réservé au super administrateur." });
    return null;
  }
  return admin;
};

const removeStoredSagaImage = (relativePath) => {
  if (!relativePath || relativePath.includes("default")) return false;

  const cleanedRel = relativePath.replace(/^[/\\]+/, "");
  const absolutePath = path.join(BACKEND_ROOT, cleanedRel);
  const normalizedRoot = path.resolve(UPLOADS_ROOT);
  const normalizedTarget = path.resolve(absolutePath);

  if (!normalizedTarget.startsWith(normalizedRoot) || !fs.existsSync(normalizedTarget)) return false;

  try {
    fs.rmSync(normalizedTarget, { force: true });
    return true;
  } catch (error) {
    console.warn("Suppression de l'image saga échouée :", error.message);
    return false;
  }
};

const removeSagaDirectory = (sagaId) => {
  const sagaDir = path.join(SAGA_ROOT, String(sagaId));
  const normalizedRoot = path.resolve(SAGA_ROOT);
  const normalizedTarget = path.resolve(sagaDir);

  if (!normalizedTarget.startsWith(normalizedRoot) || !fs.existsSync(normalizedTarget)) return false;

  try {
    fs.rmSync(normalizedTarget, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.warn("Suppression du dossier saga échouée :", error.message);
    return false;
  }
};

const saveImagePart = async (part, targetDir) => {
  const originalFilename = part.filename || "";
  const mime = (part.mimetype || "").toLowerCase();
  let ext = path.extname(originalFilename).toLowerCase();

  if (mime && !mime.startsWith("image/")) {
    throw new Error("Format d'image non supporté.");
  }

  if (!ext || !allowedImageExts.has(ext)) {
    const mappedExt = mimeToExt[mime];
    if (!mappedExt) throw new Error("Format d'image non supporté.");
    ext = mappedExt;
  }

  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const savedFilename = `${uniqueSuffix}${ext}`;
  const filePath = path.join(targetDir, savedFilename);

  await new Promise((resolve, reject) => {
    const ws = fs.createWriteStream(filePath);
    part.file.pipe(ws).on("finish", resolve).on("error", reject);
  });

  return { filePath, savedFilename };
};

const getFirstVideoForSeries = (series) => {
  const seasons = Array.isArray(series?.Saisons) ? series.Saisons : [];
  for (const season of seasons) {
    const episode = season.Episodes?.[0];
    if (episode?.VideoID) return episode;
  }
  return null;
};

const formatSagaContent = (link) => {
  if (link.Video) {
    const video = link.Video;
    return {
      SagaContentID: link.SagaContentID,
      Ordre: link.Ordre,
      id: video.VideoID,
      type: "video",
      Titre: video.Titre,
      Resumer: video.Resumer,
      Premium: !!video.Premium,
      CheminImage: video.CheminImage,
      Genres: video.VideoGenres?.map((vg) => vg.Genre.Nom) || [],
      VideoID: video.VideoID,
    };
  }

  if (link.Series) {
    const series = link.Series;
    const firstVideo = getFirstVideoForSeries(series);
    return {
      SagaContentID: link.SagaContentID,
      Ordre: link.Ordre,
      id: series.SeriesID,
      type: "series",
      Titre: series.Titre,
      Resumer: series.Resumer,
      Premium: !!series.Premium,
      CheminImage: series.CheminImage,
      Genres: series.SeriesGenres?.map((sg) => sg.Genre.Nom) || [],
      FirstVideoID: firstVideo?.VideoID || null,
      Saisons: series.Saisons?.length || 0,
      SeriesID: series.SeriesID,
    };
  }

  return null;
};

const sagaContentInclude = {
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
            select: { VideoID: true, Titre: true },
            orderBy: { Titre: "asc" },
            take: 1,
          },
        },
        orderBy: { Numero: "asc" },
      },
    },
  },
};

const normalizeSaga = (saga, includeContent = false) => {
  const normalized = {
    SagaID: saga.SagaID,
    id: saga.SagaID,
    type: "saga",
    Titre: saga.Titre,
    Resumer: saga.Resumer,
    CheminImage: saga.CheminImage,
    EtatID: saga.EtatID,
    Premium: !!saga.Premium,
    CreateDate: saga.CreateDate,
  };

  if (includeContent) {
    normalized.Contents = (saga.SagaContents || [])
      .map(formatSagaContent)
      .filter(Boolean);
  }

  return normalized;
};

export const getSagas = async (request, reply) => {
  const page = parsePositiveInt(request.query?.page) || 1;
  const take = parsePositiveInt(request.query?.limit) || 40;
  const skip = (page - 1) * take;
  const search = String(request.query?.search || "").trim();
  const includeDeleted = isTruthy(request.query?.deleted);
  const sort = String(request.query?.sort || "az").toLowerCase();

  const where = {
    EtatID: includeDeleted ? DELETED_ETAT_ID : ACTIVE_ETAT_ID,
    ...(search
      ? {
          OR: [
            { Titre: { contains: search } },
            { Resumer: { contains: search } },
          ],
        }
      : {}),
  };

  try {
    const [totalItems, sagas] = await Promise.all([
      prisma.saga.count({ where }),
      prisma.saga.findMany({
        where,
        orderBy:
          sort === "recent"
            ? { CreateDate: "desc" }
            : sort === "ancien"
              ? { CreateDate: "asc" }
              : sort === "za"
                ? { Titre: "desc" }
                : { Titre: "asc" },
        skip,
        take,
      }),
    ]);

    return reply.send({
      items: sagas.map((saga) => normalizeSaga(saga)),
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / take)),
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des sagas :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des sagas." });
  }
};

export const getAdminSagas = async (request, reply) => {
  const admin = await ensureSagaAdmin(request, reply);
  if (!admin) return;

  try {
    const sagas = await prisma.saga.findMany({
      where: { EtatID: ACTIVE_ETAT_ID },
      orderBy: { SagaID: "desc" },
      select: {
        SagaID: true,
        Titre: true,
        CheminImage: true,
        Premium: true,
        EtatID: true,
      },
    });

    return reply.send(sagas);
  } catch (error) {
    console.error("Erreur lors de la récupération admin des sagas :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des sagas." });
  }
};

export const getDeletedSagas = async (request, reply) => {
  const admin = await ensureSuperAdmin(request, reply);
  if (!admin) return;

  try {
    const sagas = await prisma.saga.findMany({
      where: { EtatID: DELETED_ETAT_ID },
      orderBy: { SagaID: "desc" },
      select: {
        SagaID: true,
        Titre: true,
        CheminImage: true,
        Premium: true,
        EtatID: true,
      },
    });

    return reply.send(sagas);
  } catch (error) {
    console.error("Erreur lors de la récupération des sagas en corbeille :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des sagas en corbeille." });
  }
};

export const getSagaById = async (request, reply) => {
  const sagaId = parsePositiveInt(request.params?.id);
  if (!sagaId) return reply.status(400).send({ error: "SagaID invalide." });

  try {
    const saga = await prisma.saga.findUnique({
      where: { SagaID: sagaId },
      include: {
        SagaContents: {
          orderBy: [{ Ordre: "asc" }, { SagaContentID: "asc" }],
          include: sagaContentInclude,
        },
      },
    });

    if (!saga || saga.EtatID === DELETED_ETAT_ID) {
      return reply.status(404).send({ error: "Saga introuvable." });
    }

    return reply.send(normalizeSaga(saga, true));
  } catch (error) {
    console.error("Erreur lors de la récupération de la saga :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération de la saga." });
  }
};

export const getSagaAdminDetails = async (request, reply) => {
  const admin = await ensureSagaAdmin(request, reply);
  if (!admin) return;

  const sagaId = parsePositiveInt(request.params?.id);
  if (!sagaId) return reply.status(400).send({ error: "SagaID invalide." });

  try {
    const saga = await prisma.saga.findUnique({
      where: { SagaID: sagaId },
      include: {
        SagaContents: {
          orderBy: [{ Ordre: "asc" }, { SagaContentID: "asc" }],
          include: sagaContentInclude,
        },
      },
    });

    if (!saga) return reply.status(404).send({ error: "Saga introuvable." });
    return reply.send(normalizeSaga(saga, true));
  } catch (error) {
    console.error("Erreur lors de la récupération admin de la saga :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération de la saga." });
  }
};

export const createSaga = async (request, reply) => {
  const admin = await ensureSagaAdmin(request, reply);
  if (!admin) return;

  try {
    const parts = request.parts();
    let Titre = "";
    let Resumer = "";
    let EtatID = ACTIVE_ETAT_ID;
    let Premium = false;
    let imageTempPath = null;
    let imageExt = null;

    for await (const part of parts) {
      if (part.type === "file") {
        const tempSagaDir = path.join(TEMP_ROOT, "saga");
        const saved = await saveImagePart(part, tempSagaDir);
        imageTempPath = saved.filePath;
        imageExt = path.extname(saved.savedFilename);
      } else {
        if (part.fieldname === "Titre") Titre = String(part.value || "");
        if (part.fieldname === "Resumer") Resumer = String(part.value || "");
        if (part.fieldname === "EtatID") EtatID = parsePositiveInt(part.value) || ACTIVE_ETAT_ID;
        if (part.fieldname === "Premium") Premium = isTruthy(part.value);
      }
    }

    if (!Titre.trim()) {
      return reply.status(400).send({ error: "Le titre de la saga est requis." });
    }

    const saga = await prisma.saga.create({
      data: {
        Titre: Titre.trim(),
        Resumer,
        CheminImage: "",
        EtatID,
        Premium,
      },
    });

    let CheminImage = "";
    if (imageTempPath && imageExt) {
      const sagaDir = path.join(SAGA_ROOT, String(saga.SagaID));
      if (!fs.existsSync(sagaDir)) fs.mkdirSync(sagaDir, { recursive: true });
      const finalFilename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${imageExt}`;
      const finalAbsPath = path.join(sagaDir, finalFilename);
      fs.renameSync(imageTempPath, finalAbsPath);
      CheminImage = path.join("uploads", "saga", String(saga.SagaID), finalFilename);
      await prisma.saga.update({
        where: { SagaID: saga.SagaID },
        data: { CheminImage },
      });
    }

    return reply.status(201).send({ ...saga, CheminImage });
  } catch (error) {
    console.error("Erreur lors de la création de la saga :", error);
    return reply.status(500).send({ error: error.message || "Erreur lors de la création de la saga." });
  }
};

export const updateSaga = async (request, reply) => {
  const admin = await ensureSagaAdmin(request, reply);
  if (!admin) return;

  const sagaId = parsePositiveInt(request.params?.id);
  if (!sagaId) return reply.status(400).send({ error: "SagaID invalide." });

  const data = {};
  if (typeof request.body?.Titre === "string") data.Titre = request.body.Titre.trim();
  if (typeof request.body?.Resumer === "string") data.Resumer = request.body.Resumer;
  if (typeof request.body?.Premium === "boolean") data.Premium = request.body.Premium;
  if (Number.isInteger(Number(request.body?.EtatID))) data.EtatID = Number(request.body.EtatID);

  if ("Titre" in data && !data.Titre) {
    return reply.status(400).send({ error: "Le titre ne peut pas être vide." });
  }

  try {
    const updated = await prisma.saga.update({
      where: { SagaID: sagaId },
      data,
    });
    return reply.send(updated);
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la saga :", error);
    return reply.status(500).send({ error: "Erreur lors de la mise à jour de la saga." });
  }
};

export const updateSagaImage = async (request, reply) => {
  const admin = await ensureSagaAdmin(request, reply);
  if (!admin) return;

  const sagaId = parsePositiveInt(request.params?.id);
  if (!sagaId) return reply.status(400).send({ error: "SagaID invalide." });

  try {
    const parts = request.parts();
    let savedPath = null;

    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "image") {
        const sagaDir = path.join(SAGA_ROOT, String(sagaId));
        const saved = await saveImagePart(part, sagaDir);
        savedPath = path.join("uploads", "saga", String(sagaId), saved.savedFilename);
        break;
      }
    }

    if (!savedPath) {
      return reply.status(400).send({ error: "Aucun fichier image reçu (champ 'image')." });
    }

    const old = await prisma.saga.findUnique({
      where: { SagaID: sagaId },
      select: { CheminImage: true },
    });
    if (!old) return reply.status(404).send({ error: "Saga introuvable." });

    removeStoredSagaImage(old.CheminImage);

    const updated = await prisma.saga.update({
      where: { SagaID: sagaId },
      data: { CheminImage: savedPath },
      select: { CheminImage: true },
    });

    return reply.send(updated);
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'image saga :", error);
    return reply.status(500).send({ error: error.message || "Erreur lors de la mise à jour de l'image de la saga." });
  }
};

export const deleteSagaImage = async (request, reply) => {
  const admin = await ensureSagaAdmin(request, reply);
  if (!admin) return;

  const sagaId = parsePositiveInt(request.params?.id);
  if (!sagaId) return reply.status(400).send({ error: "SagaID invalide." });

  try {
    const old = await prisma.saga.findUnique({
      where: { SagaID: sagaId },
      select: { CheminImage: true },
    });
    if (!old) return reply.status(404).send({ error: "Saga introuvable." });

    removeStoredSagaImage(old.CheminImage);
    const updated = await prisma.saga.update({
      where: { SagaID: sagaId },
      data: { CheminImage: "" },
      select: { CheminImage: true },
    });

    return reply.send({ ok: true, ...updated });
  } catch (error) {
    console.error("Erreur lors de la suppression de l'image saga :", error);
    return reply.status(500).send({ error: "Erreur lors de la suppression de l'image de la saga." });
  }
};

export const addSagaContent = async (request, reply) => {
  const admin = await ensureSagaAdmin(request, reply);
  if (!admin) return;

  const sagaId = parsePositiveInt(request.params?.id);
  const contentType = String(request.body?.type || "").toLowerCase();
  const contentId = parsePositiveInt(request.body?.id);
  const requestedOrder = Number.parseInt(request.body?.Ordre, 10);

  if (!sagaId || !contentId || !["video", "series"].includes(contentType)) {
    return reply.status(400).send({ error: "Données de liaison invalides." });
  }

  try {
    const saga = await prisma.saga.findUnique({ where: { SagaID: sagaId }, select: { SagaID: true } });
    if (!saga) return reply.status(404).send({ error: "Saga introuvable." });

    if (contentType === "video") {
      const video = await prisma.video.findUnique({
        where: { VideoID: contentId },
        select: { VideoID: true, EtatID: true, SaisonID: true },
      });
      if (!video || video.EtatID === DELETED_ETAT_ID || video.SaisonID !== null) {
        return reply.status(404).send({ error: "Film introuvable." });
      }
    } else {
      const series = await prisma.series.findUnique({
        where: { SeriesID: contentId },
        select: { SeriesID: true },
      });
      if (!series) return reply.status(404).send({ error: "Série introuvable." });
    }

    const duplicate = await prisma.sagaContent.findFirst({
      where: {
        SagaID: sagaId,
        ...(contentType === "video" ? { VideoID: contentId } : { SeriesID: contentId }),
      },
      select: { SagaContentID: true },
    });
    if (duplicate) return reply.status(409).send({ error: "Ce contenu est déjà lié à cette saga." });

    let Ordre = requestedOrder;
    if (!Number.isInteger(Ordre) || Ordre < 1) {
      const aggregate = await prisma.sagaContent.aggregate({
        where: { SagaID: sagaId },
        _max: { Ordre: true },
      });
      Ordre = (aggregate._max.Ordre || 0) + 1;
    }

    const created = await prisma.sagaContent.create({
      data: {
        SagaID: sagaId,
        Ordre,
        ...(contentType === "video" ? { VideoID: contentId } : { SeriesID: contentId }),
      },
      include: sagaContentInclude,
    });

    return reply.status(201).send(formatSagaContent(created));
  } catch (error) {
    console.error("Erreur lors de l'ajout du contenu à la saga :", error);
    return reply.status(500).send({ error: "Erreur lors de l'ajout du contenu à la saga." });
  }
};

export const updateSagaContentOrder = async (request, reply) => {
  const admin = await ensureSagaAdmin(request, reply);
  if (!admin) return;

  const sagaId = parsePositiveInt(request.params?.id);
  const items = Array.isArray(request.body?.items) ? request.body.items : [];
  if (!sagaId || items.length === 0) {
    return reply.status(400).send({ error: "Ordre invalide." });
  }

  try {
    const updates = items
      .map((item) => ({
        SagaContentID: Number(item.SagaContentID),
        Ordre: Number(item.Ordre),
      }))
      .filter((item) => Number.isInteger(item.SagaContentID) && Number.isInteger(item.Ordre) && item.Ordre > 0);

    if (updates.length === 0) {
      return reply.status(400).send({ error: "Ordre invalide." });
    }

    await prisma.$transaction(
      updates.map((item) =>
        prisma.sagaContent.updateMany({
          where: {
            SagaID: sagaId,
            SagaContentID: item.SagaContentID,
          },
          data: { Ordre: item.Ordre },
        })
      )
    );

    return reply.send({ ok: true });
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'ordre saga :", error);
    return reply.status(500).send({ error: "Erreur lors de la mise à jour de l'ordre." });
  }
};

export const removeSagaContent = async (request, reply) => {
  const admin = await ensureSagaAdmin(request, reply);
  if (!admin) return;

  const sagaId = parsePositiveInt(request.params?.id);
  const sagaContentId = parsePositiveInt(request.params?.contentId);
  if (!sagaId || !sagaContentId) {
    return reply.status(400).send({ error: "Liaison invalide." });
  }

  try {
    const result = await prisma.sagaContent.deleteMany({
      where: { SagaID: sagaId, SagaContentID: sagaContentId },
    });
    if (result.count === 0) return reply.status(404).send({ error: "Liaison introuvable." });
    return reply.send({ ok: true });
  } catch (error) {
    console.error("Erreur lors du retrait du contenu de la saga :", error);
    return reply.status(500).send({ error: "Erreur lors du retrait du contenu de la saga." });
  }
};

export const getSagasForContent = async (request, reply) => {
  const videoId = parsePositiveInt(request.params?.videoId);
  if (!videoId) return reply.status(400).send({ error: "VideoID invalide." });

  const page = parsePositiveInt(request.query?.page) || 1;
  const take = parsePositiveInt(request.query?.limit) || 8;
  const skip = (page - 1) * take;

  try {
    const video = await prisma.video.findUnique({
      where: { VideoID: videoId },
      select: {
        VideoID: true,
        Saison: {
          select: {
            SeriesID: true,
          },
        },
      },
    });

    if (!video) return reply.status(404).send({ error: "Vidéo introuvable." });

    const where = {
      Saga: { EtatID: ACTIVE_ETAT_ID },
      OR: [
        { VideoID: videoId },
        ...(video.Saison?.SeriesID ? [{ SeriesID: video.Saison.SeriesID }] : []),
      ],
    };

    const links = await prisma.sagaContent.findMany({
      where,
      orderBy: [{ Saga: { Titre: "asc" } }, { SagaContentID: "asc" }],
      include: { Saga: true },
    });

    const uniqueSagas = [];
    const seenSagaIds = new Set();
    links.forEach((link) => {
      if (!link.Saga || seenSagaIds.has(link.Saga.SagaID)) return;
      seenSagaIds.add(link.Saga.SagaID);
      uniqueSagas.push(link.Saga);
    });

    const totalItems = uniqueSagas.length;
    const paginatedSagas = uniqueSagas.slice(skip, skip + take);

    return reply.send({
      items: paginatedSagas.map((saga) => normalizeSaga(saga)),
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / take)),
    });
  } catch (error) {
    console.error("Erreur lors de la récupération des sagas du contenu :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des sagas du contenu." });
  }
};

export const softDeleteSaga = async (request, reply) => {
  const admin = await ensureSagaAdmin(request, reply);
  if (!admin) return;

  const sagaId = parsePositiveInt(request.params?.id);
  if (!sagaId) return reply.status(400).send({ error: "SagaID invalide." });

  try {
    const updated = await prisma.saga.update({
      where: { SagaID: sagaId },
      data: { EtatID: DELETED_ETAT_ID },
    });
    return reply.send({ ok: true, saga: updated });
  } catch (error) {
    console.error("Erreur lors de la mise en corbeille de la saga :", error);
    return reply.status(500).send({ error: "Erreur lors de la mise en corbeille de la saga." });
  }
};

export const restoreSaga = async (request, reply) => {
  const admin = await ensureSuperAdmin(request, reply);
  if (!admin) return;

  const sagaId = parsePositiveInt(request.params?.id);
  if (!sagaId) return reply.status(400).send({ error: "SagaID invalide." });

  try {
    const updated = await prisma.saga.update({
      where: { SagaID: sagaId },
      data: { EtatID: ACTIVE_ETAT_ID },
    });
    return reply.send({ ok: true, saga: updated });
  } catch (error) {
    console.error("Erreur lors de la restauration de la saga :", error);
    return reply.status(500).send({ error: "Erreur lors de la restauration de la saga." });
  }
};

export const permanentlyDeleteSaga = async (request, reply) => {
  const admin = await ensureSuperAdmin(request, reply);
  if (!admin) return;

  const sagaId = parsePositiveInt(request.params?.id);
  if (!sagaId) return reply.status(400).send({ error: "SagaID invalide." });

  try {
    const saga = await prisma.saga.findUnique({
      where: { SagaID: sagaId },
      select: { SagaID: true, Titre: true, EtatID: true, CheminImage: true },
    });
    if (!saga) return reply.status(404).send({ error: "Saga introuvable." });
    if (saga.EtatID !== DELETED_ETAT_ID) {
      return reply.status(409).send({ error: "La saga doit être dans la corbeille avant suppression définitive." });
    }

    await prisma.$transaction([
      prisma.sagaContent.deleteMany({ where: { SagaID: sagaId } }),
      prisma.saga.delete({ where: { SagaID: sagaId } }),
    ]);

    removeSagaDirectory(sagaId);

    return reply.send({ ok: true, saga: { SagaID: saga.SagaID, Titre: saga.Titre } });
  } catch (error) {
    console.error("Erreur lors de la suppression définitive de la saga :", error);
    return reply.status(500).send({ error: "Erreur lors de la suppression définitive de la saga." });
  }
};
