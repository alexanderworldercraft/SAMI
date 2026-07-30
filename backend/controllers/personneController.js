// backend/controllers/personneController.js
import { prisma } from "../services/db.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ensureAdmin } from "../services/authz.js";
import { ETAT, MULTIPART_LIMITS } from "../constants.js";
import { isMultipartFileTooLargeError, sendMultipartFileTooLarge } from "../utils/multipartErrors.js";

// Util
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.join(__dirname, "..");
const peopleRootAbs = path.join(BACKEND_ROOT, "uploads", "people");
const peopleTmpAbs = path.join(BACKEND_ROOT, "uploads", "tmp", "people");
if (!fs.existsSync(peopleRootAbs)) fs.mkdirSync(peopleRootAbs, { recursive: true });
if (!fs.existsSync(peopleTmpAbs)) fs.mkdirSync(peopleTmpAbs, { recursive: true });

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

    const { id } = request.params;
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

    const personId = parseInt(id, 10);
    const personDirAbs = path.join(peopleRootAbs, String(personId));
    if (!fs.existsSync(personDirAbs)) fs.mkdirSync(personDirAbs, { recursive: true });
    const filename = `${Date.now()}${tempExt}`;
    const finalAbs = path.join(personDirAbs, filename);
    fs.renameSync(tempPath, finalAbs);
    savedPath = path.join("uploads", "people", String(personId), filename);

    const old = await prisma.personne.findUnique({
      where: { PersonneID: personId },
      select: { CheminImage: true, ImageStatut: true },
    });

    // supprime ancien fichier custom
    if (old?.CheminImage && old.ImageStatut === "CUSTOM") {
      const oldAbs = path.join(BACKEND_ROOT, old.CheminImage);
      if (fs.existsSync(oldAbs)) {
        try { fs.unlinkSync(oldAbs); } catch (_) { }
      }
    }

    const updated = await prisma.personne.update({
      where: { PersonneID: personId },
      data: { CheminImage: savedPath, ImageStatut: "CUSTOM" },
      select: { CheminImage: true },
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
    const where = q
      ? {
        OR: [
          { Nom: { contains: q } },
          { Prenom: { contains: q } },
          { Surnom: { contains: q } }
        ]
      }
      : {};

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
    },
    include: { Personne: true },
    orderBy: { VideoPersonneID: "asc" }
  });
  return reply.send(items);
};

export const getPeopleForSeries = async (request, reply) => {
  const { id } = request.params;
  const items = await prisma.seriesPersonne.findMany({
    where: { SeriesID: parseInt(id, 10) },
    include: { Personne: true },
    orderBy: { SeriesPersonneID: "asc" }
  });
  return reply.send(items);
};

export const getPersonDetails = async (request, reply) => {
  try {
    const PersonneID = parseInt(request.params.id, 10);

    // 1) Personne
    const personne = await prisma.personne.findUnique({
      where: { PersonneID },
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
