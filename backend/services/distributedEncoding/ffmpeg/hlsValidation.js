import fs from "fs";
import path from "path";

const MAX_PLAYLIST_BYTES = 10 * 1024 * 1024;

const assertRegularNonEmptyFile = async (filePath, label) => {
  const stats = await fs.promises.lstat(filePath);
  if (!stats.isFile() || stats.size <= 0) {
    throw new Error(`${label} est vide ou n'est pas un fichier régulier.`);
  }
  return stats;
};

const readPlaylist = async (playlistPath) => {
  const stats = await assertRegularNonEmptyFile(playlistPath, "La playlist HLS");
  if (stats.size > MAX_PLAYLIST_BYTES) {
    throw new Error("La playlist HLS dépasse la taille autorisée.");
  }
  const content = await fs.promises.readFile(playlistPath, "utf8");
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
    ?.replace(/^\uFEFF/, "");
  if (firstLine !== "#EXTM3U") {
    throw new Error("La playlist HLS ne commence pas par #EXTM3U.");
  }
  return content;
};

const assertPortableLocalReference = (reference) => {
  if (
    !reference
    || reference !== reference.trim()
    || reference.includes("\\")
    || reference.includes("%")
    || reference.includes("?")
    || reference.includes("#")
    || reference.startsWith("/")
    || reference.startsWith("//")
    || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(reference)
  ) {
    throw new Error(`La référence HLS ${reference || "(vide)"} est interdite.`);
  }
  const segments = reference.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`La référence HLS ${reference} contient une traversée de chemin.`);
  }
  return reference;
};

const resolveInside = (root, reference) => {
  const normalizedReference = assertPortableLocalReference(reference);
  const target = path.resolve(root, ...normalizedReference.split("/"));
  const relative = path.relative(path.resolve(root), target);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`La référence HLS ${reference} sort du dossier attendu.`);
  }
  return target;
};

export async function validateHlsMediaPlaylist({
  playlistPath,
  requireIndependentSegments = false,
}) {
  const content = await readPlaylist(playlistPath);
  if (!content.includes("#EXT-X-ENDLIST")) {
    throw new Error("La playlist HLS VOD ne contient pas #EXT-X-ENDLIST.");
  }
  if (requireIndependentSegments && !content.includes("#EXT-X-INDEPENDENT-SEGMENTS")) {
    throw new Error("La playlist vidéo ne déclare pas des segments indépendants.");
  }

  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const references = lines.filter((line) => !line.startsWith("#"));
  const durations = lines
    .filter((line) => line.startsWith("#EXTINF:"))
    .map((line) => Number.parseFloat(line.slice("#EXTINF:".length).split(",", 1)[0]));
  if (references.length === 0 || durations.length !== references.length) {
    throw new Error("La playlist HLS ne contient pas une liste cohérente de segments.");
  }
  if (durations.some((duration) => !Number.isFinite(duration) || duration <= 0)) {
    throw new Error("La playlist HLS contient une durée de segment invalide.");
  }

  const root = path.dirname(playlistPath);
  const segmentPaths = [];
  for (const reference of references) {
    if (path.posix.extname(reference).toLowerCase() !== ".ts") {
      throw new Error(`Le segment HLS ${reference} n'utilise pas le format MPEG-TS attendu.`);
    }
    const segmentPath = resolveInside(root, reference);
    await assertRegularNonEmptyFile(segmentPath, `Le segment HLS ${reference}`);
    segmentPaths.push(segmentPath);
  }

  return {
    playlistPath,
    segmentPaths,
    segmentCount: segmentPaths.length,
    durations,
    totalDuration: durations.reduce((sum, duration) => sum + duration, 0),
  };
}

const extractMasterReferences = (content) => {
  const references = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!line.startsWith("#")) {
      references.push(line);
      continue;
    }
    const uriPattern = /\bURI\s*=\s*"([^"]*)"/gi;
    let match;
    while ((match = uriPattern.exec(line)) !== null) references.push(match[1]);
  }
  return references;
};

export async function validateHlsMasterPlaylist({ masterPlaylistPath, outputDir }) {
  const content = await readPlaylist(masterPlaylistPath);
  const references = extractMasterReferences(content);
  if (references.length === 0) {
    throw new Error("La playlist maître ne référence aucun flux HLS.");
  }
  for (const reference of references) {
    const playlistPath = resolveInside(outputDir, reference);
    if (path.extname(playlistPath).toLowerCase() !== ".m3u8") {
      throw new Error(`La référence maître ${reference} n'est pas une playlist HLS.`);
    }
    await assertRegularNonEmptyFile(playlistPath, `La playlist ${reference}`);
  }
  return { references };
}
