import { prisma } from "../services/db.js";
import { createLog } from "./logController.js";
import { ensureAdmin as ensureSharedAdmin } from "../services/authz.js";

const CONTENT_PREVIEW_KEY = "content_preview_tooltip";
const PREVIEW_LIVE_KEY = "preview_live";
const MULTI_AUDIO_KEY = "multi_audio";

const ensureAdmin = async (request, reply) => {
  const admin = await ensureSharedAdmin(request, reply, { unauthorizedError: "Unauthorized" });
  return admin?.userId || false;
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

const getSettingOrCreate = async (key) => {
  await ensureAppSettingTable();

  await prisma.$executeRaw`
    INSERT INTO AppSetting (Cle, Valeur)
    VALUES (${key}, JSON_OBJECT('active', false))
    ON DUPLICATE KEY UPDATE Cle = Cle
  `;

  const rows = await prisma.$queryRaw`
    SELECT AppSettingID, Cle, Valeur, UpdatedAt, CreateDate
    FROM AppSetting
    WHERE Cle = ${key}
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

const formatSetting = (key, setting) => ({
  key,
  active: Boolean(setting?.Valeur?.active),
  updatedAt: setting?.UpdatedAt || null,
});

export const isContentPreviewActive = async () => {
  const setting = await getSettingOrCreate(CONTENT_PREVIEW_KEY);
  return Boolean(setting?.Valeur?.active);
};

export const getContentPreviewSetting = async (_request, reply) => {
  try {
    const setting = await getSettingOrCreate(CONTENT_PREVIEW_KEY);
    return reply.send(formatSetting(CONTENT_PREVIEW_KEY, setting));
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

    const currentSetting = await getSettingOrCreate(CONTENT_PREVIEW_KEY);
    const previousActive = Boolean(currentSetting?.Valeur?.active);
    const value = JSON.stringify({ active });

    await prisma.$executeRaw`
      UPDATE AppSetting
      SET Valeur = ${value}
      WHERE Cle = ${CONTENT_PREVIEW_KEY}
    `;

    const setting = await getSettingOrCreate(CONTENT_PREVIEW_KEY);
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

    return reply.send(formatSetting(CONTENT_PREVIEW_KEY, setting));
  } catch (error) {
    console.error("Erreur lors de la mise à jour du réglage d'aperçu :", error);
    return reply.status(500).send({ error: "Erreur lors de la mise à jour du réglage d'aperçu." });
  }
};

export const isPreviewLiveActive = async () => {
  const setting = await getSettingOrCreate(PREVIEW_LIVE_KEY);
  return Boolean(setting?.Valeur?.active);
};

export const getPreviewLiveSetting = async (_request, reply) => {
  try {
    const setting = await getSettingOrCreate(PREVIEW_LIVE_KEY);
    return reply.send(formatSetting(PREVIEW_LIVE_KEY, setting));
  } catch (error) {
    console.error("Erreur lors de la récupération du réglage Preview Live :", error);
    return reply.status(500).send({ error: "Erreur lors de la récupération du réglage Preview Live." });
  }
};

export const updatePreviewLiveSetting = async (request, reply) => {
  const { active } = request.body || {};

  if (typeof active !== "boolean") {
    return reply.status(400).send({ error: "active doit être un booléen." });
  }

  try {
    const userId = await ensureAdmin(request, reply);
    if (!userId) return;

    const currentSetting = await getSettingOrCreate(PREVIEW_LIVE_KEY);
    const previousActive = Boolean(currentSetting?.Valeur?.active);
    const value = JSON.stringify({ active });

    await prisma.$executeRaw`
      UPDATE AppSetting
      SET Valeur = ${value}
      WHERE Cle = ${PREVIEW_LIVE_KEY}
    `;

    const setting = await getSettingOrCreate(PREVIEW_LIVE_KEY);
    await createLog({
      request,
      UtilisateurID: userId,
      ActionNom: "preview_live_toggle",
      Champ: PREVIEW_LIVE_KEY,
      AncienneValeur: String(previousActive),
      NouvelleValeur: String(Boolean(setting?.Valeur?.active)),
      Meta: {
        key: PREVIEW_LIVE_KEY,
      },
    });

    return reply.send(formatSetting(PREVIEW_LIVE_KEY, setting));
  } catch (error) {
    console.error("Erreur lors de la mise à jour du réglage Preview Live :", error);
    return reply.status(500).send({ error: "Erreur lors de la mise à jour du réglage Preview Live." });
  }
};

export const isMultiAudioActive = async () => {
  const setting = await getSettingOrCreate(MULTI_AUDIO_KEY);
  return Boolean(setting?.Valeur?.active);
};

export const getMultiAudioSetting = async (_request, reply) => {
  try {
    const setting = await getSettingOrCreate(MULTI_AUDIO_KEY);
    return reply.send(formatSetting(MULTI_AUDIO_KEY, setting));
  } catch (error) {
    console.error("Erreur lors de la récupération du réglage multi-audio :", error);
    return reply.status(500).send({
      error: "Erreur lors de la récupération du réglage multi-audio.",
    });
  }
};

export const updateMultiAudioSetting = async (request, reply) => {
  const { active } = request.body || {};

  if (typeof active !== "boolean") {
    return reply.status(400).send({ error: "active doit être un booléen." });
  }

  try {
    const userId = await ensureAdmin(request, reply);
    if (!userId) return;

    const currentSetting = await getSettingOrCreate(MULTI_AUDIO_KEY);
    const previousActive = Boolean(currentSetting?.Valeur?.active);
    const value = JSON.stringify({ active });

    await prisma.$executeRaw`
      UPDATE AppSetting
      SET Valeur = ${value}
      WHERE Cle = ${MULTI_AUDIO_KEY}
    `;

    const setting = await getSettingOrCreate(MULTI_AUDIO_KEY);
    await createLog({
      request,
      UtilisateurID: userId,
      ActionNom: "multi_audio_toggle",
      Champ: MULTI_AUDIO_KEY,
      AncienneValeur: String(previousActive),
      NouvelleValeur: String(Boolean(setting?.Valeur?.active)),
      Meta: {
        key: MULTI_AUDIO_KEY,
      },
    });

    return reply.send(formatSetting(MULTI_AUDIO_KEY, setting));
  } catch (error) {
    console.error("Erreur lors de la mise à jour du réglage multi-audio :", error);
    return reply.status(500).send({
      error: "Erreur lors de la mise à jour du réglage multi-audio.",
    });
  }
};
