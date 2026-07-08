import { prisma } from "../services/db.js";
import { ETAT } from "../constants.js";

export const importVideo = async (request, reply) => {
  const {
    Titre,
    Resumer,
    CheminAcces,
    CheminImage,
    SaisonID,
    GenreIDs = [],
    Subtitles = [],
    UtilisateurID
  } = request.body;

  if (!Titre || !CheminAcces || !CheminImage || !UtilisateurID) {
    return reply.code(400).send({
      error: "Les champs Titre, CheminAcces, CheminImage et UtilisateurID sont obligatoires."
    });
  }

  try {
    const cheminAccesFinal = `uploads/videos/${CheminAcces}/master.m3u8`;
    const cheminImageFinal = `uploads/images/${CheminImage}`;

    const video = await prisma.video.create({
      data: {
        Titre,
        Resumer: Resumer || null,
        CheminAcces: cheminAccesFinal,
        CheminImage: cheminImageFinal,
        EtatID: ETAT.ACTIVE,
        SaisonID: SaisonID || null,
        UtilisateurID: parseInt(UtilisateurID, 10)
      }
    });

    // Ajout des genres
    if (Array.isArray(GenreIDs)) {
      const uniqueIds = [
        ...new Set(GenreIDs.map((g) => parseInt(g, 10)).filter(Number.isInteger)),
      ];
      await prisma.videoGenre.createMany({
        data: uniqueIds.map((GenreID) => ({ VideoID: video.VideoID, GenreID })),
        skipDuplicates: true,
      });
    }

    // Ajout des sous-titres
    if (Array.isArray(Subtitles)) {
      await prisma.videoSubtitle.createMany({
        data: Subtitles.map(({ Label, CheminSubtitle }) => ({
          VideoID: video.VideoID,
          Label,
          CheminSubtitle: `uploads/subtitles/${CheminSubtitle}`
        }))
      });
    }

    reply.code(201).send({ message: "Vidéo importée avec succès", video });
  } catch (err) {
    console.error("Erreur lors de l'import :", err);
    reply.code(500).send({ error: "Erreur interne lors de l'import de la vidéo." });
  }
};
