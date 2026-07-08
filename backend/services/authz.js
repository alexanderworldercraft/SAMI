import { ADMIN_GRADE_IDS, GRADE } from "../constants.js";
import { prisma } from "./db.js";

export const getRequestUserId = (request) => {
  const userId = Number(request.user?.userId);
  return Number.isInteger(userId) ? userId : null;
};

export const ensureAdmin = async (request, reply, options = {}) => {
  const unauthorizedError = options.unauthorizedError || "Non autorisé.";
  const userId = getRequestUserId(request);
  if (!userId) {
    reply.code(401).send({ error: unauthorizedError });
    return null;
  }

  const user = await prisma.utilisateur.findUnique({
    where: { UtilisateurID: userId },
    select: { GradeID: true },
  });

  if (!user || !ADMIN_GRADE_IDS.includes(user.GradeID)) {
    reply.status(403).send({ error: "Accès réservé aux administrateurs." });
    return null;
  }

  return { userId, gradeId: user.GradeID };
};

export const ensureSuperAdmin = async (request, reply, options = {}) => {
  const admin = await ensureAdmin(request, reply, options);
  if (!admin) return null;

  if (admin.gradeId !== GRADE.SUPER_ADMIN) {
    reply.status(403).send({ error: "Accès réservé au super administrateur." });
    return null;
  }

  return admin;
};
