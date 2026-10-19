import { prisma } from "../services/db.js";
import { ensureAdmin } from "../services/authz.js";
import { ETAT } from "../constants.js";
import { createLog } from "./logController.js";
import {
  AlternativeTitlesValidationError,
  normalizeAlternativeTitles,
} from "../services/alternativeTitles.js";

const updateAlternativeTitles = (isVideo) => async (request, reply) => {
  try {
    const admin = await ensureAdmin(request, reply);
    if (!admin) return;
    const id = Number(request.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return reply.code(400).send({ error: "Identifiant invalide." });
    }
    if (!Object.prototype.hasOwnProperty.call(request.body || {}, "TitreAlternatif")) {
      return reply.code(400).send({ error: "Le champ TitreAlternatif est requis (vide pour le retirer)." });
    }
    const TitreAlternatif = normalizeAlternativeTitles(request.body.TitreAlternatif);
    const model = isVideo ? prisma.video : prisma.series;
    const where = isVideo ? { VideoID: id } : { SeriesID: id };
    const before = await model.findUnique({
      where,
      select: {
        TitreAlternatif: true,
        ...(isVideo ? { EtatID: true, SaisonID: true, Saison: { select: { SeriesID: true } } } : {}),
      },
    });
    if (!before) return reply.code(404).send({ error: "Contenu introuvable." });
    if (isVideo && before.EtatID === ETAT.BLOCKED) {
      return reply.code(409).send({
        error: "Cette vidéo est verrouillée pendant son transfert depuis une autre instance.",
        code: "VIDEO_TRANSFER_IN_PROGRESS",
      });
    }
    if ((before.TitreAlternatif ?? null) === TitreAlternatif) {
      return reply.send({ ok: true, unchanged: true, TitreAlternatif });
    }
    const updated = await model.update({ where, data: { TitreAlternatif } });
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: isVideo ? "video_update" : "serie_update",
      ...where,
      ...(isVideo ? { SaisonID: before.SaisonID ?? null, SeriesID: before.Saison?.SeriesID ?? null } : {}),
      Champ: "TitreAlternatif",
      AncienneValeur: before.TitreAlternatif ?? null,
      NouvelleValeur: TitreAlternatif,
      DedupeMs: 2000,
    });
    return reply.send(updated);
  } catch (error) {
    if (error instanceof AlternativeTitlesValidationError) {
      return reply.code(400).send({ error: error.message });
    }
    console.error("Erreur de mise à jour des titres alternatifs :", error);
    return reply.code(500).send({ error: "Erreur interne du serveur." });
  }
};

export const updateVideoAlternativeTitles = updateAlternativeTitles(true);
export const updateSeriesAlternativeTitles = updateAlternativeTitles(false);
