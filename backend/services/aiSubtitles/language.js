import { AI_SUBTITLE_LANGUAGE_CODES, AI_SUBTITLE_LANGUAGES } from "./constants.js";

const ALIASES = new Map([
  ["fra", "fr"], ["fre", "fr"], ["french", "fr"], ["francais", "fr"], ["français", "fr"],
  ["eng", "en"], ["english", "en"], ["anglais", "en"],
  ["spa", "es"], ["spanish", "es"], ["espagnol", "es"],
  ["deu", "de"], ["ger", "de"], ["german", "de"], ["allemand", "de"],
  ["ita", "it"], ["italian", "it"], ["italien", "it"],
  ["por", "pt"], ["portuguese", "pt"], ["portugais", "pt"],
  ["nld", "nl"], ["dut", "nl"], ["dutch", "nl"], ["neerlandais", "nl"], ["néerlandais", "nl"],
  ["jpn", "ja"], ["japanese", "ja"], ["japonais", "ja"],
  ["kor", "ko"], ["korean", "ko"], ["coreen", "ko"], ["coréen", "ko"],
  ["zho", "zh"], ["chi", "zh"], ["chinese", "zh"], ["chinois", "zh"],
  ["rus", "ru"], ["russian", "ru"], ["russe", "ru"],
  ["ara", "ar"], ["arabic", "ar"], ["arabe", "ar"],
  ["pol", "pl"], ["polish", "pl"], ["polonais", "pl"],
  ["tur", "tr"], ["turkish", "tr"], ["turc", "tr"],
  ["hin", "hi"], ["hindi", "hi"],
]);
const SOURCE_LANGUAGE_CODES = new Set([
  ...AI_SUBTITLE_LANGUAGE_CODES,
  "uk", "sv", "da", "no", "fi", "cs", "el", "he", "id", "th", "vi",
]);

const clean = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/_/g, "-");

export const normalizeAiLanguage = (value) => {
  const normalized = clean(value);
  if (SOURCE_LANGUAGE_CODES.has(normalized)) return normalized;
  if (ALIASES.has(normalized)) return ALIASES.get(normalized);
  const short = normalized.split("-")[0];
  if (SOURCE_LANGUAGE_CODES.has(short)) return short;
  if (ALIASES.has(short)) return ALIASES.get(short);
  return null;
};

export const requireAiLanguage = (value) => {
  const language = normalizeAiLanguage(value);
  if (!language || !AI_SUBTITLE_LANGUAGE_CODES.has(language)) {
    const error = new Error("La langue demandée n'est pas prise en charge.");
    error.statusCode = 400;
    error.code = "AI_SUBTITLE_LANGUAGE_UNSUPPORTED";
    throw error;
  }
  return language;
};

export const aiLanguageLabel = (code) =>
  AI_SUBTITLE_LANGUAGES.find((language) => language.code === code)?.label || code;

export const subtitleTypeFromLabel = (label) => {
  const normalized = clean(label);
  if (/forced|forc[eé]s?/.test(normalized)) return "FORCED";
  if (/\bsdh\b|malentendant/.test(normalized)) return "SDH";
  return "FULL";
};

export const subtitleTypeFromStream = ({ label, disposition } = {}) => {
  if (Number(disposition?.forced) === 1) return "FORCED";
  if (Number(disposition?.hearing_impaired) === 1) return "SDH";
  return subtitleTypeFromLabel(label);
};

export const subtitleLanguageFromMetadata = ({ language, label, path: subtitlePath } = {}) => {
  const direct = normalizeAiLanguage(language);
  if (direct) return direct;
  const normalizedLabel = clean(label);
  for (const [alias, code] of ALIASES.entries()) {
    if (normalizedLabel === alias || normalizedLabel.includes(alias)) return code;
  }
  const filename = clean(subtitlePath).split("/").pop() || "";
  return normalizeAiLanguage(filename.split(/[_.-]/)[0]);
};

export const isFullFrenchSubtitle = (subtitle = {}) =>
  subtitleLanguageFromMetadata({
    language: subtitle.Language ?? subtitle.language,
    label: subtitle.Label ?? subtitle.label,
    path: subtitle.CheminSubtitle ?? subtitle.path,
  }) === "fr"
  && String(subtitle.Type || subtitle.type || subtitleTypeFromLabel(
    subtitle.Label ?? subtitle.label
  )).toUpperCase() !== "FORCED";
