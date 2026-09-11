import { prisma } from "../services/db.js";
import { ADMIN_GRADE_IDS, ETAT } from "../constants.js";
import { getRequestUserId } from "../services/authz.js";
import { canAccessPremium, isVideoPremium } from "../services/video/videoAccess.js";
import { getCreditVideoDuration } from "../services/video/videoCreditDuration.js";

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const positiveId = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : fail(400, "Identifiant invalide.");
export const validateCreditRange = (body, duration) => {
  const { Start, End } = body || {};
  if (!Number.isFinite(Start) || !Number.isFinite(End) || Start < 0 || End <= Start || End > duration) {
    fail(400, "Le début doit précéder la fin et les deux bornes doivent être dans la vidéo.");
  }
  return { Start, End };
};
const protect = handler => async (request, reply) => {
  try { return await handler(request, reply); }
  catch (error) {
    if (!error.status) request.log?.error(error);
    return reply.status(error.status || 500).send({ error: error.status ? error.message : "Impossible de traiter les génériques." });
  }
};
async function identity(request) {
  const id = getRequestUserId(request);
  if (!id) fail(401, "Connexion requise.");
  const user = await prisma.utilisateur.findUnique({ where: { UtilisateurID: id }, select: { UtilisateurID: true, GradeID: true, EtatID: true, PremiumEndDate: true } });
  if (!user || user.EtatID !== ETAT.ACTIVE) fail(401, "Compte indisponible.");
  return { user, admin: ADMIN_GRADE_IDS.includes(user.GradeID) };
}
async function accessibleVideo(db, id, user) {
  const video = await db.video.findUnique({ where: { VideoID: id }, include: { Saison: { include: { Series: true } } } });
  if (!video || video.EtatID !== ETAT.ACTIVE) fail(404, "Vidéo indisponible.");
  if (isVideoPremium(video) && !canAccessPremium(user)) fail(403, "Abonnement premium requis.");
  return video;
}
const select = { ID: true, VideoID: true, Start: true, End: true, Status: true, AuthorID: true, CreatedAt: true, UpdatedAt: true, ReviewedAt: true };

export const listVideoCredits = protect(async (request, reply) => {
  const { user, admin } = await identity(request);
  const VideoID = positiveId(request.params.id);
  await accessibleVideo(prisma, VideoID, user);
  const items = await prisma.videoCreditSegment.findMany({
    where: { VideoID, ...(admin ? {} : { OR: [{ Status: "APPROVED" }, { AuthorID: user.UtilisateurID }] }) },
    select, orderBy: [{ Start: "asc" }, { ID: "asc" }],
  });
  return reply.send({ items, canModerate: admin, userId: user.UtilisateurID });
});

export const listCreditQueue = protect(async (request, reply) => {
  const { admin } = await identity(request);
  if (!admin) fail(403, "Accès réservé aux administrateurs.");
  const page = positiveId(request.query?.page || 1);
  const status = request.query?.status || "PENDING";
  if (!["PENDING", "APPROVED", "REJECTED"].includes(status)) fail(400, "Statut invalide.");
  const where = { Status: status, Video: { EtatID: ETAT.ACTIVE } };
  const [items, total] = await Promise.all([
    prisma.videoCreditSegment.findMany({ where, select: { ...select, Video: { select: { Titre: true } }, Author: { select: { Surnom: true } } }, orderBy: [{ CreatedAt: "asc" }, { ID: "asc" }], skip: (page - 1) * 25, take: 25 }),
    prisma.videoCreditSegment.count({ where }),
  ]);
  return reply.send({ items, total, page });
});

const mutate = action => protect(async (request, reply) => {
  const { user, admin } = await identity(request);
  const VideoID = positiveId(request.params.id);
  const segmentId = action === "create" ? null : positiveId(request.params.segmentId);
  const result = await prisma.$transaction(async tx => {
    // Serialize all edits for one video, including simultaneous approvals and author edits.
    await tx.$queryRaw`SELECT VideoID FROM Video WHERE VideoID = ${VideoID} FOR UPDATE`;
    const video = await accessibleVideo(tx, VideoID, user);
    const existing = segmentId ? await tx.videoCreditSegment.findFirst({ where: { ID: segmentId, VideoID } }) : null;
    if (segmentId && !existing) fail(404, "Proposition introuvable.");
    if (existing && !admin && (existing.AuthorID !== user.UtilisateurID || existing.Status !== "PENDING")) fail(403, "Seules vos propositions en attente peuvent être modifiées ou supprimées.");
    if (action === "delete") {
      await tx.videoCreditSegment.delete({ where: { ID: segmentId } });
      return { deleted: true };
    }
    const requestedStatus = request.body?.Status;
    if (requestedStatus !== undefined && (!admin || action === "create" || !["APPROVED", "REJECTED"].includes(requestedStatus))) fail(403, "Validation réservée aux administrateurs.");
    const Status = requestedStatus || existing?.Status || "PENDING";
    let range;
    // Refusal must remain possible when the media file is missing.
    if (Status === "REJECTED" && existing && request.body?.Start === undefined && request.body?.End === undefined) {
      range = { Start: existing.Start, End: existing.End };
    } else {
      let duration;
      try { duration = await getCreditVideoDuration(video); }
      catch { fail(409, "Durée vidéo indisponible : vérifiez le média avant de proposer ou valider un générique."); }
      range = validateCreditRange({ ...existing, ...request.body }, duration);
    }
    if (Status === "APPROVED") {
      const overlap = await tx.videoCreditSegment.findFirst({ where: { VideoID, Status: "APPROVED", ...(segmentId ? { ID: { not: segmentId } } : {}), Start: { lt: range.End }, End: { gt: range.Start } } });
      if (overlap) fail(409, "Ce générique chevauche un générique déjà validé.");
    }
    const data = { ...range, Status, ...(admin && Status !== "PENDING" ? { ReviewerID: user.UtilisateurID, ReviewedAt: new Date() } : {}) };
    return segmentId
      ? tx.videoCreditSegment.update({ where: { ID: segmentId }, data, select })
      : tx.videoCreditSegment.create({ data: { ...data, VideoID, AuthorID: user.UtilisateurID }, select });
  });
  return reply.status(action === "create" ? 201 : 200).send(result);
});
export const createVideoCredit = mutate("create");
export const updateVideoCredit = mutate("update");
export const deleteVideoCredit = mutate("delete");
