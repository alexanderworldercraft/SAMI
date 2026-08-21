export const VIDEO_TITLE_SIMILARITY_THRESHOLD = 0.8;

export const normalizeVideoSearchText = (value) =>
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

  const [shorter, longer] =
    left.length <= right.length ? [left, right] : [right, left];
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

export const calculateVideoTitleSimilarity = (left, right) => {
  const normalizedLeft = normalizeVideoSearchText(left);
  const normalizedRight = normalizeVideoSearchText(right);
  if (!normalizedLeft || !normalizedRight) return 0;
  if (normalizedLeft === normalizedRight) return 1;

  const longestLength = Math.max(normalizedLeft.length, normalizedRight.length);
  return 1 - levenshteinDistance(normalizedLeft, normalizedRight) / longestLength;
};

const getSimilarityCandidates = (normalizedTitle, normalizedQuery) => {
  const titleWords = normalizedTitle.split(" ");
  const queryWords = normalizedQuery.split(" ");
  const candidates = new Set([
    normalizedTitle,
    normalizedTitle.replace(/\s/g, ""),
  ]);

  if (queryWords.length <= titleWords.length) {
    for (let index = 0; index <= titleWords.length - queryWords.length; index += 1) {
      const window = titleWords.slice(index, index + queryWords.length).join(" ");
      candidates.add(window);
      candidates.add(window.replace(/\s/g, ""));
    }
  }

  return candidates;
};

export const getVideoTitleSearchMatch = (
  title,
  query,
  threshold = VIDEO_TITLE_SIMILARITY_THRESHOLD
) => {
  const normalizedTitle = normalizeVideoSearchText(title);
  const normalizedQuery = normalizeVideoSearchText(query);
  if (!normalizedTitle || !normalizedQuery) return null;

  if (normalizedTitle === normalizedQuery) {
    return { type: "exact", rank: 3, score: 1 };
  }

  const compactTitle = normalizedTitle.replace(/\s/g, "");
  const compactQuery = normalizedQuery.replace(/\s/g, "");
  if (
    normalizedTitle.includes(normalizedQuery) ||
    compactTitle.includes(compactQuery)
  ) {
    return { type: "contains", rank: 2, score: 1 };
  }

  let bestScore = 0;
  for (const candidate of getSimilarityCandidates(normalizedTitle, normalizedQuery)) {
    bestScore = Math.max(bestScore, calculateVideoTitleSimilarity(candidate, normalizedQuery));
  }

  return bestScore >= threshold
    ? { type: "similar", rank: 1, score: bestScore }
    : null;
};

export const getVideoContentSearchMatch = (
  item,
  query,
  threshold = VIDEO_TITLE_SIMILARITY_THRESHOLD
) => {
  const titleMatch = getVideoTitleSearchMatch(item?.Titre, query, threshold);
  if (titleMatch) return titleMatch;

  const normalizedQuery = normalizeVideoSearchText(query);
  const normalizedSummary = normalizeVideoSearchText(item?.Resumer);
  if (normalizedQuery && normalizedSummary.includes(normalizedQuery)) {
    return { type: "summary", rank: 0, score: 1 };
  }

  return null;
};

