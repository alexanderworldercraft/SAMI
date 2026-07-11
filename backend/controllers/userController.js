// controllers/userController.js

import { userRepository } from '../models/user.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import { subDays } from 'date-fns';
import { createLog, getClientIp } from "./logController.js";
import { prisma } from "../services/db.js";
import { ADMIN_GRADE_IDS, AUTH_COOKIE_NAME, ETAT, GRADE, MULTIPART_LIMITS } from "../constants.js";
import { ensureSuperAdmin } from "../services/authz.js";
import { getJwtFromRequest } from "../middlewares/authMiddleware.js";
import { isMultipartFileTooLargeError, sendMultipartFileTooLarge } from "../utils/multipartErrors.js";
import {
  computePremiumEndDate,
  createFakePaymentEvent,
  isAllowedPremiumPlan,
  verifyFakePaymentPayload,
} from "../services/payment/fakePremiumPaymentService.js";
import {
  buildFavoriteContentSummaryPayload,
  buildUserFavoritesPayload,
  getFavoriteStatus,
  toggleFavoriteContent,
} from "../services/favoriteContentService.js";

// Durée de vie des tokens par GradeID
// 1 = SuperAdmin, 2 = Admin, 3 = Utilisateur
const TOKEN_EXPIRATIONS_BY_GRADE = {
  1: '4h',   // SuperAdmin
  2: '8h',   // Admin
  3: '30d',  // Utilisateur standard
};

// Valeur par défaut si GradeID est absent ou non mappé
const TOKEN_DEFAULT_EXPIRATION = '12h';

const TOKEN_EXPIRATION_SECONDS = Object.freeze({
  "4h": 4 * 60 * 60,
  "8h": 8 * 60 * 60,
  "12h": 12 * 60 * 60,
  "30d": 30 * 24 * 60 * 60,
});

// Choisit la durée de vie du token en fonction du grade de l'utilisateur
function getTokenExpirationForUser(user) {
  if (user.GradeID && TOKEN_EXPIRATIONS_BY_GRADE[user.GradeID]) {
    return TOKEN_EXPIRATIONS_BY_GRADE[user.GradeID];
  }

  return TOKEN_DEFAULT_EXPIRATION;
}

function getTokenMaxAgeSeconds(expiration) {
  return TOKEN_EXPIRATION_SECONDS[expiration] || TOKEN_EXPIRATION_SECONDS[TOKEN_DEFAULT_EXPIRATION];
}

function shouldUseSecureCookie() {
  return process.env.COOKIE_SECURE === "true"
    || process.env.NODE_ENV === "production"
    || (process.env.PUBLIC_URL || "").startsWith("https://")
    || Boolean(process.env.HTTPS);
}

function buildAuthCookie(value, maxAgeSeconds) {
  const secure = shouldUseSecureCookie() ? " Secure;" : "";
  return [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    secure.trim(),
  ].filter(Boolean).join("; ");
}

function setReplyHeader(reply, name, value) {
  if (typeof reply.header === "function") {
    reply.header(name, value);
  }
}

function clearAuthCookie(reply) {
  setReplyHeader(
    reply,
    "Set-Cookie",
    `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${shouldUseSecureCookie() ? "; Secure" : ""}`
  );
}

function getDecodedAuthUser(request) {
  if (request.user) return request.user;

  const token = getJwtFromRequest(request);
  if (!token) return null;

  return jwt.verify(token, secretKey);
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
  });
}

// 🔐 Protection anti-brute-force (en mémoire, par process)
const loginAttempts = new Map(); // key: "user:surnom" ou "ip:xxx"
const LOGIN_MAX_ATTEMPTS = 3;
const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Génère une clé d'identification pour les tentatives (priorité au surnom)
function getClientKey(request) {
  try {
    const { surnom } = request.body || {};
    if (surnom) {
      return `user:${surnom}`;
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
  const entry = loginAttempts.get(key) || { attempts: 0, lockUntil: null };

  // On incrémente le compteur
  entry.attempts += 1;
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

const secretKey = process.env.JWT_SECRET;

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

function validatePassword(password) {
  const minLength = 8;
  const maxLength = 20;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (
    password.length < minLength ||
    password.length > maxLength ||
    !hasUpperCase ||
    !hasLowerCase ||
    !hasNumber ||
    !hasSpecialChar
  ) {
    return false;
  }
  return true;
}

// Génère un mot de passe temporaire conforme aux règles de complexité
function generateTemporaryPassword(length = 12) {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";
  const special = "!@#$%^&*(),.?\":{}|<>";
  const all = upper + lower + digits + special;

  // on s'assure d'avoir au moins un caractère de chaque type
  let password = "";
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += digits[Math.floor(Math.random() * digits.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // le reste au hasard
  for (let i = password.length; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  // petite permutation pour éviter d'avoir toujours les 4 premiers types dans le même ordre
  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

// Envoi de l'email avec le mot de passe temporaire
async function sendPasswordResetEmail(to, surnom, tempPassword) {
  // ⚠️ Nécessite la config SMTP dans le .env :
  // SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: false, // passe à true si tu utilises le port 465
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const from = process.env.SMTP_FROM || `"SAMI" <no-reply@sami.local>`;
  const subject = "Réinitialisation de votre mot de passe SAMI";
  const text =
    `Bonjour ${surnom},

Un nouveau mot de passe temporaire a été généré pour votre compte SAMI.

Nouveau mot de passe temporaire : ${tempPassword}

Connectez-vous avec ce mot de passe puis changez-le dans vos paramètres dès que possible.

Si vous n'êtes pas à l'origine de cette demande, il est conseillé de prévenir l'administrateur.

— SAMI`;

  await transporter.sendMail({
    from,
    to,
    subject,
    text,
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
      reply.status(500).send({ error: 'Internal Server Error', message: err.message });
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
      reply.status(500).send({ error: "Internal Server Error", message: err.message });
    }
  },

  async login(request, reply) {
    try {
      const { surnom, motDePasse } = request.body;

      if (!surnom || !motDePasse) {
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
      if (user.EtatID === 3) {
        return reply.status(403).send({
          error: 'Votre compte est bloqué. Veuillez contacter l\'administrateur.',
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

      // 6) Durée de vie dynamique du token selon le grade
      const tokenExpiration = getTokenExpirationForUser(user);

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

      // Génération du token JWT avec durée personnalisée
      const token = jwt.sign(
        { userId: user.UtilisateurID, surnom: user.Surnom },
        process.env.JWT_SECRET,
        { expiresIn: tokenExpiration }
      );

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

      setReplyHeader(reply, "Set-Cookie", buildAuthCookie(token, getTokenMaxAgeSeconds(tokenExpiration)));
      reply.send({ message: "Connexion réussie" });
    } catch (err) {
      console.error('Error in login:', err);
      reply.status(500).send({ error: 'Internal Server Error', message: err.message });
    }
  },

  async logout(request, reply) {
    try {
      const token = getJwtFromRequest(request);
      const decoded = token ? jwt.verify(token, process.env.JWT_SECRET) : null;
      const userId = decoded?.userId;

      const action = userId
        ? await prisma.action.findUnique({ where: { Nom: 'deconnexion' } })
        : null;

      if (action && userId) {
        await createLog({
          request,
          UtilisateurID: userId,
          ActionNom: "deconnexion",
        });
      }

      clearAuthCookie(reply);
      reply.send({ message: 'Déconnexion enregistrée' });
    } catch (err) {
      console.error('Error in logout:', err);
      clearAuthCookie(reply);
      reply.status(200).send({ message: 'Déconnexion enregistrée' });
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
      const decoded = getDecodedAuthUser(request);
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
      const decoded = getDecodedAuthUser(request);
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
      const decoded = getDecodedAuthUser(request);
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
      const decoded = getDecodedAuthUser(request);
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
      const decoded = getDecodedAuthUser(request);
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

        const hashedPassword = await bcrypt.hash(newPassword, user.Salt);
        updateData.MotDePasse = hashedPassword;
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
      const updatedUser = await userRepository.updateUserById(userId, updateData);

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

      reply.send({ message: 'User updated successfully', user: updatedUser });
    } catch (err) {
      if (isMultipartFileTooLargeError(err)) return sendMultipartFileTooLarge(reply);
      console.error('Error in updateUser:', err);
      reply.status(500).send({ error: 'Internal Server Error', message: err.message });
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
      // console.log("Admins récupérés:", admins); // Logguer les admins récupérés
      const admins = adminsBrut.map((admin) => ({
        ...admin,
        isPremium: isUserPremium(admin),
      }));

      reply.send(admins);
    } catch (err) {
      console.error("Error in getAdmins:", err);
      reply.status(500).send({ error: "Internal Server Error", message: err.message });
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
      reply.status(500).send({ error: "Internal Server Error", message: err.message });
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
      const updatedUser = await userRepository.updateUserById(userId, {
        EtatID: newEtat,
      });

      if (!updatedUser) {
        return reply.status(404).send({ error: "User not found" });
      }

      reply.send({
        message: `L'état de l'utilisateur a été modifié avec succès.`,
        user: updatedUser,
      });
    } catch (err) {
      console.error("Error in changeUserEtat:", err);
      reply.status(500).send({ error: "Internal Server Error", message: err.message });
    }
  },

  async changeEtat(request, reply) {
    try {
      const token = request.headers["authorization"]?.split(" ")[1];
      if (!token) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const decoded = jwt.verify(token, secretKey);
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
      reply.status(500).send({ error: "Internal Server Error", message: err.message });
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

      console.log("User avant suppression:", user);

      const currentTimestamp = new Date().toISOString().replace(/[:.]/g, "-");

      const deletedEmail =
        ADMIN_GRADE_IDS.includes(user.GradeID)
          ? "Admin@delete.com"
          : "Utilisateur@delete.com";

      const deletedMotDePasse = await bcrypt.hash("deleted", 10);

      // Mettre à jour l'utilisateur dans la BDD
      let updatedUser;
      try {
        updatedUser = await userRepository.updateUserById(user.UtilisateurID, {
          Surnom: `delete-${currentTimestamp}`,
          Email: deletedEmail,
          MotDePasse: deletedMotDePasse,
          CheminImage: null,
          EtatID: ETAT.DELETED,
        });
        console.log("Utilisateur mis à jour :", updatedUser);
      } catch (err) {
        console.error("Erreur lors de la mise à jour de l'utilisateur :", err);
        throw err;
      }

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
      reply.status(500).send({ error: "Erreur interne du serveur.", message: err.message });
    }
  },

  async resetPassword(request, reply) {
    try {
      const { surnom, email } = request.body || {};

      if (!surnom || !email) {
        return reply
          .status(400)
          .send({ error: "Surnom et email sont obligatoires." });
      }

      const user = await prisma.utilisateur.findFirst({
        where: {
          Surnom: surnom,
          Email: email,
        },
      });

      if (!user) {
        // 🔐 Tentative de reset avec combo Surnom + Email invalide
        try {
          // On récupère l'action d'échec
          const actionFail = await prisma.action.findUnique({
            where: { Nom: 'reset_mot_de_passe_echec' },
          });

          if (actionFail) {
            const logsToCreate = [];

            // 1) On vérifie si le surnom existe pour un user
            const userBySurnom = await prisma.utilisateur.findFirst({
              where: { Surnom: surnom },
            });

            if (userBySurnom) {
              logsToCreate.push(userBySurnom.UtilisateurID);
            }

            // 2) On vérifie si l'email existe pour un user
            const userByEmail = await prisma.utilisateur.findFirst({
              where: { Email: email },
            });

            // Si l'email correspond à un autre compte, on log aussi
            if (
              userByEmail &&
              (!userBySurnom || userByEmail.UtilisateurID !== userBySurnom.UtilisateurID)
            ) {
              logsToCreate.push(userByEmail.UtilisateurID);
            }

            // 3) Création des logs (un par utilisateur concerné)
            await Promise.all(
              logsToCreate.map((utilisateurId) =>
                prisma.log.create({
                  data: {
                    UtilisateurID: utilisateurId,
                    ActionID: actionFail.ActionID,
                    // DateAction = now() par défaut
                  },
                })
              )
            );
          } else {
            console.warn("Action 'reset_mot_de_passe_echec' non trouvée dans la table Action");
          }
        } catch (logErr) {
          console.error("Erreur lors du log de tentative de reset échouée :", logErr);
          // On ne bloque pas la réponse pour un problème de log
        }

        // ⚠️ Côté API : on reste volontairement vague,
        // pour ne pas donner d’info à un attaquant.
        return reply
          .status(404)
          .send({ error: "Aucun compte ne correspond à ce surnom et cet email." });
      }


      const tempPassword = generateTemporaryPassword(12);

      const salt = user.Salt || (await bcrypt.genSalt(10));
      const hashedPassword = await bcrypt.hash(tempPassword, salt);

      await prisma.utilisateur.update({
        where: { UtilisateurID: user.UtilisateurID },
        data: {
          MotDePasse: hashedPassword,
          Salt: salt,
        },
      });

      // 🔎 Log de la réinitialisation de mot de passe
      try {
        // On récupère l'action correspondante dans la table Action
        const action = await prisma.action.findUnique({
          where: { Nom: 'reset_mot_de_passe' }, // ⚠️ doit exister en BDD
        });

        if (action) {
          // On crée une entrée dans Log
          await prisma.log.create({
            data: {
              UtilisateurID: user.UtilisateurID,
              ActionID: action.ActionID,
              // DateAction est auto @default(now()) dans le schéma
            },
          });
        } else {
          console.warn("Action 'reset_mot_de_passe' non trouvée dans la table Action");
        }
      } catch (logErr) {
        console.error("Erreur lors de la création du log de reset mot de passe :", logErr);
        // On ne bloque pas l'utilisateur pour un problème de log
      }

      const isDev = process.env.NODE_ENV !== 'production';

      try {
        await sendPasswordResetEmail(user.Email, user.Surnom, tempPassword);

        // ✅ Cas normal : tout s'est bien passé
        return reply.send({
          message: "Un mot de passe temporaire a été généré et envoyé par email.",
        });
      } catch (mailErr) {
        console.error("Erreur lors de l'envoi de l'email de reset:", mailErr);

        if (isDev) {
          // 💻 MODE DEV : on ne bloque pas, on renvoie le mot de passe temporaire
          return reply.send({
            message:
              "Mot de passe temporaire généré, mais l'email n'a pas pu être envoyé (mode développement).",
            tempPassword, // ⚠️ À NE SURTOUT PAS GARDER EN PROD
          });
        }

        // 🌐 PROD : on reste strict
        return reply.status(500).send({
          error:
            "Le mot de passe a été réinitialisé, mais l'email n'a pas pu être envoyé. Contacte l'administrateur.",
        });
      }
    } catch (err) {
      console.error("Error in resetPassword:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error", message: err.message });
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
        .send({ error: "Internal Server Error", message: err.message });
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
        .send({ error: "Internal Server Error", message: err.message });
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
        .send({ error: "Internal Server Error", message: err.message });
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
        .send({ error: "Internal Server Error", message: err.message });
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
        .send({ error: "Internal Server Error", message: err.message });
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
        .send({ error: "Internal Server Error", message: err.message });
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
        .send({ error: "Internal Server Error", message: err.message });
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
        .send({ error: err.statusCode ? err.message : "Internal Server Error", message: err.message });
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

      const users = usersBrut.map((u) => ({
        ...u,
        isPremium: isUserPremium(u),
      }));

      return reply.send(users);
    } catch (err) {
      console.error("Error in getUsersForAdminPanel:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error", message: err.message });
    }
  },

  async createFakePremiumCheckout(request, reply) {
    try {
      const { userId } = request.user;
      const { plan } = request.body;

      if (!isAllowedPremiumPlan(plan)) {
        return reply
          .status(400)
          .send({ error: "Plan d'abonnement invalide." });
      }

      const event = createFakePaymentEvent({ userId, plan });
      return userController.handleFakePremiumPaymentEvent(request, reply, event.payload, event.signature);
    } catch (err) {
      console.error("Error in createFakePremiumCheckout:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error", message: err.message });
    }
  },

  async fakePremiumPaymentWebhook(request, reply) {
    try {
      const signature = request.headers["x-fake-payment-signature"];
      return userController.handleFakePremiumPaymentEvent(request, reply, request.body, signature);
    } catch (err) {
      console.error("Error in fakePremiumPaymentWebhook:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error", message: err.message });
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
      if (!Number.isInteger(userId) || !isAllowedPremiumPlan(plan)) {
        return reply.status(400).send({ error: "Payload de paiement invalide." });
      }

      const newPremiumEndDate = computePremiumEndDate(plan);

      const updatedUser = await prisma.utilisateur.update({
        where: { UtilisateurID: userId },
        data: {
          PremiumEndDate: newPremiumEndDate,
        },
        select: {
          UtilisateurID: true,
          PremiumEndDate: true,
          GradeID: true,
        },
      });

      let isPremium = false;
      if (updatedUser.PremiumEndDate) {
        const end = new Date(updatedUser.PremiumEndDate);
        isPremium = end > new Date();
      }

      await createLog({
        request,
        UtilisateurID: userId,
        ActionNom: "premium_payment_fake",
        Champ: "PremiumEndDate",
        NouvelleValeur: updatedUser.PremiumEndDate ? updatedUser.PremiumEndDate.toISOString() : null,
        Meta: {
          paymentId: payload.paymentId,
          plan,
          provider: payload.provider,
        },
      });

      return reply.send({
        message:
          plan === "FREE"
            ? "Votre abonnement premium a été désactivé."
            : plan === "MONTHLY"
              ? "Abonnement premium mensuel activé (fake)."
              : "Abonnement premium annuel activé (fake).",
        PremiumEndDate: updatedUser.PremiumEndDate,
        isPremium,
      });
    } catch (err) {
      console.error("Error in handleFakePremiumPaymentEvent:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error", message: err.message });
    }
  },

};
