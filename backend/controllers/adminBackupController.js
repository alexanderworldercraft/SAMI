import fs from "fs";
import bcrypt from "bcrypt";
import { prisma } from "../services/db.js";
import { createDatabaseBackup } from "../services/databaseBackupService.js";
import { createLog } from "./logController.js";
import { GRADE } from "../constants.js";

const ensureSuperAdminWithPassword = async (request, reply) => {
  const userId = Number(request.user?.userId);
  const { currentPassword } = request.body || {};

  if (!Number.isInteger(userId)) {
    reply.status(401).send({ error: "Non authentifié." });
    return null;
  }

  if (!currentPassword) {
    reply.status(400).send({ error: "Le mot de passe est requis pour lancer une sauvegarde." });
    return null;
  }

  const user = await prisma.utilisateur.findUnique({
    where: { UtilisateurID: userId },
    select: {
      UtilisateurID: true,
      GradeID: true,
      MotDePasse: true,
      Surnom: true,
    },
  });

  if (!user || user.GradeID !== GRADE.SUPER_ADMIN) {
    reply.status(403).send({ error: "Accès réservé au super administrateur." });
    return null;
  }

  const isPasswordValid = await bcrypt.compare(currentPassword, user.MotDePasse || "");
  if (!isPasswordValid) {
    reply.status(401).send({ error: "Mot de passe incorrect." });
    return null;
  }

  return user;
};

export const createManualBackup = async (request, reply) => {
  try {
    const user = await ensureSuperAdminWithPassword(request, reply);
    if (!user) return;

    const backup = await createDatabaseBackup({ kind: "manual" });

    await createLog({
      request,
      UtilisateurID: user.UtilisateurID,
      ActionNom: "manual_database_backup",
      Champ: "database_backup",
      NouvelleValeur: backup.relativePath,
      Meta: {
        filename: backup.filename,
        path: backup.relativePath,
        kind: "manual",
      },
    });

    return reply
      .header("Content-Type", "application/sql")
      .header("Content-Disposition", `attachment; filename="${backup.filename}"`)
      .header("X-Backup-Filename", backup.filename)
      .send(fs.createReadStream(backup.filePath));
  } catch (err) {
    request.log?.error?.(err);
    console.error("Erreur lors de la sauvegarde manuelle :", err);
    return reply.status(500).send({ error: "Erreur lors de la sauvegarde manuelle." });
  }
};
