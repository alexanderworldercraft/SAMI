import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_REPOSITORY_ROOT = path.resolve(__dirname, "../..");
const ACTIVE_ETAT_ID = 1;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 };
const UPDATE_CHUNK_SIZE = 400;

export const DEFAULT_CSV_SOURCES = [
  {
    relativePath: "outputs/film_credits/film_acteurs_principaux.csv",
    contentType: "video",
    idColumn: "VideoID",
    peopleColumn: "ActeursPrincipaux",
    role: "actor",
  },
  {
    relativePath: "outputs/film_credits/film_realisateurs.csv",
    contentType: "video",
    idColumn: "VideoID",
    peopleColumn: "Réalisateurs",
    role: "director",
  },
  {
    relativePath: "outputs/series_credits/series_acteurs_principaux.csv",
    contentType: "series",
    idColumn: "SeriesID",
    peopleColumn: "ActeursPrincipaux",
    role: "actor",
  },
  {
    relativePath: "outputs/series_credits/series_realisateurs.csv",
    contentType: "series",
    idColumn: "SeriesID",
    peopleColumn: "Réalisateurs",
    role: "director",
  },
  {
    relativePath: "outputs/series_credits_remaining/series_acteurs_principaux_restants.csv",
    contentType: "series",
    idColumn: "SeriesID",
    peopleColumn: "ActeursPrincipaux",
    role: "actor",
  },
  {
    relativePath: "outputs/series_credits_remaining/series_realisateurs_restants.csv",
    contentType: "series",
    idColumn: "SeriesID",
    peopleColumn: "Réalisateurs",
    role: "director",
  },
];

export function parseSemicolonCsv(text) {
  const input = String(text ?? "").replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ";") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error("CSV invalide : guillemet fermant manquant.");
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ""));
    rows.push(row);
  }

  return rows.filter((values) => values.some((value) => value !== ""));
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

export function splitPersonName(fullName) {
  const cleaned = String(fullName ?? "").trim().replace(/\s+/g, " ");
  if (!cleaned) throw new Error("Impossible de créer une personne sans nom.");

  const parts = cleaned.split(" ");
  if (parts.length === 1) return { Prenom: "", Nom: parts[0], Surnom: null };

  const suffixes = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv"]);
  const particles = new Set(["al", "bin", "da", "de", "del", "della", "des", "di", "dos", "du", "la", "le", "van", "von"]);
  let surnameStart = suffixes.has(parts.at(-1).toLocaleLowerCase("fr-FR")) && parts.length > 2
    ? parts.length - 2
    : parts.length - 1;

  while (surnameStart > 1 && particles.has(parts[surnameStart - 1].toLocaleLowerCase("fr-FR"))) {
    surnameStart -= 1;
  }

  return {
    Prenom: parts.slice(0, surnameStart).join(" "),
    Nom: parts.slice(surnameStart).join(" "),
    Surnom: null,
  };
}

function requireColumn(headers, column, filePath) {
  const index = headers.indexOf(column);
  if (index === -1) throw new Error(`${filePath} : colonne « ${column} » absente.`);
  return index;
}

function addContentTitle(contentTitles, contentType, contentId, title, sourcePath) {
  const key = `${contentType}:${contentId}`;
  const existing = contentTitles.get(key);
  if (existing && normalizePersonName(existing.title) !== normalizePersonName(title)) {
    throw new Error(
      `${sourcePath} : le contenu ${key} porte deux titres différents (« ${existing.title} » et « ${title} »).`,
    );
  }
  if (!existing) contentTitles.set(key, { contentType, contentId, title, sourcePath });
}

export async function buildImportPlan({
  repositoryRoot = DEFAULT_REPOSITORY_ROOT,
  sources = DEFAULT_CSV_SOURCES,
} = {}) {
  const people = new Map();
  const links = new Map();
  const contentTitles = new Map();
  const sourceStats = [];

  for (const source of sources) {
    const absolutePath = path.resolve(repositoryRoot, source.relativePath);
    const rows = parseSemicolonCsv(await fs.readFile(absolutePath, "utf8"));
    if (!rows.length) throw new Error(`${absolutePath} : fichier vide.`);

    const headers = rows[0].map((value) => value.trim());
    const idIndex = requireColumn(headers, source.idColumn, absolutePath);
    const titleIndex = requireColumn(headers, "Titre", absolutePath);
    const peopleIndex = requireColumn(headers, source.peopleColumn, absolutePath);
    const expectedWidth = headers.length;
    const seenIds = new Set();
    let emptyCreditRows = 0;
    let creditCount = 0;

    for (const [offset, values] of rows.slice(1).entries()) {
      const lineNumber = offset + 2;
      if (values.length !== expectedWidth) {
        throw new Error(`${absolutePath}:${lineNumber} : ${values.length} colonnes au lieu de ${expectedWidth}.`);
      }

      const contentId = Number(values[idIndex]);
      const title = values[titleIndex].trim();
      if (!Number.isInteger(contentId) || contentId <= 0) {
        throw new Error(`${absolutePath}:${lineNumber} : identifiant invalide « ${values[idIndex]} ».`);
      }
      if (!title) throw new Error(`${absolutePath}:${lineNumber} : titre vide.`);
      if (seenIds.has(contentId)) throw new Error(`${absolutePath}:${lineNumber} : identifiant ${contentId} dupliqué.`);
      seenIds.add(contentId);
      addContentTitle(contentTitles, source.contentType, contentId, title, absolutePath);

      const rowPeople = values[peopleIndex].split("|").map((name) => name.trim()).filter(Boolean);
      if (!rowPeople.length) emptyCreditRows += 1;

      for (const displayName of rowPeople) {
        const personKey = normalizePersonName(displayName);
        if (!personKey) throw new Error(`${absolutePath}:${lineNumber} : nom de personne invalide.`);
        if (!people.has(personKey)) people.set(personKey, displayName);

        const linkKey = `${source.contentType}:${contentId}:${personKey}`;
        const link = links.get(linkKey) ?? {
          contentType: source.contentType,
          contentId,
          title,
          personKey,
          displayName: people.get(personKey),
          EstActeur: false,
          EstRealisateur: false,
        };
        if (source.role === "actor") link.EstActeur = true;
        if (source.role === "director") link.EstRealisateur = true;
        links.set(linkKey, link);
        creditCount += 1;
      }
    }

    sourceStats.push({
      file: source.relativePath,
      rows: rows.length - 1,
      emptyCreditRows,
      credits: creditCount,
    });
  }

  return {
    people,
    links,
    contentTitles,
    sourceStats,
    videoIds: [...new Set([...contentTitles.values()].filter((item) => item.contentType === "video").map((item) => item.contentId))],
    seriesIds: [...new Set([...contentTitles.values()].filter((item) => item.contentType === "series").map((item) => item.contentId))],
  };
}

function indexExistingPeople(existingPeople, desiredPeople) {
  const matches = new Map();
  for (const person of existingPeople) {
    const keys = new Set([
      normalizePersonName([person.Prenom, person.Nom].filter(Boolean).join(" ")),
      normalizePersonName(person.Surnom),
    ].filter(Boolean));

    for (const key of keys) {
      if (!desiredPeople.has(key)) continue;
      const current = matches.get(key) ?? [];
      current.push(person);
      matches.set(key, current);
    }
  }

  const duplicates = [...matches.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([key, values]) => ({ name: desiredPeople.get(key), ids: values.map((value) => value.PersonneID) }));
  if (duplicates.length) {
    throw new Error(`Personnes en double dans la base : ${JSON.stringify(duplicates)}.`);
  }

  const inactive = [...matches.entries()]
    .filter(([, values]) => values[0].EtatID !== ACTIVE_ETAT_ID)
    .map(([key, values]) => ({ name: desiredPeople.get(key), PersonneID: values[0].PersonneID, EtatID: values[0].EtatID }));
  if (inactive.length) {
    throw new Error(`Personnes existantes mais inactives à restaurer avant le seed : ${JSON.stringify(inactive)}.`);
  }

  return new Map([...matches.entries()].map(([key, values]) => [key, values[0]]));
}

function missingContentIds(expectedIds, databaseRows, idColumn) {
  const found = new Set(databaseRows.map((row) => row[idColumn]));
  return expectedIds.filter((id) => !found.has(id));
}

function chunks(values, size = UPDATE_CHUNK_SIZE) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function compoundKey(contentId, personId) {
  return `${contentId}:${personId}`;
}

async function applyRoleUpdates(delegate, idColumn, roleColumn, links) {
  let updated = 0;
  for (const batch of chunks(links)) {
    const result = await delegate.updateMany({
      where: {
        OR: batch.map((link) => ({ [idColumn]: link.contentId, PersonneID: link.PersonneID })),
        [roleColumn]: false,
      },
      data: { [roleColumn]: true },
    });
    updated += result.count;
  }
  return updated;
}

async function synchronizeContentLinks(tx, contentType, desiredLinks) {
  const isVideo = contentType === "video";
  const delegate = isVideo ? tx.videoPersonne : tx.seriesPersonne;
  const idColumn = isVideo ? "VideoID" : "SeriesID";
  const ids = [...new Set(desiredLinks.map((link) => link.contentId))];
  const personIds = [...new Set(desiredLinks.map((link) => link.PersonneID))];
  const existing = ids.length && personIds.length
    ? await delegate.findMany({
      where: { [idColumn]: { in: ids }, PersonneID: { in: personIds } },
      select: { [idColumn]: true, PersonneID: true, EstActeur: true, EstRealisateur: true },
    })
    : [];
  const existingByKey = new Map(existing.map((link) => [compoundKey(link[idColumn], link.PersonneID), link]));
  const toCreate = [];
  const actorUpdates = [];
  const directorUpdates = [];
  let unchanged = 0;

  for (const link of desiredLinks) {
    const current = existingByKey.get(compoundKey(link.contentId, link.PersonneID));
    if (!current) {
      toCreate.push({
        [idColumn]: link.contentId,
        PersonneID: link.PersonneID,
        EstActeur: link.EstActeur,
        EstRealisateur: link.EstRealisateur,
      });
      continue;
    }

    let needsUpdate = false;
    if (link.EstActeur && !current.EstActeur) {
      actorUpdates.push(link);
      needsUpdate = true;
    }
    if (link.EstRealisateur && !current.EstRealisateur) {
      directorUpdates.push(link);
      needsUpdate = true;
    }
    if (!needsUpdate) unchanged += 1;
  }

  if (toCreate.length) await delegate.createMany({ data: toCreate, skipDuplicates: true });
  const actorsAdded = await applyRoleUpdates(delegate, idColumn, "EstActeur", actorUpdates);
  const directorsAdded = await applyRoleUpdates(delegate, idColumn, "EstRealisateur", directorUpdates);

  return {
    created: toCreate.length,
    updated: new Set([...actorUpdates, ...directorUpdates].map((link) => compoundKey(link.contentId, link.PersonneID))).size,
    unchanged,
    actorsAdded,
    directorsAdded,
  };
}

export async function applyImportPlan(prisma, plan) {
  return prisma.$transaction(async (tx) => {
    const [videos, series, existingPeople] = await Promise.all([
      tx.video.findMany({ where: { VideoID: { in: plan.videoIds } }, select: { VideoID: true } }),
      tx.series.findMany({ where: { SeriesID: { in: plan.seriesIds } }, select: { SeriesID: true } }),
      tx.personne.findMany({
        select: { PersonneID: true, Nom: true, Prenom: true, Surnom: true, EtatID: true },
      }),
    ]);

    const missingVideos = missingContentIds(plan.videoIds, videos, "VideoID");
    const missingSeries = missingContentIds(plan.seriesIds, series, "SeriesID");
    if (missingVideos.length || missingSeries.length) {
      throw new Error(`Contenus absents de la base : ${JSON.stringify({ missingVideos, missingSeries })}.`);
    }

    const existingMatches = indexExistingPeople(existingPeople, plan.people);
    const peopleToCreate = [...plan.people.entries()]
      .filter(([key]) => !existingMatches.has(key))
      .map(([, displayName]) => ({
        ...splitPersonName(displayName),
        CheminImage: null,
        ImageStatut: "DEFAULT",
        EtatID: ACTIVE_ETAT_ID,
      }));
    if (peopleToCreate.length) await tx.personne.createMany({ data: peopleToCreate });

    const allPeople = peopleToCreate.length
      ? await tx.personne.findMany({
        select: { PersonneID: true, Nom: true, Prenom: true, Surnom: true, EtatID: true },
      })
      : existingPeople;
    const personByKey = indexExistingPeople(allPeople, plan.people);
    const unresolvedPeople = [...plan.people.keys()].filter((key) => !personByKey.has(key));
    if (unresolvedPeople.length) {
      throw new Error(`Personnes impossibles à retrouver après création : ${JSON.stringify(unresolvedPeople)}.`);
    }

    const resolvedLinks = [...plan.links.values()].map((link) => ({
      ...link,
      PersonneID: personByKey.get(link.personKey).PersonneID,
    }));
    const videoLinks = resolvedLinks.filter((link) => link.contentType === "video");
    const seriesLinks = resolvedLinks.filter((link) => link.contentType === "series");
    const videoResult = await synchronizeContentLinks(tx, "video", videoLinks);
    const seriesResult = await synchronizeContentLinks(tx, "series", seriesLinks);

    return {
      people: {
        requested: plan.people.size,
        existing: existingMatches.size,
        created: peopleToCreate.length,
      },
      videos: { contents: plan.videoIds.length, links: videoLinks.length, ...videoResult },
      series: { contents: plan.seriesIds.length, links: seriesLinks.length, ...seriesResult },
    };
  }, TRANSACTION_OPTIONS);
}

function summarizePlan(plan) {
  return {
    files: plan.sourceStats,
    uniquePeople: plan.people.size,
    uniqueLinks: plan.links.size,
    videos: plan.videoIds.length,
    series: plan.seriesIds.length,
  };
}

async function runCli() {
  const dryRun = process.argv.includes("--dry-run");
  const plan = await buildImportPlan();
  console.log("CSV validés :", JSON.stringify(summarizePlan(plan), null, 2));
  if (dryRun) {
    console.log("Mode simulation : aucune écriture en base.");
    return;
  }

  const prisma = new PrismaClient();
  try {
    const result = await applyImportPlan(prisma, plan);
    console.log("Seed terminé :", JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

const isMainModule = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMainModule) {
  runCli().catch((error) => {
    console.error("Échec du seed temporaire :", error);
    process.exitCode = 1;
  });
}
