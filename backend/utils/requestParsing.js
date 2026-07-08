export const parsePositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const intValue = Math.floor(parsed);
  return intValue > 0 ? intValue : null;
};

export const isTruthyValue = (value) =>
  ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
