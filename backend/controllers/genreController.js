import { prisma } from "../services/db.js";
import {
  getGenreFeaturedContent,
  rotateGenreFeaturedContent,
} from "../services/genreFeaturedContentService.js";

const ensureAdmin = async (request, reply) => {
  const userId = Number(request.user?.userId);
  if (!Number.isInteger(userId)) {
    reply.status(401).send({ error: "Unauthorized" });
    return false;
  }

  const user = await prisma.utilisateur.findUnique({
    where: { UtilisateurID: userId },
    select: { GradeID: true },
  });

  if (!user || (user.GradeID !== 1 && user.GradeID !== 2)) {
    reply.status(403).send({ error: "Accès réservé aux administrateurs." });
    return false;
  }

  return true;
};

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

// POST

// Ajouter un nouveau genre
export const addGenre = async (request, reply) => {
  const { Nom } = request.body;

  try {
    const genre = await prisma.genre.create({ data: { Nom } });
    console.log("Ajout d'un nouveau genre : ", Nom);
    reply.status(201).send(genre);
  } catch (err) {
    reply.status(500).send({ error: "Erreur lors de l'ajout du genre." });
  }
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
