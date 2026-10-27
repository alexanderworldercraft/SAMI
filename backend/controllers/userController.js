// controllers/userController.js

import { userRepository } from '../models/user.js';
import crypto from 'node:crypto';
import bcrypt from 'bcrypt';

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { subDays } from 'date-fns';
import { createLog, getClientIp } from "./logController.js";
import { prisma } from "../services/db.js";
import { ADMIN_GRADE_IDS, ETAT, GRADE, MULTIPART_LIMITS } from "../constants.js";
import { ensureSuperAdmin } from "../services/authz.js";
import { getJwtFromRequest } from "../middlewares/authMiddleware.js";
import { isMultipartFileTooLargeError, sendMultipartFileTooLarge } from "../utils/multipartErrors.js";
import {
  createFakePaymentEvent,
  isAllowedPremiumPlan,
  verifyFakePaymentPayload,
} from "../services/payment/fakePremiumPaymentService.js";
import {
  changePremiumPlan,
  getPremiumSubscription,
} from "../services/payment/premiumSubscriptionService.js";
import {
  buildFavoriteContentSummaryPayload,
  buildUserFavoritesPayload,
  getFavoriteStatus,
  toggleFavoriteContent,
} from "../services/favoriteContentService.js";
import { issueUserSession, verifyUserSession, invalidateUserSessions, notifySessionsRevoked, notifySessionRevoked } from "../services/userSessionService.js";
import { passwordRecoveryService } from "../services/passwordRecoveryService.js";
import { validatePassword } from "../services/passwordPolicy.js";
import { buildAuthCookie, clearAuthCookie, setReplyHeader } from "../services/authCookie.js";

async function getDecodedAuthUser(request) {
  if (request.user) return request.user;
  const token = getJwtFromRequest(request);
  return token ? verifyUserSession(token) : null;
}

function isUserPremium(user) {
  if (!user?.PremiumEndDate) return false;

  const now = new Date();
  const end = new Date(user.PremiumEndDate);
  return end > now;
}

async function buildWatchHistoryPayload(userId, limit) {
  const actions = await prisma.action.findMany({
    where: { Nom: { in: ["video_first_play", "video_resume_play"] } },
    select: { ActionID: true, Nom: true },
  });

  if (!actions.length) {
    return [];
  }

  const actionById = new Map(actions.map((action) => [action.ActionID, action.Nom]));

  const logs = await prisma.log.findMany({
    where: {
      UtilisateurID: userId,
      ActionID: { in: actions.map((action) => action.ActionID) },
    },
    orderBy: { DateAction: "desc" },
    take: limit,
    select: {
      LogID: true,
      ActionID: true,
      DateAction: true,
      VideoID: true,
      SeriesID: true,
      SaisonID: true,
      AncienneValeur: true,
      Meta: true,
    },
  });

  const deletedVideoIdFromLog = (log) => {
    const meta = log.Meta && typeof log.Meta === "object" && !Array.isArray(log.Meta)
      ? log.Meta
      : {};
    const id = Number(meta.deletedVideoId ?? meta.VideoID ?? meta.videoId);
    return Number.isInteger(id) ? id : null;
  };

  const videoIds = logs
    .map((log) => log.VideoID || deletedVideoIdFromLog(log))
    .filter(Boolean);
  const videos = videoIds.length > 0
    ? await prisma.video.findMany({
        where: { VideoID: { in: videoIds } },
        select: {
          VideoID: true,
          Titre: true,
          CheminImage: true,
          EtatID: true,
          SaisonID: true,
          Saison: {
            select: {
              Numero: true,
              Series: {
                select: {
                  SeriesID: true,
                  Titre: true,
                  CheminImage: true,
                },
              },
            },
          },
        },
      })
    : [];

  const videoById = new Map(videos.map((video) => [video.VideoID, video]));
  const seriesIds = Array.from(
    new Set(
      videos
        .map((video) => video.Saison?.Series?.SeriesID)
        .filter(Boolean)
    )
  );

  const seriesFirstEpisodes = seriesIds.length > 0
    ? await prisma.series.findMany({
        where: { SeriesID: { in: seriesIds } },
        select: {
          SeriesID: true,
          Saisons: {
            orderBy: { Numero: "asc" },
            take: 1,
            select: {
              Episodes: {
                where: { EtatID: ETAT.ACTIVE },
                orderBy: { Titre: "asc" },
                take: 1,
                select: { VideoID: true },
              },
            },
          },
        },
      })
    : [];

  const firstEpisodeBySeriesId = new Map(
    seriesFirstEpisodes.map((serie) => [
      serie.SeriesID,
      serie.Saisons?.[0]?.Episodes?.[0]?.VideoID || null,
    ])
  );

  return logs.map((log) => {
    const deletedVideoId = deletedVideoIdFromLog(log);
    const meta = log.Meta && typeof log.Meta === "object" && !Array.isArray(log.Meta)
      ? log.Meta
      : {};
    const videoId = log.VideoID || deletedVideoId;
    const video = videoId ? videoById.get(videoId) : null;
    if (video?.EtatID === ETAT.BLOCKED) return null;
    const series = video?.Saison?.Series || null;
    const isDeletedVideo = !video || video.EtatID === 2;
    const deletedSeriesId = Number(meta.deletedSeriesId ?? log.SeriesID);
    const fallbackSeries = Number.isInteger(deletedSeriesId) && deletedSeriesId > 0
      ? {
          SeriesID: deletedSeriesId,
          Titre: meta.deletedSeriesTitre || "Série supprimée",
          CheminImage: null,
          FirstEpisodeID: null,
          Deleted: true,
        }
      : null;

    return {
      LogID: log.LogID ? log.LogID.toString() : null,
      ActionNom: actionById.get(log.ActionID) || null,
      DateAction: log.DateAction,
      Meta: log.Meta || null,
      Video: videoId
        ? {
            VideoID: videoId,
            Titre: video?.Titre || log.AncienneValeur || `Video ${videoId}`,
            CheminImage: video?.CheminImage || null,
            SaisonID: video?.SaisonID ?? log.SaisonID ?? null,
            SaisonNumero: video?.Saison?.Numero ?? null,
            Deleted: isDeletedVideo,
          }
        : null,
      Series: series
        ? {
            SeriesID: series.SeriesID,
            Titre: series.Titre,
            CheminImage: series.CheminImage,
            FirstEpisodeID: firstEpisodeBySeriesId.get(series.SeriesID) || null,
          }
        : fallbackSeries,
    };
  }).filter(Boolean);
}

async function getLastActivityByUserIds(userIds) {
  const normalizedUserIds = Array.from(
    new Set(
      userIds
        .map(Number)
        .filter((userId) => Number.isInteger(userId) && userId > 0)
    )
  );

  if (normalizedUserIds.length === 0) {
    return new Map();
  }

  const rows = await prisma.log.groupBy({
    by: ["UtilisateurID", "ActionID"],
    where: {
      UtilisateurID: { in: normalizedUserIds },
    },
    _max: {
      DateAction: true,
    },
  });

  const latestRows = new Map();
  for (const row of rows) {
    const current = latestRows.get(row.UtilisateurID);
    const date = row._max.DateAction;
    if (!date) continue;

    if (!current || date > current.DateAction) {
      latestRows.set(row.UtilisateurID, {
        DateAction: date,
        ActionID: row.ActionID,
      });
    }
  }

  const actionIds = Array.from(new Set([...latestRows.values()].map((row) => row.ActionID)));
  const actions = actionIds.length > 0
    ? await prisma.action.findMany({
        where: { ActionID: { in: actionIds } },
        select: { ActionID: true, Nom: true },
      })
    : [];
  const actionNameById = new Map(actions.map((action) => [action.ActionID, action.Nom]));

  return new Map(
    [...latestRows.entries()].map(([userId, row]) => [
      userId,
      {
        DateAction: row.DateAction,
        ActionNom: actionNameById.get(row.ActionID) || null,
      },
    ])
  );
}

// 🔐 Protection anti-brute-force (en mémoire, par process)
const loginAttempts = new Map();
let lastLoginAttemptCleanup = 0; // key: "user:surnom" ou "ip:xxx"
const LOGIN_MAX_ATTEMPTS = 3;
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Génère une clé d'identification pour les tentatives (priorité au surnom)
function getClientKey(request) {
  try {
    const { surnom } = request.body || {};
    if (surnom) {
      return `user:${String(surnom).trim().normalize("NFKC").toLowerCase()}`;
    }
  } catch (e) {
    // ignore
  }

  const ip = getClientIp(request) || 'unknown';

  return `ip:${ip}`;
}

// Retourne les infos de lock si encore actif, sinon nettoie
function getLockInfo(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (entry.expiresAt <= now) { loginAttempts.delete(key); return null; }

  if (entry.lockUntil && entry.lockUntil > now) {
    return {
      remainingMs: entry.lockUntil - now,
      attempts: entry.attempts || 0,
    };
  }

  // Lock expiré → on supprime l'entrée
  if (entry.lockUntil && entry.lockUntil <= now) {
    loginAttempts.delete(key);
  }

  return null;
}

// Enregistre un échec et retourne si on vient de passer en mode "lock"
function registerFailedLogin(key) {
  const now = Date.now();
  if (now - lastLoginAttemptCleanup >= 60_000) {
    for (const [entryKey, entry] of loginAttempts) if (entry.expiresAt <= now) loginAttempts.delete(entryKey);
    lastLoginAttemptCleanup = now;
  }
  if (!loginAttempts.has(key) && loginAttempts.size >= 10000) return { justLocked: true, remainingAttempts: 0 };
  const entry = loginAttempts.get(key) || { attempts: 0, lockUntil: null };

  // On incrémente le compteur
  entry.attempts += 1;
  entry.expiresAt = now + LOGIN_LOCK_DURATION_MS;
  let justLocked = false;

  if (entry.attempts >= LOGIN_MAX_ATTEMPTS) {
    // On passe en mode lock
    entry.lockUntil = now + LOGIN_LOCK_DURATION_MS;
    entry.attempts = 0; // reset du compteur une fois locké
    justLocked = true;
  }

  loginAttempts.set(key, entry);

  // Calcul des tentatives restantes avant le lock (si pas encore locké)
  const remainingAttempts = justLocked
    ? 0
    : Math.max(0, LOGIN_MAX_ATTEMPTS - entry.attempts);

  return { entry, justLocked, remainingAttempts };
}

// Nettoie l'état brute-force quand le login réussit
function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

// Recrée __dirname pour les modules ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();


async function createUserFromMultipart(request, reply, gradeId) {
  const fields = {};
  let cheminImage = null;

  if (typeof request.parts === "function") {
    const parts = request.parts({ limits: { fileSize: MULTIPART_LIMITS.IMAGE_FILE_SIZE } });

    for await (const part of parts) {
      if (part.file) {
        const safeName = path.basename(part.filename || "profile-image");
        const fileName = `${Date.now()}-${safeName}`;
        const uploadPath = path.join(__dirname, "../uploads/pp", fileName);

        await fs.promises.writeFile(uploadPath, await part.toBuffer());
        cheminImage = `/uploads/pp/${fileName}`;
      } else {
        fields[part.fieldname] = part.value;
      }
    }
  } else {
    Object.assign(fields, request.body || {});
    cheminImage = fields.cheminImage || fields.CheminImage || null;
  }

  const { surnom, email, motDePasse } = fields;

  if (!surnom || !email || !motDePasse) {
    reply.status(400).send({ error: "Surnom, Email, and Mot de Passe are required" });
    return null;
  }

  if (!validatePassword(motDePasse)) {
    reply.status(400).send({
      error:
        "Le mot de passe doit contenir entre 8 et 20 caractères, inclure une majuscule, une minuscule, un chiffre et un caractère spécial.",
    });
    return null;
  }

  const existingUser = await userRepository.getUserBySurnomOrEmail(surnom, email);
  if (existingUser) {
    reply.status(400).send({
      error:
        existingUser.Surnom === surnom
          ? "Ce surnom est déjà utilisé. Veuillez en choisir un autre."
          : "Cet email est déjà utilisé. Veuillez en choisir un autre.",
    });
    return null;
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(motDePasse, salt);

  return userRepository.createUser({
    Surnom: surnom,
    Email: email,
    MotDePasse: hashedPassword,
    CheminImage: cheminImage,
    Salt: salt,
    GradeID: gradeId,
    EtatID: ETAT.ACTIVE,
    PremiumEndDate: new Date(),
  });
}

export const userController = {

  async register(request, reply) {
    try {
      const user = await createUserFromMultipart(request, reply, GRADE.USER);
      if (!user) return;

      reply.send(user);
    } catch (err) {
      if (isMultipartFileTooLargeError(err)) return sendMultipartFileTooLarge(reply);
      console.error('Error in register:', err);
      reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async registerAdmin(request, reply) {
    try {
      const superAdmin = await ensureSuperAdmin(request, reply);
      if (!superAdmin) return;

      const user = await createUserFromMultipart(request, reply, GRADE.ADMIN);
      if (!user) return;

      await createLog({
        request,
        UtilisateurID: superAdmin.userId,
        ActionNom: "admin_create",
        Champ: "GradeID",
        NouvelleValeur: String(GRADE.ADMIN),
        Meta: {
          createdUserId: user.UtilisateurID,
          createdSurnom: user.Surnom,
        },
      });

      reply.send(user);
    } catch (err) {
      if (isMultipartFileTooLargeError(err)) return sendMultipartFileTooLarge(reply);
      console.error("Error in registerAdmin:", err);
      reply.status(500).send({ error: "Internal Server Error" });
    }
  },

  async login(request, reply) {
    try {
      const { surnom, motDePasse } = request.body;

      if (typeof surnom !== "string" || !surnom || surnom.length > 100
        || typeof motDePasse !== "string" || !motDePasse || motDePasse.length > 128) {
        return reply.status(400).send({ error: 'Surnom and Mot de Passe are required' });
      }

      const clientKey = getClientKey(request);

      // 1) Vérifier si un lock est déjà actif pour ce client (surnom ou IP)
      const lockInfo = getLockInfo(clientKey);
      if (lockInfo) {
        const remainingSeconds = Math.ceil(lockInfo.remainingMs / 1000);

        return reply.status(429).send({
          error: 'Trop de tentatives de connexion. Réessaie plus tard.',
          lockRemaining: remainingSeconds,
        });
      }

      // 2) Récupérer l'utilisateur
      const user = await userRepository.getUserBySurnom(surnom);

      if (!user) {
        // On ne dit pas si le surnom existe ou pas → réponse générique
        const { justLocked, remainingAttempts } = registerFailedLogin(clientKey);

        // Ici, pas d'UtilisateurID → on ne log pas dans Log (tu pourrais log par IP dans une autre table si tu veux, plus tard)
        if (justLocked) {
          // Lock déclenché, on renvoie un 429
          return reply.status(429).send({
            error: 'Trop de tentatives de connexion. Réessaie plus tard.',
            lockRemaining: Math.ceil(LOGIN_LOCK_DURATION_MS / 1000),
          });
        }

        return reply.status(401).send({
          error: 'Identifiants invalides.',
          attemptsRemaining: remainingAttempts,
        });
      }

      // 3) Compte explicitement bloqué côté BDD
      if (user.EtatID !== ETAT.ACTIVE) {
        return reply.status(403).send({
          error: 'Ce compte est inactif. Veuillez contacter l\'administrateur.',
        });
      }

      // 4) Vérifier le mot de passe
      const isPasswordValid = await bcrypt.compare(motDePasse, user.MotDePasse);
      if (!isPasswordValid) {
        const { justLocked, remainingAttempts } = registerFailedLogin(clientKey);

        // Log de l'échec de connexion
        try {
          const actionFail = await prisma.action.findUnique({
            where: { Nom: 'connexion_echec' },
          });

          if (actionFail) {
            await createLog({
              request,
              UtilisateurID: user.UtilisateurID,
              ActionNom: "connexion_echec",
            });
          } else {
            console.warn("Action 'connexion_echec' non trouvée dans la table Action");
          }
        } catch (logErr) {
          console.error("Erreur lors du log d'échec de connexion :", logErr);
        }

        if (justLocked) {
          // On vient de déclencher le lock → log + 429
          try {
            const actionLock = await prisma.action.findUnique({
              where: { Nom: 'login_lock' },
            });

            if (actionLock) {
              await createLog({
                request,
                UtilisateurID: user.UtilisateurID,
                ActionNom: "login_lock",
              });
            } else {
              console.warn("Action 'login_lock' non trouvée dans la table Action");
            }
          } catch (logErr) {
            console.error("Erreur lors du log de verrouillage de login :", logErr);
          }

          return reply.status(429).send({
            error: 'Trop de tentatives de connexion. Réessaie plus tard.',
            lockRemaining: Math.ceil(LOGIN_LOCK_DURATION_MS / 1000),
          });
        }

        // Sinon, simple échec + info sur les tentatives restantes
        return reply.status(401).send({
          error: 'Identifiants invalides.',
          attemptsRemaining: remainingAttempts,
        });
      }

      // 5) Connexion réussie → on nettoie les tentatives brute-force
      clearLoginAttempts(clientKey);

      if (user.PasswordChangeRequired) {
        await passwordRecoveryService.consumeTemporaryPassword(user);
      }

      // 🔥 AJOUT : mise à jour de LastLogin
      try {
        await prisma.utilisateur.update({
          where: { UtilisateurID: user.UtilisateurID },
          data: {
            LastLogin: new Date(), // On enregistre la dernière connexion
          },
        });
      } catch (updateErr) {
        console.error("Erreur lors de la mise à jour de LastLogin :", updateErr);
        // On ne bloque pas la connexion pour un souci de log / BDD
      }

      const session = await issueUserSession(user, { scope: user.PasswordChangeRequired ? "password-change" : "session" });

      // 7) Log de la connexion
      try {
        const action = await prisma.action.findUnique({
          where: { Nom: 'connexion' },
        });

        if (action) {
          await createLog({
            request,
            UtilisateurID: user.UtilisateurID,
            ActionNom: "connexion",
          });
        } else {
          console.warn("Action 'connexion' non trouvée dans la table Action");
        }
      } catch (logErr) {
        console.error("Erreur lors du log de connexion :", logErr);
      }

      setReplyHeader(reply, "Set-Cookie", buildAuthCookie(session.token, session.maxAge));
      reply.header?.("Cache-Control", "no-store");
      reply.send({ message: "Connexion réussie", passwordChangeRequired: Boolean(user.PasswordChangeRequired) });
    } catch (err) {
      if (!err.statusCode) console.error('Login unavailable.');
      reply.status(err.statusCode || 500).send({ error: err.statusCode ? err.message : 'Connexion momentanément indisponible.' });
    }
  },

  async logout(request, reply) {
    const token = getJwtFromRequest(request);
    try {
      if (token) {
        let session;
        try { session = await verifyUserSession(token, { allowPasswordChange: true }); }
        catch (error) { if (error.statusCode !== 401) throw error; }
        if (session) {
          await prisma.userSession.deleteMany({ where: { UserSessionID: session.sessionId } });
          notifySessionRevoked(session.sessionId);
          try { await createLog({ request, UtilisateurID: session.userId, ActionNom: "deconnexion" }); }
          catch { console.warn("Journal de déconnexion indisponible."); }
        }
      }
      clearAuthCookie(reply);
      return reply.send({ message: "Déconnexion enregistrée" });
    } catch {
      // Keep the cookie so a retry can revoke the server-side session too.
      return reply.status(503).send({ error: "Déconnexion momentanément indisponible. Réessaie." });
    }
  },

  async updatePassword(request, reply) {
    const { surnom, oldPassword, newPassword } = request.body;

    const user = await userRepository.getUserBySurnom(surnom);
    if (!user) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.motDePasse);
    if (!isOldPasswordValid) {
      return reply.status(401).send({ error: 'Invalid old password' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, user.salt);
    await userRepository.updateUserPassword(surnom, hashedNewPassword);

    reply.send({ message: 'Password updated successfully' });
  },

  async deleteUser(request, reply) {
    try {
      const decoded = await getDecodedAuthUser(request);
      if (!decoded?.surnom) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const { surnom } = request.body;

      if (decoded.surnom !== surnom) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      await userRepository.deleteUserBySurnom(surnom);
      reply.send({ message: 'User deleted successfully' });
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  },

  async updateSurnom(request, reply) {
    try {
      const decoded = await getDecodedAuthUser(request);
      if (!decoded?.surnom) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const { newSurnom } = request.body;

      if (!newSurnom) {
        return reply.status(400).send({ error: 'New surnom is required' });
      }

      await userRepository.updateUserSurnom(decoded.surnom, newSurnom);
      reply.send({ message: 'Surnom updated successfully' });
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  },

  async updateEmail(request, reply) {
    try {
      const decoded = await getDecodedAuthUser(request);
      if (!decoded?.surnom) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const { newEmail } = request.body;

      if (!newEmail) {
        return reply.status(400).send({ error: 'New email is required' });
      }

      await userRepository.updateUserEmail(decoded.surnom, newEmail);
      reply.send({ message: 'Email updated successfully' });
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  },

  async updateProfileImage(request, reply) {
    try {
      const decoded = await getDecodedAuthUser(request);
      if (!decoded?.surnom) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const { cheminImage } = request.body;

      await userRepository.updateUserProfileImage(decoded.surnom, cheminImage);
      reply.send({ message: 'Profile image updated successfully' });
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  },

  async deleteProfileImage(request, reply) {
    try {
      const decoded = await getDecodedAuthUser(request);
      if (!decoded?.surnom) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      await userRepository.deleteUserProfileImage(decoded.surnom);
      reply.send({ message: 'Profile image deleted successfully' });
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  },

  async updateUser(request, reply) {
    try {
      const { userId } = request.user || {};
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const parts = request.parts({ limits: { fileSize: MULTIPART_LIMITS.IMAGE_FILE_SIZE } });
      let fields = {};
      let newImagePath = null;
      let oldImagePath = null; // Pour stocker le chemin de l'ancienne image si elle existe

      const user = await userRepository.getUserWithSecretById(userId); // Récupère les infos actuelles de l'utilisateur
      const idNumber = user?.UtilisateurID;
      const id = idNumber?.toString();

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Lire les champs et fichiers
      for await (const part of parts) {
        if (part.file) {
          const safeName = path.basename(part.filename || "profile-image");
          const fileName = `${Date.now()}-${safeName}`;
          const uploadPath = path.join(__dirname, '../uploads/pp/', id, '/', fileName);

          // Vérifier si le dossier existe
          const dirPath = path.join(__dirname, '../uploads/pp/', id);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }

          await fs.promises.writeFile(uploadPath, await part.toBuffer());
          newImagePath = `/uploads/pp/${id}/${fileName}`;
        } else {
          fields[part.fieldname] = part.value;
        }
      }

      // ⚠️ On déstructure APRES avoir lu tous les champs
      const { surnom, email, motDePasse, removeImage, currentPassword } = fields;

      // Sauvegarder l'ancien chemin d'image pour suppression ultérieure
      oldImagePath = user.CheminImage ? path.join(__dirname, `..${user.CheminImage}`) : null;

      // 🔐 1) Protection brute-force & vérification du mot de passe
      const clientKey = `user:${user.Surnom}`;
      const lockInfo = getLockInfo(clientKey);

      if (lockInfo) {
        const remainingSeconds = Math.ceil(lockInfo.remainingMs / 1000);
        return reply.status(429).send({
          error: "Trop de tentatives de vérification du mot de passe. Réessaie plus tard.",
          lockRemaining: remainingSeconds,
        });
      }

      if (!currentPassword) {
        return reply.status(400).send({
          error: "Le mot de passe est requis pour modifier les paramètres.",
        });
      }

      if (!user.MotDePasse) {
        return reply.status(500).send({
          error: "Mot de passe introuvable pour cet utilisateur. Contactez l’administrateur.",
        });
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.MotDePasse);
      if (!isPasswordValid) {
        const { justLocked, remainingAttempts } = registerFailedLogin(clientKey);

        // 📝 Log de l'échec de vérification du MDP
        try {
          const actionFail = await prisma.action.findUnique({
            where: { Nom: 'update_parametres_echec' },
          });

          if (actionFail) {
            await prisma.log.create({
              data: {
                UtilisateurID: user.UtilisateurID,
                ActionID: actionFail.ActionID,
              },
            });
          } else {
            console.warn("Action 'update_parametres_echec' non trouvée dans la table Action");
          }
        } catch (logErr) {
          console.error("Erreur lors du log d'échec de mise à jour de paramètres :", logErr);
        }

        if (justLocked) {
          // 📝 Log du lock
          try {
            const actionLock = await prisma.action.findUnique({
              where: { Nom: 'update_parametres_lock' },
            });

            if (actionLock) {
              await prisma.log.create({
                data: {
                  UtilisateurID: user.UtilisateurID,
                  ActionID: actionLock.ActionID,
                },
              });
            } else {
              console.warn("Action 'update_parametres_lock' non trouvée dans la table Action");
            }
          } catch (logErr) {
            console.error("Erreur lors du log de lock de mise à jour de paramètres :", logErr);
          }

          return reply.status(429).send({
            error: "Trop de tentatives de vérification du mot de passe. Réessaie plus tard.",
            lockRemaining: Math.ceil(LOGIN_LOCK_DURATION_MS / 1000),
          });
        }

        return reply.status(401).send({
          error: "Mot de passe incorrect.",
          attemptsRemaining: remainingAttempts,
        });
      }

      // ✅ Mot de passe OK → on réinitialise les tentatives
      clearLoginAttempts(clientKey);

      const updateData = {};

      // 🔐 2) Gestion du changement de mot de passe (optionnel)
      if (motDePasse) {
        const { oldPassword, newPassword, confirmPassword } = JSON.parse(motDePasse);

        // Vérifiez que tous les champs sont présents
        if (!oldPassword || !newPassword || !confirmPassword) {
          return reply.status(400).send({ error: "Tous les champs de mot de passe sont requis." });
        }

        // Vérifiez que l'ancien mot de passe correspond bien (double garde-fou)
        const isOldPasswordValid = await bcrypt.compare(oldPassword, user.MotDePasse);
        if (!isOldPasswordValid) {
          return reply.status(400).send({ error: "L'ancien mot de passe est incorrect." });
        }

        if (newPassword !== confirmPassword) {
          return reply.status(400).send({ error: "Le nouveau mot de passe et la confirmation ne correspondent pas." });
        }

        if (!validatePassword(newPassword)) {
          return reply.status(400).send({
            error:
              "Le nouveau mot de passe doit contenir entre 8 et 20 caractères, inclure une majuscule, une minuscule, un chiffre et un caractère spécial.",
          });
        }

        const salt = await bcrypt.genSalt(10);
        updateData.MotDePasse = await bcrypt.hash(newPassword, salt);
        updateData.Salt = salt;
      }

      if (surnom) updateData.Surnom = surnom;
      if (email) updateData.Email = email;

      // Gérer la suppression ou le remplacement de l'image
      if (removeImage === 'true') {
        updateData.CheminImage = null;
        newImagePath = null;
      } else if (newImagePath) {
        updateData.CheminImage = newImagePath;
      }

      // Mettre à jour les données de l'utilisateur
      const updatedUser = await prisma.$transaction(async tx => {
        const changed = await tx.utilisateur.updateMany({ where: { UtilisateurID: userId,
          AuthVersion: request.user.authVersion, EtatID: ETAT.ACTIVE }, data: updateData });
        if (changed.count !== 1) throw Object.assign(new Error("Session expirée."), { statusCode: 401 });
        if (updateData.MotDePasse || updateData.Email) {
          await tx.passwordRecovery.updateMany({ where: { UtilisateurID: userId, ConsumedAt: null }, data: { ConsumedAt: new Date() } });
          if (updateData.MotDePasse) return invalidateUserSessions(tx, userId);
        }
        return tx.utilisateur.findUnique({ where: { UtilisateurID: userId } });
      });
      if (updateData.MotDePasse) {
        notifySessionsRevoked(userId);
        const renewed = await issueUserSession(updatedUser);
        setReplyHeader(reply, "Set-Cookie", buildAuthCookie(renewed.token, renewed.maxAge));
      }

      // Supprimer l'ancienne image si une nouvelle est ajoutée ou si l'image est supprimée
      if ((removeImage === 'true' || newImagePath) && oldImagePath) {
        fs.unlink(oldImagePath, (err) => {
          if (err) {
            console.error(`Erreur lors de la suppression de l'image : ${err.message}`);
          } else {
            console.log(`Ancienne image supprimée : ${oldImagePath}`);
          }
        });
      }

      // 📝 Log de la mise à jour réussie
      try {
        const actionUpdate = await prisma.action.findUnique({
          where: { Nom: 'update_parametres' },
        });

        if (actionUpdate) {
          await prisma.log.create({
            data: {
              UtilisateurID: userId,
              ActionID: actionUpdate.ActionID,
            },
          });
        } else {
          console.warn("Action 'update_parametres' non trouvée dans la table Action");
        }
      } catch (logErr) {
        console.error("Erreur lors du log de mise à jour de paramètres :", logErr);
      }

      const { MotDePasse: _password, Salt: _salt, ...publicUser } = updatedUser;
      reply.send({ message: 'User updated successfully', user: publicUser });
    } catch (err) {
      if (isMultipartFileTooLargeError(err)) return sendMultipartFileTooLarge(reply);
      console.error('Error in updateUser:', err);
      reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async getAdmins(request, reply) {
    // console.log("getAdmins a été appelé"); // Log pour vérifier si la méthode est appelée
    try {
      const { userId } = request.user || {};
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      // Vérifier si l'utilisateur est superadmin ou admin
      const user = await userRepository.getUserById(userId);
      // console.log("Utilisateur récupéré:", user); // Logguer les infos utilisateur

      if (!user || !ADMIN_GRADE_IDS.includes(user.GradeID)) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const adminsBrut = await userRepository.getAdmins();
      const lastActivityByUserId = await getLastActivityByUserIds(
        adminsBrut.map((admin) => admin.UtilisateurID)
      );
      // console.log("Admins récupérés:", admins); // Logguer les admins récupérés
      const admins = adminsBrut.map((admin) => ({
        ...admin,
        LastActivity: lastActivityByUserId.get(admin.UtilisateurID)?.DateAction || null,
        LastActivityAction: lastActivityByUserId.get(admin.UtilisateurID)?.ActionNom || null,
        isPremium: isUserPremium(admin),
      }));

      reply.send(admins);
    } catch (err) {
      console.error("Error in getAdmins:", err);
      reply.status(500).send({ error: "Internal Server Error" });
    }
  },

  async getUsersByCriteria(request, reply) {
    try {
      const { userId } = request.user || {};
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      // Vérifier si l'utilisateur est superadmin ou admin
      const user = await userRepository.getUserById(userId);
      if (!user || !ADMIN_GRADE_IDS.includes(user.GradeID)) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const { gradeId = GRADE.USER, etatId = ETAT.ACTIVE } = request.query; // Paramètres par défaut : utilisateurs classiques actifs

      // Récupérer les utilisateurs correspondant aux critères
      const users = await userRepository.getUsersByCriteria(Number(gradeId), Number(etatId));
      reply.send(users);
    } catch (err) {
      console.error("Error in getUsersByCriteria:", err);
      reply.status(500).send({ error: "Internal Server Error" });
    }
  },

  async changeUserEtat(request, reply) {
    try {
      const { userId: currentUserId } = request.user || {};
      if (!currentUserId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      // Vérifie si l'utilisateur qui effectue l'action est SuperAdmin ou Admin
      const user = await userRepository.getUserById(currentUserId);
      if (!user || !ADMIN_GRADE_IDS.includes(user.GradeID)) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const { userId, newEtat } = request.body;

      // Vérifie les paramètres de la requête
      if (!userId || ![ETAT.ACTIVE, ETAT.BLOCKED].includes(newEtat)) {
        return reply.status(400).send({ error: "Invalid request parameters" });
      }

      // Met à jour l'état de l'utilisateur
      const updatedUser = await prisma.$transaction(async tx => {
        await tx.utilisateur.update({ where: { UtilisateurID: Number(userId) }, data: { EtatID: newEtat } });
        await tx.passwordRecovery.updateMany({ where: { UtilisateurID: Number(userId), ConsumedAt: null }, data: { ConsumedAt: new Date() } });
        return invalidateUserSessions(tx, Number(userId));
      });

      notifySessionsRevoked(Number(userId));
      if (!updatedUser) {
        return reply.status(404).send({ error: "User not found" });
      }

      const { MotDePasse: _password, Salt: _salt, ...publicUser } = updatedUser;
      reply.send({ message: "L'état de l'utilisateur a été modifié avec succès.", user: publicUser });
    } catch (err) {
      console.error("Error in changeUserEtat:", err);
      reply.status(500).send({ error: "Internal Server Error" });
    }
  },

  async changeEtat(request, reply) {
    try {
      const token = request.headers["authorization"]?.split(" ")[1];
      if (!token) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const decoded = await verifyUserSession(token);
      const user = await userRepository.getUserById(decoded.userId);

      // Vérifier si l'utilisateur est superadmin
      if (!user || user.GradeID !== GRADE.SUPER_ADMIN) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const { userId, newEtat } = request.body;
      const targetUser = await userRepository.getUserById(userId);

      // Empêcher de modifier les superadmins
      if (targetUser.GradeID === GRADE.SUPER_ADMIN) {
        return reply.status(403).send({ error: "Cannot modify a superadmin." });
      }

      // Modifier l'état de l'utilisateur
      await userRepository.updateUserEtat(userId, newEtat);

      reply.send({ message: "User state updated successfully." });
    } catch (err) {
      console.error("Error in changeEtat:", err);
      reply.status(500).send({ error: "Internal Server Error" });
    }
  },

  async deleteAccount(request, reply) {
    try {
      const { userId } = request.user || {};
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const { currentPassword } = request.body || {};

      const user = await userRepository.getUserWithSecretById(userId);
      if (!user) {
        console.log("Utilisateur introuvable");
        return reply.status(404).send({ error: "Utilisateur introuvable." });
      }

      // 🔐 1) Gestion du lock / brute-force
      const clientKey = `user:${user.Surnom}`;
      const lockInfo = getLockInfo(clientKey);

      if (lockInfo) {
        const remainingSeconds = Math.ceil(lockInfo.remainingMs / 1000);
        return reply.status(429).send({
          error: "Trop de tentatives de vérification du mot de passe. Réessaie plus tard.",
          lockRemaining: remainingSeconds,
        });
      }

      if (!currentPassword) {
        return reply.status(400).send({
          error: "Le mot de passe est requis pour supprimer le compte.",
        });
      }

      const isPasswordValid = await bcrypt.compare(currentPassword, user.MotDePasse);
      if (!isPasswordValid) {
        const { justLocked, remainingAttempts } = registerFailedLogin(clientKey);

        // 📝 Log de l'échec de MDP pour suppression
        try {
          const actionFail = await prisma.action.findUnique({
            where: { Nom: 'delete_account_echec' },
          });

          if (actionFail) {
            await prisma.log.create({
              data: {
                UtilisateurID: user.UtilisateurID,
                ActionID: actionFail.ActionID,
              },
            });
          } else {
            console.warn("Action 'delete_account_echec' non trouvée dans la table Action");
          }
        } catch (logErr) {
          console.error("Erreur lors du log d'échec de suppression de compte :", logErr);
        }

        if (justLocked) {
          // 📝 Log du lock
          try {
            const actionLock = await prisma.action.findUnique({
              where: { Nom: 'delete_account_lock' },
            });

            if (actionLock) {
              await prisma.log.create({
                data: {
                  UtilisateurID: user.UtilisateurID,
                  ActionID: actionLock.ActionID,
                },
              });
            } else {
              console.warn("Action 'delete_account_lock' non trouvée dans la table Action");
            }
          } catch (logErr) {
            console.error("Erreur lors du log de lock de suppression de compte :", logErr);
          }

          return reply.status(429).send({
            error: "Trop de tentatives de vérification du mot de passe. Réessaie plus tard.",
            lockRemaining: Math.ceil(LOGIN_LOCK_DURATION_MS / 1000),
          });
        }

        return reply.status(401).send({
          error: "Mot de passe incorrect.",
          attemptsRemaining: remainingAttempts,
        });
      }

      // ✅ Mot de passe OK → on réinitialise les tentatives
      clearLoginAttempts(clientKey);


      const currentTimestamp = new Date().toISOString().replace(/[:.]/g, "-");

      const deletedEmail =
        ADMIN_GRADE_IDS.includes(user.GradeID)
          ? "Admin@delete.com"
          : "Utilisateur@delete.com";

      const deletedMotDePasse = await bcrypt.hash(crypto.randomBytes(32).toString("base64url"), 10);

      // Mettre à jour l'utilisateur dans la BDD
      let updatedUser;
      try {
        updatedUser = await userRepository.updateUserById(user.UtilisateurID, {
          Surnom: `delete-${currentTimestamp}`,
          Email: deletedEmail,
          MotDePasse: deletedMotDePasse,
          CheminImage: null,
          EtatID: ETAT.DELETED,
          AuthVersion: { increment: 1 },
        });
      } catch (err) {
        console.error("Erreur lors de la mise à jour de l'utilisateur :", err);
        throw err;
      }

      notifySessionsRevoked(user.UtilisateurID);
      clearAuthCookie(reply);
      // Supprimer physiquement l'image de profil
      if (user.CheminImage) {
        const imagePath = path.join(__dirname, `..${user.CheminImage}`);
        console.log("Chemin de l'image à supprimer :", imagePath);

        fs.unlink(imagePath, (err) => {
          if (err) {
            console.error(`Erreur lors de la suppression de l'image : ${err.message}`);
          } else {
            console.log(`Image supprimée : ${imagePath}`);
          }
        });
      }

      // 📝 Log de la suppression de compte
      try {
        const actionDelete = await prisma.action.findUnique({
          where: { Nom: 'delete_account' },
        });

        if (actionDelete) {
          await prisma.log.create({
            data: {
              UtilisateurID: user.UtilisateurID,
              ActionID: actionDelete.ActionID,
            },
          });
        } else {
          console.warn("Action 'delete_account' non trouvée dans la table Action");
        }
      } catch (logErr) {
        console.error("Erreur lors du log de suppression de compte :", logErr);
      }

      reply.send({ message: "Compte supprimé avec succès." });
    } catch (err) {
      console.error("Error in deleteAccount:", err);
      reply.status(500).send({ error: "Erreur interne du serveur." });
    }
  },

  async getUserActivitySummary(request, reply) {
    try {
      const { userId } = request.user || {};
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      // Vérifier si l'utilisateur est Admin ou SuperAdmin
      const currentUser = await userRepository.getUserById(userId);
      if (!currentUser || !ADMIN_GRADE_IDS.includes(currentUser.GradeID)) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      // Nb de jours à analyser, par défaut 7
      const days = request.query.days ? Number(request.query.days) : 7;
      const sinceDate = subDays(new Date(), isNaN(days) ? 7 : days);

      // Récupérer les logs récents
      const logs = await prisma.log.findMany({
        where: {
          DateAction: {
            gte: sinceDate,
          },
        },
        include: {
          action: true, // Nom + Criticite
        },
      });

      const activityByUser = new Map();

      for (const log of logs) {
        const userId = log.UtilisateurID;
        const action = log.action;
        if (!action) continue;

        const crit = action.Criticite ?? 1;
        const actionName = action.Nom;

        if (!activityByUser.has(userId)) {
          activityByUser.set(userId, {
            totalLogsLastNDays: 0,
            byCriticite: {},
            byAction: {},
          });
        }

        const summary = activityByUser.get(userId);

        // total
        summary.totalLogsLastNDays += 1;

        // par criticité
        summary.byCriticite[crit] = (summary.byCriticite[crit] || 0) + 1;

        // par action (on stocke aussi les dates)
        if (!summary.byAction[actionName]) {
          summary.byAction[actionName] = {
            count: 0,
            dates: [], // liste des DateAction pour cette action
          };
        }

        summary.byAction[actionName].count += 1;
        summary.byAction[actionName].dates.push(log.DateAction);
      }

      if (activityByUser.size === 0) {
        return reply.send([]);
      }

      const userIds = Array.from(activityByUser.keys());
      const lastActivityByUserId = await getLastActivityByUserIds(userIds);

      // Infos de base des utilisateurs concernés
      const users = await prisma.utilisateur.findMany({
        where: {
          UtilisateurID: { in: userIds },
        },
        select: {
          UtilisateurID: true,
          Surnom: true,
          Email: true,
          CheminImage: true,
          EtatID: true,
          GradeID: true,
          CreateDate: true,
          LastLogin: true,
        },
      });

      // Fusion user + activity
      const result = users.map((user) => ({
        UtilisateurID: user.UtilisateurID,
        Surnom: user.Surnom,
        Email: user.Email,
        CheminImage: user.CheminImage,
        EtatID: user.EtatID,
        GradeID: user.GradeID,
        CreateDate: user.CreateDate,
        LastLogin: user.LastLogin,
        LastActivity: lastActivityByUserId.get(user.UtilisateurID)?.DateAction || null,
        LastActivityAction: lastActivityByUserId.get(user.UtilisateurID)?.ActionNom || null,
        activity: activityByUser.get(user.UtilisateurID) || {
          totalLogsLastNDays: 0,
          byCriticite: {},
          byAction: {},
        },
      }));

      return reply.send(result);
    } catch (err) {
      console.error("Error in getUserActivitySummary:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error" });
    }
  },

  async getUserWatchHistory(request, reply) {
    try {
      const currentUser = await userRepository.getUserById(request.user?.userId);
      if (!currentUser || !ADMIN_GRADE_IDS.includes(currentUser.GradeID)) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const userId = Number(request.params.userId);
      if (!Number.isInteger(userId)) {
        return reply.status(400).send({ error: "Invalid userId" });
      }

      const limitRaw = Number(request.query.limit);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 200;

      const response = await buildWatchHistoryPayload(userId, limit);
      return reply.send(response);
    } catch (err) {
      console.error("Error in getUserWatchHistory:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error" });
    }
  },

  async getMyWatchHistory(request, reply) {
    try {
      const userId = Number(request.user?.userId);
      if (!Number.isInteger(userId)) {
        return reply.status(400).send({ error: "Invalid userId" });
      }

      const limitRaw = Number(request.query.limit);
      const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 200;

      const response = await buildWatchHistoryPayload(userId, limit);
      return reply.send(response);
    } catch (err) {
      console.error("Error in getMyWatchHistory:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error" });
    }
  },

  async getMyFavorites(request, reply) {
    try {
      const userId = Number(request.user?.userId);
      if (!Number.isInteger(userId)) {
        return reply.status(400).send({ error: "Invalid userId" });
      }

      const response = await buildUserFavoritesPayload(userId);
      return reply.send(response);
    } catch (err) {
      console.error("Error in getMyFavorites:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error" });
    }
  },

  async getUserFavorites(request, reply) {
    try {
      const currentUser = await userRepository.getUserById(request.user?.userId);
      if (!currentUser || !ADMIN_GRADE_IDS.includes(currentUser.GradeID)) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const userId = Number(request.params.userId);
      if (!Number.isInteger(userId)) {
        return reply.status(400).send({ error: "Invalid userId" });
      }

      const response = await buildUserFavoritesPayload(userId);
      return reply.send(response);
    } catch (err) {
      console.error("Error in getUserFavorites:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error" });
    }
  },

  async getFavoriteSummary(request, reply) {
    try {
      const currentUser = await userRepository.getUserById(request.user?.userId);
      if (!currentUser || !ADMIN_GRADE_IDS.includes(currentUser.GradeID)) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const response = await buildFavoriteContentSummaryPayload({
        search: String(request.query?.search || ""),
        sort: request.query?.sort === "asc" ? "asc" : "desc",
        page: Number(request.query?.page || 1),
        take: Number(request.query?.take || 6),
      });
      return reply.send(response);
    } catch (err) {
      console.error("Error in getFavoriteSummary:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error" });
    }
  },

  async getFavoriteStatus(request, reply) {
    try {
      const userId = Number(request.user?.userId);
      if (!Number.isInteger(userId)) {
        return reply.status(400).send({ error: "Invalid userId" });
      }

      const items = Array.isArray(request.body?.items) ? request.body.items : [];
      const response = await getFavoriteStatus(userId, items);
      return reply.send(response);
    } catch (err) {
      console.error("Error in getFavoriteStatus:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error" });
    }
  },

  async toggleFavorite(request, reply) {
    try {
      const userId = Number(request.user?.userId);
      if (!Number.isInteger(userId)) {
        return reply.status(400).send({ error: "Invalid userId" });
      }

      const type = request.body?.type;
      const id = Number(request.body?.id);
      const response = await toggleFavoriteContent({ userId, type, id });

      await createLog({
        request,
        UtilisateurID: userId,
        ActionNom: response.IsFavorite ? "favorite_add" : "favorite_remove",
        VideoID: type === "video" ? id : null,
        SeriesID: type === "series" ? id : null,
        Champ: "favorite",
        AncienneValeur: response.IsFavorite ? "false" : "true",
        NouvelleValeur: response.IsFavorite ? "true" : "false",
        Meta: {
          contentType: type,
          contentId: id,
        },
      });

      return reply.send(response);
    } catch (err) {
      console.error("Error in toggleFavorite:", err);
      return reply
        .status(err.statusCode || 500)
        .send({ error: err.statusCode ? err.message : "Internal Server Error" });
    }
  },

  async getUsersForAdminPanel(request, reply) {
    try {
      const { userId } = request.user || {};
      if (!userId) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      // Vérifier si l'utilisateur est Admin ou SuperAdmin
      const currentUser = await userRepository.getUserById(userId);
      if (!currentUser || !ADMIN_GRADE_IDS.includes(currentUser.GradeID)) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const { gradeId = GRADE.USER, scope = "activeBlocked" } = request.query;

      const usersBrut = await userRepository.getUsersForAdminPanel(
        Number(gradeId),
        scope
      );
      const lastActivityByUserId = await getLastActivityByUserIds(
        usersBrut.map((user) => user.UtilisateurID)
      );

      const users = usersBrut.map((u) => ({
        ...u,
        LastActivity: lastActivityByUserId.get(u.UtilisateurID)?.DateAction || null,
        LastActivityAction: lastActivityByUserId.get(u.UtilisateurID)?.ActionNom || null,
        isPremium: isUserPremium(u),
      }));

      return reply.send(users);
    } catch (err) {
      console.error("Error in getUsersForAdminPanel:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error" });
    }
  },

  async getPremiumSubscription(request, reply) {
    reply.header("Cache-Control", "no-store");
    try {
      return reply.send(await getPremiumSubscription(Number(request.user.userId)));
    } catch (error) {
      if (!error.statusCode) console.error("Error in getPremiumSubscription:", error);
      return reply.status(error.statusCode || 500).send({ error: error.statusCode ? error.message : "Impossible de charger l'abonnement." });
    }
  },

  async createFakePremiumCheckout(request, reply) {
    try {
      const { userId } = request.user;
      const { plan } = request.body || {};

      if (!isAllowedPremiumPlan(plan)) {
        return reply
          .status(400)
          .send({ error: "Plan d'abonnement invalide." });
      }

      // Arrêter le renouvellement reste possible même lorsque l'API factice est désactivée.
      if (plan === "FREE") {
        const subscription = await changePremiumPlan(Number(userId), plan);
        return reply.send({ ...subscription, message: "Renouvellement arrêté. Votre accès Premium reste valable jusqu'à son échéance." });
      }
      const event = createFakePaymentEvent({ userId, plan });
      return await userController.handleFakePremiumPaymentEvent(request, reply, event.payload, event.signature);
    } catch (err) {
      if (!err.statusCode) console.error("Error in createFakePremiumCheckout:", err);
      return reply
        .status(err.statusCode || 500)
        .send({ error: err.statusCode ? err.message : "Internal Server Error" });
    }
  },

  async fakePremiumPaymentWebhook(request, reply) {
    try {
      const signature = request.headers["x-fake-payment-signature"];
      return await userController.handleFakePremiumPaymentEvent(request, reply, request.body, signature);
    } catch (err) {
      console.error("Error in fakePremiumPaymentWebhook:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error" });
    }
  },

  async handleFakePremiumPaymentEvent(request, reply, payload, signature) {
    try {
      if (!verifyFakePaymentPayload(payload, signature)) {
        return reply.status(401).send({ error: "Signature de paiement invalide." });
      }

      if (payload?.provider !== "fake" || payload?.event !== "premium.payment.succeeded") {
        return reply.status(400).send({ error: "Evénement de paiement invalide." });
      }

      const userId = Number(payload.userId);
      const plan = payload.plan;
      if (!Number.isSafeInteger(userId) || userId <= 0 || !isAllowedPremiumPlan(plan)
        || typeof payload.paymentId !== "string" || !/^[a-zA-Z0-9_.:-]{1,120}$/.test(payload.paymentId)) {
        return reply.status(400).send({ error: "Payload de paiement invalide." });
      }

      const subscription = await changePremiumPlan(userId, plan, { paymentId: payload.paymentId });
      if (!subscription.replayed) await createLog({
        request,
        UtilisateurID: userId,
        ActionNom: "premium_payment_fake",
        Champ: "PremiumEndDate",
        NouvelleValeur: subscription.PremiumEndDate ? new Date(subscription.PremiumEndDate).toISOString() : null,
        Meta: {
          paymentId: payload.paymentId,
          plan,
          provider: payload.provider,
          renewalPlan: subscription.renewalPlan,
        },
      });

      return reply.send({
        ...subscription,
        message:
          plan === "FREE"
            ? "Renouvellement arrêté. Votre accès Premium reste valable jusqu'à son échéance."
            : "Formule enregistrée. Le renouvellement automatique utilisera la formule choisie à l'échéance de votre période en cours (paiement factice).",
      });
    } catch (err) {
      if (!err.statusCode) console.error("Error in handleFakePremiumPaymentEvent:", err);
      return reply
        .status(err.statusCode || 500)
        .send({ error: err.statusCode ? err.message : "Internal Server Error" });
    }
  },

};
