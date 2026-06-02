// controllers/userController.js

import { userRepository } from '../models/user.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import { subDays } from 'date-fns';
import { createLog, getClientIp } from "./logController.js";

const prisma = new PrismaClient();

// Durée de vie des tokens par GradeID
// 1 = SuperAdmin, 2 = Admin, 3 = Utilisateur
const TOKEN_EXPIRATIONS_BY_GRADE = {
  1: '4h',   // SuperAdmin
  2: '8h',   // Admin
  3: '30d',  // Utilisateur standard
};

// Valeur par défaut si GradeID est absent ou non mappé
const TOKEN_DEFAULT_EXPIRATION = '12h';

// Choisit la durée de vie du token en fonction du grade de l'utilisateur
function getTokenExpirationForUser(user) {
  if (user.GradeID && TOKEN_EXPIRATIONS_BY_GRADE[user.GradeID]) {
    return TOKEN_EXPIRATIONS_BY_GRADE[user.GradeID];
  }

  return TOKEN_DEFAULT_EXPIRATION;
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
      Meta: true,
    },
  });

  const videoIds = logs.map((log) => log.VideoID).filter(Boolean);
  const videos = videoIds.length > 0
    ? await prisma.video.findMany({
        where: { VideoID: { in: videoIds } },
        select: {
          VideoID: true,
          Titre: true,
          CheminImage: true,
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
    const video = log.VideoID ? videoById.get(log.VideoID) : null;
    const series = video?.Saison?.Series || null;

    return {
      LogID: log.LogID ? log.LogID.toString() : null,
      ActionNom: actionById.get(log.ActionID) || null,
      DateAction: log.DateAction,
      Meta: log.Meta || null,
      Video: video
        ? {
            VideoID: video.VideoID,
            Titre: video.Titre,
            CheminImage: video.CheminImage,
            SaisonID: video.SaisonID,
            SaisonNumero: video.Saison?.Numero ?? null,
          }
        : null,
      Series: series
        ? {
            SeriesID: series.SeriesID,
            Titre: series.Titre,
            CheminImage: series.CheminImage,
            FirstEpisodeID: firstEpisodeBySeriesId.get(series.SeriesID) || null,
          }
        : log.SeriesID
          ? { SeriesID: log.SeriesID }
          : null,
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
      const parts = request.parts(); // Permet de lire les fichiers et champs
      let fields = {};
      let cheminImage = null;

      for await (const part of parts) {
        if (part.file) {
          const fileName = `${Date.now()}-${part.filename}`;
          const uploadPath = path.join(__dirname, '../uploads/pp', fileName);

          await fs.promises.writeFile(uploadPath, await part.toBuffer());
          cheminImage = `/uploads/pp/${fileName}`;
        } else {
          fields[part.fieldname] = part.value;
        }
      }

      const { surnom, email, motDePasse, gradeId } = fields;

      if (!surnom || !email || !motDePasse) {
        return reply.status(400).send({ error: 'Surnom, Email, and Mot de Passe are required' });
      }

      // Valider le mot de passe
      if (!validatePassword(motDePasse)) {
        return reply.status(400).send({
          error:
            'Le mot de passe doit contenir entre 8 et 20 caractères, inclure une majuscule, une minuscule, un chiffre et un caractère spécial.',
        });
      }

      // Vérifier si le surnom ou l'email existe déjà
      const existingUser = await userRepository.getUserBySurnomOrEmail(surnom, email);
      if (existingUser) {
        return reply.status(400).send({
          error: existingUser.Surnom === surnom
            ? 'Ce surnom est déjà utilisé. Veuillez en choisir un autre.'
            : 'Cet email est déjà utilisé. Veuillez en choisir un autre.',
        });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(motDePasse, salt);

      // Ajouter un grade et un état par défaut
      const DEFAULT_GRADE_ID = 3; // Grade utilisateur standard
      const DEFAULT_ETAT_ID = 1; // Etat actif par défaut

      const user = await userRepository.createUser({
        Surnom: surnom,
        Email: email,
        MotDePasse: hashedPassword,
        CheminImage: cheminImage,
        Salt: salt,
        GradeID: gradeId ? parseInt(gradeId) : DEFAULT_GRADE_ID,
        EtatID: DEFAULT_ETAT_ID,
        PremiumEndDate: new Date(),
      });

      reply.send(user);
    } catch (err) {
      console.error('Error in register:', err);
      reply.status(500).send({ error: 'Internal Server Error', message: err.message });
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

      reply.send({ token });
    } catch (err) {
      console.error('Error in login:', err);
      reply.status(500).send({ error: 'Internal Server Error', message: err.message });
    }
  },

  async logout(request, reply) {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader) {
        return reply.status(401).send({ error: 'No token provided' });
      }

      const token = authHeader.split(' ')[1];
      if (!token) {
        return reply.status(401).send({ error: 'Invalid token format' });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      const action = await prisma.action.findUnique({
        where: { Nom: 'deconnexion' }
      });

      if (action) {
        await createLog({
          request,
          UtilisateurID: userId,
          ActionNom: "deconnexion",
        });
      }

      reply.send({ message: 'Déconnexion enregistrée' });
    } catch (err) {
      console.error('Error in logout:', err);
      reply.status(500).send({ error: 'Internal Server Error', message: err.message });
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
    const token = request.headers['authorization']?.split(' ')[1];
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const decoded = jwt.verify(token, secretKey);
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
    const token = request.headers['authorization']?.split(' ')[1];
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const decoded = jwt.verify(token, secretKey);
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
    const token = request.headers['authorization']?.split(' ')[1];
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const decoded = jwt.verify(token, secretKey);
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
    const token = request.headers['authorization']?.split(' ')[1];
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const decoded = jwt.verify(token, secretKey);
      const { cheminImage } = request.body;

      await userRepository.updateUserProfileImage(decoded.surnom, cheminImage);
      reply.send({ message: 'Profile image updated successfully' });
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  },

  async deleteProfileImage(request, reply) {
    const token = request.headers['authorization']?.split(' ')[1];
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const decoded = jwt.verify(token, secretKey);

      await userRepository.deleteUserProfileImage(decoded.surnom);
      reply.send({ message: 'Profile image deleted successfully' });
    } catch (err) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  },

  async updateUser(request, reply) {
    const token = request.headers['authorization']?.split(' ')[1];
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const decoded = jwt.verify(token, secretKey);
      const parts = request.parts();
      let fields = {};
      let newImagePath = null;
      let oldImagePath = null; // Pour stocker le chemin de l'ancienne image si elle existe

      const user = await userRepository.getUserWithSecretById(decoded.userId); // Récupère les infos actuelles de l'utilisateur
      const idNumber = user?.UtilisateurID;
      const id = idNumber?.toString();

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      // Lire les champs et fichiers
      for await (const part of parts) {
        if (part.file) {
          const fileName = `${Date.now()}-${part.filename}`;
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
      const updatedUser = await userRepository.updateUserById(decoded.userId, updateData);

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
              UtilisateurID: decoded.userId,
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
      console.error('Error in updateUser:', err);
      reply.status(500).send({ error: 'Internal Server Error', message: err.message });
    }
  },

  async getAdmins(request, reply) {
    // console.log("getAdmins a été appelé"); // Log pour vérifier si la méthode est appelée
    try {
      const token = request.headers["authorization"]?.split(" ")[1];
      // console.log("Token reçu:", token); // Logguer le token

      if (!token) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const decoded = jwt.verify(token, secretKey);
      // console.log("Données décodées du JWT:", decoded); // Logguer les données décodées

      // Vérifier si l'utilisateur est superadmin ou admin
      const user = await userRepository.getUserById(decoded.userId);
      // console.log("Utilisateur récupéré:", user); // Logguer les infos utilisateur

      if (!user || (user.GradeID !== 1 && user.GradeID !== 2)) {
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
      const token = request.headers["authorization"]?.split(" ")[1];
      if (!token) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const decoded = jwt.verify(token, secretKey);

      // Vérifier si l'utilisateur est superadmin ou admin
      const user = await userRepository.getUserById(decoded.userId);
      if (!user || (user.GradeID !== 1 && user.GradeID !== 2)) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const { gradeId = 3, etatId = 1 } = request.query; // Paramètres par défaut : utilisateurs classiques actifs

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
      const token = request.headers["authorization"]?.split(" ")[1];
      if (!token) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const decoded = jwt.verify(token, secretKey);

      // Vérifie si l'utilisateur qui effectue l'action est SuperAdmin ou Admin
      const user = await userRepository.getUserById(decoded.userId);
      if (!user || (user.GradeID !== 1 && user.GradeID !== 2)) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const { userId, newEtat } = request.body;

      // Vérifie les paramètres de la requête
      if (!userId || ![1, 3].includes(newEtat)) {
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
      if (!user || user.GradeID !== 1) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const { userId, newEtat } = request.body;
      const targetUser = await userRepository.getUserById(userId);

      // Empêcher de modifier les superadmins
      if (targetUser.GradeID === 1) {
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
      const token = request.headers["authorization"]?.split(" ")[1];
      if (!token) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const decoded = jwt.verify(token, secretKey);
      const { currentPassword } = request.body || {};

      const user = await userRepository.getUserWithSecretById(decoded.userId);
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
        user.GradeID === 1 || user.GradeID === 2
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
          EtatID: 2, // État supprimé
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
      const token = request.headers["authorization"]?.split(" ")[1];
      if (!token) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      // Vérifier le token JWT
      const decoded = jwt.verify(token, secretKey);

      // Vérifier si l'utilisateur est Admin ou SuperAdmin
      const currentUser = await userRepository.getUserById(decoded.userId);
      if (!currentUser || (currentUser.GradeID !== 1 && currentUser.GradeID !== 2)) {
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
      if (!currentUser || (currentUser.GradeID !== 1 && currentUser.GradeID !== 2)) {
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

  async getUsersForAdminPanel(request, reply) {
    try {
      const token = request.headers["authorization"]?.split(" ")[1];
      if (!token) {
        return reply.status(401).send({ error: "Unauthorized" });
      }

      const decoded = jwt.verify(token, secretKey);

      // Vérifier si l'utilisateur est Admin ou SuperAdmin
      const currentUser = await userRepository.getUserById(decoded.userId);
      if (!currentUser || (currentUser.GradeID !== 1 && currentUser.GradeID !== 2)) {
        return reply.status(403).send({ error: "Forbidden" });
      }

      const { gradeId = 3, scope = "activeBlocked" } = request.query;

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

  async updatePremiumPlan(request, reply) {
    try {
      const { userId } = request.user;       // fourni par authMiddleware
      const { plan } = request.body;         // "FREE", "MONTHLY", "YEARLY"

      const allowedPlans = ["FREE", "MONTHLY", "YEARLY"];
      if (!allowedPlans.includes(plan)) {
        return reply
          .status(400)
          .send({ error: "Plan d'abonnement invalide." });
      }

      let newPremiumEndDate = null;
      const now = new Date();

      if (plan === "MONTHLY") {
        // Premium 1 mois à partir de maintenant
        newPremiumEndDate = new Date(now);
        newPremiumEndDate.setMonth(newPremiumEndDate.getMonth() + 1);

        // Teste 1min check
        // newPremiumEndDate = new Date(now);
        // newPremiumEndDate.setMinutes(newPremiumEndDate.getMinutes() + 1);
      } else if (plan === "YEARLY") {
        // Premium 1 an à partir de maintenant
        newPremiumEndDate = new Date(now);
        newPremiumEndDate.setFullYear(newPremiumEndDate.getFullYear() + 1);
      }
      // plan === "FREE" -> newPremiumEndDate = null

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

      // TODO (optionnel) : logguer l'action dans Log / Action

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
      console.error("Error in updatePremiumPlan:", err);
      return reply
        .status(500)
        .send({ error: "Internal Server Error", message: err.message });
    }
  },

};
