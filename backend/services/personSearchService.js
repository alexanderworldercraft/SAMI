export const PERSON_SEARCH_SIMILARITY_THRESHOLD = 0.8;

export const normalizePersonSearchText = (value) =>
  String(value || "")
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

const levenshteinDistance = (left, right) => {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const [shorter, longer] = left.length <= right.length
    ? [left, right]
    : [right, left];
  let previous = Array.from({ length: shorter.length + 1 }, (_, index) => index);

  for (let row = 1; row <= longer.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= shorter.length; column += 1) {
      const substitutionCost = longer[row - 1] === shorter[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + substitutionCost
      );
    }
    previous = current;
  }

  return previous[shorter.length];
};

export const calculatePersonSearchSimilarity = (left, right) => {
  const normalizedLeft = normalizePersonSearchText(left);
  const normalizedRight = normalizePersonSearchText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const longestLength = Math.max(normalizedLeft.length, normalizedRight.length);
  return 1 - levenshteinDistance(normalizedLeft, normalizedRight) / longestLength;
};

const getPersonSearchCandidates = (person) => {
  const firstName = normalizePersonSearchText(person?.Prenom);
  const lastName = normalizePersonSearchText(person?.Nom);
  const nickname = normalizePersonSearchText(person?.Surnom);

  return [...new Set([
    [firstName, lastName].filter(Boolean).join(" "),
    [lastName, firstName].filter(Boolean).join(" "),
    firstName,
    lastName,
    nickname,
  ].filter(Boolean))];
};

export const getPersonSearchMatch = (
  person,
  query,
  threshold = PERSON_SEARCH_SIMILARITY_THRESHOLD
) => {
  const normalizedQuery = normalizePersonSearchText(query);
  if (!normalizedQuery) return null;

  const compactQuery = normalizedQuery.replace(/\s/g, "");
  let bestSimilarScore = 0;

  for (const candidate of getPersonSearchCandidates(person)) {
    if (candidate === normalizedQuery) {
      return { type: "exact", rank: 3, score: 1 };
    }

    const compactCandidate = candidate.replace(/\s/g, "");
    if (
      candidate.includes(normalizedQuery)
      || compactCandidate.includes(compactQuery)
    ) {
      return { type: "contains", rank: 2, score: 1 };
    }

    bestSimilarScore = Math.max(
      bestSimilarScore,
      calculatePersonSearchSimilarity(candidate, normalizedQuery)
    );
  }

  return bestSimilarScore >= threshold
    ? { type: "similar", rank: 1, score: bestSimilarScore }
    : null;
};

export const filterPeopleBySearch = (people, query) => {
  const normalizedQuery = normalizePersonSearchText(query);
  if (!normalizedQuery) return people;

  return people.filter((person) => getPersonSearchMatch(person, normalizedQuery));
};
