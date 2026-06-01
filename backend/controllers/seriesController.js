// controllers/seriesController.js

import { prisma } from "../services/db.js";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from "url";
import { createLog } from "./logController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.join(__dirname, "..");
const UPLOADS_ROOT = path.join(BACKEND_ROOT, "uploads");
const SERIE_ROOT = path.join(UPLOADS_ROOT, "serie");
const TEMP_ROOT = path.join(UPLOADS_ROOT, "tmp");

// Ajouter une nouvelle série
export const createSeries = async (request, reply) => {
  try {
    console.log("Début du traitement multipart...");

    const parts = request.parts();
    let Titre = "";
    let Resumer = "";
    let CheminImage = null;
    let imageTempPath = null;
    let imageExt = null;
    let EtatID = 1; // Par défaut
    let GenreIDs = [];
    let UtilisateurID = "";

    // Parcours des champs multipart
    for await (const part of parts) {
      if (part.type === "file") {
        // Gestion du fichier image
        console.log(`Fichier image reçu : ${part.filename}`);
        const tempSerieDir = path.join(TEMP_ROOT, "serie");
        if (!fs.existsSync(tempSerieDir)) {
          fs.mkdirSync(tempSerieDir, { recursive: true });
        }
        imageExt = path.extname(part.filename).toLowerCase();
        const tempFilename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${imageExt}`;
        imageTempPath = path.join(tempSerieDir, tempFilename);
        const writeStream = fs.createWriteStream(imageTempPath);

        await new Promise((resolve, reject) => {
          part.file
            .pipe(writeStream)
            .on("finish", () => resolve())
            .on("error", (err) => reject(err));
        });

        // Chemin final défini après création (besoin du SeriesID)
      } else {
        // Gestion des champs texte
        console.log(`Champ texte détecté : ${part.fieldname} = ${part.value}`);
        if (part.fieldname === "Titre") Titre = part.value;
        if (part.fieldname === "Resumer") Resumer = part.value;
        if (part.fieldname === "EtatID") EtatID = parseInt(part.value);
        if (part.fieldname === "GenreIDs") GenreIDs = JSON.parse(part.value);
        if (part.fieldname === "UtilisateurID") UtilisateurID = parseInt(part.value);
      }
    }

    // Validation des champs obligatoires
    if (!Titre) {
      console.error("Titre manquant.");
      return reply.status(400).send({ error: "Le titre de la série est requis." });
    }


    // Insertion dans la base de données
    const series = await prisma.series.create({
      data: {
        Titre,
        Resumer,
        CheminImage: CheminImage || "uploads/images/default.png",
        EtatID,
        UtilisateurID,
      },
    });

    if (imageTempPath && imageExt) {
      const serieDir = path.join(SERIE_ROOT, String(series.SeriesID));
      if (!fs.existsSync(serieDir)) fs.mkdirSync(serieDir, { recursive: true });
      const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const finalFilename = `${uniqueSuffix}${imageExt}`;
      const finalAbsPath = path.join(serieDir, finalFilename);
      fs.renameSync(imageTempPath, finalAbsPath);
      const finalRelPath = path.join("uploads", "serie", String(series.SeriesID), finalFilename);
      await prisma.series.update({
        where: { SeriesID: series.SeriesID },
        data: { CheminImage: finalRelPath },
      });
      CheminImage = finalRelPath;
    }

    if (GenreIDs.length > 0) {
      const uniqueIds = [
        ...new Set(GenreIDs.map((g) => parseInt(g, 10)).filter(Number.isInteger)),
      ];
      await prisma.seriesGenre.createMany({
        data: uniqueIds.map((GenreID) => ({ SeriesID: series.SeriesID, GenreID })),
        skipDuplicates: true,
      });
    }

    const responseSeries = {
      ...series,
      CheminImage: CheminImage || series.CheminImage,
    };

    console.log("Série créée avec succès :", responseSeries);
    reply.status(201).send(responseSeries);
  } catch (error) {
    console.error("Erreur lors de la création de la série :", error);
    reply.status(500).send({ error: "Erreur lors de la création de la série." });
  }
};

// Ajouter une nouvelle saison à une série
export const addSaison = async (request, reply) => {
  const { id } = request.params; // ID de la série
  const { Numero, UtilisateurID } = request.body;

  try {
    const saison = await prisma.saison.create({
      data: {
        Numero,
        SeriesID: parseInt(id),
        UtilisateurID,
      },
    });

    reply.status(201).send(saison);
  } catch (error) {
    console.error("Erreur lors de la création de la saison :", error);
    reply.status(500).send({ error: "Erreur lors de la création de la saison." });
  }
};

export const resetSeriesWatchStatus = async (request, reply) => {
  const seriesId = parseInt(request.params.id, 10);
  const userId = Number(request.user?.userId);

  if (!Number.isInteger(seriesId)) {
    return reply.status(400).send({ error: "SeriesID invalide." });
  }

  if (!Number.isInteger(userId)) {
    return reply.status(401).send({ error: "Non authentifié." });
  }

  try {
    const series = await prisma.series.findUnique({
      where: { SeriesID: seriesId },
      select: { SeriesID: true },
    });

    if (!series) {
      return reply.status(404).send({ error: "Série introuvable." });
    }

    const resetAt = new Date();
    const reset = await prisma.userSeriesWatchReset.upsert({
      where: {
        UserID_SeriesID: {
          UserID: userId,
          SeriesID: seriesId,
        },
      },
      create: {
        UserID: userId,
        SeriesID: seriesId,
        ResetAt: resetAt,
      },
      update: {
        ResetAt: resetAt,
      },
      select: {
        SeriesID: true,
        ResetAt: true,
      },
    });

    return reply.send({
      ok: true,
      message: "La série a été remise à zéro.",
      reset,
    });
  } catch (error) {
    console.error("Erreur lors de la remise à zéro de la série :", error);
    return reply.status(500).send({ error: "Erreur lors de la remise à zéro de la série." });
  }
};

export const getAllSeries = async (request, reply) => {
  try {
    const series = await prisma.series.findMany({
      orderBy: { SeriesID: "desc" },
      select: {
        SeriesID: true,
        Titre: true,
      },
    });
    reply.send(series);
  } catch (error) {
    console.error("Erreur lors de la récupération des séries :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération des séries." });
  }
};

// Récupérer toutes les saisons d'une série par SeriesID
export const getSeasonsBySeriesId = async (request, reply) => {
  const { id } = request.params;

  try {
    const seasons = await prisma.saison.findMany({
      where: { SeriesID: parseInt(id) },
      orderBy: { Numero: "desc" }, // Trie les saisons par leur numéro
      select: {
        SaisonID: true,
        Numero: true,
      },
    });

    if (!seasons.length) {
      return reply.status(404).send({ error: "Aucune saison trouvée pour cette série." });
    }

    reply.send(seasons);
  } catch (error) {
    console.error("Erreur lors de la récupération des saisons :", error);
    reply.status(500).send({ error: "Erreur lors de la récupération des saisons." });
  }
};

// Mise à jour du titre d'une série
export const updateSerieTitle = async (request, reply) => {
  const { id } = request.params;
  const { Titre } = request.body;

  if (!Titre || Titre.trim() === "") {
    return reply.status(400).send({ error: "Le titre ne peut pas être vide." });
  }

  try {
    const seriesId = parseInt(id, 10);
    const userId = request.user?.userId;
    if (!userId || !Number.isFinite(Number(userId))) {
      return reply.code(401).send({ error: "Non autorisé." });
    }

    const before = await prisma.series.findUnique({
      where: { SeriesID: seriesId },
      select: { Titre: true },
    });
    if (!before) return reply.code(404).send({ error: "Série introuvable." });

    if ((before.Titre ?? "").trim() === (Titre ?? "").trim()) {
      // ✅ aucune modif réelle => pas de log, pas de update
      return reply.send({ ok: true, unchanged: true, Titre });
    }

    const updatedSerie = await prisma.series.update({
      where: { SeriesID: seriesId },
      data: { Titre },
    });

    // Log audit
    await createLog({
      request,
      UtilisateurID: Number(userId),
      ActionNom: "serie_update",
      SeriesID: seriesId,
      Champ: "Titre",
      AncienneValeur: before.Titre ?? null,
      NouvelleValeur: Titre,
      DedupeMs: 2000,
    });

    return reply.send(updatedSerie);
  } catch (error) {
    console.error("Erreur lors de la mise à jour du titre de la série :", error);
    return reply.status(500).send({ error: "Erreur interne du serveur." });
  }
};

// Mise à jour du résumer d'une série
export const updateSerieResumer = async (request, reply) => {
  const { id } = request.params;
  const { Resumer } = request.body;

  if (!Resumer || Resumer.trim() === "") {
    return reply.status(400).send({ error: "Le Resumer ne peut pas être vide." });
  }

  try {
    const seriesId = parseInt(id, 10);
    const userId = request.user?.userId;
    if (!userId || !Number.isFinite(Number(userId))) {
      return reply.code(401).send({ error: "Non autorisé." });
    }

    const before = await prisma.series.findUnique({
      where: { SeriesID: seriesId },
      select: { Resumer: true },
    });
    if (!before) return reply.code(404).send({ error: "Série introuvable." });

    if ((before.Resumer ?? "").trim() === (Resumer ?? "").trim()) {
      return reply.send({ ok: true, unchanged: true, Resumer });
    }

    const updatedSerie = await prisma.series.update({
      where: { SeriesID: seriesId },
      data: { Resumer },
    });

    await createLog({
      request,
      UtilisateurID: Number(userId),
      ActionNom: "serie_update",
      SeriesID: seriesId,
      Champ: "Resumer",
      AncienneValeur: before.Resumer ?? null,
      NouvelleValeur: Resumer,
      DedupeMs: 2000,
    });

    return reply.send(updatedSerie);
  } catch (error) {
    console.error("Erreur lors de la mise à jour du Resumer de la série :", error);
    return reply.status(500).send({ error: "Erreur interne du serveur." });
  }
};

// PUT /api/series/:id/image
export const updateSerieImage = async (request, reply) => {
  try {
    const { id } = request.params;
    const userId = request.user?.userId;
    if (!userId || !Number.isFinite(Number(userId))) {
      return reply.code(401).send({ error: "Non autorisé." });
    }
    const parts = request.parts();

    const serieDir = path.join(SERIE_ROOT, String(id));
    console.log("[serie:image] start", { seriesId: Number(id), userId });
    const allowedExts = new Set([
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
    if (!fs.existsSync(serieDir)) fs.mkdirSync(serieDir, { recursive: true });

    let savedPath = null;

    // Lire le fichier multipart (champ 'image')
    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "image") {
        const originalFilename = part.filename || "";
        const mime = (part.mimetype || "").toLowerCase();
        let ext = path.extname(originalFilename).toLowerCase();
        if (mime && !mime.startsWith("image/")) {
          console.warn("[serie:image] unsupported mimetype", { seriesId: Number(id), mime });
          return reply.code(400).send({ error: "Format d'image non supporté." });
        }
        if (!ext || !allowedExts.has(ext)) {
          const mappedExt = mimeToExt[mime];
          if (mappedExt) {
            ext = mappedExt;
          } else {
            console.warn("[serie:image] unsupported format", { seriesId: Number(id), filename: originalFilename, mime });
            return reply.code(400).send({ error: "Format d'image non supporté." });
          }
        }
        const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const savedFilename = `${uniqueSuffix}${ext}`;
        const filePath = path.join(serieDir, savedFilename);

        await new Promise((resolve, reject) => {
          const ws = fs.createWriteStream(filePath);
          part.file.pipe(ws).on("finish", resolve).on("error", reject);
        });

        savedPath = path.join("uploads", "serie", String(id), savedFilename);
        console.log("[serie:image] file saved", { seriesId: Number(id), savedPath });
        break;
      }
    }

    if (!savedPath) {
      console.warn("[serie:image] no file received", { seriesId: Number(id) });
      return reply.code(400).send({ error: "Aucun fichier image reçu (champ 'image')." });
    }

    // Récupérer l’ancien chemin
    const old = await prisma.series.findUnique({
      where: { SeriesID: parseInt(id, 10) },
      select: { CheminImage: true },
    });

    // Supprimer l’ancien fichier si présent et non 'default'
    if (old?.CheminImage) {
      const cleanedRel = old.CheminImage.replace(/^[/\\]+/, "");
      const oldAbs = path.join(BACKEND_ROOT, cleanedRel);
      if (fs.existsSync(oldAbs) && !old.CheminImage.includes("default")) {
        try {
          fs.unlinkSync(oldAbs);
          console.log("🗑️ Ancien visuel série supprimé :", old.CheminImage);
        } catch (err) {
          console.warn("⚠️ Suppression ancienne image (serie) échouée :", err.message);
        }
      }
    }

    // Écrire le nouveau chemin en BDD
    const updated = await prisma.series.update({
      where: { SeriesID: parseInt(id, 10) },
      data: { CheminImage: savedPath },
      select: { CheminImage: true },
    });
    console.log("[serie:image] db updated", { seriesId: Number(id), savedPath });

    // Log audit image
    await createLog({
      request,
      UtilisateurID: Number(userId),
      ActionNom: "serie_update",
      SeriesID: parseInt(id, 10),
      Champ: "CheminImage",
      AncienneValeur: old?.CheminImage ?? null,
      NouvelleValeur: savedPath,
      DedupeMs: 2000,
    });

    return reply.send(updated); // { CheminImage: 'uploads/images/xxx.ext' }
  } catch (error) {
    console.error("❌ updateSerieImage:", error);
    return reply.code(500).send({ error: "Erreur lors de la mise à jour de l'image de la série." });
  }
};

// GET /api/series/:id/genres
export const getSerieGenres = async (request, reply) => {
  const { id } = request.params;
  try {
    const links = await prisma.seriesGenre.findMany({
      where: { SeriesID: parseInt(id, 10) },
      include: { Genre: true },
      orderBy: { SeriesGenreID: 'asc' }
    });
    // renvoie un simple tableau d'objets Genre (id + nom)
    const genres = links.map(l => ({ GenreID: l.GenreID, Nom: l.Genre.Nom }));
    return reply.send(genres);
  } catch (e) {
    console.error("getSerieGenres error:", e);
    return reply.code(500).send({ error: "Erreur lors de la récupération des genres de la série." });
  }
};

export const updateSerieGenres = async (request, reply) => {
  const { id } = request.params;
  let { GenreIDs } = request.body; // tableau d'entiers

  if (!Array.isArray(GenreIDs)) {
    return reply.code(400).send({ error: "GenreIDs doit être un tableau d'entiers." });
  }

  try {
    const seriesId = parseInt(id, 10);
    const userId = request.user?.userId;
    if (!userId || !Number.isFinite(Number(userId))) {
      return reply.code(401).send({ error: "Non autorisé." });
    }

    const uniqueIds = [
      ...new Set(GenreIDs.map((g) => parseInt(g, 10)).filter(Number.isInteger)),
    ];

    // récupère l’état actuel
    const current = await prisma.seriesGenre.findMany({
      where: { SeriesID: seriesId },
      select: { GenreID: true },
    });
    const beforeIds = [...new Set(current.map((g) => g.GenreID))];

    // remplace entièrement les liaisons pour éviter les doublons persistants
    await prisma.seriesGenre.deleteMany({ where: { SeriesID: seriesId } });
    if (uniqueIds.length) {
      await prisma.seriesGenre.createMany({
        data: uniqueIds.map((GenreID) => ({ SeriesID: seriesId, GenreID })),
      });
    }

    await createLog({
      request,
      UtilisateurID: Number(userId),
      ActionNom: "serie_update",
      SeriesID: seriesId,
      Champ: "GenreIDs",
      AncienneValeur: JSON.stringify(beforeIds),
      NouvelleValeur: JSON.stringify(uniqueIds),
      Meta: {
        removed: beforeIds.filter((x) => !uniqueIds.includes(x)),
        added: uniqueIds.filter((x) => !beforeIds.includes(x)),
      },
      DedupeMs: 2000,
    });

    // renvoie les genres à jour
    const updated = await prisma.seriesGenre.findMany({
      where: { SeriesID: seriesId },
      include: { Genre: true },
      orderBy: { SeriesGenreID: "asc" },
    });
    const genres = updated.map((l) => ({ GenreID: l.GenreID, Nom: l.Genre.Nom }));
    return reply.send({ ok: true, genres });
  } catch (e) {
    console.error("updateSerieGenres error:", e);
    return reply.code(500).send({ error: "Erreur lors de la mise à jour des genres de la série." });
  }
};

// Active ou désactive le flag Premium sur une série
export const updateSeriePremium = async (request, reply) => {
  try {
    if (!request.user?.userId || !Number.isFinite(Number(request.user.userId))) {
      return reply.code(401).send({ error: "Non autorisé." });
    }
    const { id } = request.params;
    const { Premium } = request.body;
    const userId = Number(request.user.userId);

    if (typeof Premium !== "boolean") {
      return reply.code(400).send({ error: "Le champ 'Premium' doit être un booléen." });
    }

    const user = await prisma.utilisateur.findUnique({
      where: { UtilisateurID: userId },
      select: { GradeID: true },
    });

    if (!user || (user.GradeID !== 1 && user.GradeID !== 2)) {
      return reply.code(403).send({ error: "Accès réservé aux administrateurs." });
    }

    const seriesId = parseInt(id, 10);
    if (Number.isNaN(seriesId)) {
      return reply.code(400).send({ error: "ID de série invalide." });
    }

    const before = await prisma.series.findUnique({
      where: { SeriesID: seriesId },
      select: { Premium: true },
    });
    if (!before) return reply.code(404).send({ error: "Série introuvable." });

    if (Boolean(before.Premium) === Boolean(Premium)) {
      return reply.send({ ok: true, unchanged: true, Premium: before.Premium });
    }

    const updated = await prisma.series.update({
      where: { SeriesID: seriesId },
      data: { Premium },
      select: {
        SeriesID: true,
        Premium: true,
      },
    });

    await createLog({
      request,
      UtilisateurID: userId,
      ActionNom: "serie_update",
      SeriesID: seriesId,
      Champ: "Premium",
      AncienneValeur: String(before.Premium),
      NouvelleValeur: String(Premium),
      DedupeMs: 2000,
    });

    return reply.send(updated);
  } catch (e) {
    console.error("updateSeriePremium error:", e);
    return reply.code(500).send({ error: "Erreur lors de la mise à jour du statut premium de la série." });
  }
};
