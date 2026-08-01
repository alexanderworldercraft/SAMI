import { prisma } from "../db.js";

export const DISTRIBUTED_ENCODING_SETTING_KEY = "distributed_encoding";

const normalizeValue = (value) => {
  if (!value) return { active: false };
  if (typeof value === "string") {
    try {
      return normalizeValue(JSON.parse(value));
    } catch {
      return { active: false };
    }
  }
  return { active: Boolean(value.active) };
};

export async function getDistributedEncodingSetting({ database = prisma } = {}) {
  const setting = await database.appSetting.upsert({
    where: { Cle: DISTRIBUTED_ENCODING_SETTING_KEY },
    create: {
      Cle: DISTRIBUTED_ENCODING_SETTING_KEY,
      Valeur: { active: false },
    },
    update: {},
  });
  const value = normalizeValue(setting.Valeur);
  return {
    key: DISTRIBUTED_ENCODING_SETTING_KEY,
    active: value.active,
    updatedAt: setting.UpdatedAt,
  };
}

export async function isDistributedEncodingSettingActive(options) {
  return Boolean((await getDistributedEncodingSetting(options)).active);
}

export async function setDistributedEncodingSetting(
  active,
  { database = prisma } = {}
) {
  if (typeof active !== "boolean") {
    throw new TypeError("active doit être un booléen.");
  }
  const setting = await database.appSetting.upsert({
    where: { Cle: DISTRIBUTED_ENCODING_SETTING_KEY },
    create: {
      Cle: DISTRIBUTED_ENCODING_SETTING_KEY,
      Valeur: { active },
    },
    update: { Valeur: { active } },
  });
  return {
    key: DISTRIBUTED_ENCODING_SETTING_KEY,
    active: normalizeValue(setting.Valeur).active,
    updatedAt: setting.UpdatedAt,
  };
}
