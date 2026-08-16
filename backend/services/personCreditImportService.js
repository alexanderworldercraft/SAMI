import { ETAT } from "../constants.js";
import { normalizePersonName, splitPersonName } from "../prisma/seedCreditsPersonnes.js";

const MAX_PEOPLE_PER_IMPORT = 50;
const TRANSACTION_OPTIONS = { maxWait: 10_000, timeout: 120_000 };

export class PersonCreditImportError extends Error {
  constructor(message, statusCode = 400, code = "PERSON_CREDIT_IMPORT_INVALID") {
    super(message);
    this.name = "PersonCreditImportError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function parsePeopleList(value) {
  const rawNames = String(value ?? "")
    .split(/\||\r?\n/)
    .map((name) => name.trim().replace(/\s+/g, " "))
    .filter(Boolean);

  if (!rawNames.length) {
    throw new PersonCreditImportError("Ajoute au moins une personne, avec le caractère | entre les noms.");
  }
  if (rawNames.length > MAX_PEOPLE_PER_IMPORT) {
    throw new PersonCreditImportError(`La liste est limitée à ${MAX_PEOPLE_PER_IMPORT} personnes par import.`);
  }

  const people = [];
  const seen = new Set();
  let duplicateCount = 0;
  for (const displayName of rawNames) {
    if (displayName.length > 160) {
      throw new PersonCreditImportError(`Le nom « ${displayName.slice(0, 40)}… » est trop long.`);
    }
    const key = normalizePersonName(displayName);
    if (!key) throw new PersonCreditImportError(`Le nom « ${displayName} » n'est pas exploitable.`);
    if (seen.has(key)) {
      duplicateCount += 1;
      continue;
    }
    seen.add(key);
    people.push({ key, displayName });
  }

  return { people, duplicateCount };
}

function indexPeople(rows) {
  const index = new Map();
  for (const person of rows) {
    const keys = new Set([
      normalizePersonName([person.Prenom, person.Nom].filter(Boolean).join(" ")),
      normalizePersonName(person.Surnom),
    ].filter(Boolean));
    for (const key of keys) {
      const matches = index.get(key) ?? [];
      matches.push(person);
      index.set(key, matches);
    }
  }
  return index;
}

async function ensureContent(tx, type, contentId) {
  if (type === "video") {
    const video = await tx.video.findFirst({
      where: { VideoID: contentId, SaisonID: null },
      select: { VideoID: true, Titre: true, EtatID: true },
    });
    if (!video) {
      throw new PersonCreditImportError("Film introuvable.", 404, "CONTENT_NOT_FOUND");
    }
    if (video.EtatID === ETAT.BLOCKED) {
      throw new PersonCreditImportError(
        "Ce film est verrouillé pendant son transfert.",
        409,
        "VIDEO_TRANSFER_IN_PROGRESS",
      );
    }
    if (video.EtatID !== ETAT.ACTIVE) {
      throw new PersonCreditImportError("Ce film n'est pas actif.", 409, "CONTENT_NOT_ACTIVE");
    }
    return { id: video.VideoID, title: video.Titre, type };
  }

  const series = await tx.series.findFirst({
    where: { SeriesID: contentId, EtatID: ETAT.ACTIVE },
    select: { SeriesID: true, Titre: true },
  });
  if (!series) throw new PersonCreditImportError("Série introuvable ou inactive.", 404, "CONTENT_NOT_FOUND");
  return { id: series.SeriesID, title: series.Titre, type };
}

async function linkPerson(tx, { type, contentId, personId, role }) {
  const isVideo = type === "video";
  const delegate = isVideo ? tx.videoPersonne : tx.seriesPersonne;
  const idColumn = isVideo ? "VideoID" : "SeriesID";
  const uniqueColumn = isVideo ? "VideoID_PersonneID" : "SeriesID_PersonneID";
  const roleColumn = role === "actor" ? "EstActeur" : "EstRealisateur";
  const uniqueWhere = { [uniqueColumn]: { [idColumn]: contentId, PersonneID: personId } };
  const existing = await delegate.findUnique({ where: uniqueWhere });

  if (!existing) {
    await delegate.create({
      data: {
        [idColumn]: contentId,
        PersonneID: personId,
        EstActeur: role === "actor",
        EstRealisateur: role === "director",
      },
    });
    return "created";
  }
  if (existing[roleColumn]) return "unchanged";

  await delegate.update({ where: uniqueWhere, data: { [roleColumn]: true } });
  return "updated";
}

export async function importPeopleCredits({ prisma, type, contentId, role, names }) {
  if (!["video", "series"].includes(type)) {
    throw new PersonCreditImportError("Le type de contenu doit être video ou series.");
  }
  if (!["actor", "director"].includes(role)) {
    throw new PersonCreditImportError("Le rôle doit être actor ou director.");
  }
  const numericContentId = Number(contentId);
  if (!Number.isInteger(numericContentId) || numericContentId <= 0) {
    throw new PersonCreditImportError("Identifiant de contenu invalide.");
  }
  const parsed = parsePeopleList(names);

  return prisma.$transaction(async (tx) => {
    const content = await ensureContent(tx, type, numericContentId);
    const existingPeople = await tx.personne.findMany({
      select: {
        PersonneID: true,
        Nom: true,
        Prenom: true,
        Surnom: true,
        CheminImage: true,
        ImageStatut: true,
        EtatID: true,
      },
    });
    const peopleIndex = indexPeople(existingPeople);
    const results = [];

    for (const requestedPerson of parsed.people) {
      const matches = peopleIndex.get(requestedPerson.key) ?? [];
      const activeMatches = matches.filter((person) => person.EtatID === ETAT.ACTIVE);
      if (activeMatches.length > 1) {
        throw new PersonCreditImportError(
          `Plusieurs personnes actives correspondent à « ${requestedPerson.displayName} ». Corrige les doublons avant l'import.`,
          409,
          "AMBIGUOUS_DATABASE_PERSON",
        );
      }
      if (!activeMatches.length && matches.length) {
        throw new PersonCreditImportError(
          `La personne « ${requestedPerson.displayName} » existe dans la corbeille. Restaure-la avant l'import.`,
          409,
          "INACTIVE_DATABASE_PERSON",
        );
      }

      let person = activeMatches[0];
      let personStatus = "existing";
      if (!person) {
        person = await tx.personne.create({
          data: {
            ...splitPersonName(requestedPerson.displayName),
            CheminImage: null,
            ImageStatut: "DEFAULT",
            EtatID: ETAT.ACTIVE,
          },
          select: {
            PersonneID: true,
            Nom: true,
            Prenom: true,
            Surnom: true,
            CheminImage: true,
            ImageStatut: true,
            EtatID: true,
          },
        });
        personStatus = "created";
        peopleIndex.set(requestedPerson.key, [person]);
      }

      const linkStatus = await linkPerson(tx, {
        type,
        contentId: numericContentId,
        personId: person.PersonneID,
        role,
      });
      results.push({
        PersonneID: person.PersonneID,
        name: requestedPerson.displayName,
        personStatus,
        linkStatus,
        hadImage: person.ImageStatut === "CUSTOM" && Boolean(person.CheminImage),
      });
    }

    return {
      content,
      role,
      duplicateCount: parsed.duplicateCount,
      results,
      summary: {
        requested: parsed.people.length,
        peopleCreated: results.filter((result) => result.personStatus === "created").length,
        peopleExisting: results.filter((result) => result.personStatus === "existing").length,
        linksCreated: results.filter((result) => result.linkStatus === "created").length,
        linksUpdated: results.filter((result) => result.linkStatus === "updated").length,
        linksUnchanged: results.filter((result) => result.linkStatus === "unchanged").length,
      },
    };
  }, TRANSACTION_OPTIONS);
}
