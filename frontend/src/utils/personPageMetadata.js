import {
  isDefaultPosterPath,
  normalizePublicPosterPath,
  truncateMetaDescription,
} from "./videoPageMetadata";

const DEFAULT_SITE_NAME = "SAMI";

const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeOrigin = (value, fallback = "http://localhost") => {
  try {
    const url = new URL(normalizeText(value) || fallback);
    if (
      (url.protocol === "http:" || url.protocol === "https:")
      && !url.username
      && !url.password
    ) {
      return url.origin;
    }
  } catch {
    // La valeur de repli est contrôlée par l'application.
  }

  return new URL(fallback).origin;
};

const buildAbsoluteUrl = (value, origin) => {
  try {
    const url = new URL(value, `${normalizeOrigin(origin)}/`);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
};

export const buildPersonDisplayName = (person) => {
  const firstName = normalizeText(person?.Prenom);
  const lastName = normalizeText(person?.Nom);
  const nickname = normalizeText(person?.Surnom);
  const legalName = [firstName, lastName].filter(Boolean).join(" ");

  if (nickname) return legalName ? `${legalName} “${nickname}”` : nickname;
  return legalName || "Personne sans nom";
};

export const buildPersonPageMetadata = ({
  id,
  person,
  siteName,
  pageOrigin,
  assetOrigin,
}) => {
  const resolvedSiteName = normalizeText(siteName) || DEFAULT_SITE_NAME;
  const resolvedPageOrigin = normalizeOrigin(pageOrigin);
  const resolvedAssetOrigin = normalizeOrigin(assetOrigin, resolvedPageOrigin);
  const displayName = person ? buildPersonDisplayName(person) : "";
  const normalizedId = String(id ?? "").trim();
  const parsedId = /^[1-9][0-9]*$/.test(normalizedId) ? Number(normalizedId) : null;
  const canonicalPath = Number.isSafeInteger(parsedId) && parsedId <= 2_147_483_647
    ? `/personnes/${parsedId}`
    : "/personnes";
  const portraitPath = person && !isDefaultPosterPath(person.CheminImage)
    ? normalizePublicPosterPath(person.CheminImage)
    : null;
  const portraitUrl = portraitPath
    ? buildAbsoluteUrl(portraitPath, resolvedAssetOrigin)
    : null;

  return {
    siteName: resolvedSiteName,
    title: displayName ? `${displayName} - ${resolvedSiteName}` : `Personnes - ${resolvedSiteName}`,
    description: truncateMetaDescription(
      displayName
        ? `Découvrez la filmographie de ${displayName} sur ${resolvedSiteName} : films et séries en réalisation et distribution.`
        : `Découvrez les acteurs, actrices, réalisateurs et réalisatrices du catalogue ${resolvedSiteName}.`
    ),
    canonicalUrl: buildAbsoluteUrl(canonicalPath, resolvedPageOrigin),
    imageUrl: portraitUrl || buildAbsoluteUrl("/logo512.png", resolvedPageOrigin),
    imageAlt: portraitUrl ? `Portrait de ${displayName}` : `Logo de ${resolvedSiteName}`,
    openGraphType: displayName ? "profile" : "website",
  };
};
