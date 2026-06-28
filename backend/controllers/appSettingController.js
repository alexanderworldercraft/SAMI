import { prisma } from "../services/db.js";
import { createLog } from "./logController.js";

const CONTENT_PREVIEW_KEY = "content_preview_tooltip";

const ensureAdmin = async (request, reply) => {
  const userId = Number(request.user?.userId);
  if (!Number.isInteger(userId)) {
    reply.status(401).send({ error: "Unauthorized" });
    return false;
  }

  const user = await prisma.utilisateur.findUnique({
    where: { UtilisateurID: userId },
    select: { GradeID: true },
  });

  if (!user || (user.GradeID !== 1 && user.GradeID !== 2)) {
    reply.status(403).send({ error: "Accès réservé aux administrateurs." });
    return false;
  }

  return userId;
};

const ensureAppSettingTable = async () => {
  await prisma.$executeRaw`
    CREATE TABLE IF NOT EXISTS AppSetting (
      AppSettingID BIGINT NOT NULL AUTO_INCREMENT,
      Cle VARCHAR(120) NOT NULL,
      Valeur JSON NOT NULL,
      UpdatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      CreateDate DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (AppSettingID),
      UNIQUE INDEX AppSetting_Cle_key (Cle),
      INDEX idx_app_setting_key (Cle)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `;
};

const normalizeSettingValue = (value) => {
  if (!value) return { active: false };
  if (typeof value === "string") {
    try {
      return normalizeSettingValue(JSON.parse(value));
    } catch (_) {
      return { active: false };
    }
  }

  return {
    active: Boolean(value.active),
  };
};

const getContentPreviewSettingOrCreate = async () => {
  await ensureAppSettingTable();

  await prisma.$executeRaw`
    INSERT INTO AppSetting (Cle, Valeur)
    VALUES (${CONTENT_PREVIEW_KEY}, JSON_OBJECT('active', false))
    ON DUPLICATE KEY UPDATE Cle = Cle
  `;

  const rows = await prisma.$queryRaw`
    SELECT AppSettingID, Cle, Valeur, UpdatedAt, CreateDate
    FROM AppSetting
    WHERE Cle = ${CONTENT_PREVIEW_KEY}
    LIMIT 1
  `;

  if (rows.length) {
    const row = rows[0];
    return {
      ...row,
      AppSettingID: Number(row.AppSettingID),
      Valeur: normalizeSettingValue(row.Valeur),
    };
  }

  return null;
};

const formatContentPreviewSetting = (setting) => ({
  key: CONTENT_PREVIEW_KEY,
  active: Boolean(setting?.Valeur?.active),
  updatedAt: setting?.UpdatedAt || null,
});

export const isContentPreviewActive = async () => {
  const setting = await getContentPreviewSettingOrCreate();
  return Boolean(setting?.Valeur?.active);
};

export const getContentPreviewSetting = async (_request, reply) => {
  try {
    const setting = await getContentPreviewSettingOrCreate();
    return reply.send(formatContentPreviewSetting(setting));
  } catch (error) {
    console.error("Erreur lors de la récupération du réglage d'aperçu :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération du réglage d'aperçu." });
  }
};

export const updateContentPreviewSetting = async (request, reply) => {
  const { active } = request.body || {};

  if (typeof active !== "boolean") {
    return reply.status(400).send({ error: "active doit être un booléen." });
  }

  try {
    const userId = await ensureAdmin(request, reply);
    if (!userId) return;

    const currentSetting = await getContentPreviewSettingOrCreate();
    const previousActive = Boolean(currentSetting?.Valeur?.active);
    const value = JSON.stringify({ active });

    await prisma.$executeRaw`
      UPDATE AppSetting
      SET Valeur = ${value}
      WHERE Cle = ${CONTENT_PREVIEW_KEY}
    `;

    const setting = await getContentPreviewSettingOrCreate();
    await createLog({
      request,
      UtilisateurID: userId,
      ActionNom: "content_preview_tooltip_toggle",
      Champ: CONTENT_PREVIEW_KEY,
      AncienneValeur: String(previousActive),
      NouvelleValeur: String(Boolean(setting?.Valeur?.active)),
      Meta: {
        key: CONTENT_PREVIEW_KEY,
      },
    });

    return reply.send(formatContentPreviewSetting(setting));
  } catch (error) {
    console.error("Erreur lors de la mise à jour du réglage d'aperçu :", error);
    return reply.status(500).send({ error: "Erreur lors de la mise à jour du réglage d'aperçu." });
  }
};
