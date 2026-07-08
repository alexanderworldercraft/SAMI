import { prisma } from "../services/db.js";
import { createLog } from "./logController.js";
import { ensureAdmin as ensureSharedAdmin } from "../services/authz.js";

const ensureAdmin = async (request, reply) => {
  return Boolean(await ensureSharedAdmin(request, reply, { unauthorizedError: "Unauthorized" }));
};

const getAdminMessageOrCreate = async () => {
  const message = await prisma.adminMessage.findFirst({
    orderBy: { AdminMessageID: "asc" },
  });

  if (message) return message;

  return prisma.adminMessage.create({
    data: {
      Titre: "",
      Description: "",
      Actif: false,
    },
  });
};

const formatAdminMessage = (message) => {
  if (!message) return null;

  return {
    ...message,
    AdminMessageID: Number(message.AdminMessageID),
  };
};

export const getAdminMessage = async (request, reply) => {
  try {
    const isAdmin = await ensureAdmin(request, reply);
    if (!isAdmin) return;

    const message = await getAdminMessageOrCreate();
    return reply.send(formatAdminMessage(message));
  } catch (err) {
    console.error("Erreur lors de la récupération du message admin :", err);
    return reply.status(500).send({ error: "Erreur lors de la récupération du message admin." });
  }
};

export const getActiveAdminMessage = async (request, reply) => {
  try {
    const message = await prisma.adminMessage.findFirst({
      where: {
        Actif: true,
        Titre: { not: "" },
        Description: { not: "" },
      },
      orderBy: { AdminMessageID: "asc" },
    });

    return reply.send(formatAdminMessage(message));
  } catch (err) {
    console.error("Erreur lors de la récupération du message actif :", err);
    return reply.status(500).send({ error: "Erreur lors de la récupération du message actif." });
  }
};

export const updateAdminMessage = async (request, reply) => {
  const { Titre, Description } = request.body || {};
  const userId = Number(request.user?.userId);
  const titre = String(Titre || "").trim();
  const description = String(Description || "").trim();

  if (!titre || !description) {
    return reply.status(400).send({ error: "Le titre et la description sont obligatoires." });
  }

  try {
    const isAdmin = await ensureAdmin(request, reply);
    if (!isAdmin) return;

    const currentMessage = await getAdminMessageOrCreate();
    const message = await prisma.adminMessage.update({
      where: { AdminMessageID: currentMessage.AdminMessageID },
      data: {
        Titre: titre,
        Description: description,
      },
    });

    await createLog({
      request,
      UtilisateurID: userId,
      ActionNom: "admin_message_update",
      Champ: "admin_message",
      AncienneValeur: JSON.stringify({
        Titre: currentMessage.Titre,
        Description: currentMessage.Description,
      }),
      NouvelleValeur: JSON.stringify({
        Titre: message.Titre,
        Description: message.Description,
      }),
    });

    return reply.send(formatAdminMessage(message));
  } catch (err) {
    console.error("Erreur lors de la maj du message admin :", err);
    return reply.status(500).send({ error: "Erreur lors de la maj du message admin." });
  }
};

export const toggleAdminMessage = async (request, reply) => {
  const { Actif } = request.body || {};
  const userId = Number(request.user?.userId);

  if (typeof Actif !== "boolean") {
    return reply.status(400).send({ error: "Actif doit être un booléen." });
  }

  try {
    const isAdmin = await ensureAdmin(request, reply);
    if (!isAdmin) return;

    const currentMessage = await getAdminMessageOrCreate();
    const message = await prisma.adminMessage.update({
      where: { AdminMessageID: currentMessage.AdminMessageID },
      data: { Actif },
    });

    await createLog({
      request,
      UtilisateurID: userId,
      ActionNom: "admin_message_toggle",
      Champ: "Actif",
      AncienneValeur: String(currentMessage.Actif),
      NouvelleValeur: String(message.Actif),
    });

    return reply.send(formatAdminMessage(message));
  } catch (err) {
    console.error("Erreur lors du changement d'état du message admin :", err);
    return reply.status(500).send({ error: "Erreur lors du changement d'état du message admin." });
  }
};
