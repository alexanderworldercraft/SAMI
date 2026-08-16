// backend/controllers/personneController.js
import { prisma } from "../services/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureAdmin, ensureSuperAdmin } from "../services/authz.js";
import { ETAT, MULTIPART_LIMITS } from "../constants.js";
import { isMultipartFileTooLargeError, sendMultipartFileTooLarge } from "../utils/multipartErrors.js";
import { createWikimediaClient, runPersonImageSeed } from "../prisma/seedPersonneImages.js";
import {
  importPeopleCredits,
  PersonCreditImportError,
} from "../services/personCreditImportService.js";
import {
  getPotentialDuplicatePairs,
  mergeDuplicatePeople,
  PersonDuplicateError,
  reviewDuplicatePair,
} from "../services/personDuplicateService.js";
import { createLog } from "./logController.js";

// Util
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.join(__dirname, "..");
const peopleRootAbs = path.join(BACKEND_ROOT, "uploads", "people");
const peopleTmpAbs = path.join(BACKEND_ROOT, "uploads", "tmp", "people");
const ACTIVE_ETAT_ID = ETAT.ACTIVE;
const DELETED_ETAT_ID = ETAT.DELETED;
if (!fs.existsSync(peopleRootAbs)) fs.mkdirSync(peopleRootAbs, { recursive: true });
if (!fs.existsSync(peopleTmpAbs)) fs.mkdirSync(peopleTmpAbs, { recursive: true });

const parsePersonId = (value) => {
  const personId = Number(value);
  return Number.isInteger(personId) && personId > 0 ? personId : null;
};

const removePersonDirectory = (personId) => {
  const target = path.resolve(peopleRootAbs, String(personId));
  const root = `${path.resolve(peopleRootAbs)}${path.sep}`;
  if (!target.startsWith(root) || !fs.existsSync(target)) return false;

  try {
    fs.rmSync(target, { recursive: true, force: true });
    return true;
  } catch (error) {
    console.warn("Suppression du dossier personne échouée :", error.message);
    return false;
  }
};

const removeStoredPersonImage = (relativePath) => {
  if (!relativePath || relativePath.includes("default")) return false;

  const target = path.resolve(BACKEND_ROOT, relativePath.replace(/^[/\\]+/, ""));
  const root = `${path.resolve(peopleRootAbs)}${path.sep}`;
  if (!target.startsWith(root) || !fs.existsSync(target)) return false;

  try {
    fs.rmSync(target, { force: true });
    return true;
  } catch (error) {
    console.warn("Suppression de l'image personne échouée :", error.message);
    return false;
  }
};

const ensureVideoIsNotTransferBlocked = async (videoId, reply) => {
  const video = await prisma.video.findUnique({
    where: { VideoID: Number(videoId) },
    select: { EtatID: true },
  });
  if (!video) {
    reply.code(404).send({ error: "Vidéo introuvable." });
    return false;
  }
  if (video.EtatID === ETAT.BLOCKED) {
    reply.code(409).send({
      error: "Cette vidéo est verrouillée pendant son transfert.",
      code: "VIDEO_TRANSFER_IN_PROGRESS",
    });
    return false;
  }
  return true;
};

/**
 * POST /api/people  (multipart)
 * Champs texte: Nom, Prenom, Surnom?
 * Fichier: image?  (fieldname: "image")
 */
export const createPersonne = async (request, reply) => {
  try {
    const admin = await ensureAdmin(request, reply);
    if (!admin) return;

    const parts = request.parts({ limits: { fileSize: MULTIPART_LIMITS.IMAGE_FILE_SIZE } });
    let Nom = "", Prenom = "", Surnom = null;
    let tempPath = null;
    let tempExt = null;

    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "image") {
        const originalFilename = path.basename(part.filename || "");
        const ext = path.extname(originalFilename).toLowerCase();
        if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(ext)) {
          return reply.code(400).send({ error: "Format d'image non supporté." });
        }
        const filename = `${Date.now()}${ext}`;
        const filePath = path.join(peopleTmpAbs, filename);
        await new Promise((resolve, reject) => {
          const ws = fs.createWriteStream(filePath);
          part.file.pipe(ws).on("finish", resolve).on("error", reject);
        });
        tempPath = filePath;
        tempExt = ext;
      } else {
        if (part.fieldname === "Nom") Nom = (part.value || "").trim();
        if (part.fieldname === "Prenom") Prenom = (part.value || "").trim();
        if (part.fieldname === "Surnom") Surnom = (part.value || "").trim() || null;
      }
    }

    if (!Nom || !Prenom) {
      return reply.code(400).send({ error: "Nom et Prenom sont requis." });
    }

    let personne = await prisma.personne.create({
      data: {
        Nom, Prenom, Surnom,
        CheminImage: null,
        ImageStatut: "DEFAULT",
        EtatID: ACTIVE_ETAT_ID,
      }
    });

    let savedPath = null;
    if (tempPath && tempExt) {
      const personDirAbs = path.join(peopleRootAbs, String(personne.PersonneID));
      if (!fs.existsSync(personDirAbs)) fs.mkdirSync(personDirAbs, { recursive: true });
      const filename = `${Date.now()}${tempExt}`;
      const finalAbs = path.join(personDirAbs, filename);
      fs.renameSync(tempPath, finalAbs);
      savedPath = path.join("uploads", "people", String(personne.PersonneID), filename);

      personne = await prisma.personne.update({
        where: { PersonneID: personne.PersonneID },
        data: { CheminImage: savedPath, ImageStatut: "CUSTOM" },
      });
    }

    return reply.code(201).send(personne);
  } catch (e) {
    if (isMultipartFileTooLargeError(e)) return sendMultipartFileTooLarge(reply);
    console.error("createPersonne:", e);
    return reply.code(500).send({ error: "Erreur lors de la création de la personne." });
  }
};

/**
 * PUT /api/people/:id/photo  (multipart image)
 * remplace la photo + supprime l’ancienne si custom
 */
export const updatePersonnePhoto = async (request, reply) => {
  try {
    const admin = await ensureAdmin(request, reply);
    if (!admin) return;

    const personId = parsePersonId(request.params?.id);
    if (!personId) return reply.code(400).send({ error: "PersonneID invalide." });

    const old = await prisma.personne.findFirst({
      where: { PersonneID: personId, EtatID: ACTIVE_ETAT_ID },
      select: { CheminImage: true, ImageStatut: true },
    });
    if (!old) return reply.code(404).send({ error: "Personne introuvable." });

    const parts = request.parts({ limits: { fileSize: MULTIPART_LIMITS.IMAGE_FILE_SIZE } });

    let savedPath = null;
    let tempPath = null;
    let tempExt = null;

    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "image") {
        const originalFilename = path.basename(part.filename || "");
        const ext = path.extname(originalFilename).toLowerCase();
        if (!/\.(jpg|jpeg|png|webp|gif)$/i.test(ext)) {
          return reply.code(400).send({ error: "Format d'image non supporté." });
        }
        const filename = `${Date.now()}${ext}`;
        const filePath = path.join(peopleTmpAbs, filename);
        await new Promise((resolve, reject) => {
          const ws = fs.createWriteStream(filePath);
          part.file.pipe(ws).on("finish", resolve).on("error", reject);
        });
        tempPath = filePath;
        tempExt = ext;
        break;
      }
    }

    if (!tempPath || !tempExt) {
      return reply.code(400).send({ error: "Aucun fichier image reçu (champ 'image')." });
    }

    const personDirAbs = path.join(peopleRootAbs, String(personId));
    if (!fs.existsSync(personDirAbs)) fs.mkdirSync(personDirAbs, { recursive: true });
    const filename = `${Date.now()}${tempExt}`;
    const finalAbs = path.join(personDirAbs, filename);
    fs.renameSync(tempPath, finalAbs);
    savedPath = path.join("uploads", "people", String(personId), filename);

    // supprime ancien fichier custom
    if (old?.CheminImage && old.ImageStatut === "CUSTOM") {
      removeStoredPersonImage(old.CheminImage);
    }

    const updated = await prisma.personne.update({
      where: { PersonneID: personId },
      data: { CheminImage: savedPath, ImageStatut: "CUSTOM" },
      select: { CheminImage: true },
    });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "person_photo_update",
      Champ: "person_photo",
      AncienneValeur: old.CheminImage,
      NouvelleValeur: updated.CheminImage,
      Meta: { personId },
    });

    return reply.send(updated);
  } catch (e) {
    if (isMultipartFileTooLargeError(e)) return sendMultipartFileTooLarge(reply);
    console.error("updatePersonnePhoto:", e);
    return reply.code(500).send({ error: "Erreur lors de la mise à jour de la photo." });
  }
};

/**
 * GET /api/people?search=
 * recherche simple par nom/prenom/surnom
 */
export const searchPeople = async (request, reply) => {
  const q = (request.query.search || "").trim();
  try {
    const where = {
      EtatID: ACTIVE_ETAT_ID,
      ...(q
      ? {
        OR: [
          { Nom: { contains: q } },
          { Prenom: { contains: q } },
          { Surnom: { contains: q } }
        ]
      }
      : {}),
    };

    const people = await prisma.personne.findMany({
      where,
      orderBy: [{ Prenom: "asc" }, { Nom: "asc" }],
      // take: 50
    });

    return reply.send(people);
  } catch (e) {
    console.error("searchPeople:", e);
    return reply.code(500).send({ error: "Erreur lors de la recherche." });
  }
};

export const getAdminPeople = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;

  try {
    const people = await prisma.personne.findMany({
      where: { EtatID: ACTIVE_ETAT_ID },
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
    return reply.send(people);
  } catch (error) {
    console.error("getAdminPeople:", error);
    return reply.code(500).send({ error: "Impossible de récupérer les personnes." });
  }
};

export const getDeletedPeople = async (request, reply) => {
  const admin = await ensureSuperAdmin(request, reply);
  if (!admin) return;

  try {
    const people = await prisma.personne.findMany({
      where: { EtatID: DELETED_ETAT_ID },
      orderBy: { PersonneID: "desc" },
      select: {
        PersonneID: true,
        Nom: true,
        Prenom: true,
        Surnom: true,
        CheminImage: true,
        EtatID: true,
      },
    });
    return reply.send(people);
  } catch (error) {
    console.error("getDeletedPeople:", error);
    return reply.code(500).send({ error: "Impossible de récupérer les personnes en corbeille." });
  }
};

/**
 * POST /api/people/bulk-link
 * body: { type: "video"|"series", contenuId: number, role: "actor"|"director", names: string }
 */
export const bulkLinkPeople = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;

  try {
    const importResult = await importPeopleCredits({
      prisma,
      type: request.body?.type,
      contentId: request.body?.contenuId,
      role: request.body?.role,
      names: request.body?.names,
    });

    let imageSearch;
    try {
      const client = createWikimediaClient({ userAgent: process.env.WIKIMEDIA_USER_AGENT });
      const imageResult = await runPersonImageSeed({
        prisma,
        client,
        options: {
          dryRun: false,
          refresh: false,
          retryMisses: false,
          limit: null,
          personId: null,
          personIds: importResult.results.map((person) => person.PersonneID),
          concurrency: 2,
          writeReports: false,
        },
        logger: { log: () => {} },
      });
      const imageByPersonId = new Map(
        imageResult.results.map((result) => [result.PersonneID, result]),
      );
      imageSearch = {
        status: "completed",
        summary: imageResult.summary,
        results: importResult.results.map((person) => ({
          PersonneID: person.PersonneID,
          name: person.name,
          status: person.hadImage
            ? "existing"
            : imageByPersonId.get(person.PersonneID)?.status ?? "existing",
          ...(imageByPersonId.get(person.PersonneID)?.error
            ? { error: imageByPersonId.get(person.PersonneID).error }
            : {}),
        })),
      };
    } catch (error) {
      console.error("bulkLinkPeople image search:", error);
      imageSearch = {
        status: "unavailable",
        error: error.message,
        results: importResult.results.map((person) => ({
          PersonneID: person.PersonneID,
          name: person.name,
          status: person.hadImage ? "existing" : "error",
        })),
      };
    }

    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "person_bulk_link",
      VideoID: importResult.content.type === "video" ? importResult.content.id : null,
      SeriesID: importResult.content.type === "series" ? importResult.content.id : null,
      Champ: "person_credits",
      NouvelleValeur: String(importResult.summary?.requested ?? importResult.results.length),
      Meta: {
        content: importResult.content,
        role: importResult.role,
        summary: importResult.summary,
        personIds: importResult.results.map((person) => person.PersonneID),
        imageSearchStatus: imageSearch.status,
        imageSearchSummary: imageSearch.summary ?? null,
      },
    });

    return reply.send({ ...importResult, imageSearch });
  } catch (error) {
    if (error instanceof PersonCreditImportError) {
      return reply.code(error.statusCode).send({ error: error.message, code: error.code });
    }
    console.error("bulkLinkPeople:", error);
    return reply.code(500).send({ error: "Impossible d'importer cette liste de personnes." });
  }
};

export const getPersonDuplicateCandidates = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;

  try {
    return reply.send(await getPotentialDuplicatePairs(prisma));
  } catch (error) {
    console.error("getPersonDuplicateCandidates:", error);
    return reply.code(500).send({ error: "Impossible de vérifier les doublons de personnes." });
  }
};

export const reviewPersonDuplicate = async (request, reply) => {
  const admin = await ensureSuperAdmin(request, reply);
  if (!admin) return;

  try {
    const review = await reviewDuplicatePair(prisma, {
      personAId: request.body?.personAId,
      personBId: request.body?.personBId,
      decision: request.body?.decision,
      reviewedById: admin.userId,
    });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "person_duplicate_review",
      Champ: "person_duplicate_review",
      NouvelleValeur: review.Decision,
      Meta: {
        personAId: Number(request.body?.personAId),
        personBId: Number(request.body?.personBId),
        decision: review.Decision,
      },
    });
    return reply.send({ ok: true, decision: review.Decision });
  } catch (error) {
    if (error instanceof PersonDuplicateError) {
      return reply.code(error.statusCode).send({ error: error.message, code: error.code });
    }
    console.error("reviewPersonDuplicate:", error);
    return reply.code(500).send({ error: "Impossible d'enregistrer cette décision." });
  }
};

export const mergePersonDuplicates = async (request, reply) => {
  const admin = await ensureSuperAdmin(request, reply);
  if (!admin) return;

  try {
    const result = await mergeDuplicatePeople(prisma, {
      keepPersonId: request.body?.keepPersonId,
      mergePersonId: request.body?.mergePersonId,
      reviewedById: admin.userId,
    });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "person_duplicate_merge",
      Champ: "person_duplicate_merge",
      AncienneValeur: String(result.mergedPersonId),
      NouvelleValeur: String(result.keptPersonId),
      Meta: result,
    });
    return reply.send({ ok: true, ...result });
  } catch (error) {
    if (error instanceof PersonDuplicateError) {
      return reply.code(error.statusCode).send({ error: error.message, code: error.code });
    }
    console.error("mergePersonDuplicates:", error);
    return reply.code(500).send({ error: "Impossible de fusionner ces personnes." });
  }
};

export const updatePersonne = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;

  const personId = parsePersonId(request.params?.id);
  if (!personId) return reply.code(400).send({ error: "PersonneID invalide." });

  const Nom = typeof request.body?.Nom === "string" ? request.body.Nom.trim() : "";
  const Prenom = typeof request.body?.Prenom === "string" ? request.body.Prenom.trim() : "";
  const Surnom = typeof request.body?.Surnom === "string" ? request.body.Surnom.trim() || null : null;
  if (!Nom || !Prenom) return reply.code(400).send({ error: "Nom et prénom sont requis." });

  try {
    const existing = await prisma.personne.findFirst({
      where: { PersonneID: personId, EtatID: ACTIVE_ETAT_ID },
      select: { PersonneID: true, Nom: true, Prenom: true, Surnom: true },
    });
    if (!existing) return reply.code(404).send({ error: "Personne introuvable." });

    const updated = await prisma.personne.update({
      where: { PersonneID: personId },
      data: { Nom, Prenom, Surnom },
    });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "person_update",
      Champ: "person_identity",
      AncienneValeur: JSON.stringify({ Nom: existing.Nom, Prenom: existing.Prenom, Surnom: existing.Surnom }),
      NouvelleValeur: JSON.stringify({ Nom, Prenom, Surnom }),
      Meta: { personId },
    });
    return reply.send(updated);
  } catch (error) {
    console.error("updatePersonne:", error);
    return reply.code(500).send({ error: "Impossible de mettre à jour la personne." });
  }
};

export const deletePersonnePhoto = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;

  const personId = parsePersonId(request.params?.id);
  if (!personId) return reply.code(400).send({ error: "PersonneID invalide." });

  try {
    const person = await prisma.personne.findFirst({
      where: { PersonneID: personId, EtatID: ACTIVE_ETAT_ID },
      select: { CheminImage: true, ImageStatut: true },
    });
    if (!person) return reply.code(404).send({ error: "Personne introuvable." });

    if (person.ImageStatut === "CUSTOM") removeStoredPersonImage(person.CheminImage);
    const updated = await prisma.personne.update({
      where: { PersonneID: personId },
      data: { CheminImage: null, ImageStatut: "DEFAULT" },
      select: { CheminImage: true, ImageStatut: true },
    });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "person_photo_delete",
      Champ: "person_photo",
      AncienneValeur: person.CheminImage,
      NouvelleValeur: null,
      Meta: { personId },
    });
    return reply.send(updated);
  } catch (error) {
    console.error("deletePersonnePhoto:", error);
    return reply.code(500).send({ error: "Impossible de retirer la photo de la personne." });
  }
};

export const softDeletePersonne = async (request, reply) => {
  const admin = await ensureAdmin(request, reply);
  if (!admin) return;

  const personId = parsePersonId(request.params?.id);
  if (!personId) return reply.code(400).send({ error: "PersonneID invalide." });

  try {
    const result = await prisma.personne.updateMany({
      where: { PersonneID: personId, EtatID: ACTIVE_ETAT_ID },
      data: { EtatID: DELETED_ETAT_ID },
    });
    if (!result.count) return reply.code(404).send({ error: "Personne introuvable." });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "person_soft_delete",
      Champ: "person_state",
      AncienneValeur: String(ACTIVE_ETAT_ID),
      NouvelleValeur: String(DELETED_ETAT_ID),
      Meta: { personId },
    });
    return reply.send({ ok: true });
  } catch (error) {
    console.error("softDeletePersonne:", error);
    return reply.code(500).send({ error: "Impossible de placer la personne dans la corbeille." });
  }
};

export const restorePersonne = async (request, reply) => {
  const admin = await ensureSuperAdmin(request, reply);
  if (!admin) return;

  const personId = parsePersonId(request.params?.id);
  if (!personId) return reply.code(400).send({ error: "PersonneID invalide." });

  try {
    const mergedReview = await prisma.personDuplicateReview.findFirst({
      where: { MergedPersonneID: personId, Decision: "MERGED" },
      select: { PersonDuplicateReviewID: true },
    });
    if (mergedReview) {
      return reply.code(409).send({
        error: "Cette personne a été fusionnée et ne peut pas être restaurée.",
        code: "MERGED_PERSON_CANNOT_BE_RESTORED",
      });
    }
    const result = await prisma.personne.updateMany({
      where: { PersonneID: personId, EtatID: DELETED_ETAT_ID },
      data: { EtatID: ACTIVE_ETAT_ID },
    });
    if (!result.count) return reply.code(404).send({ error: "Personne introuvable dans la corbeille." });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "person_restore",
      Champ: "person_state",
      AncienneValeur: String(DELETED_ETAT_ID),
      NouvelleValeur: String(ACTIVE_ETAT_ID),
      Meta: { personId },
    });
    return reply.send({ ok: true });
  } catch (error) {
    console.error("restorePersonne:", error);
    return reply.code(500).send({ error: "Impossible de restaurer la personne." });
  }
};

export const permanentlyDeletePersonne = async (request, reply) => {
  const admin = await ensureSuperAdmin(request, reply);
  if (!admin) return;

  const personId = parsePersonId(request.params?.id);
  if (!personId) return reply.code(400).send({ error: "PersonneID invalide." });

  try {
    const person = await prisma.personne.findFirst({
      where: { PersonneID: personId, EtatID: DELETED_ETAT_ID },
      select: { PersonneID: true },
    });
    if (!person) return reply.code(404).send({ error: "Personne introuvable dans la corbeille." });

    await prisma.$transaction([
      prisma.videoPersonne.deleteMany({ where: { PersonneID: personId } }),
      prisma.seriesPersonne.deleteMany({ where: { PersonneID: personId } }),
      prisma.personne.delete({ where: { PersonneID: personId } }),
    ]);
    removePersonDirectory(personId);
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "person_delete",
      Champ: "person",
      AncienneValeur: String(personId),
      Meta: { personId, permanent: true },
    });
    return reply.send({ ok: true });
  } catch (error) {
    console.error("permanentlyDeletePersonne:", error);
    return reply.code(500).send({ error: "Impossible de supprimer définitivement la personne." });
  }
};

/**
 * POST /api/people/:id/link
 * body: { type: "video"|"series", contenuId: number, EstActeur?:bool, EstRealisateur?:bool }
 */
export const linkPersonne = async (request, reply) => {
  try {
    const admin = await ensureAdmin(request, reply);
    if (!admin) return;

    const { id } = request.params;
    const { type, contenuId, EstActeur = false, EstRealisateur = false } = request.body || {};

    if (!["video", "series"].includes(String(type))) {
      return reply.code(400).send({ error: "type invalide (video|series)." });
    }
    if (!contenuId) {
      return reply.code(400).send({ error: "contenuId requis." });
    }
    if (!EstActeur && !EstRealisateur) {
      return reply.code(400).send({ error: "Au moins un rôle (EstActeur/EstRealisateur) doit être vrai." });
    }

    const PersonneID = parseInt(id, 10);
    const person = await prisma.personne.findFirst({
      where: { PersonneID, EtatID: ACTIVE_ETAT_ID },
      select: { PersonneID: true },
    });
    if (!person) return reply.code(404).send({ error: "Personne introuvable." });

    if (type === "video") {
      if (!(await ensureVideoIsNotTransferBlocked(contenuId, reply))) return;

      // upsert: s'il existe, maj des flags, sinon création
      const existing = await prisma.videoPersonne.findUnique({
        where: { VideoID_PersonneID: { VideoID: contenuId, PersonneID } }
      }).catch(() => null);

      const res = existing
        ? await prisma.videoPersonne.update({
          where: { VideoID_PersonneID: { VideoID: contenuId, PersonneID } },
          data: {
            EstActeur: !!(EstActeur || existing.EstActeur),
            EstRealisateur: !!(EstRealisateur || existing.EstRealisateur),
          }
        })
        : await prisma.videoPersonne.create({
          data: { VideoID: contenuId, PersonneID, EstActeur, EstRealisateur }
        });

      return reply.send(res);
    } else {
      const existing = await prisma.seriesPersonne.findUnique({
        where: { SeriesID_PersonneID: { SeriesID: contenuId, PersonneID } }
      }).catch(() => null);

      const res = existing
        ? await prisma.seriesPersonne.update({
          where: { SeriesID_PersonneID: { SeriesID: contenuId, PersonneID } },
          data: {
            EstActeur: !!(EstActeur || existing.EstActeur),
            EstRealisateur: !!(EstRealisateur || existing.EstRealisateur),
          }
        })
        : await prisma.seriesPersonne.create({
          data: { SeriesID: contenuId, PersonneID, EstActeur, EstRealisateur }
        });

      return reply.send(res);
    }
  } catch (e) {
    console.error("linkPersonne:", e);
    return reply.code(500).send({ error: "Erreur lors du rattachement." });
  }
};

/**
 * DELETE /api/people/:id/unlink
 * body: { type, contenuId, role?: "actor"|"director"|"both" }
 * - role absent ou "both" => on supprime totalement le lien
 * - role précis => on met le flag à false; si plus aucun flag true, on supprime le lien
 */
export const unlinkPersonne = async (request, reply) => {
  try {
    const admin = await ensureAdmin(request, reply);
    if (!admin) return;

    const { id } = request.params; // PersonneID
    const { type, contenuId, EstActeur, EstRealisateur } = request.body || {};

    if (!id || !type || !contenuId) {
      return reply.code(400).send({ error: "Paramètres manquants." });
    }
    if (!EstActeur && !EstRealisateur) {
      return reply.code(400).send({ error: "Aucun rôle à retirer." });
    }

    const PersonneID = Number(id);
    const cibleId = Number(contenuId);

    if (type === "video") {
      if (!(await ensureVideoIsNotTransferBlocked(cibleId, reply))) return;

      const link = await prisma.videoPersonne.findFirst({
        where: { PersonneID, VideoID: cibleId },
      });
      if (!link) return reply.code(404).send({ error: "Lien (vidéo) introuvable." });

      const dataUpdate = {};
      if (EstActeur) dataUpdate.EstActeur = false;
      if (EstRealisateur) dataUpdate.EstRealisateur = false;

      const updated = await prisma.videoPersonne.update({
        where: { VideoPersonneID: link.VideoPersonneID },
        data: dataUpdate,
        select: { VideoPersonneID: true, EstActeur: true, EstRealisateur: true },
      });

      if (!updated.EstActeur && !updated.EstRealisateur) {
        await prisma.videoPersonne.delete({ where: { VideoPersonneID: updated.VideoPersonneID } });
        return reply.send({ ok: true, deleted: true });
      }
      return reply.send({ ok: true, deleted: false, link: updated });
    }

    if (type === "series") {
      const link = await prisma.seriesPersonne.findFirst({
        where: { PersonneID, SeriesID: cibleId },
      });
      if (!link) return reply.code(404).send({ error: "Lien (série) introuvable." });

      const dataUpdate = {};
      if (EstActeur) dataUpdate.EstActeur = false;
      if (EstRealisateur) dataUpdate.EstRealisateur = false;

      const updated = await prisma.seriesPersonne.update({
        where: { SeriesPersonneID: link.SeriesPersonneID },
        data: dataUpdate,
        select: { SeriesPersonneID: true, EstActeur: true, EstRealisateur: true },
      });

      if (!updated.EstActeur && !updated.EstRealisateur) {
        await prisma.seriesPersonne.delete({ where: { SeriesPersonneID: updated.SeriesPersonneID } });
        return reply.send({ ok: true, deleted: true });
      }
      return reply.send({ ok: true, deleted: false, link: updated });
    }

    return reply.code(400).send({ error: "Type invalide." });
  } catch (e) {
    console.error("unlinkPersonne error:", e);
    return reply.code(500).send({ error: "Erreur interne." });
  }
};


/**
 * GET /api/videos/:id/people
 * GET /api/series/:id/people
 * (facultatif aujourd’hui, utile pour la page dédiée plus tard)
 */
export const getPeopleForVideo = async (request, reply) => {
  const { id } = request.params;
  const items = await prisma.videoPersonne.findMany({
    where: {
      VideoID: parseInt(id, 10),
      Video: { EtatID: ETAT.ACTIVE },
      Personne: { EtatID: ACTIVE_ETAT_ID },
    },
    include: { Personne: true },
    orderBy: { VideoPersonneID: "asc" }
  });
  return reply.send(items);
};

export const getPeopleForSeries = async (request, reply) => {
  const { id } = request.params;
  const items = await prisma.seriesPersonne.findMany({
    where: { SeriesID: parseInt(id, 10), Personne: { EtatID: ACTIVE_ETAT_ID } },
    include: { Personne: true },
    orderBy: { SeriesPersonneID: "asc" }
  });
  return reply.send(items);
};

export const getPersonDetails = async (request, reply) => {
  try {
    const PersonneID = parseInt(request.params.id, 10);

    // 1) Personne
    const personne = await prisma.personne.findFirst({
      where: { PersonneID, EtatID: ACTIVE_ETAT_ID },
      select: {
        PersonneID: true,
        Nom: true,
        Prenom: true,
        Surnom: true,
        CheminImage: true,
        CreateDate: true,
      },
    });
    if (!personne) return reply.code(404).send({ error: "Personne introuvable." });

    // 2) Liens vidéos (acteur / réalisateur)
    const vlinks = await prisma.videoPersonne.findMany({
      where: {
        PersonneID,
        Video: { EtatID: ETAT.ACTIVE },
      },
      include: {
        Video: {
          select: {
            VideoID: true,
            Titre: true,
            CheminImage: true,
            Resumer: true,
            VideoGenres: {
              include: {
                Genre: {
                  select: {
                    Nom: true
                  },
                },
              },
            },
          },
        },
      }
    });

    const VideosActeur = vlinks
      .filter(l => l.EstActeur && l.Video)
      .map(l => ({
        VideoID: l.Video.VideoID,
        Titre: l.Video.Titre,
        Resumer: l.Video.Resumer,
        CheminImage: l.Video.CheminImage,
        Genres: l.Video.VideoGenres.map(vg => vg.Genre.Nom),
      }));

    const VideosRealisateur = vlinks
      .filter(l => l.EstRealisateur && l.Video)
      .map(l => ({
        VideoID: l.Video.VideoID,
        Titre: l.Video.Titre,
        Resumer: l.Video.Resumer,
        CheminImage: l.Video.CheminImage,
        Genres: l.Video.VideoGenres.map(vg => vg.Genre.Nom),
      }));

    // 3) Liens séries (acteur / réalisateur)
    const slinks = await prisma.seriesPersonne.findMany({
      where: { PersonneID },
      include: {
        Series: {
          select: {
            SeriesID: true,
            Titre: true,
            Resumer: true,
            CheminImage: true,
            SeriesGenres: {
              include: {
                Genre: {
                  select: {
                    Nom: true
                  },
                },
              },
            },
          },
        },
      },
    });

    // 3bis) On veut le FirstVideoID pour chaque série (pour lier vers /lecture/:id).
    // Approche pragmatique : requête par série (simple et lisible).
    // Si tu veux optimiser, on pourra faire un batch par IN plus tard.
    const seriesIds = [...new Set(slinks.map(l => l.SeriesID).filter(Boolean))];
    const firstIdsBySeries = {};
    for (const sid of seriesIds) {
      // ⚠️ Pas d'EpisodeNumero dans ton schéma → on trie par n° de saison puis par VideoID
      const first = await prisma.video.findFirst({
        where: {
          EtatID: ETAT.ACTIVE,
          Saison: { SeriesID: sid },
        },
        orderBy: [
          { Saison: { Numero: "asc" } }, // n° de saison le plus petit
          { VideoID: "asc" },            // puis première vidéo trouvée
        ],
        select: { VideoID: true },
      });
      firstIdsBySeries[sid] = first?.VideoID || null;
    }

    const SeriesActeur = slinks
      .filter(l => l.EstActeur && l.Series)
      .map(l => ({
        SeriesID: l.Series.SeriesID,
        Titre: l.Series.Titre,
        Resumer: l.Series.Resumer,
        CheminImage: l.Series.CheminImage,
        FirstVideoID: firstIdsBySeries[l.Series.SeriesID] || null,
        Genres: l.Series.SeriesGenres.map(vg => vg.Genre.Nom),
      }));

    const SeriesRealisateur = slinks
      .filter(l => l.EstRealisateur && l.Series)
      .map(l => ({
        SeriesID: l.Series.SeriesID,
        Titre: l.Series.Titre,
        Resumer: l.Series.Resumer,
        CheminImage: l.Series.CheminImage,
        FirstVideoID: firstIdsBySeries[l.Series.SeriesID] || null,
        Genres: l.Series.SeriesGenres.map(vg => vg.Genre.Nom),
      }));

    return reply.send({
      personne,
      videos: {
        Acteur: VideosActeur,
        Realisateur: VideosRealisateur,
      },
      series: {
        Acteur: SeriesActeur,
        Realisateur: SeriesRealisateur,
      },
    });
  } catch (e) {
    console.error("getPersonDetails:", e);
    return reply.code(500).send({ error: "Erreur lors de la récupération de la personne." });
  }
};
