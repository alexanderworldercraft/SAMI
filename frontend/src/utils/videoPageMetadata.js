const DEFAULT_SITE_NAME = "SAMI";
const MAX_DESCRIPTION_LENGTH = 200;

const normalizeText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

export const truncateMetaDescription = (value, maxLength = MAX_DESCRIPTION_LENGTH) => {
  const normalized = normalizeText(value);
  const characters = Array.from(normalized);
  if (characters.length <= maxLength) return normalized;
  if (maxLength <= 1) return "…".slice(0, Math.max(0, maxLength));

  return `${characters.slice(0, maxLength - 1).join("").trimEnd()}…`;
};

export const isDefaultPosterPath = (value) => {
  const path = normalizeText(value).split(/[?#]/, 1)[0];
  if (!path) return true;

  const basename = path.split(/[\\/]/).pop()?.toLowerCase() || "";
  const stem = basename.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/g, "");
  return stem === "default" || stem === "imagedefault" || stem === "defaultimage";
};

export const normalizePublicPosterPath = (value) => {
  const normalized = String(value ?? "").trim().replace(/\\/g, "/");
  const hasControlCharacter = Array.from(normalized).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
  if (!normalized || hasControlCharacter || /[?#%]/.test(normalized)) return null;

  const withoutLeadingSlash = normalized.replace(/^\/+/, "");
  const segments = withoutLeadingSlash.split("/");
  if (
    !withoutLeadingSlash.startsWith("uploads/")
    || segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null;
  }

  return `/${withoutLeadingSlash}`;
};

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
  const rawValue = normalizeText(value);
  if (!rawValue) return null;

  try {
    const url = new URL(rawValue, `${normalizeOrigin(origin)}/`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.href;
  } catch {
    return null;
  }
};

export const buildVideoPageMetadata = ({
  id,
  video,
  series,
  currentSeason,
  siteName,
  pageOrigin,
  assetOrigin,
}) => {
  const resolvedSiteName = normalizeText(siteName) || DEFAULT_SITE_NAME;
  const resolvedPageOrigin = normalizeOrigin(pageOrigin);
  const resolvedAssetOrigin = normalizeOrigin(assetOrigin, resolvedPageOrigin);
  const videoTitle = normalizeText(video?.Titre);
  const seriesTitle = normalizeText(series?.Titre);
  const parsedSeasonNumber = Number(currentSeason?.Numero);
  const hasSeasonNumber = Number.isInteger(parsedSeasonNumber) && parsedSeasonNumber > 0;
  const seasonNumber = hasSeasonNumber ? parsedSeasonNumber : null;
  const isEpisode = Boolean(video?.SaisonID || seriesTitle);

  let title = resolvedSiteName;
  if (videoTitle && isEpisode && seriesTitle && hasSeasonNumber) {
    title = `${videoTitle} (Saison ${seasonNumber} - ${seriesTitle}) - ${resolvedSiteName}`;
  } else if (videoTitle && isEpisode && seriesTitle) {
    title = `${videoTitle} (${seriesTitle}) - ${resolvedSiteName}`;
  } else if (videoTitle) {
    title = `${videoTitle} - ${resolvedSiteName}`;
  }

  let descriptionSource = video?.Resumer;
  if (!normalizeText(descriptionSource) && isEpisode) descriptionSource = series?.Resumer;
  if (!normalizeText(descriptionSource)) {
    if (videoTitle && isEpisode && seriesTitle) {
      descriptionSource = `Regardez ${videoTitle} de la série ${seriesTitle} sur ${resolvedSiteName}.`;
    } else if (videoTitle) {
      descriptionSource = `Regardez ${videoTitle} en streaming sur ${resolvedSiteName}.`;
    } else {
      descriptionSource = `Découvrez les contenus disponibles sur ${resolvedSiteName}.`;
    }
  }

  const videoPosterCandidate = video?.CheminImage;
  const seriesPosterCandidate = series?.CheminImage;
  const videoPoster = !isDefaultPosterPath(videoPosterCandidate)
    ? normalizePublicPosterPath(videoPosterCandidate)
    : null;
  const seriesPoster = isEpisode && !isDefaultPosterPath(seriesPosterCandidate)
    ? normalizePublicPosterPath(seriesPosterCandidate)
    : null;
  const posterPath = isEpisode
    ? (seriesPoster || videoPoster)
    : videoPoster;
  const posterTitle = posterPath === seriesPoster ? seriesTitle : videoTitle;
  const posterUrl = posterPath ? buildAbsoluteUrl(posterPath, resolvedAssetOrigin) : null;
  const imageUrl = posterUrl || buildAbsoluteUrl("/logo512.png", resolvedPageOrigin);
  const normalizedId = String(id ?? "").trim();
  const parsedId = /^[1-9][0-9]*$/.test(normalizedId) ? Number(normalizedId) : null;
  const canonicalPath = Number.isSafeInteger(parsedId) && parsedId <= 2_147_483_647
    ? `/lecture/${parsedId}`
    : "/";

  return {
    siteName: resolvedSiteName,
    title,
    description: truncateMetaDescription(descriptionSource),
    canonicalUrl: buildAbsoluteUrl(canonicalPath, resolvedPageOrigin),
    imageUrl,
    imageAlt: posterUrl && posterTitle
      ? `Affiche de ${posterTitle}`
      : `Logo de ${resolvedSiteName}`,
    openGraphType: videoTitle ? (isEpisode ? "video.episode" : "video.movie") : "website",
  };
};
