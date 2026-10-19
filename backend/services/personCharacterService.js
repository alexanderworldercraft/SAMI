import { ETAT } from "../constants.js";

export const CHARACTER_INCLUDE = { orderBy: [{ Position: "asc" }, { Nom: "asc" }] };
export const MAX_CHARACTERS = 50;

export class PersonCharacterError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const characterKey = (name) => name.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");

export const characterNames = (rows = []) => rows.map((row) => row.Nom);

export function normalizeCharacters(value) {
  if (!Array.isArray(value) || value.length > MAX_CHARACTERS) {
    throw new PersonCharacterError(`Indique une liste de ${MAX_CHARACTERS} personnages maximum.`);
  }
  const names = [];
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== "string") throw new PersonCharacterError("Chaque personnage doit être un nom.");
    const name = item.trim().replace(/\s+/g, " ").normalize("NFC");
    if (!name || name.length > 160) {
      throw new PersonCharacterError("Le nom d'un personnage doit contenir entre 1 et 160 caractères.");
    }
    const key = characterKey(name);
    if (!seen.has(key)) {
      names.push(name);
      seen.add(key);
    }
  }
  return names;
}

// Preserve existing spelling and order during additive imports and person merges.
export function charactersToAppend(existing = [], requested = []) {
  const seen = new Set(characterNames(existing).map(characterKey));
  let position = existing.reduce((max, row) => Math.max(max, row.Position ?? -1), -1) + 1;
  const additions = normalizeCharacters(requested).flatMap((Nom) => {
    const key = characterKey(Nom);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ Nom, Position: position++ }];
  });
  if (existing.length + additions.length > MAX_CHARACTERS) {
    throw new PersonCharacterError(`Un acteur peut avoir au maximum ${MAX_CHARACTERS} personnages par contenu.`);
  }
  return additions;
}

export async function replacePersonCharacters(prisma, { personId, type, contentId, characters }) {
  if (!["video", "series"].includes(type) || !Number.isInteger(personId) || personId <= 0
    || !Number.isInteger(contentId) || contentId <= 0) {
    throw new PersonCharacterError("Personne ou contenu invalide.");
  }
  const names = normalizeCharacters(characters);
  return prisma.$transaction(async (tx) => {
    const isVideo = type === "video";
    const content = await (isVideo ? tx.video : tx.series).findFirst({
      where: isVideo ? { VideoID: contentId, SaisonID: null } : { SeriesID: contentId },
      select: { EtatID: true },
    });
    if (isVideo && content?.EtatID === ETAT.BLOCKED) {
      throw new PersonCharacterError("Ce film est verrouillé pendant son transfert.", 409);
    }
    if (content?.EtatID !== ETAT.ACTIVE) throw new PersonCharacterError("Contenu introuvable ou inactif.", 404);
    const delegate = isVideo ? tx.videoPersonne : tx.seriesPersonne;
    const primaryKey = isVideo ? "VideoPersonneID" : "SeriesPersonneID";
    const link = await delegate.findFirst({
      where: {
        PersonneID: personId,
        [isVideo ? "VideoID" : "SeriesID"]: contentId,
        EstActeur: true,
        Personne: { EtatID: ETAT.ACTIVE },
      },
      include: { Personnages: CHARACTER_INCLUDE },
    });
    if (!link) throw new PersonCharacterError("Lien acteur introuvable.", 404);
    const charactersDelegate = isVideo ? tx.videoPersonnage : tx.seriesPersonnage;
    await charactersDelegate.deleteMany({ where: { [primaryKey]: link[primaryKey] } });
    if (names.length) {
      await charactersDelegate.createMany({
        data: names.map((Nom, Position) => ({ [primaryKey]: link[primaryKey], Nom, Position })),
      });
    }
    return { Personnages: names, previous: characterNames(link.Personnages) };
  });
}
