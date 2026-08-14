import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, "..");
const PEOPLE_ROOT = path.join(BACKEND_ROOT, "uploads", "people");
const TEMP_ROOT = path.join(BACKEND_ROOT, "uploads", "tmp", "people-wikimedia");
const CACHE_PATH = path.join(PEOPLE_ROOT, ".wikimedia-image-cache.json");
const ATTRIBUTION_PATH = path.join(PEOPLE_ROOT, "wikimedia-image-attributions.jsonl");
const KNOWN_WIKIDATA_IDS_PATH = path.join(__dirname, "peopleWikidataIds.json");
const ACTIVE_ETAT_ID = 1;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const THUMBNAIL_WIDTH = 600;
const DEFAULT_CONCURRENCY = 2;
const RESOLVER_VERSION = 3;
const NEGATIVE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_NAME_SIMILARITY = 0.86;

const ACTOR_OCCUPATIONS = new Set([
  "Q33999", // actor
  "Q10800557", // film actor
  "Q10798782", // television actor
  "Q2405480", // voice actor
  "Q2259451", // stage actor
  "Q948329", // character actor
]);
const DIRECTOR_OCCUPATIONS = new Set([
  "Q2526255", // film director
  "Q2059704", // television director
  "Q7042855", // animation director
  "Q3455803", // director
  "Q1414443", // filmmaker
]);
const ROLE_DESCRIPTION_PATTERN = /\b(actor|actress|director|filmmaker|performer|voice actor|acteur|actrice|réalisateur|réalisatrice|comedian|comédien|comédienne|seiyu|seiyū)\b/i;
const ACCEPTED_MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function normalizePersonName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’‘`´]/g, "'")
    .toLocaleLowerCase("fr-FR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

export function personNameSimilarity(leftValue, rightValue) {
  const left = normalizePersonName(leftValue);
  const right = normalizePersonName(rightValue);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftTokens = [...new Set(left.split(" "))];
  const rightTokens = [...new Set(right.split(" "))];
  if (leftTokens.length > 1 && leftTokens.length === rightTokens.length
    && [...leftTokens].sort().join(" ") === [...rightTokens].sort().join(" ")) return 0.98;

  const intersection = leftTokens.filter((token) => rightTokens.includes(token)).length;
  const containment = intersection / Math.min(leftTokens.length, rightTokens.length);
  const coverage = intersection / Math.max(leftTokens.length, rightTokens.length);
  const tokenScore = (0.6 * containment) + (0.4 * coverage);
  const compactLeft = left.replaceAll(" ", "");
  const compactRight = right.replaceAll(" ", "");
  const editScore = 1 - (levenshteinDistance(compactLeft, compactRight) / Math.max(compactLeft.length, compactRight.length));
  return Math.max(tokenScore, editScore);
}

export function personDisplayName(person) {
  return [person.Prenom, person.Nom].filter(Boolean).join(" ").trim() || String(person.Surnom ?? "").trim();
}

function claimEntityIds(entity, property) {
  return new Set((entity?.claims?.[property] ?? [])
    .filter((claim) => claim.rank !== "deprecated")
    .map((claim) => claim?.mainsnak?.datavalue?.value?.id)
    .filter(Boolean));
}

function firstClaimString(entity, property) {
  const claims = (entity?.claims?.[property] ?? []).filter((claim) => claim.rank !== "deprecated");
  const preferred = claims.find((claim) => claim.rank === "preferred") ?? claims[0];
  return preferred?.mainsnak?.datavalue?.value ?? null;
}

function localizedValues(container) {
  return Object.values(container ?? {}).flatMap((value) => {
    if (Array.isArray(value)) return value.map((item) => item?.value).filter(Boolean);
    return value?.value ? [value.value] : [];
  });
}

function hasRelevantOccupation(occupationIds, roles) {
  const actorMatch = roles.actor && [...occupationIds].some((id) => ACTOR_OCCUPATIONS.has(id));
  const directorMatch = roles.director && [...occupationIds].some((id) => DIRECTOR_OCCUPATIONS.has(id));
  return actorMatch || directorMatch;
}

export function selectWikidataCandidate(displayName, searchResults, entities, roles) {
  const expectedName = normalizePersonName(displayName);
  const candidates = [];

  for (const [rank, searchResult] of searchResults.entries()) {
    const entity = entities[searchResult.id];
    if (!entity || entity.missing) continue;
    const labels = localizedValues(entity.labels);
    const aliases = localizedValues(entity.aliases);
    const exactLabel = labels.some((label) => normalizePersonName(label) === expectedName);
    const exactAlias = aliases.some((alias) => normalizePersonName(alias) === expectedName);
    const nameSimilarity = Math.max(0, ...[...labels, ...aliases].map((name) => personNameSimilarity(displayName, name)));
    if (nameSimilarity < MIN_NAME_SIMILARITY) continue;

    const imageName = firstClaimString(entity, "P18");
    const occupationIds = claimEntityIds(entity, "P106");
    const descriptions = localizedValues(entity.descriptions).join(" ");
    const occupationMatch = hasRelevantOccupation(occupationIds, roles);
    const descriptionMatch = ROLE_DESCRIPTION_PATTERN.test(descriptions);
    const isHuman = claimEntityIds(entity, "P31").has("Q5");
    if ((!isHuman && !occupationIds.size) || (!occupationMatch && !descriptionMatch)) continue;

    const sitelinkCount = Object.keys(entity.sitelinks ?? {}).length;
    const score = Math.round(nameSimilarity * 100)
      + (exactLabel ? 5 : 0)
      + (exactAlias ? 3 : 0)
      + (occupationMatch ? 35 : 0)
      + (descriptionMatch ? 15 : 0)
      + Math.min(sitelinkCount, 20)
      + Math.max(0, 10 - rank);
    candidates.push({
      wikidataId: entity.id,
      imageName,
      label: labels[0] ?? searchResult.label ?? displayName,
      description: descriptions,
      exactName: exactLabel || exactAlias,
      nameSimilarity,
      score,
      searchRank: rank,
    });
  }

  candidates.sort((left, right) => right.score - left.score || left.searchRank - right.searchRank);
  if (!candidates.length) return { status: "not-found", candidates: [] };
  const exactWinner = candidates.length > 1 && candidates[0]?.exactName && !candidates[1]?.exactName
    && candidates[0].nameSimilarity - candidates[1].nameSimilarity >= 0.05;
  if (candidates.length > 1 && candidates[0].score - candidates[1].score < 20 && !exactWinner) {
    return { status: "ambiguous", candidates: candidates.slice(0, 3) };
  }
  if (!candidates[0].imageName) {
    return { status: "no-image", candidate: candidates[0], candidates: candidates.slice(0, 3) };
  }
  return { status: "matched", candidate: candidates[0], candidates: candidates.slice(0, 3) };
}

export function selectCommonsImageCandidates(displayName, pages) {
  const expected = normalizePersonName(displayName);
  const expectedTokens = expected.split(" ").filter(Boolean);
  const rejected = /\b(signature|autograph|grave|tomb|poster|logo|family|cast|characters|statue|painting|drawing|mural|caricature|cosplay)\b/i;
  const groupConnectors = /\b(and|with|feat|featuring|avec|et)\b|&/i;
  const candidates = [];

  for (const page of pages) {
    const imageName = String(page?.title ?? "").replace(/^File:/i, "");
    if (!/\.(?:jpe?g|png|webp|gif)$/i.test(imageName) || rejected.test(imageName) || groupConnectors.test(imageName)) continue;
    const basename = normalizePersonName(imageName.replace(/\.[^.]+$/, ""));
    const basenameTokens = basename.split(" ").filter(Boolean);
    const containsEveryToken = expectedTokens.every((token) => basenameTokens.includes(token));
    const startsWithName = basename === expected || basename.startsWith(`${expected} `);
    const reversed = expectedTokens.length > 1 ? [...expectedTokens].reverse().join(" ") : expected;
    const startsReversed = basename === reversed || basename.startsWith(`${reversed} `);
    if (!containsEveryToken || (!startsWithName && !startsReversed && basenameTokens.length > expectedTokens.length + 3)) continue;
    const extraTokens = Math.max(0, basenameTokens.length - expectedTokens.length);
    candidates.push({ imageName, score: (startsWithName ? 100 : startsReversed ? 95 : 85) - extraTokens });
  }

  return candidates.sort((left, right) => right.score - left.score || left.imageName.localeCompare(right.imageName));
}

function metadataValue(metadata, key) {
  return metadata?.[key]?.value ?? "";
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function validateImageBytes(buffer, mimeType) {
  if (!ACCEPTED_MIME_TYPES.has(mimeType)) return false;
  if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "image/png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return buffer.length >= 12 && buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
  if (mimeType === "image/gif") return buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString());
  return false;
}

export function parseCliArguments(argv) {
  const options = {
    dryRun: argv.includes("--dry-run"),
    refresh: argv.includes("--refresh"),
    retryMisses: argv.includes("--retry-misses"),
    limit: null,
    personId: null,
    concurrency: DEFAULT_CONCURRENCY,
  };
  for (const argument of argv) {
    const [name, rawValue] = argument.split("=", 2);
    if (name === "--limit") options.limit = Number(rawValue);
    if (name === "--person-id") options.personId = Number(rawValue);
    if (name === "--concurrency") options.concurrency = Number(rawValue);
  }
  if (options.limit !== null && (!Number.isInteger(options.limit) || options.limit <= 0)) throw new Error("--limit doit être un entier positif.");
  if (options.personId !== null && (!Number.isInteger(options.personId) || options.personId <= 0)) throw new Error("--person-id doit être un entier positif.");
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 4) {
    throw new Error("--concurrency doit être compris entre 1 et 4.");
  }
  return options;
}

export function createWikimediaClient({ fetchImpl = fetch, userAgent }) {
  if (!userAgent || !/\([^)]*(?:@|https?:\/\/|User:)[^)]*\)/i.test(userAgent)) {
    throw new Error(
      "WIKIMEDIA_USER_AGENT est requis avec un contact, par exemple "
      + "« SAMI-image-import-bot/1.0 (mailto:admin@example.com) ».",
    );
  }

  let throttleQueue = Promise.resolve();
  let nextRequestAt = 0;

  async function waitForRequestSlot() {
    const turn = throttleQueue.then(async () => {
      const wait = Math.max(0, nextRequestAt - Date.now());
      if (wait) await sleep(wait);
      nextRequestAt = Date.now() + 250;
    });
    throttleQueue = turn.catch(() => {});
    await turn;
  }

  async function fetchWithRetry(url, { binary = false } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        await waitForRequestSlot();
        const response = await fetchImpl(url, { headers: { "user-agent": userAgent, accept: binary ? "image/*" : "application/json" } });
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = Number(response.headers.get("retry-after"));
          await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : attempt * 750);
          continue;
        }
        if (!response.ok) throw new Error(`${response.status} ${response.statusText} pour ${url}`);
        return response;
      } catch (error) {
        lastError = error;
        if (attempt < 5) await sleep(attempt * 500);
      }
    }
    throw lastError ?? new Error(`Requête Wikimedia impossible : ${url}`);
  }

  async function fetchJson(baseUrl, parameters) {
    const url = new URL(baseUrl);
    for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, String(value));
    const response = await fetchWithRetry(url);
    const json = await response.json();
    if (json.error) throw new Error(`Erreur Wikimedia ${json.error.code}: ${json.error.info}`);
    return json;
  }

  async function searchWikidata(searchText, language) {
    const search = await fetchJson("https://www.wikidata.org/w/api.php", {
      action: "wbsearchentities",
      search: searchText,
      language,
      uselang: "fr",
      type: "item",
      limit: 10,
      format: "json",
      origin: "*",
    });
    return search.search ?? [];
  }

  async function resolveSearchResults(displayName, roles, searchResults) {
    if (!searchResults.length) return { status: "not-found", candidates: [] };
    const details = await fetchJson("https://www.wikidata.org/w/api.php", {
      action: "wbgetentities",
      ids: searchResults.map((item) => item.id).join("|"),
      props: "labels|aliases|descriptions|claims|sitelinks/urls",
      languages: "fr|en",
      languagefallback: 1,
      format: "json",
      origin: "*",
    });
    return selectWikidataCandidate(displayName, searchResults, details.entities ?? {}, roles);
  }

  async function getImageInfo(imageName) {
    const result = await fetchJson("https://commons.wikimedia.org/w/api.php", {
      action: "query",
      prop: "imageinfo",
      titles: `File:${imageName}`,
      iiprop: "url|mime|size|extmetadata",
      iiurlwidth: THUMBNAIL_WIDTH,
      iiextmetadatalanguage: "fr",
      iiextmetadatafilter: "Artist|Credit|LicenseShortName|LicenseUrl|UsageTerms|AttributionRequired|Restrictions|ImageDescription",
      format: "json",
      origin: "*",
    });
    const page = Object.values(result.query?.pages ?? {})[0];
    const info = page?.imageinfo?.[0];
    if (!info) throw new Error(`Image Commons introuvable : ${imageName}`);
    const mimeType = info.thumbmime || info.mime;
    const imageUrl = info.thumburl || info.url;
    const licenseShortName = stripHtml(metadataValue(info.extmetadata, "LicenseShortName") || metadataValue(info.extmetadata, "UsageTerms"));
    const licenseUrl = stripHtml(metadataValue(info.extmetadata, "LicenseUrl"));
    if (!imageUrl || !ACCEPTED_MIME_TYPES.has(mimeType)) throw new Error(`Format d’image non pris en charge : ${mimeType || "inconnu"}.`);
    if (!licenseShortName || /non[- ]?free|fair use|copyrighted|all rights reserved/i.test(licenseShortName)) {
      throw new Error(`Licence Commons absente ou non réutilisable : ${licenseShortName || "inconnue"}.`);
    }
    return {
      imageName,
      imageUrl,
      mimeType,
      descriptionUrl: info.descriptionurl,
      artist: stripHtml(metadataValue(info.extmetadata, "Artist")),
      credit: stripHtml(metadataValue(info.extmetadata, "Credit")),
      licenseShortName,
      licenseUrl,
      attributionRequired: stripHtml(metadataValue(info.extmetadata, "AttributionRequired")),
      restrictions: stripHtml(metadataValue(info.extmetadata, "Restrictions")),
      imageDescription: stripHtml(metadataValue(info.extmetadata, "ImageDescription")),
    };
  }

  async function findCommonsImage(displayName) {
    const result = await fetchJson("https://commons.wikimedia.org/w/api.php", {
      action: "query",
      generator: "search",
      gsrsearch: `intitle:"${displayName.replaceAll('"', "")}" filetype:bitmap`,
      gsrnamespace: 6,
      gsrlimit: 12,
      prop: "info",
      format: "json",
      origin: "*",
    });
    const candidates = selectCommonsImageCandidates(displayName, Object.values(result.query?.pages ?? {}));
    for (const candidate of candidates.slice(0, 3)) {
      try {
        await getImageInfo(candidate.imageName);
        return candidate.imageName;
      } catch {}
    }
    return null;
  }

  async function resolvePerson(displayName, roles) {
    const primary = await searchWikidata(displayName, "en");
    let searchResults = primary;
    let resolution = await resolveSearchResults(displayName, roles, searchResults);

    if (resolution.status === "not-found") {
      const tokens = displayName.trim().split(/\s+/).filter(Boolean);
      const fallbackSearches = [searchWikidata(displayName, "fr")];
      if (tokens.length === 2) fallbackSearches.push(searchWikidata([...tokens].reverse().join(" "), "en"));
      const fallbackResults = (await Promise.all(fallbackSearches)).flat();
      searchResults = [...new Map([...primary, ...fallbackResults].map((item) => [item.id, item])).values()];
      resolution = await resolveSearchResults(displayName, roles, searchResults);
    }

    if (resolution.status === "no-image") {
      const imageName = await findCommonsImage(displayName);
      if (imageName) {
        return {
          ...resolution,
          status: "matched",
          candidate: { ...resolution.candidate, imageName, imageSource: "commons-search" },
        };
      }
    }
    return resolution;
  }

  async function resolveKnownPerson(displayName, roles, wikidataId) {
    const result = await resolveSearchResults(displayName, roles, [{ id: wikidataId, label: displayName }]);
    if (result.status !== "no-image") return result;
    const imageName = await findCommonsImage(displayName);
    if (!imageName) return result;
    return {
      ...result,
      status: "matched",
      candidate: { ...result.candidate, imageName, imageSource: "commons-search" },
    };
  }

  async function downloadImage(imageInfo) {
    const response = await fetchWithRetry(imageInfo.imageUrl, { binary: true });
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) throw new Error("Image trop volumineuse (> 5 Mio).");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error("Image trop volumineuse (> 5 Mio).");
    const responseMime = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    const mimeType = ACCEPTED_MIME_TYPES.has(responseMime) ? responseMime : imageInfo.mimeType;
    if (!validateImageBytes(buffer, mimeType)) throw new Error(`Signature d’image invalide pour ${mimeType}.`);
    return { buffer, mimeType, extension: ACCEPTED_MIME_TYPES.get(mimeType) };
  }

  return {
    resolvePerson,
    resolveKnownPerson,
    getImageInfo,
    downloadImage,
  };
}

function personRoles(person) {
  const videoLinks = person.Videos ?? [];
  const seriesLinks = person.Series ?? [];
  return {
    actor: [...videoLinks, ...seriesLinks].some((link) => link.EstActeur),
    director: [...videoLinks, ...seriesLinks].some((link) => link.EstRealisateur),
  };
}

function personTitles(person) {
  return [...new Set([
    ...(person.Videos ?? []).map((link) => link.Video?.Titre),
    ...(person.Series ?? []).map((link) => link.Series?.Titre),
  ].filter(Boolean))].slice(0, 10);
}

async function loadCache() {
  try {
    return JSON.parse(await fs.readFile(CACHE_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function loadKnownWikidataIds() {
  try {
    const data = JSON.parse(await fs.readFile(KNOWN_WIKIDATA_IDS_PATH, "utf8"));
    return data.people ?? {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}

async function saveJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await callback(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function cachedResolution(cache, person, displayName, options) {
  if (options.refresh) return null;
  const entry = cache[person.PersonneID];
  if (!entry || entry.nameKey !== normalizePersonName(displayName) || entry.resolverVersion !== RESOLVER_VERSION) return null;
  const resolution = entry.resolution ?? null;
  if (!resolution) return null;
  if (options.retryMisses && resolution.status !== "matched") return null;
  if (resolution.status !== "matched") {
    const checkedAt = Date.parse(entry.checkedAt);
    if (!Number.isFinite(checkedAt) || Date.now() - checkedAt >= NEGATIVE_CACHE_TTL_MS) return null;
  }
  return resolution;
}

async function installImage({ prisma, person, displayName, roles, candidate, imageInfo, downloaded }) {
  const personDirectory = path.join(PEOPLE_ROOT, String(person.PersonneID));
  await fs.mkdir(personDirectory, { recursive: true });
  await fs.mkdir(TEMP_ROOT, { recursive: true });
  const uniquePart = `${Date.now()}-${process.pid}`;
  const temporaryPath = path.join(TEMP_ROOT, `${person.PersonneID}-${uniquePart}.${downloaded.extension}.tmp`);
  const filename = `${uniquePart}-wikimedia.${downloaded.extension}`;
  const finalPath = path.join(personDirectory, filename);
  const relativePath = path.join("uploads", "people", String(person.PersonneID), filename);
  await fs.writeFile(temporaryPath, downloaded.buffer);
  await fs.rename(temporaryPath, finalPath);

  const updated = await prisma.personne.updateMany({
    where: {
      PersonneID: person.PersonneID,
      ImageStatut: "DEFAULT",
      OR: [{ CheminImage: null }, { CheminImage: "" }],
    },
    data: { CheminImage: relativePath, ImageStatut: "CUSTOM" },
  });
  if (!updated.count) {
    await fs.unlink(finalPath).catch(() => {});
    return { status: "already-has-image" };
  }

  const attribution = {
    PersonneID: person.PersonneID,
    name: displayName,
    roles,
    wikidataId: candidate.wikidataId,
    wikidataUrl: `https://www.wikidata.org/wiki/${candidate.wikidataId}`,
    imageSource: candidate.imageSource ?? "wikidata-p18",
    commonsFile: imageInfo.imageName,
    commonsUrl: imageInfo.descriptionUrl,
    artist: imageInfo.artist,
    credit: imageInfo.credit,
    license: imageInfo.licenseShortName,
    licenseUrl: imageInfo.licenseUrl,
    attributionRequired: imageInfo.attributionRequired,
    restrictions: imageInfo.restrictions,
    localPath: relativePath,
    importedAt: new Date().toISOString(),
  };
  try {
    await fs.appendFile(ATTRIBUTION_PATH, `${JSON.stringify(attribution)}\n`, "utf8");
  } catch (error) {
    await prisma.personne.updateMany({
      where: { PersonneID: person.PersonneID, CheminImage: relativePath },
      data: { CheminImage: null, ImageStatut: "DEFAULT" },
    });
    await fs.unlink(finalPath).catch(() => {});
    throw error;
  }
  return { status: "imported", relativePath, attribution };
}

export async function runPersonImageSeed({ prisma, client, options, logger = console }) {
  await fs.mkdir(PEOPLE_ROOT, { recursive: true });
  const cache = await loadCache();
  const knownWikidataIds = await loadKnownWikidataIds();
  const people = await prisma.personne.findMany({
    where: {
      EtatID: ACTIVE_ETAT_ID,
      ImageStatut: "DEFAULT",
      OR: [{ CheminImage: null }, { CheminImage: "" }],
      ...(options.personId ? { PersonneID: options.personId } : {}),
    },
    orderBy: { PersonneID: "asc" },
    select: {
      PersonneID: true,
      Nom: true,
      Prenom: true,
      Surnom: true,
      Videos: {
        where: { OR: [{ EstActeur: true }, { EstRealisateur: true }] },
        select: { EstActeur: true, EstRealisateur: true, Video: { select: { Titre: true } } },
      },
      Series: {
        where: { OR: [{ EstActeur: true }, { EstRealisateur: true }] },
        select: { EstActeur: true, EstRealisateur: true, Series: { select: { Titre: true } } },
      },
    },
  });
  const selectedPeople = options.limit ? people.slice(0, options.limit) : people;
  const summary = {
    eligible: people.length,
    selected: selectedPeople.length,
    imported: 0,
    matchedDryRun: 0,
    alreadyHasImage: 0,
    notFound: 0,
    noImage: 0,
    ambiguous: 0,
    commonsFallback: 0,
    knownIdMatches: 0,
    errors: 0,
  };
  let cacheWrite = Promise.resolve();
  let completed = 0;

  const results = await mapLimit(selectedPeople, options.concurrency, async (person) => {
    const displayName = personDisplayName(person);
    const roles = personRoles(person);
    const titles = personTitles(person);
    try {
      let resolution = cachedResolution(cache, person, displayName, options);
      if (!resolution) {
        const knownWikidataId = knownWikidataIds[normalizePersonName(displayName)];
        if (knownWikidataId && client.resolveKnownPerson) {
          resolution = await client.resolveKnownPerson(displayName, roles, knownWikidataId);
          if (resolution.status !== "not-found") summary.knownIdMatches += 1;
        }
        if (!resolution || resolution.status === "not-found") resolution = await client.resolvePerson(displayName, roles);
      }
      cache[person.PersonneID] = {
        resolverVersion: RESOLVER_VERSION,
        name: displayName,
        nameKey: normalizePersonName(displayName),
        roles,
        titles,
        resolution,
        checkedAt: new Date().toISOString(),
      };
      cacheWrite = cacheWrite.then(() => saveJsonAtomic(CACHE_PATH, cache));
      await cacheWrite;

      if (resolution.status === "not-found") {
        summary.notFound += 1;
        return { PersonneID: person.PersonneID, name: displayName, status: "not-found" };
      }
      if (resolution.status === "no-image") {
        summary.noImage += 1;
        return { PersonneID: person.PersonneID, name: displayName, status: "no-image", candidate: resolution.candidate };
      }
      if (resolution.status === "ambiguous") {
        summary.ambiguous += 1;
        return { PersonneID: person.PersonneID, name: displayName, status: "ambiguous", candidates: resolution.candidates };
      }

      if (resolution.candidate.imageSource === "commons-search") summary.commonsFallback += 1;
      const imageInfo = await client.getImageInfo(resolution.candidate.imageName);
      if (options.dryRun) {
        summary.matchedDryRun += 1;
        return { PersonneID: person.PersonneID, name: displayName, status: "matched-dry-run", candidate: resolution.candidate, imageInfo };
      }
      const downloaded = await client.downloadImage(imageInfo);
      const installation = await installImage({ prisma, person, displayName, roles, candidate: resolution.candidate, imageInfo, downloaded });
      if (installation.status === "imported") summary.imported += 1;
      if (installation.status === "already-has-image") summary.alreadyHasImage += 1;
      return { PersonneID: person.PersonneID, name: displayName, ...installation };
    } catch (error) {
      summary.errors += 1;
      return { PersonneID: person.PersonneID, name: displayName, status: "error", error: error.message };
    } finally {
      completed += 1;
      if (completed % 10 === 0 || completed === selectedPeople.length) {
        logger.log(`Progression Wikimedia : ${completed}/${selectedPeople.length}`);
      }
    }
  });

  const reportPath = path.join(PEOPLE_ROOT, `wikimedia-image-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify({ summary, results }, null, 2)}\n`, "utf8");
  const missesReportPath = reportPath.replace("wikimedia-image-report-", "wikimedia-image-misses-").replace(/\.json$/, ".csv");
  const misses = results.filter((result) => ["not-found", "no-image", "ambiguous", "error"].includes(result.status));
  const peopleById = new Map(selectedPeople.map((person) => [person.PersonneID, person]));
  await fs.writeFile(missesReportPath, toCsv([
    ["PersonneID", "Nom", "Statut", "Rôles", "Œuvres liées", "WikidataID", "Candidats", "Erreur"],
    ...misses.map((result) => {
      const person = peopleById.get(result.PersonneID);
      const roles = personRoles(person ?? {});
      return [
        result.PersonneID,
        result.name,
        result.status,
        [roles.actor ? "acteur" : "", roles.director ? "réalisateur" : ""].filter(Boolean).join(" | "),
        personTitles(person ?? {}).join(" | "),
        result.candidate?.wikidataId ?? "",
        (result.candidates ?? []).map((candidate) => `${candidate.wikidataId}:${candidate.label}`).join(" | "),
        result.error ?? "",
      ];
    }),
  ]), "utf8");
  return { summary, results, reportPath, missesReportPath, cachePath: CACHE_PATH, attributionPath: ATTRIBUTION_PATH };
}

async function runCli() {
  const options = parseCliArguments(process.argv.slice(2));
  const client = createWikimediaClient({ userAgent: process.env.WIKIMEDIA_USER_AGENT });
  const prisma = new PrismaClient();
  try {
    const result = await runPersonImageSeed({ prisma, client, options });
    console.log(options.dryRun ? "Simulation terminée :" : "Import des images terminé :", JSON.stringify({
      ...result.summary,
      reportPath: result.reportPath,
      missesReportPath: result.missesReportPath,
      attributionPath: result.attributionPath,
    }, null, 2));
    if (options.dryRun) console.log("Aucune image et aucune ligne de base de données n’ont été modifiées.");
  } finally {
    await prisma.$disconnect();
  }
}

const isMainModule = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) {
  runCli().catch((error) => {
    console.error("Échec du seed des photos de personnes :", error);
    process.exitCode = 1;
  });
}
