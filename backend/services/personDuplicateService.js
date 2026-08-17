import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ETAT } from "../constants.js";
import { normalizePersonName } from "../prisma/seedCreditsPersonnes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKEND_ROOT = path.resolve(__dirname, "..");
const PEOPLE_ROOT = path.join(BACKEND_ROOT, "uploads", "people");
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 };
const DUPLICATE_THRESHOLD = 0.86;

export class PersonDuplicateError extends Error {
  constructor(message, statusCode = 400, code = "PERSON_DUPLICATE_INVALID") {
    super(message);
    this.name = "PersonDuplicateError";
    this.statusCode = statusCode;
    this.code = code;
  }
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

function compactPersonName(value) {
  return normalizePersonName(value).replaceAll(" ", "");
}

function jaroWinklerSimilarity(leftValue, rightValue) {
  const left = compactPersonName(leftValue);
  const right = compactPersonName(rightValue);
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  if (left === right) return 1;

  const matchDistance = Math.max(0, Math.floor(Math.max(left.length, right.length) / 2) - 1);
  const leftMatches = Array(left.length).fill(false);
  const rightMatches = Array(right.length).fill(false);
  let matches = 0;

  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const start = Math.max(0, leftIndex - matchDistance);
    const end = Math.min(right.length, leftIndex + matchDistance + 1);
    for (let rightIndex = start; rightIndex < end; rightIndex += 1) {
      if (rightMatches[rightIndex] || left[leftIndex] !== right[rightIndex]) continue;
      leftMatches[leftIndex] = true;
      rightMatches[rightIndex] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;

  const leftMatched = leftMatches
    .map((matched, index) => (matched ? left[index] : ""))
    .join("");
  const rightMatched = rightMatches
    .map((matched, index) => (matched ? right[index] : ""))
    .join("");
  let mismatches = 0;
  for (let index = 0; index < leftMatched.length; index += 1) {
    if (leftMatched[index] !== rightMatched[index]) mismatches += 1;
  }
  const transpositions = mismatches / 2;
  const jaro = (
    (matches / left.length)
    + (matches / right.length)
    + ((matches - transpositions) / matches)
  ) / 3;
  let commonPrefixLength = 0;
  while (
    commonPrefixLength < Math.min(4, left.length, right.length)
    && left[commonPrefixLength] === right[commonPrefixLength]
  ) {
    commonPrefixLength += 1;
  }
  return jaro + (commonPrefixLength * 0.1 * (1 - jaro));
}

export function identitySimilarity(leftValue, rightValue) {
  const left = compactPersonName(leftValue);
  const right = compactPersonName(rightValue);
  if (!left && !right) return 1;
  if (!left || !right) return 0;
  if (left === right) return 1;
  return 1 - (levenshteinDistance(left, right) / Math.max(left.length, right.length));
}

function canonicalPair(leftId, rightId) {
  const first = Number(leftId);
  const second = Number(rightId);
  if (!Number.isInteger(first) || !Number.isInteger(second) || first <= 0 || second <= 0 || first === second) {
    throw new PersonDuplicateError("La paire de personnes est invalide.");
  }
  return first < second
    ? { PersonneAID: first, PersonneBID: second, key: `${first}:${second}` }
    : { PersonneAID: second, PersonneBID: first, key: `${second}:${first}` };
}

function normalizedIdentity(person) {
  return {
    firstName: normalizePersonName(person.Prenom),
    lastName: normalizePersonName(person.Nom),
  };
}

function relationIds(person, relationName, idColumn) {
  return new Set(
    (person?.[relationName] ?? [])
      .map((relation) => Number(relation?.[idColumn]))
      .filter((id) => Number.isInteger(id) && id > 0),
  );
}

function countSharedIds(leftIds, rightIds) {
  let count = 0;
  for (const id of leftIds) {
    if (rightIds.has(id)) count += 1;
  }
  return count;
}

function sharedContentSummary(left, right) {
  const commonVideoCount = countSharedIds(
    relationIds(left, "Videos", "VideoID"),
    relationIds(right, "Videos", "VideoID"),
  );
  const commonSeriesCount = countSharedIds(
    relationIds(left, "Series", "SeriesID"),
    relationIds(right, "Series", "SeriesID"),
  );
  return {
    commonVideoCount,
    commonSeriesCount,
    commonContentCount: commonVideoCount + commonSeriesCount,
  };
}

function scorePair(left, right) {
  const leftIdentity = normalizedIdentity(left);
  const rightIdentity = normalizedIdentity(right);
  const firstNameScore = identitySimilarity(leftIdentity.firstName, rightIdentity.firstName);
  const lastNameScore = identitySimilarity(leftIdentity.lastName, rightIdentity.lastName);
  const firstNameTypoScore = Math.max(
    firstNameScore,
    jaroWinklerSimilarity(leftIdentity.firstName, rightIdentity.firstName),
  );
  const lastNameTypoScore = Math.max(
    lastNameScore,
    jaroWinklerSimilarity(leftIdentity.lastName, rightIdentity.lastName),
  );
  const score = (firstNameScore * 0.5) + (lastNameScore * 0.5);
  const sharedContents = sharedContentSummary(left, right);
  const isNameCandidate = (
    lastNameScore === 1 && firstNameScore >= 0.7
  ) || (
    firstNameScore === 1 && lastNameScore >= 0.7
  ) || (
    lastNameScore >= 0.8 && firstNameScore >= 0.8 && score >= DUPLICATE_THRESHOLD
  );
  const isStrongTypoCandidate = (
    lastNameScore === 1 && firstNameTypoScore >= 0.9
  ) || (
    firstNameScore === 1 && lastNameTypoScore >= 0.9
  );
  const isSharedContentCandidate = sharedContents.commonContentCount > 0 && (
    (lastNameScore === 1 && firstNameScore >= 0.5)
    || (firstNameScore === 1 && lastNameScore >= 0.5)
    || (firstNameTypoScore >= 0.78 && lastNameTypoScore >= 0.78 && score >= 0.65)
  );
  return {
    firstNameScore,
    lastNameScore,
    score,
    ...sharedContents,
    isCandidate: isNameCandidate || isStrongTypoCandidate || isSharedContentCandidate,
  };
}

function serializePerson(person) {
  return {
    PersonneID: person.PersonneID,
    Prenom: person.Prenom,
    Nom: person.Nom,
    Surnom: person.Surnom,
    CheminImage: person.CheminImage,
    ImageStatut: person.ImageStatut,
    videoLinks: person._count?.Videos ?? 0,
    seriesLinks: person._count?.Series ?? 0,
  };
}

export function findPotentialDuplicatePairs(people, reviews = []) {
  const activePeople = people.filter((person) => person.EtatID === ETAT.ACTIVE);
  const peopleById = new Map(activePeople.map((person) => [person.PersonneID, person]));
  const reviewByKey = new Map(reviews.map((review) => {
    const pair = canonicalPair(review.PersonneAID, review.PersonneBID);
    return [pair.key, review];
  }));
  const pairs = new Map();
  const buckets = new Map();

  const addToBucket = (key, person) => {
    if (!key) return;
    const bucket = buckets.get(key) ?? [];
    bucket.push(person);
    buckets.set(key, bucket);
  };

  for (const person of activePeople) {
    const firstName = compactPersonName(person.Prenom);
    const lastName = compactPersonName(person.Nom);
    if (lastName) addToBucket(`last-initial:${lastName[0]}`, person);
    if (firstName) addToBucket(`first-exact:${firstName}`, person);
    for (const videoId of relationIds(person, "Videos", "VideoID")) {
      addToBucket(`video:${videoId}`, person);
    }
    for (const seriesId of relationIds(person, "Series", "SeriesID")) {
      addToBucket(`series:${seriesId}`, person);
    }
  }

  const comparedPairs = new Set();
  for (const bucket of buckets.values()) {
    for (let leftIndex = 0; leftIndex < bucket.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < bucket.length; rightIndex += 1) {
        const left = bucket[leftIndex];
        const right = bucket[rightIndex];
        const pair = canonicalPair(left.PersonneID, right.PersonneID);
        if (comparedPairs.has(pair.key)) continue;
        comparedPairs.add(pair.key);
        const review = reviewByKey.get(pair.key);
        if (["DISTINCT", "MERGED"].includes(review?.Decision)) continue;

        const scores = scorePair(left, right);
        if (!scores.isCandidate && review?.Decision !== "DOUBT") continue;
        pairs.set(pair.key, {
          key: pair.key,
          status: review?.Decision === "DOUBT" ? "doubt" : "new",
          score: Math.round(scores.score * 100),
          firstNameScore: Math.round(scores.firstNameScore * 100),
          lastNameScore: Math.round(scores.lastNameScore * 100),
          commonContentCount: scores.commonContentCount,
          commonVideoCount: scores.commonVideoCount,
          commonSeriesCount: scores.commonSeriesCount,
          personA: serializePerson(left),
          personB: serializePerson(right),
        });
      }
    }
  }

  for (const review of reviews.filter((item) => item.Decision === "DOUBT")) {
    const pair = canonicalPair(review.PersonneAID, review.PersonneBID);
    if (pairs.has(pair.key)) continue;
    const left = peopleById.get(pair.PersonneAID);
    const right = peopleById.get(pair.PersonneBID);
    if (!left || !right) continue;
    const scores = scorePair(left, right);
    pairs.set(pair.key, {
      key: pair.key,
      status: "doubt",
      score: Math.round(scores.score * 100),
      firstNameScore: Math.round(scores.firstNameScore * 100),
      lastNameScore: Math.round(scores.lastNameScore * 100),
      commonContentCount: scores.commonContentCount,
      commonVideoCount: scores.commonVideoCount,
      commonSeriesCount: scores.commonSeriesCount,
      personA: serializePerson(left),
      personB: serializePerson(right),
    });
  }

  return [...pairs.values()].sort((left, right) => {
    if (left.status !== right.status) return left.status === "doubt" ? -1 : 1;
    return right.commonContentCount - left.commonContentCount
      || right.score - left.score
      || left.key.localeCompare(right.key);
  });
}

export async function getPotentialDuplicatePairs(prisma) {
  const [people, reviews] = await Promise.all([
    prisma.personne.findMany({
      where: { EtatID: ETAT.ACTIVE },
      orderBy: { PersonneID: "asc" },
      select: {
        PersonneID: true,
        Prenom: true,
        Nom: true,
        Surnom: true,
        CheminImage: true,
        ImageStatut: true,
        EtatID: true,
        Videos: { select: { VideoID: true } },
        Series: { select: { SeriesID: true } },
        _count: { select: { Videos: true, Series: true } },
      },
    }),
    prisma.personDuplicateReview.findMany({
      select: { PersonneAID: true, PersonneBID: true, Decision: true },
    }),
  ]);
  const pairs = findPotentialDuplicatePairs(people, reviews);
  return {
    scannedPeople: people.length,
    pairs,
    newCount: pairs.filter((pair) => pair.status === "new").length,
    doubtCount: pairs.filter((pair) => pair.status === "doubt").length,
  };
}

export async function reviewDuplicatePair(prisma, { personAId, personBId, decision, reviewedById }) {
  const normalizedDecision = String(decision ?? "").toUpperCase();
  if (!["DOUBT", "DISTINCT"].includes(normalizedDecision)) {
    throw new PersonDuplicateError("La décision doit être doubt ou distinct.");
  }
  const pair = canonicalPair(personAId, personBId);
  const people = await prisma.personne.findMany({
    where: { PersonneID: { in: [pair.PersonneAID, pair.PersonneBID] }, EtatID: ETAT.ACTIVE },
    select: { PersonneID: true },
  });
  if (people.length !== 2) {
    throw new PersonDuplicateError("Une des personnes est introuvable ou inactive.", 404, "PERSON_NOT_FOUND");
  }

  return prisma.personDuplicateReview.upsert({
    where: {
      PersonneAID_PersonneBID: {
        PersonneAID: pair.PersonneAID,
        PersonneBID: pair.PersonneBID,
      },
    },
    create: {
      PersonneAID: pair.PersonneAID,
      PersonneBID: pair.PersonneBID,
      Decision: normalizedDecision,
      MergedPersonneID: null,
      ReviewedByID: reviewedById,
    },
    update: {
      Decision: normalizedDecision,
      MergedPersonneID: null,
      ReviewedByID: reviewedById,
    },
  });
}

async function preparePhotoCopy(keeper, merged) {
  if (keeper.CheminImage || !merged.CheminImage) return null;
  const sourcePath = path.resolve(BACKEND_ROOT, merged.CheminImage.replace(/^[/\\]+/, ""));
  const peopleRootPrefix = `${path.resolve(PEOPLE_ROOT)}${path.sep}`;
  if (!sourcePath.startsWith(peopleRootPrefix)) {
    throw new PersonDuplicateError("Le chemin de la photo à reprendre est invalide.", 409, "INVALID_PERSON_IMAGE_PATH");
  }

  try {
    await fs.access(sourcePath);
    const keeperDirectory = path.join(PEOPLE_ROOT, String(keeper.PersonneID));
    await fs.mkdir(keeperDirectory, { recursive: true });
    const extension = path.extname(sourcePath).toLowerCase() || ".jpg";
    const filename = `${Date.now()}-${merged.PersonneID}-merged${extension}`;
    const destinationPath = path.join(keeperDirectory, filename);
    await fs.copyFile(sourcePath, destinationPath);
    return {
      destinationPath,
      relativePath: path.join("uploads", "people", String(keeper.PersonneID), filename),
      ImageStatut: merged.ImageStatut,
    };
  } catch (error) {
    if (error instanceof PersonDuplicateError) throw error;
    throw new PersonDuplicateError(
      `Impossible de reprendre la photo de la personne fusionnée : ${error.message}`,
      409,
      "PERSON_IMAGE_COPY_FAILED",
    );
  }
}

async function mergeLinks(tx, { delegateName, idColumn, primaryKey, keeperId, mergedId }) {
  const delegate = tx[delegateName];
  const links = await delegate.findMany({
    where: { PersonneID: { in: [keeperId, mergedId] } },
    select: {
      [primaryKey]: true,
      [idColumn]: true,
      PersonneID: true,
      EstActeur: true,
      EstRealisateur: true,
    },
  });
  const keeperLinks = new Map(
    links.filter((link) => link.PersonneID === keeperId).map((link) => [link[idColumn], link]),
  );
  let moved = 0;
  let combined = 0;

  for (const sourceLink of links.filter((link) => link.PersonneID === mergedId)) {
    const keeperLink = keeperLinks.get(sourceLink[idColumn]);
    if (!keeperLink) {
      await delegate.update({
        where: { [primaryKey]: sourceLink[primaryKey] },
        data: { PersonneID: keeperId },
      });
      moved += 1;
      continue;
    }

    const nextRoles = {
      EstActeur: keeperLink.EstActeur || sourceLink.EstActeur,
      EstRealisateur: keeperLink.EstRealisateur || sourceLink.EstRealisateur,
    };
    if (nextRoles.EstActeur !== keeperLink.EstActeur || nextRoles.EstRealisateur !== keeperLink.EstRealisateur) {
      await delegate.update({ where: { [primaryKey]: keeperLink[primaryKey] }, data: nextRoles });
    }
    await delegate.delete({ where: { [primaryKey]: sourceLink[primaryKey] } });
    combined += 1;
  }
  return { moved, combined };
}

export async function mergeDuplicatePeople(prisma, { keepPersonId, mergePersonId, reviewedById }) {
  const keeperId = Number(keepPersonId);
  const mergedId = Number(mergePersonId);
  const pair = canonicalPair(keeperId, mergedId);
  const people = await prisma.personne.findMany({
    where: { PersonneID: { in: [keeperId, mergedId] }, EtatID: ETAT.ACTIVE },
    select: {
      PersonneID: true,
      Prenom: true,
      Nom: true,
      CheminImage: true,
      ImageStatut: true,
    },
  });
  const keeper = people.find((person) => person.PersonneID === keeperId);
  const merged = people.find((person) => person.PersonneID === mergedId);
  if (!keeper || !merged) {
    throw new PersonDuplicateError("Une des personnes est introuvable ou inactive.", 404, "PERSON_NOT_FOUND");
  }

  const preparedPhoto = await preparePhotoCopy(keeper, merged);
  try {
    const result = await prisma.$transaction(async (tx) => {
      const videoLinks = await mergeLinks(tx, {
        delegateName: "videoPersonne",
        idColumn: "VideoID",
        primaryKey: "VideoPersonneID",
        keeperId,
        mergedId,
      });
      const seriesLinks = await mergeLinks(tx, {
        delegateName: "seriesPersonne",
        idColumn: "SeriesID",
        primaryKey: "SeriesPersonneID",
        keeperId,
        mergedId,
      });

      if (preparedPhoto) {
        await tx.personne.update({
          where: { PersonneID: keeperId },
          data: { CheminImage: preparedPhoto.relativePath, ImageStatut: preparedPhoto.ImageStatut },
        });
      }
      await tx.personne.update({
        where: { PersonneID: mergedId },
        data: { EtatID: ETAT.DELETED },
      });
      await tx.personDuplicateReview.deleteMany({
        where: {
          OR: [{ PersonneAID: mergedId }, { PersonneBID: mergedId }],
          NOT: { PersonneAID: pair.PersonneAID, PersonneBID: pair.PersonneBID },
        },
      });
      await tx.personDuplicateReview.upsert({
        where: {
          PersonneAID_PersonneBID: {
            PersonneAID: pair.PersonneAID,
            PersonneBID: pair.PersonneBID,
          },
        },
        create: {
          PersonneAID: pair.PersonneAID,
          PersonneBID: pair.PersonneBID,
          Decision: "MERGED",
          MergedPersonneID: mergedId,
          ReviewedByID: reviewedById,
        },
        update: {
          Decision: "MERGED",
          MergedPersonneID: mergedId,
          ReviewedByID: reviewedById,
        },
      });
      return { videoLinks, seriesLinks };
    }, TRANSACTION_OPTIONS);

    return {
      keptPersonId: keeperId,
      mergedPersonId: mergedId,
      photoTransferred: Boolean(preparedPhoto),
      ...result,
    };
  } catch (error) {
    if (preparedPhoto) await fs.unlink(preparedPhoto.destinationPath).catch(() => {});
    throw error;
  }
}
