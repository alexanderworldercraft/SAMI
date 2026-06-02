// controllers/logController.js

import { prisma } from "../services/db.js";

/**
 * Cache en mémoire pour éviter de faire un SELECT sur Action à chaque log.
 * Key: Nom (string) -> Value: ActionID (number)
 */

const actionIdCache = new Map();

/**
 * Anti-race condition: verrou en mémoire par clé de déduplication.
 * Sans ça, deux requêtes quasi simultanées peuvent faire:
 *   SELECT (rien) -> INSERT
 * en parallèle, et créer 2 logs malgré le dedupe.
 *
 * ⚠️ Protège uniquement dans UNE instance Node (ce qui est ton cas actuel).
 */
const dedupeLocks = new Map();
const VIDEO_PLAY_ACTIONS = ["video_first_play", "video_resume_play"];

async function withDedupeLock(lockKey, fn) {
  // Si une exécution est déjà en cours pour cette clé, on attend qu'elle termine.
  const existing = dedupeLocks.get(lockKey);
  if (existing) {
    await existing;
  }

  // On enregistre la promesse en cours pour bloquer les concurrents.
  let resolveLock;
  const lockPromise = new Promise((resolve) => {
    resolveLock = resolve;
  });
  dedupeLocks.set(lockKey, lockPromise);

  try {
    return await fn();
  } finally {
    // On libère le verrou quoiqu'il arrive.
    dedupeLocks.delete(lockKey);
    resolveLock();
  }
}

/**
 * Récupère l'IP "réelle" de l'utilisateur en tenant compte du reverse proxy (Nginx).
 * - x-forwarded-for peut contenir plusieurs IP: "client, proxy1, proxy2"
 * - On prend la première (la plus à gauche).
 */
export function getClientIp(request) {
  const xff = request.headers["x-forwarded-for"];
  if (typeof xff === "string") {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  } else if (Array.isArray(xff) && xff.length > 0) {
    const first = String(xff[0] || "").split(",")[0]?.trim();
    if (first) return first;
  }

  const xRealIp = request.headers["x-real-ip"];
  if (typeof xRealIp === "string" && xRealIp.trim()) return xRealIp.trim();

  // Fastify peut fournir request.ip
  if (request.ip) return request.ip;

  // Fallback Node
  return request.socket?.remoteAddress || null;
}

export function getUserAgent(request) {
  const ua = request.headers["user-agent"];
  return typeof ua === "string" ? ua : null;
}

/**
 * Résout ActionID à partir du Nom (avec cache).
 * IMPORTANT: ne crée pas l'action automatiquement (tu gardes le contrôle).
 */
async function resolveActionId(ActionNom) {
  if (!ActionNom || typeof ActionNom !== "string") return null;

  if (actionIdCache.has(ActionNom)) {
    return actionIdCache.get(ActionNom);
  }

  const action = await prisma.action.findUnique({
    where: { Nom: ActionNom },
    select: { ActionID: true },
  });

  if (!action) return null;

  actionIdCache.set(ActionNom, action.ActionID);
  return action.ActionID;
}

const normalizeTimecodeMeta = ({ startTimecode = null, endTimecode = null, duration = null }) => {
  const safeDuration = Number.isFinite(Number(duration)) && Number(duration) > 0
    ? Math.floor(Number(duration))
    : null;
  const safeStart = Number.isFinite(Number(startTimecode)) && Number(startTimecode) >= 0
    ? Math.floor(Number(startTimecode))
    : null;
  const safeEnd = Number.isFinite(Number(endTimecode)) && Number(endTimecode) >= 0
    ? Math.floor(Number(endTimecode))
    : null;

  return {
    startTimecode: safeStart,
    endTimecode: safeEnd,
    duration: safeDuration,
    startPercent: safeDuration && safeStart !== null
      ? Number(Math.min((safeStart / safeDuration) * 100, 100).toFixed(2))
      : null,
    endPercent: safeDuration && safeEnd !== null
      ? Number(Math.min((safeEnd / safeDuration) * 100, 100).toFixed(2))
      : null,
  };
};

export async function updateLatestVideoPlayLogProgress({
  UtilisateurID,
  VideoID,
  endTimecode,
  duration,
  final = false,
}) {
  const userId = Number(UtilisateurID);
  const videoId = Number(VideoID);

  if (!Number.isInteger(userId) || !Number.isInteger(videoId)) {
    return { ok: false, reason: "INVALID_INPUT" };
  }

  try {
    const actions = await prisma.action.findMany({
      where: { Nom: { in: VIDEO_PLAY_ACTIONS } },
      select: { ActionID: true, Nom: true },
    });

    const updates = await Promise.all(actions.map(async (action) => {
      const latestLog = await prisma.log.findFirst({
        where: {
          UtilisateurID: userId,
          VideoID: videoId,
          ActionID: action.ActionID,
        },
        orderBy: { DateAction: "desc" },
        select: { LogID: true, Meta: true },
      });

      if (!latestLog) return null;

      const previousMeta =
        latestLog.Meta && typeof latestLog.Meta === "object" && !Array.isArray(latestLog.Meta)
          ? latestLog.Meta
          : {};
      const previousStart = previousMeta.startTimecode ?? previousMeta.timecodeStart;
      const startTimecode = action.Nom === "video_resume_play"
        ? previousStart ?? null
        : previousMeta.startTimecode ?? null;
      const progressMeta = normalizeTimecodeMeta({
        startTimecode,
        endTimecode,
        duration,
      });

      return prisma.log.update({
        where: { LogID: latestLog.LogID },
        data: {
          Meta: {
            ...previousMeta,
            ...progressMeta,
            progressFinal: Boolean(final),
            progressUpdatedAt: new Date().toISOString(),
          },
        },
      });
    }));

    return { ok: true, updated: updates.filter(Boolean).length };
  } catch (err) {
    console.error("❌ updateLatestVideoPlayLogProgress:", err);
    return { ok: false, reason: "EXCEPTION", error: err?.message };
  }
}

/**
 * Fonction générique pour créer un log.
 * Elle:
 * - résout ActionID via ActionNom
 * - ajoute IP + UserAgent
 * - rattache le log à une entité (VideoID/SeriesID/SaisonID)
 * - stocke ancien/nouveau (audit)
 */
export async function createLog({
  request,
  UtilisateurID,
  ActionNom,
  VideoID = null,
  SeriesID = null,
  SaisonID = null,
  Champ = null,
  AncienneValeur = null,
  NouvelleValeur = null,
  Meta = null,
  DedupeMs = 0, // ✅ 0 = pas de dedupe
}) {
  try {
    const ActionID = await resolveActionId(ActionNom);

    if (!ActionID) {
      // Pas d'action => on ne log pas (ou tu peux throw si tu veux être strict)
      console.warn(`⚠️ Action '${ActionNom}' introuvable en BDD (table Action).`);
      return { ok: false, reason: "ACTION_NOT_FOUND" };
    }

    // Auth: on exige un UtilisateurID (sinon tu peux imaginer une table "SecurityLog" plus tard)
    if (!UtilisateurID || !Number.isInteger(UtilisateurID)) {
      console.warn("⚠️ createLog appelé sans UtilisateurID valide.");
      return { ok: false, reason: "INVALID_USER" };
    }

    const Ip = request ? getClientIp(request) : null;
    const UserAgent = request ? getUserAgent(request) : null;

    // Clé stable pour sérialiser le dedupe+insert (évite les doublons à 1ms d'écart)
    const lockKey = [
      UtilisateurID,
      ActionID,
      VideoID ?? "null",
      SeriesID ?? "null",
      SaisonID ?? "null",
      Champ ?? "null",
      AncienneValeur ?? "null",
      NouvelleValeur ?? "null",
    ].join("|");

    // Tout ce qui suit (dedupe + insert) doit être atomique à l'échelle du process.
    return await withDedupeLock(lockKey, async () => {
      // ✅ Pare-feu anti-doublon (utile tant que le front est instable)
      if (DedupeMs && DedupeMs > 0) {
        const since = new Date(Date.now() - DedupeMs);

        const existing = await prisma.log.findFirst({
          where: {
            UtilisateurID,
            ActionID,
            VideoID: VideoID ?? null,
            SeriesID: SeriesID ?? null,
            SaisonID: SaisonID ?? null,
            Champ: Champ ?? null,
            AncienneValeur: AncienneValeur ?? null,
            NouvelleValeur: NouvelleValeur ?? null,
            DateAction: { gte: since },
          },
          select: { LogID: true, DateAction: true },
        });

        if (existing) {
          console.warn(
            `⚠️ DEDUPE log skip: action=${ActionNom} user=${UtilisateurID} video=${VideoID} champ=${Champ} (LogID=${existing.LogID})`
          );
          return { ok: true, deduped: true };
        }
      }

      // -------------------------
      // Insertion du log en BDD
      // -------------------------
      const dataV5 = {
        UtilisateurID,
        ActionID,

        // Contexte
        VideoID: VideoID ?? undefined,
        SeriesID: SeriesID ?? undefined,
        SaisonID: SaisonID ?? undefined,

        // Audit
        Champ: Champ ?? undefined,
        AncienneValeur: AncienneValeur ?? undefined,
        NouvelleValeur: NouvelleValeur ?? undefined,

        // Réseau / device
        Ip: Ip ?? undefined,
        UserAgent: UserAgent ?? undefined,

        // Meta JSON (optionnel)
        Meta: Meta ?? undefined,
      };

      try {
        const created = await prisma.log.create({ data: dataV5 });
        return { ok: true, mode: "v5", LogID: created.LogID };
      } catch (err) {
        // Rétro-compatibilité: si ton Prisma / BDD n'a pas encore toutes les colonnes
        const msg = String(err?.message || "");
        const looksLikeUnknownArg =
          msg.includes("Unknown argument") || msg.includes("PrismaClientValidationError");

        if (!looksLikeUnknownArg) throw err;

        // Version minimale (legacy)
        const dataLegacy = {
          UtilisateurID,
          ActionID,
        };

        const created = await prisma.log.create({ data: dataLegacy });
        console.warn(
          "⚠️ Log créé en mode LEGACY (colonnes v5 absentes : Ip/UserAgent/Meta/etc). Fais la migration Log v5 quand tu es prêt."
        );
        return { ok: true, mode: "legacy", LogID: created.LogID };
      }
    });
  } catch (err) {
    console.error("❌ createLog error:", err);
    return { ok: false, reason: "EXCEPTION", error: err?.message };
  }
}

/**
 * Endpoint: log "premier play" d'une vidéo (1 fois par chargement côté front).
 * Route conseillée: POST /api/logs/video-first-play
 * Body: { VideoID: number }
 * Auth: obligatoire (request.user.userId)
 */
export const logVideoFirstPlay = async (request, reply) => {
  try {
    const { VideoID } = request.body || {};
    const videoId = parseInt(VideoID, 10);

    if (Number.isNaN(videoId)) {
      return reply.code(400).send({ error: "VideoID invalide." });
    }

    // Auth middleware doit injecter request.user.userId
    const userId = request.user?.userId;
    if (!userId) {
      return reply.code(401).send({ error: "Non authentifié." });
    }

    // (Optionnel) Vérifie que la vidéo existe + contexte épisode/série
    const exists = await prisma.video.findUnique({
      where: { VideoID: videoId },
      select: {
        VideoID: true,
        SaisonID: true,
        Saison: { select: { SeriesID: true } },
      },
    });
    if (!exists) return reply.code(404).send({ error: "Vidéo introuvable." });

    const progress = await prisma.userVideoProgress.findUnique({
      where: {
        UserID_VideoID: {
          UserID: Number(userId),
          VideoID: videoId,
        },
      },
      select: {
        Timecode: true,
        Duration: true,
      },
    });

    const progressMeta = normalizeTimecodeMeta({
      startTimecode: null,
      endTimecode: progress?.Timecode ?? null,
      duration: progress?.Duration ?? null,
    });

    const res = await createLog({
      request,
      UtilisateurID: Number(userId),
      ActionNom: "video_first_play",
      VideoID: videoId,
      SaisonID: exists.SaisonID ?? null,
      SeriesID: exists.Saison?.SeriesID ?? null,
      Champ: "player",
      AncienneValeur: null,
      NouvelleValeur: "play",
      Meta: {
        // Petit bonus utile: timestamp côté serveur
        serverTime: new Date().toISOString(),
        ...progressMeta,
      },
      // ✅ Sécurité anti-double-call front (2 requêtes quasi simultanées)
      DedupeMs: 5000,
    });

    if (!res.ok && res.reason === "ACTION_NOT_FOUND") {
      return reply.code(500).send({ error: "Action 'video_first_play' manquante en BDD." });
    }

    return reply.send({ ok: true });
  } catch (err) {
    console.error("❌ logVideoFirstPlay:", err);
    return reply.code(500).send({ error: "Erreur serveur." });
  }
};

export const logVideoResumePlay = async (request, reply) => {
  try {
    const { VideoID, StartTimecode, Duration } = request.body || {};
    const videoId = parseInt(VideoID, 10);

    if (Number.isNaN(videoId)) {
      return reply.code(400).send({ error: "VideoID invalide." });
    }

    const userId = request.user?.userId;
    if (!userId) {
      return reply.code(401).send({ error: "Non authentifié." });
    }

    const exists = await prisma.video.findUnique({
      where: { VideoID: videoId },
      select: {
        VideoID: true,
        SaisonID: true,
        Saison: { select: { SeriesID: true } },
      },
    });
    if (!exists) return reply.code(404).send({ error: "Vidéo introuvable." });

    const progress = await prisma.userVideoProgress.findUnique({
      where: {
        UserID_VideoID: {
          UserID: Number(userId),
          VideoID: videoId,
        },
      },
      select: {
        Timecode: true,
        Duration: true,
      },
    });

    const requestedStart = Number(StartTimecode);
    const requestedDuration = Number(Duration);
    const startTimecode = Number.isFinite(requestedStart) && requestedStart > 0
      ? Math.floor(requestedStart)
      : progress?.Timecode ?? null;
    const duration = Number.isFinite(requestedDuration) && requestedDuration > 0
      ? Math.floor(requestedDuration)
      : progress?.Duration ?? null;

    const res = await createLog({
      request,
      UtilisateurID: Number(userId),
      ActionNom: "video_resume_play",
      VideoID: videoId,
      SaisonID: exists.SaisonID ?? null,
      SeriesID: exists.Saison?.SeriesID ?? null,
      Champ: "player",
      AncienneValeur: null,
      NouvelleValeur: "resume",
      Meta: {
        serverTime: new Date().toISOString(),
        ...normalizeTimecodeMeta({
          startTimecode,
          endTimecode: startTimecode,
          duration,
        }),
      },
      DedupeMs: 5000,
    });

    if (!res.ok && res.reason === "ACTION_NOT_FOUND") {
      return reply.code(500).send({ error: "Action 'video_resume_play' manquante en BDD." });
    }

    return reply.send({ ok: true });
  } catch (err) {
    console.error("❌ logVideoResumePlay:", err);
    return reply.code(500).send({ error: "Erreur serveur." });
  }
};
