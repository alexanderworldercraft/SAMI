export const ALTERNATIVE_TITLES_MAX_LENGTH = 10000;

export class AlternativeTitlesValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AlternativeTitlesValidationError";
    this.statusCode = 400;
  }
}

export const normalizeAlternativeTitles = (value) => {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new AlternativeTitlesValidationError("TitreAlternatif doit être un texte séparé par |.");
  }
  if (value.length > ALTERNATIVE_TITLES_MAX_LENGTH) {
    throw new AlternativeTitlesValidationError("Les titres alternatifs ne peuvent pas dépasser 10 000 caractères.");
  }
  const titles = [...new Set(value.split("|").map((title) => title.trim()).filter(Boolean))];
  const normalized = titles.join(" | ");
  if (normalized.length > ALTERNATIVE_TITLES_MAX_LENGTH) {
    throw new AlternativeTitlesValidationError("Les titres alternatifs ne peuvent pas dépasser 10 000 caractères.");
  }
  return normalized || null;
};
