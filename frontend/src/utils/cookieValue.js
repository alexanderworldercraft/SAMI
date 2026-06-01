export const parseCookieValue = (rawValue) => {
  if (!rawValue) return { value: "", expiresAt: null };
  const decoded = decodeURIComponent(rawValue);
  const separatorIndex = decoded.lastIndexOf("|");
  if (separatorIndex === -1) {
    return { value: decoded, expiresAt: null };
  }
  return {
    value: decoded.slice(0, separatorIndex),
    expiresAt: decoded.slice(separatorIndex + 1),
  };
};

export const buildCookieValue = (value, expiresAtIso) => {
  if (!expiresAtIso) return String(value ?? "");
  return `${value}|${expiresAtIso}`;
};
