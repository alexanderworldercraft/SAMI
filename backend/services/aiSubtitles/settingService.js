import { prisma } from "../db.js";
import { AI_SUBTITLE_SETTING_KEY } from "./constants.js";

const normalizedValue = (value) => {
  if (typeof value === "string") {
    try {
      return normalizedValue(JSON.parse(value));
    } catch {
      return { active: false };
    }
  }
  return { active: Boolean(value?.active) };
};

export async function getAiSubtitleSetting({ database = prisma } = {}) {
  const setting = await database.appSetting.upsert({
    where: { Cle: AI_SUBTITLE_SETTING_KEY },
    create: { Cle: AI_SUBTITLE_SETTING_KEY, Valeur: { active: false } },
    update: {},
  });
  return {
    key: AI_SUBTITLE_SETTING_KEY,
    active: normalizedValue(setting.Valeur).active,
    updatedAt: setting.UpdatedAt,
  };
}

export const isAiSubtitleSettingActive = async (options) =>
  Boolean((await getAiSubtitleSetting(options)).active);

export async function setAiSubtitleSetting(active, { database = prisma } = {}) {
  if (typeof active !== "boolean") throw new TypeError("active doit être un booléen.");
  const setting = await database.appSetting.upsert({
    where: { Cle: AI_SUBTITLE_SETTING_KEY },
    create: { Cle: AI_SUBTITLE_SETTING_KEY, Valeur: { active } },
    update: { Valeur: { active } },
  });
  return {
    key: AI_SUBTITLE_SETTING_KEY,
    active: normalizedValue(setting.Valeur).active,
    updatedAt: setting.UpdatedAt,
  };
}
