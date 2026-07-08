// models/user.js

import { prisma } from '../services/db.js';

export const userRepository = {
  async createUser(userData) {
    return prisma.utilisateur.create({
      data: userData,
    });
  },

  async getUserBySurnom(surnom) {
    return prisma.utilisateur.findUnique({
      where: { Surnom: surnom },
    });
  },

  async updateUserPassword(surnom, hashedPassword) {
    return prisma.utilisateur.update({
      where: { surnom },
      data: { motDePasse: hashedPassword },
    });
  },

  async deleteUserBySurnom(surnom) {
    return prisma.utilisateur.delete({
      where: { surnom },
    });
  },

  async updateUserSurnom(surnom, newSurnom) {
    return prisma.utilisateur.update({
      where: { surnom },
      data: { surnom: newSurnom },
    });
  },

  async updateUserEmail(surnom, newEmail) {
    return prisma.utilisateur.update({
      where: { surnom },
      data: { email: newEmail },
    });
  },

  async updateUserProfileImage(surnom, cheminImage) {
    return prisma.utilisateur.update({
      where: { surnom },
      data: { cheminImage },
    });
  },

  async deleteUserProfileImage(surnom) {
    return prisma.utilisateur.update({
      where: { surnom },
      data: { cheminImage: null },
    });
  },
  async getUserById(userId) {
    return await prisma.utilisateur.findUnique({
      where: { UtilisateurID: userId },
      select: {
        UtilisateurID: true,
        Surnom: true,
        Email: true,
        // MotDePasse: true,
        // Salt: true,
        CheminImage: true,
        EtatID: true,
        GradeID: true,
        CreateDate: true,
        LastLogin: true,
        PremiumEndDate: true,
      },
    });
  },
  async getUserWithSecretById(userId) {
    return prisma.utilisateur.findUnique({
      where: { UtilisateurID: userId },
      select: {
        UtilisateurID: true,
        MotDePasse: true,
        Salt: true,
        CheminImage: true,
        EtatID: true,
        GradeID: true,
        CreateDate: true,
        LastLogin: true,
        PremiumEndDate: true,
        Surnom: true,
        Email: true,
      },
    });
  },
  async getUserBySurnomOrEmail(surnom, email) {
    return prisma.utilisateur.findFirst({
      where: {
        OR: [
          { Surnom: surnom },
          { Email: email },
        ],
      },
    });
  },
  async updateUserByField(where, data) {
    return prisma.utilisateur.update({
      where,
      data,
    });
  },
  async updateUserById(userId, updateData) {
    return prisma.utilisateur.update({
      where: { UtilisateurID: userId },
      data: updateData,
    });
  },
  async getAdmins() {
    return (
      (await prisma.utilisateur.findMany({
        where: {
          // On récupère uniquement les comptes de type SuperAdmin (1) et Admin (2)
          GradeID: {
            in: [1, 2],
          },
        },
        select: {
          UtilisateurID: true, // ID unique de l'utilisateur
          Surnom: true,        // Nom affiché
          Email: true,         // Email (mailto)
          CheminImage: true,   // 🔥 Photo de profil (pour la carte Admin)
          GradeID: true,       // Pour la logique côté front (sécurité, règles d'affichage)
          EtatID: true,        // Pour savoir si Actif / Bloqué / Supprimé
          CreateDate: true,
          LastLogin: true,
          PremiumEndDate: true,

          // Relation vers le Grade (permet d'afficher "SuperAdmin", "Admin", etc.)
          Grade: {
            select: {
              Nom: true,
            },
          },

          // Optionnel : si tu veux afficher le nom de l'état côté front
          // (ex : "Actif", "Bloqué", "Supprimé") sans hard-coder
          Etat: {
            select: {
              Nom: true,
            },
          },
        },
        // Optionnel mais propre : ordre de tri
        orderBy: [
          { GradeID: "asc" },   // SuperAdmin avant Admin
          { Surnom: "asc" },    // puis tri alphabétique
        ],
      })) || []
    );
  },
  async getUsersByCriteria(gradeId, etatId) {
    return prisma.utilisateur.findMany({
      where: {
        GradeID: gradeId,
        EtatID: etatId,
      },
      select: {
        UtilisateurID: true,
        Surnom: true,
        Email: true,
        CheminImage: true,
        EtatID: true,
      },
    });
  },
  async getUsersForAdminPanel(gradeId, scope = "activeBlocked") {
    let etatFilter;

    switch (scope) {
      case "activeBlocked":
        etatFilter = { in: [1, 3] }; // Actif + Bloqué
        break;
      case "deleted":
        etatFilter = 2; // Supprimé
        break;
      case "all":
        etatFilter = { in: [1, 2, 3] };
        break;
      default:
        etatFilter = { in: [1, 3] };
        break;
    }

    return prisma.utilisateur.findMany({
      where: {
        GradeID: gradeId,      // ex: 3 = utilisateurs normaux
        EtatID: etatFilter,    // filtre dynamique selon scope
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
        PremiumEndDate: true,
        Grade: {
          select: {
            Nom: true,
          },
        },
        Etat: {
          select: {
            Nom: true,
          },
        },
      },
      orderBy: [
        { EtatID: "asc" },    // Actifs avant Bloqués/Supprimés
        { Surnom: "asc" },
      ],
    });
  },

};
