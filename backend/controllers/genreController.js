import { prisma } from "../services/db.js";
import {
  getGenreFeaturedContent,
  rotateGenreFeaturedContent,
} from "../services/genreFeaturedContentService.js";
import { ensureAdmin as ensureSharedAdmin } from "../services/authz.js";

const ensureAdmin = async (request, reply) => {
  return Boolean(await ensureSharedAdmin(request, reply, { unauthorizedError: "Unauthorized" }));
};

const FALLBACK_HOMEPAGE_GENRES = ["Épique", "Romance", "Animé", "Aventure", "Horreur"];

const getFallbackHomepageGenres = async () => {
  const genres = await prisma.genre.findMany({
    where: { Nom: { in: FALLBACK_HOMEPAGE_GENRES } },
    select: { GenreID: true, Nom: true },
  });
  const byName = new Map(genres.map((genre) => [genre.Nom, genre]));

  return FALLBACK_HOMEPAGE_GENRES
    .map((name, index) => {
      const genre = byName.get(name);
      return genre ? { Position: index + 1, GenreID: genre.GenreID, Genre: genre } : null;
    })
    .filter(Boolean);
};

const toHomepageDefaultGenrePayload = (row) => ({
  Position: row.Position,
  GenreID: row.GenreID,
  Genre: row.Genre,
});

// GET

// Récupérer tous les genres
export const getAllGenres = async (request, reply) => {
  try {
    const genres = await prisma.genre.findMany({
      orderBy: { Nom: "asc" },
    });
    reply.send(genres);
  } catch (err) {
    reply.status(500).send({ error: "Erreur lors de la récupération des genres." });
  }
};
// Récupérer les genres de l'utilisateur
export const getGenres = async (request, reply) => {
  const { id } = request.params;
  try {
    const genres = await prisma.utilisateurGenre.findMany({
      where: { UtilisateurID: parseInt(id) },
      include: { Genre: true },
      take: 6
    });

    // Vérifiez si des genres ont été trouvés
    if (genres.length === 0) {
      return reply.status(404).send({ message: "Aucun genre trouvé pour cet utilisateur." });
    }

    reply.send(genres);
  } catch (err) {
    reply.status(500).send({ error: "Erreur lors de la récupération des genres de l'utilisateur." });
  }
};

export const getFeaturedGenres = async (request, reply) => {
  const genreIds = String(request.query?.genreIds || "")
    .split(",")
    .map((id) => Number.parseInt(id, 10))
    .filter(Number.isInteger);

  try {
    const rows = await getGenreFeaturedContent(genreIds);
    return reply.send(rows);
  } catch (err) {
    console.error("Erreur lors de la récupération des contenus à la une :", err);
    return reply.status(500).send({ error: "Erreur lors de la récupération des contenus à la une." });
  }
};

export const getHomepageDefaultGenres = async (request, reply) => {
  try {
    const rows = await prisma.homepageDefaultGenre.findMany({
      include: { Genre: true },
      orderBy: { Position: "asc" },
    });

    if (rows.length === 0) {
      return reply.send(await getFallbackHomepageGenres());
    }

    return reply.send(rows.map(toHomepageDefaultGenrePayload));
  } catch (err) {
    console.error("Erreur lors de la récupération des genres homepage :", err);
    return reply.status(500).send({ error: "Erreur lors de la récupération des genres homepage." });
  }
};

// POST

// Ajouter un nouveau genre
export const addGenre = async (request, reply) => {
  const Nom = request.body?.Nom?.trim();

  if (!Nom) {
    return reply.status(400).send({ error: "Le nom du genre est obligatoire." });
  }

  try {
    const genre = await prisma.genre.create({ data: { Nom } });
    console.log("Ajout d'un nouveau genre : ", Nom);
    reply.status(201).send(genre);
  } catch (err) {
    if (err.code === "P2002") {
      return reply.status(409).send({ error: "Ce genre existe déjà." });
    }

    reply.status(500).send({ error: "Erreur lors de l'ajout du genre." });
  }
};

export const addAdminGenre = async (request, reply) => {
  const isAdmin = await ensureAdmin(request, reply);
  if (!isAdmin) return;

  return addGenre(request, reply);
};
// Ajoute un nouveau genre à l'utilisateur
export const addGenreUtilisateur = async (request, reply) => {
  const { id } = request.params;
  const { GenreID } = request.body;
  const test = [
    {"UtilisateurID": id, "GenreID": GenreID }
  ];
  console.table(test);
  try {
    const utilisateurGenre = await prisma.utilisateurGenre.create({ 
      data: { 
        UtilisateurID: parseInt(id),
        GenreID
      } 
    });
    console.log("Ajout du genre à l'utilisateur : ", GenreID);
    reply.status(201).send(utilisateurGenre);
  } catch (err) {
    reply.status(500).send({ error: "Erreur lors de l'ajout du genre de l'utilisateur." });
  }
};

export const refreshFeaturedGenres = async (request, reply) => {
  try {
    const isAdmin = await ensureAdmin(request, reply);
    if (!isAdmin) return;

    const result = await rotateGenreFeaturedContent();
    return reply.send(result);
  } catch (err) {
    console.error("Erreur lors de l'actualisation des contenus à la une :", err);
    return reply.status(500).send({ error: "Erreur lors de l'actualisation des contenus à la une." });
  }
};

export const updateHomepageDefaultGenres = async (request, reply) => {
  try {
    const isAdmin = await ensureAdmin(request, reply);
    if (!isAdmin) return;

    const { GenreIDs } = request.body || {};
    if (!Array.isArray(GenreIDs)) {
      return reply.status(400).send({ error: "GenreIDs doit être un tableau." });
    }

    const sanitized = [
      ...new Set(
        GenreIDs
          .map((value) => Number.parseInt(value, 10))
          .filter((value) => Number.isInteger(value))
      ),
    ];

    if (sanitized.length !== 5) {
      return reply.status(400).send({ error: "Exactement 5 genres sont requis." });
    }

    const existingCount = await prisma.genre.count({
      where: { GenreID: { in: sanitized } },
    });

    if (existingCount !== sanitized.length) {
      return reply.status(400).send({ error: "Un ou plusieurs genres sont introuvables." });
    }

    await prisma.$transaction(
      sanitized.map((GenreID, index) =>
        prisma.homepageDefaultGenre.upsert({
          where: { Position: index + 1 },
          create: { Position: index + 1, GenreID },
          update: { GenreID },
        })
      )
    );

    const rows = await prisma.homepageDefaultGenre.findMany({
      include: { Genre: true },
      orderBy: { Position: "asc" },
    });

    return reply.send({ ok: true, genres: rows.map(toHomepageDefaultGenrePayload) });
  } catch (err) {
    console.error("Erreur lors de la mise à jour des genres homepage :", err);
    return reply.status(500).send({ error: "Erreur lors de la mise à jour des genres homepage." });
  }
};

export const updateGenre = async (request, reply) => {
  try {
    const isAdmin = await ensureAdmin(request, reply);
    if (!isAdmin) return;

    const GenreID = Number.parseInt(request.params.id, 10);
    const Nom = request.body?.Nom?.trim();

    if (!Number.isInteger(GenreID)) {
      return reply.status(400).send({ error: "GenreID invalide." });
    }

    if (!Nom) {
      return reply.status(400).send({ error: "Le nom du genre est obligatoire." });
    }

    const genre = await prisma.genre.update({
      where: { GenreID },
      data: { Nom },
    });

    return reply.send(genre);
  } catch (err) {
    if (err.code === "P2002") {
      return reply.status(409).send({ error: "Ce genre existe déjà." });
    }

    if (err.code === "P2025") {
      return reply.status(404).send({ error: "Genre introuvable." });
    }

    return reply.status(500).send({ error: "Erreur lors de la mise à jour du genre." });
  }
};

export const deleteGenre = async (request, reply) => {
  try {
    const isAdmin = await ensureAdmin(request, reply);
    if (!isAdmin) return;

    const GenreID = Number.parseInt(request.params.id, 10);
    if (!Number.isInteger(GenreID)) {
      return reply.status(400).send({ error: "GenreID invalide." });
    }

    const genre = await prisma.genre.findUnique({
      where: { GenreID },
      select: { GenreID: true, Nom: true },
    });

    if (!genre) {
      return reply.status(404).send({ error: "Genre introuvable." });
    }

    const [videos, series, utilisateurs, contenusALaUne] = await Promise.all([
      prisma.videoGenre.count({ where: { GenreID } }),
      prisma.seriesGenre.count({ where: { GenreID } }),
      prisma.utilisateurGenre.count({ where: { GenreID } }),
      prisma.genreFeaturedContent.count({ where: { GenreID } }),
    ]);

    const blockingTotal = videos + series + utilisateurs;
    const links = {
      videos,
      series,
      utilisateurs,
      contenusALaUne,
      total: blockingTotal + contenusALaUne,
      blockingTotal,
    };

    if (blockingTotal > 0) {
      return reply.status(409).send({
        error: "Ce genre est déjà relié à du contenu ou à des préférences utilisateur.",
        links,
      });
    }

    await prisma.genre.delete({ where: { GenreID } });

    return reply.send({
      ok: true,
      genre,
      deletedFeaturedContent: contenusALaUne,
    });
  } catch (err) {
    return reply.status(500).send({ error: "Erreur lors de la suppression du genre." });
  }
};

// PUT

// Mettre à jour les genre de l'utilisateur
export const updateGenreUtilisateur = async (request, reply) => {
  const { id } = request.params;
  const { GenreIDs } = request.body || {};

  if (!Array.isArray(GenreIDs)) {
    return reply.status(400).send({ error: "GenreIDs doit être un tableau." });
  }

  const userId = Number.parseInt(id, 10);
  if (!Number.isInteger(userId)) {
    return reply.status(400).send({ error: "UtilisateurID invalide." });
  }

  const sanitized = GenreIDs
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value));

  if (sanitized.length > 5) {
    return reply.status(400).send({ error: "Maximum 5 genres autorisés." });
  }

  try {
    await prisma.utilisateurGenre.deleteMany({
      where: { UtilisateurID: userId },
    });

    if (sanitized.length > 0) {
      await prisma.utilisateurGenre.createMany({
        data: sanitized.map((genreId) => ({
          UtilisateurID: userId,
          GenreID: genreId,
        })),
      });
    }

    return reply.send({ ok: true, genres: sanitized });
  } catch (err) {
    return reply.status(500).send({ error: "Erreur lors de la mise à jour des genres de l'utilisateur." });
  }
};
