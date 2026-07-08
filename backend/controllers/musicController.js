import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { prisma } from "../services/db.js";
import { createLog } from "./logController.js";
import { ensureAdmin as ensureSharedAdmin, ensureSuperAdmin as ensureSharedSuperAdmin } from "../services/authz.js";
import { ETAT } from "../constants.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.join(__dirname, "..");
const UPLOADS_ROOT = path.join(BACKEND_ROOT, "uploads");
const MUSIC_ROOT = path.join(UPLOADS_ROOT, "musique");
const ALBUM_ROOT = path.join(UPLOADS_ROOT, "album");
const ACTIVE_ETAT_ID = ETAT.ACTIVE;
const DELETED_ETAT_ID = ETAT.DELETED;

const ensureAdmin = async (request, reply) => {
  const admin = await ensureSharedAdmin(request, reply);
  return admin?.userId || null;
};

const ensureSuperAdmin = async (request, reply) => {
  const admin = await ensureSharedSuperAdmin(request, reply);
  return admin?.userId || null;
};

const parseId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const parseBoolean = (value) => {
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
};

const uniqueIds = (values) => [
  ...new Set((Array.isArray(values) ? values : []).map((value) => parseId(value)).filter(Boolean)),
];

const parseJsonIds = (value) => {
  if (Array.isArray(value)) return uniqueIds(value);
  if (!value) return [];
  try {
    return uniqueIds(JSON.parse(value));
  } catch {
    return [];
  }
};

const safeExt = (filename, fallback = "") => {
  const ext = path.extname(filename || "").toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext || fallback;
};

const savePart = async (part, targetPath) => {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(targetPath);
    part.file.pipe(stream).on("finish", resolve).on("error", reject);
  });
};

const readMultipart = async (request) => {
  const fields = {};
  const files = {};
  const tmpDir = path.join(MUSIC_ROOT, "tmp", `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);

  for await (const part of request.parts()) {
    if (part.type === "file") {
      const tmpPath = path.join(
        tmpDir,
        `${part.fieldname}_${Date.now()}${safeExt(part.filename, ".upload")}`
      );
      await savePart(part, tmpPath);
      files[part.fieldname] = {
        filename: part.filename || "upload",
        mimetype: part.mimetype || "",
        tmpPath,
      };
    } else {
      fields[part.fieldname] = part.value;
    }
  }

  return { fields, files };
};

const writeBufferedFile = async (file, targetPath) => {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  if (file.tmpPath) {
    await fs.promises.rename(file.tmpPath, targetPath);
    return;
  }
  if (file.buffer) {
    await fs.promises.writeFile(targetPath, file.buffer);
  }
};

const removeStoredPath = (relativePath, { recursive = false } = {}) => {
  if (!relativePath || relativePath.includes("default")) return;
  const normalizedTarget = path.resolve(BACKEND_ROOT, relativePath.replace(/^[/\\]+/, ""));
  const normalizedRoot = path.resolve(UPLOADS_ROOT);
  if (!normalizedTarget.startsWith(normalizedRoot) || !fs.existsSync(normalizedTarget)) return;
  fs.rmSync(normalizedTarget, { recursive, force: true });
};

const logMusicAction = ({
  request,
  userId,
  action,
  musiqueId = null,
  albumId = null,
  champ,
  ancienneValeur = null,
  nouvelleValeur = null,
  meta = {},
  dedupeMs = 0,
}) =>
  createLog({
    request,
    UtilisateurID: Number(userId),
    ActionNom: action,
    MusiqueID: musiqueId,
    AlbumID: albumId,
    Champ: champ,
    AncienneValeur: ancienneValeur,
    NouvelleValeur: nouvelleValeur,
    Meta: meta,
    DedupeMs: dedupeMs,
  });

const musiqueSelect = {
  MusiqueID: true,
  Titre: true,
  CheminAcces: true,
  CheminImage: true,
  Premium: true,
  EtatID: true,
  UtilisateurID: true,
  CreateDate: true,
  MusiqueGenreMusiques: { include: { MusiqueGenre: true } },
  AlbumMusiques: { include: { Album: true } },
};

const albumSelect = {
  AlbumID: true,
  Titre: true,
  CheminImage: true,
  EtatID: true,
  UtilisateurID: true,
  CreateDate: true,
  MusiqueGenreAlbums: { include: { MusiqueGenre: true } },
  AlbumMusiques: { include: { Musique: true } },
};

const formatMusique = (musique) => ({
  ...musique,
  Genres: (musique.MusiqueGenreMusiques || []).map((link) => link.MusiqueGenre),
  Albums: (musique.AlbumMusiques || []).map((link) => link.Album),
  MusiqueGenreMusiques: undefined,
  AlbumMusiques: undefined,
});

const formatAlbum = (album) => ({
  ...album,
  Genres: (album.MusiqueGenreAlbums || []).map((link) => link.MusiqueGenre),
  Musiques: (album.AlbumMusiques || []).map((link) => link.Musique),
  MusiqueGenreAlbums: undefined,
  AlbumMusiques: undefined,
});

export const getMusiques = async (request, reply) => {
  try {
    const musiques = await prisma.musique.findMany({
      where: { EtatID: ACTIVE_ETAT_ID },
      orderBy: { Titre: "asc" },
      select: musiqueSelect,
    });
    return reply.send(musiques.map(formatMusique));
  } catch (error) {
    console.error("Erreur lors de la récupération des musiques :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des musiques." });
  }
};

export const getAdminMusiques = async (request, reply) => {
  if (!(await ensureAdmin(request, reply))) return;
  return getMusiques(request, reply);
};

export const getDeletedMusiques = async (request, reply) => {
  if (!(await ensureSuperAdmin(request, reply))) return;
  try {
    const musiques = await prisma.musique.findMany({
      where: { EtatID: DELETED_ETAT_ID },
      orderBy: { MusiqueID: "desc" },
      select: musiqueSelect,
    });
    return reply.send(musiques.map(formatMusique));
  } catch (error) {
    console.error("Erreur lors de la récupération des musiques supprimées :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des musiques supprimées." });
  }
};

export const getAlbums = async (request, reply) => {
  try {
    const albums = await prisma.album.findMany({
      where: { EtatID: ACTIVE_ETAT_ID },
      orderBy: { Titre: "asc" },
      select: albumSelect,
    });
    return reply.send(albums.map(formatAlbum));
  } catch (error) {
    console.error("Erreur lors de la récupération des albums :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des albums." });
  }
};

export const getAdminAlbums = async (request, reply) => {
  if (!(await ensureAdmin(request, reply))) return;
  return getAlbums(request, reply);
};

export const getDeletedAlbums = async (request, reply) => {
  if (!(await ensureSuperAdmin(request, reply))) return;
  try {
    const albums = await prisma.album.findMany({
      where: { EtatID: DELETED_ETAT_ID },
      orderBy: { AlbumID: "desc" },
      select: albumSelect,
    });
    return reply.send(albums.map(formatAlbum));
  } catch (error) {
    console.error("Erreur lors de la récupération des albums supprimés :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des albums supprimés." });
  }
};

export const getMusicGenres = async (request, reply) => {
  try {
    const genres = await prisma.musiqueGenre.findMany({ orderBy: { Nom: "asc" } });
    return reply.send(genres);
  } catch (error) {
    console.error("Erreur lors de la récupération des genres musicaux :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération des genres musicaux." });
  }
};

export const createMusicGenre = async (request, reply) => {
  const userId = await ensureAdmin(request, reply);
  if (!userId) return;

  const Nom = String(request.body?.Nom || "").trim();
  if (!Nom) return reply.status(400).send({ error: "Le nom du genre est obligatoire." });

  try {
    const genre = await prisma.musiqueGenre.create({ data: { Nom, UtilisateurID: userId } });
    await logMusicAction({
      request,
      userId,
      action: "musique_genre_create",
      champ: "MusiqueGenre",
      nouvelleValeur: Nom,
      meta: { MusiqueGenreID: genre.MusiqueGenreID, Nom },
    });
    return reply.status(201).send(genre);
  } catch (error) {
    console.error("Erreur lors de l'ajout du genre musical :", error);
    return reply.status(500).send({ error: "Erreur lors de l'ajout du genre musical." });
  }
};

export const updateMusicGenre = async (request, reply) => {
  const userId = await ensureAdmin(request, reply);
  if (!userId) return;
  const MusiqueGenreID = parseId(request.params.id);
  const Nom = String(request.body?.Nom || "").trim();
  if (!MusiqueGenreID) return reply.status(400).send({ error: "MusiqueGenreID invalide." });
  if (!Nom) return reply.status(400).send({ error: "Le nom du genre est obligatoire." });

  try {
    const before = await prisma.musiqueGenre.findUnique({ where: { MusiqueGenreID } });
    if (!before) return reply.status(404).send({ error: "Genre musical introuvable." });
    const genre = await prisma.musiqueGenre.update({ where: { MusiqueGenreID }, data: { Nom } });
    await logMusicAction({
      request,
      userId,
      action: "musique_genre_update",
      champ: "Nom",
      ancienneValeur: before.Nom,
      nouvelleValeur: genre.Nom,
      meta: { MusiqueGenreID, Nom: genre.Nom },
      dedupeMs: 2000,
    });
    return reply.send(genre);
  } catch (error) {
    if (error.code === "P2025") return reply.status(404).send({ error: "Genre musical introuvable." });
    console.error("Erreur lors de la mise à jour du genre musical :", error);
    return reply.status(500).send({ error: "Erreur lors de la mise à jour du genre musical." });
  }
};

export const deleteMusicGenre = async (request, reply) => {
  const userId = await ensureAdmin(request, reply);
  if (!userId) return;
  const MusiqueGenreID = parseId(request.params.id);
  if (!MusiqueGenreID) return reply.status(400).send({ error: "MusiqueGenreID invalide." });

  try {
    const before = await prisma.musiqueGenre.findUnique({ where: { MusiqueGenreID } });
    if (!before) return reply.status(404).send({ error: "Genre musical introuvable." });
    await prisma.musiqueGenre.delete({ where: { MusiqueGenreID } });
    await logMusicAction({
      request,
      userId,
      action: "musique_genre_delete",
      champ: "MusiqueGenre",
      ancienneValeur: before.Nom,
      meta: { MusiqueGenreID, Nom: before.Nom },
    });
    return reply.send({ ok: true });
  } catch (error) {
    if (error.code === "P2025") return reply.status(404).send({ error: "Genre musical introuvable." });
    console.error("Erreur lors de la suppression du genre musical :", error);
    return reply.status(500).send({ error: "Erreur lors de la suppression du genre musical." });
  }
};

export const createMusique = async (request, reply) => {
  const userId = await ensureAdmin(request, reply);
  if (!userId) return;

  try {
    const { fields, files } = request.isMultipart() ? await readMultipart(request) : { fields: request.body || {}, files: {} };
    const Titre = String(fields.Titre || fields.titre || "").trim();
    const rawPath = String(fields.CheminAcces || fields.cheminAcces || "").trim();
    const GenreIDs = parseJsonIds(fields.GenreIDs || fields.genres);
    const AlbumIDs = parseJsonIds(fields.AlbumIDs || fields.albums);
    const audio = files.audio || files.file;
    const image = files.image;

    if (!Titre) return reply.status(400).send({ error: "Le titre est obligatoire." });
    if (!audio && !rawPath) return reply.status(400).send({ error: "Le fichier audio ou le chemin d'accès est obligatoire." });

    const musique = await prisma.musique.create({
      data: {
        Titre,
        CheminAcces: rawPath || "uploads/musique/pending",
        Premium: parseBoolean(fields.Premium || fields.premium),
        EtatID: ACTIVE_ETAT_ID,
        UtilisateurID: userId,
      },
    });

    const updateData = {};
    const musicDir = path.join(MUSIC_ROOT, String(musique.MusiqueID));

    if (audio) {
      const ext = safeExt(audio.filename, ".mp3");
      const audioPath = path.join(musicDir, "musique", `musique_${musique.MusiqueID}${ext}`);
      await writeBufferedFile(audio, audioPath);
      updateData.CheminAcces = path.join("uploads", "musique", String(musique.MusiqueID), "musique", path.basename(audioPath));
    }

    if (image) {
      const ext = safeExt(image.filename, ".jpg");
      const imagePath = path.join(musicDir, "affiche", `image_${Date.now()}${ext}`);
      await writeBufferedFile(image, imagePath);
      updateData.CheminImage = path.join("uploads", "musique", String(musique.MusiqueID), "affiche", path.basename(imagePath));
    }

    await prisma.$transaction([
      Object.keys(updateData).length
        ? prisma.musique.update({ where: { MusiqueID: musique.MusiqueID }, data: updateData })
        : prisma.musique.findUnique({ where: { MusiqueID: musique.MusiqueID } }),
      prisma.musiqueGenreMusique.createMany({
        data: GenreIDs.map((MusiqueGenreID) => ({ MusiqueID: musique.MusiqueID, MusiqueGenreID, UtilisateurID: userId })),
        skipDuplicates: true,
      }),
      prisma.albumMusique.createMany({
        data: AlbumIDs.map((AlbumID) => ({ AlbumID, MusiqueID: musique.MusiqueID, UtilisateurID: userId })),
        skipDuplicates: true,
      }),
    ]);

    const created = await prisma.musique.findUnique({ where: { MusiqueID: musique.MusiqueID }, select: musiqueSelect });
    await logMusicAction({
      request,
      userId,
      action: "musique_create",
      musiqueId: musique.MusiqueID,
      champ: "Musique",
      nouvelleValeur: created?.Titre ?? Titre,
      meta: {
        Titre: created?.Titre ?? Titre,
        CheminAcces: created?.CheminAcces ?? null,
        CheminImage: created?.CheminImage ?? null,
        GenreIDs,
        AlbumIDs,
      },
    });
    return reply.status(201).send(formatMusique(created));
  } catch (error) {
    console.error("Erreur lors de l'ajout de la musique :", error);
    return reply.status(500).send({ error: "Erreur lors de l'ajout de la musique." });
  }
};

export const updateMusique = async (request, reply) => {
  const userId = await ensureAdmin(request, reply);
  if (!userId) return;
  const MusiqueID = parseId(request.params.id);
  if (!MusiqueID) return reply.status(400).send({ error: "MusiqueID invalide." });

  try {
    const { fields, files } = request.isMultipart() ? await readMultipart(request) : { fields: request.body || {}, files: {} };
    const data = {};
    if (fields.Titre !== undefined) data.Titre = String(fields.Titre).trim();
    if (fields.CheminAcces !== undefined) data.CheminAcces = String(fields.CheminAcces).trim();
    if (fields.Premium !== undefined) data.Premium = parseBoolean(fields.Premium);
    if (!data.Titre && fields.Titre !== undefined) return reply.status(400).send({ error: "Le titre est obligatoire." });

    const existing = await prisma.musique.findUnique({ where: { MusiqueID } });
    if (!existing) return reply.status(404).send({ error: "Musique introuvable." });

    if (files.audio || files.file) {
      const audio = files.audio || files.file;
      const ext = safeExt(audio.filename, ".mp3");
      const audioPath = path.join(MUSIC_ROOT, String(MusiqueID), "musique", `musique_${MusiqueID}${ext}`);
      await writeBufferedFile(audio, audioPath);
      removeStoredPath(existing.CheminAcces);
      data.CheminAcces = path.join("uploads", "musique", String(MusiqueID), "musique", path.basename(audioPath));
    }

    if (files.image) {
      const ext = safeExt(files.image.filename, ".jpg");
      const imagePath = path.join(MUSIC_ROOT, String(MusiqueID), "affiche", `image_${Date.now()}${ext}`);
      await writeBufferedFile(files.image, imagePath);
      removeStoredPath(existing.CheminImage);
      data.CheminImage = path.join("uploads", "musique", String(MusiqueID), "affiche", path.basename(imagePath));
    }

    const GenreIDs = fields.GenreIDs !== undefined ? parseJsonIds(fields.GenreIDs) : null;
    const AlbumIDs = fields.AlbumIDs !== undefined ? parseJsonIds(fields.AlbumIDs) : null;

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) await tx.musique.update({ where: { MusiqueID }, data });
      if (GenreIDs) {
        await tx.musiqueGenreMusique.deleteMany({ where: { MusiqueID } });
        if (GenreIDs.length) {
          await tx.musiqueGenreMusique.createMany({
            data: GenreIDs.map((MusiqueGenreID) => ({ MusiqueID, MusiqueGenreID, UtilisateurID: userId })),
            skipDuplicates: true,
          });
        }
      }
      if (AlbumIDs) {
        await tx.albumMusique.deleteMany({ where: { MusiqueID } });
        if (AlbumIDs.length) {
          await tx.albumMusique.createMany({
            data: AlbumIDs.map((AlbumID) => ({ AlbumID, MusiqueID, UtilisateurID: userId })),
            skipDuplicates: true,
          });
        }
      }
    });

    const updated = await prisma.musique.findUnique({ where: { MusiqueID }, select: musiqueSelect });
    await logMusicAction({
      request,
      userId,
      action: "musique_update",
      musiqueId: MusiqueID,
      champ: "Musique",
      ancienneValeur: JSON.stringify({
        Titre: existing.Titre,
        CheminAcces: existing.CheminAcces,
        CheminImage: existing.CheminImage,
        Premium: existing.Premium,
      }),
      nouvelleValeur: JSON.stringify({
        Titre: updated.Titre,
        CheminAcces: updated.CheminAcces,
        CheminImage: updated.CheminImage,
        Premium: updated.Premium,
      }),
      meta: {
        changedFields: Object.keys(data),
        GenreIDs,
        AlbumIDs,
      },
      dedupeMs: 2000,
    });
    return reply.send(formatMusique(updated));
  } catch (error) {
    console.error("Erreur lors de la mise à jour de la musique :", error);
    return reply.status(500).send({ error: "Erreur lors de la mise à jour de la musique." });
  }
};

export const createAlbum = async (request, reply) => {
  const userId = await ensureAdmin(request, reply);
  if (!userId) return;

  try {
    const { fields, files } = request.isMultipart() ? await readMultipart(request) : { fields: request.body || {}, files: {} };
    const Titre = String(fields.Titre || fields.titre || "").trim();
    const GenreIDs = parseJsonIds(fields.GenreIDs || fields.genres);
    const MusiqueIDs = parseJsonIds(fields.MusiqueIDs || fields.musiques);
    if (!Titre) return reply.status(400).send({ error: "Le titre est obligatoire." });

    const album = await prisma.album.create({
      data: { Titre, EtatID: ACTIVE_ETAT_ID, UtilisateurID: userId },
    });

    const data = {};
    if (files.image) {
      const ext = safeExt(files.image.filename, ".jpg");
      const imagePath = path.join(ALBUM_ROOT, String(album.AlbumID), "affiche", `image_${Date.now()}${ext}`);
      await writeBufferedFile(files.image, imagePath);
      data.CheminImage = path.join("uploads", "album", String(album.AlbumID), "affiche", path.basename(imagePath));
    }

    await prisma.$transaction([
      Object.keys(data).length ? prisma.album.update({ where: { AlbumID: album.AlbumID }, data }) : prisma.album.findUnique({ where: { AlbumID: album.AlbumID } }),
      prisma.musiqueGenreAlbum.createMany({
        data: GenreIDs.map((MusiqueGenreID) => ({ AlbumID: album.AlbumID, MusiqueGenreID, UtilisateurID: userId })),
        skipDuplicates: true,
      }),
      prisma.albumMusique.createMany({
        data: MusiqueIDs.map((MusiqueID) => ({ AlbumID: album.AlbumID, MusiqueID, UtilisateurID: userId })),
        skipDuplicates: true,
      }),
    ]);

    const created = await prisma.album.findUnique({ where: { AlbumID: album.AlbumID }, select: albumSelect });
    await logMusicAction({
      request,
      userId,
      action: "album_create",
      albumId: album.AlbumID,
      champ: "Album",
      nouvelleValeur: created?.Titre ?? Titre,
      meta: {
        Titre: created?.Titre ?? Titre,
        CheminImage: created?.CheminImage ?? null,
        GenreIDs,
        MusiqueIDs,
      },
    });
    return reply.status(201).send(formatAlbum(created));
  } catch (error) {
    console.error("Erreur lors de l'ajout de l'album :", error);
    return reply.status(500).send({ error: "Erreur lors de l'ajout de l'album." });
  }
};

export const updateAlbum = async (request, reply) => {
  const userId = await ensureAdmin(request, reply);
  if (!userId) return;
  const AlbumID = parseId(request.params.id);
  if (!AlbumID) return reply.status(400).send({ error: "AlbumID invalide." });

  try {
    const { fields, files } = request.isMultipart() ? await readMultipart(request) : { fields: request.body || {}, files: {} };
    const data = {};
    if (fields.Titre !== undefined) data.Titre = String(fields.Titre).trim();
    if (!data.Titre && fields.Titre !== undefined) return reply.status(400).send({ error: "Le titre est obligatoire." });

    const existing = await prisma.album.findUnique({ where: { AlbumID } });
    if (!existing) return reply.status(404).send({ error: "Album introuvable." });

    if (files.image) {
      const ext = safeExt(files.image.filename, ".jpg");
      const imagePath = path.join(ALBUM_ROOT, String(AlbumID), "affiche", `image_${Date.now()}${ext}`);
      await writeBufferedFile(files.image, imagePath);
      removeStoredPath(existing.CheminImage);
      data.CheminImage = path.join("uploads", "album", String(AlbumID), "affiche", path.basename(imagePath));
    }

    const GenreIDs = fields.GenreIDs !== undefined ? parseJsonIds(fields.GenreIDs) : null;
    const MusiqueIDs = fields.MusiqueIDs !== undefined ? parseJsonIds(fields.MusiqueIDs) : null;

    await prisma.$transaction(async (tx) => {
      if (Object.keys(data).length > 0) await tx.album.update({ where: { AlbumID }, data });
      if (GenreIDs) {
        await tx.musiqueGenreAlbum.deleteMany({ where: { AlbumID } });
        if (GenreIDs.length) {
          await tx.musiqueGenreAlbum.createMany({
            data: GenreIDs.map((MusiqueGenreID) => ({ AlbumID, MusiqueGenreID, UtilisateurID: userId })),
            skipDuplicates: true,
          });
        }
      }
      if (MusiqueIDs) {
        await tx.albumMusique.deleteMany({ where: { AlbumID } });
        if (MusiqueIDs.length) {
          await tx.albumMusique.createMany({
            data: MusiqueIDs.map((MusiqueID) => ({ AlbumID, MusiqueID, UtilisateurID: userId })),
            skipDuplicates: true,
          });
        }
      }
    });

    const updated = await prisma.album.findUnique({ where: { AlbumID }, select: albumSelect });
    await logMusicAction({
      request,
      userId,
      action: "album_update",
      albumId: AlbumID,
      champ: "Album",
      ancienneValeur: JSON.stringify({
        Titre: existing.Titre,
        CheminImage: existing.CheminImage,
      }),
      nouvelleValeur: JSON.stringify({
        Titre: updated.Titre,
        CheminImage: updated.CheminImage,
      }),
      meta: {
        changedFields: Object.keys(data),
        GenreIDs,
        MusiqueIDs,
      },
      dedupeMs: 2000,
    });
    return reply.send(formatAlbum(updated));
  } catch (error) {
    console.error("Erreur lors de la mise à jour de l'album :", error);
    return reply.status(500).send({ error: "Erreur lors de la mise à jour de l'album." });
  }
};

export const softDeleteMusique = async (request, reply) => {
  const userId = await ensureAdmin(request, reply);
  if (!userId) return;
  const MusiqueID = parseId(request.params.id);
  if (!MusiqueID) return reply.status(400).send({ error: "MusiqueID invalide." });
  const musique = await prisma.musique.findUnique({ where: { MusiqueID } });
  if (!musique) return reply.status(404).send({ error: "Musique introuvable." });
  await prisma.musique.update({ where: { MusiqueID }, data: { EtatID: DELETED_ETAT_ID } });
  await logMusicAction({
    request,
    userId,
    action: "musique_soft_delete",
    musiqueId: MusiqueID,
    champ: "EtatID",
    ancienneValeur: String(musique.EtatID),
    nouvelleValeur: String(DELETED_ETAT_ID),
    meta: { Titre: musique.Titre },
  });
  return reply.send({ ok: true });
};

export const restoreMusique = async (request, reply) => {
  const userId = await ensureSuperAdmin(request, reply);
  if (!userId) return;
  const MusiqueID = parseId(request.params.id);
  if (!MusiqueID) return reply.status(400).send({ error: "MusiqueID invalide." });
  const musique = await prisma.musique.findUnique({ where: { MusiqueID } });
  if (!musique) return reply.status(404).send({ error: "Musique introuvable." });
  await prisma.musique.update({ where: { MusiqueID }, data: { EtatID: ACTIVE_ETAT_ID } });
  await logMusicAction({
    request,
    userId,
    action: "musique_restore",
    musiqueId: MusiqueID,
    champ: "EtatID",
    ancienneValeur: String(musique.EtatID),
    nouvelleValeur: String(ACTIVE_ETAT_ID),
    meta: { Titre: musique.Titre },
  });
  return reply.send({ ok: true });
};

export const deleteMusique = async (request, reply) => {
  const userId = await ensureSuperAdmin(request, reply);
  if (!userId) return;
  const MusiqueID = parseId(request.params.id);
  if (!MusiqueID) return reply.status(400).send({ error: "MusiqueID invalide." });
  const musique = await prisma.musique.findUnique({ where: { MusiqueID } });
  if (!musique) return reply.status(404).send({ error: "Musique introuvable." });
  await prisma.musique.delete({ where: { MusiqueID } });
  removeStoredPath(path.join("uploads", "musique", String(MusiqueID)), { recursive: true });
  await logMusicAction({
    request,
    userId,
    action: "musique_delete",
    champ: "Musique",
    ancienneValeur: JSON.stringify({
      MusiqueID,
      Titre: musique.Titre,
      CheminAcces: musique.CheminAcces,
      CheminImage: musique.CheminImage,
    }),
    meta: { Titre: musique.Titre },
  });
  return reply.send({ ok: true });
};

export const softDeleteAlbum = async (request, reply) => {
  const userId = await ensureAdmin(request, reply);
  if (!userId) return;
  const AlbumID = parseId(request.params.id);
  if (!AlbumID) return reply.status(400).send({ error: "AlbumID invalide." });
  const album = await prisma.album.findUnique({ where: { AlbumID } });
  if (!album) return reply.status(404).send({ error: "Album introuvable." });
  await prisma.album.update({ where: { AlbumID }, data: { EtatID: DELETED_ETAT_ID } });
  await logMusicAction({
    request,
    userId,
    action: "album_soft_delete",
    albumId: AlbumID,
    champ: "EtatID",
    ancienneValeur: String(album.EtatID),
    nouvelleValeur: String(DELETED_ETAT_ID),
    meta: { Titre: album.Titre },
  });
  return reply.send({ ok: true });
};

export const restoreAlbum = async (request, reply) => {
  const userId = await ensureSuperAdmin(request, reply);
  if (!userId) return;
  const AlbumID = parseId(request.params.id);
  if (!AlbumID) return reply.status(400).send({ error: "AlbumID invalide." });
  const album = await prisma.album.findUnique({ where: { AlbumID } });
  if (!album) return reply.status(404).send({ error: "Album introuvable." });
  await prisma.album.update({ where: { AlbumID }, data: { EtatID: ACTIVE_ETAT_ID } });
  await logMusicAction({
    request,
    userId,
    action: "album_restore",
    albumId: AlbumID,
    champ: "EtatID",
    ancienneValeur: String(album.EtatID),
    nouvelleValeur: String(ACTIVE_ETAT_ID),
    meta: { Titre: album.Titre },
  });
  return reply.send({ ok: true });
};

export const deleteAlbum = async (request, reply) => {
  const userId = await ensureSuperAdmin(request, reply);
  if (!userId) return;
  const AlbumID = parseId(request.params.id);
  if (!AlbumID) return reply.status(400).send({ error: "AlbumID invalide." });
  const album = await prisma.album.findUnique({ where: { AlbumID } });
  if (!album) return reply.status(404).send({ error: "Album introuvable." });
  await prisma.album.delete({ where: { AlbumID } });
  removeStoredPath(path.join("uploads", "album", String(AlbumID)), { recursive: true });
  await logMusicAction({
    request,
    userId,
    action: "album_delete",
    champ: "Album",
    ancienneValeur: JSON.stringify({
      AlbumID,
      Titre: album.Titre,
      CheminImage: album.CheminImage,
    }),
    meta: { Titre: album.Titre },
  });
  return reply.send({ ok: true });
};
