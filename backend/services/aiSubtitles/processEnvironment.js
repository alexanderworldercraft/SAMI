const libraryPathVariable = (platform) => platform === "win32" ? "PATH" : "LD_LIBRARY_PATH";
const libraryPathDelimiter = (platform) => platform === "win32" ? ";" : ":";

export function buildAiSubtitleProcessEnvironment({
  install = null,
  env = process.env,
  platform = process.platform,
} = {}) {
  const result = { ...env, PYTHONUNBUFFERED: "1", PYTHONUTF8: "1" };
  const configuredPaths = Array.isArray(install?.cudaLibraryPaths)
    ? install.cudaLibraryPaths
    : [];
  const paths = configuredPaths
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  if (paths.length === 0) return result;

  const variable = libraryPathVariable(platform);
  const delimiter = libraryPathDelimiter(platform);
  const existing = String(result[variable] || "")
    .split(delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
  result[variable] = [...new Set([...paths, ...existing])].join(delimiter);
  return result;
}
