import { ETAT } from "../constants.js";
import { prisma } from "./db.js";

export const SOCIAL_META_START = '<meta name="sami-meta-start" content="" />';
export const SOCIAL_META_END = '<meta name="sami-meta-end" content="" />';

const LEGACY_SOCIAL_META_START = "<!-- SAMI_META_START -->";
const LEGACY_SOCIAL_META_END = "<!-- SAMI_META_END -->";

const DEFAULT_APP_NAME = "SAMI";
const DEFAULT_DESCRIPTION_MAX_LENGTH = 200;
const FALLBACK_IMAGE_PATH = "/logo512.png";
const MAX_PRISMA_INT = 2_147_483_647;

export function parseLectureVideoId(value) {
  const normalized = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) return null;

  const videoId = Number(normalized);
  return Number.isSafeInteger(videoId) && videoId <= MAX_PRISMA_INT ? videoId : null;
}

export function normalizeSocialText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function truncateSocialText(value, maxLength = DEFAULT_DESCRIPTION_MAX_LENGTH) {
  const normalized = normalizeSocialText(value);
  const characters = Array.from(normalized);
  if (characters.length <= maxLength) return normalized;
  if (maxLength <= 1) return "…".slice(0, Math.max(0, maxLength));
  return `${characters.slice(0, maxLength - 1).join("").trimEnd()}…`;
}

export function isPlaceholderImagePath(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .split(/[?#]/, 1)[0]
    .toLowerCase();
  if (!normalized) return true;

  const filename = normalized.split("/").filter(Boolean).pop() || "";
  const stem = filename.replace(/\.[^.]+$/, "").replace(/[^a-z0-9]/g, "");
  return stem === "default" || stem === "imagedefault" || stem === "defaultimage";
}

function normalizePublicAssetPath(value) {
  const normalized = String(value ?? "").trim().replace(/\\/g, "/");
  if (!normalized || /[\u0000-\u001f\u007f?#%]/.test(normalized)) return null;

  const withoutLeadingSlash = normalized.replace(/^\/+/, "");
  const segments = withoutLeadingSlash.split("/");
  if (
    !withoutLeadingSlash.startsWith("uploads/")
    || segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    return null;
  }

  return `/${withoutLeadingSlash}`;
}

function parseHttpOrigin(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

export function resolvePublicOrigin(publicUrl) {
  const configuredOrigins = String(publicUrl || "")
    .split(",")
    .map((candidate) => parseHttpOrigin(candidate.trim()))
    .filter(Boolean);
  if (configuredOrigins.length > 0) return configuredOrigins[0];
  return "http://localhost";
}

function buildAbsoluteUrl(origin, pathname) {
  return new URL(pathname, `${origin}/`).toString();
}

function selectPublicPoster(content) {
  const candidates = content?.type === "episode"
    ? [
        { image: content?.series?.image, source: "series" },
        { image: content?.video?.image, source: "video" },
      ]
    : [
        { image: content?.video?.image, source: "video" },
        { image: content?.series?.image, source: "series" },
      ];

  for (const candidate of candidates) {
    if (isPlaceholderImagePath(candidate.image)) continue;
    const path = normalizePublicAssetPath(candidate.image);
    if (path) return { path, source: candidate.source };
  }

  return null;
}

export async function getLectureSocialMetadata(
  videoId,
  { database = prisma } = {}
) {
  const parsedVideoId = parseLectureVideoId(videoId);
  if (!parsedVideoId) return null;

  const video = await database.video.findFirst({
    where: {
      VideoID: parsedVideoId,
      EtatID: ETAT.ACTIVE,
    },
    select: {
      VideoID: true,
      Titre: true,
      Resumer: true,
      CheminImage: true,
      Saison: {
        select: {
          Numero: true,
          Series: {
            select: {
              Titre: true,
              Resumer: true,
              CheminImage: true,
              EtatID: true,
            },
          },
        },
      },
    },
  });

  if (!video) return null;

  if (video.Saison) {
    const series = video.Saison.Series;
    if (!series || series.EtatID !== ETAT.ACTIVE) return null;

    return {
      type: "episode",
      videoId: video.VideoID,
      video: {
        title: video.Titre,
        summary: video.Resumer,
        image: video.CheminImage,
      },
      season: { number: video.Saison.Numero },
      series: {
        title: series.Titre,
        summary: series.Resumer,
        image: series.CheminImage,
      },
    };
  }

  return {
    type: "movie",
    videoId: video.VideoID,
    video: {
      title: video.Titre,
      summary: video.Resumer,
      image: video.CheminImage,
    },
    season: null,
    series: null,
  };
}

export function buildLectureSocialMeta({
  content,
  videoId,
  appName = DEFAULT_APP_NAME,
  publicOrigin,
}) {
  const siteName = normalizeSocialText(appName) || DEFAULT_APP_NAME;
  const parsedVideoId = parseLectureVideoId(videoId);
  const canonicalPath = parsedVideoId ? `/lecture/${parsedVideoId}` : "/";
  const canonicalUrl = buildAbsoluteUrl(publicOrigin, canonicalPath);

  if (!content) {
    return {
      type: "website",
      siteName,
      title: siteName,
      description: `Découvrez les contenus disponibles sur ${siteName}.`,
      imageUrl: buildAbsoluteUrl(publicOrigin, FALLBACK_IMAGE_PATH),
      imageAlt: `Logo de ${siteName}`,
      canonicalUrl,
    };
  }

  const videoTitle = normalizeSocialText(content.video?.title) || "Vidéo";
  const seriesTitle = normalizeSocialText(content.series?.title);
  const seasonNumber = Number(content.season?.number);
  const isEpisode = content.type === "episode" && Boolean(seriesTitle);
  const hasSeasonNumber = Number.isInteger(seasonNumber) && seasonNumber > 0;

  const title = isEpisode
    ? hasSeasonNumber
      ? `${videoTitle} (Saison ${seasonNumber} - ${seriesTitle}) - ${siteName}`
      : `${videoTitle} (${seriesTitle}) - ${siteName}`
    : `${videoTitle} - ${siteName}`;
  const fallbackDescription = isEpisode
    ? `Regardez ${videoTitle} de la série ${seriesTitle} sur ${siteName}.`
    : `Regardez ${videoTitle} en streaming sur ${siteName}.`;
  const videoSummary = normalizeSocialText(content.video?.summary);
  const seriesSummary = normalizeSocialText(content.series?.summary);
  const description = truncateSocialText(
    videoSummary || (isEpisode ? seriesSummary : "") || fallbackDescription
  );
  const poster = selectPublicPoster(content);
  const publicPosterPath = poster?.path || FALLBACK_IMAGE_PATH;

  return {
    type: isEpisode ? "video.episode" : "video.movie",
    siteName,
    title,
    description,
    imageUrl: buildAbsoluteUrl(publicOrigin, publicPosterPath),
    imageAlt: poster
      ? `Affiche de ${poster.source === "series" ? seriesTitle : videoTitle}`
      : `Logo de ${siteName}`,
    canonicalUrl,
  };
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderSocialMetaBlock(meta) {
  const title = escapeHtml(meta.title);
  const description = escapeHtml(meta.description);
  const siteName = escapeHtml(meta.siteName);
  const type = escapeHtml(meta.type);
  const imageUrl = escapeHtml(meta.imageUrl);
  const imageAlt = escapeHtml(meta.imageAlt);
  const canonicalUrl = escapeHtml(meta.canonicalUrl);

  return [
    SOCIAL_META_START,
    `  <title data-rh="true">${title}</title>`,
    `  <meta data-rh="true" name="application-name" content="${siteName}" />`,
    `  <meta data-rh="true" name="description" content="${description}" />`,
    `  <meta data-rh="true" property="og:type" content="${type}" />`,
    `  <meta data-rh="true" property="og:site_name" content="${siteName}" />`,
    `  <meta data-rh="true" property="og:title" content="${title}" />`,
    `  <meta data-rh="true" property="og:description" content="${description}" />`,
    `  <meta data-rh="true" property="og:image" content="${imageUrl}" />`,
    `  <meta data-rh="true" property="og:image:alt" content="${imageAlt}" />`,
    `  <meta data-rh="true" property="og:url" content="${canonicalUrl}" />`,
    '  <meta data-rh="true" property="og:locale" content="fr_FR" />',
    '  <meta data-rh="true" name="twitter:card" content="summary_large_image" />',
    `  <meta data-rh="true" name="twitter:title" content="${title}" />`,
    `  <meta data-rh="true" name="twitter:description" content="${description}" />`,
    `  <meta data-rh="true" name="twitter:image" content="${imageUrl}" />`,
    `  <meta data-rh="true" name="twitter:image:alt" content="${imageAlt}" />`,
    `  <link data-rh="true" rel="canonical" href="${canonicalUrl}" />`,
    SOCIAL_META_END,
  ].join("\n");
}

export function injectSocialMetaBlock(htmlTemplate, metaBlock) {
  const template = String(htmlTemplate ?? "");
  const persistentStart = /<meta\b(?=[^>]*\bname\s*=\s*["']sami-meta-start["'])[^>]*>/i.exec(
    template
  );
  const persistentEnd = /<meta\b(?=[^>]*\bname\s*=\s*["']sami-meta-end["'])[^>]*>/i.exec(
    template
  );

  if (
    persistentStart
    && persistentEnd
    && persistentEnd.index > persistentStart.index
  ) {
    return `${template.slice(0, persistentStart.index)}${metaBlock}${template.slice(
      persistentEnd.index + persistentEnd[0].length
    )}`;
  }

  const legacyStartIndex = template.indexOf(LEGACY_SOCIAL_META_START);
  const legacyEndIndex = template.indexOf(LEGACY_SOCIAL_META_END);

  if (legacyStartIndex !== -1 && legacyEndIndex > legacyStartIndex) {
    return `${template.slice(0, legacyStartIndex)}${metaBlock}${template.slice(
      legacyEndIndex + LEGACY_SOCIAL_META_END.length
    )}`;
  }

  const closingHeadIndex = template.toLowerCase().lastIndexOf("</head>");
  if (closingHeadIndex === -1) {
    throw new Error("Le template React ne contient pas de balise </head>.");
  }

  return `${template.slice(0, closingHeadIndex)}${metaBlock}\n${template.slice(closingHeadIndex)}`;
}
