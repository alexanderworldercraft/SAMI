// Resolve advertised variants instead of assuming a particular encoding profile.
export async function loadHlsDuration(url, { signal } = {}, depth = 0) {
  if (depth > 2) throw new Error("Playlists HLS imbriquées invalides");
  const response = await fetch(url, { credentials: "include", ...(signal ? { signal } : {}) });
  if (!response.ok) throw Object.assign(new Error(`Playlist indisponible (${response.status})`), { status: response.status });
  const lines = (await response.text()).replace(/^\uFEFF/, "").split(/\r?\n/).map(line => line.trim());
  if (lines[0] !== "#EXTM3U") throw new Error("Réponse différente d’une playlist HLS");
  const segments = lines.filter(line => line.startsWith("#EXTINF:")).map(line => Number(line.slice(8).split(",")[0]));
  if (segments.length) {
    if (!lines.includes("#EXT-X-ENDLIST") || segments.some(n => !Number.isFinite(n) || n <= 0)) throw new Error("Durée HLS incomplète ou invalide");
    return segments.reduce((sum, duration) => sum + duration, 0);
  }
  const variants = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].startsWith("#EXT-X-STREAM-INF:")) continue;
    const reference = lines.slice(i + 1).find(line => line && !line.startsWith("#"));
    if (reference) variants.push(new URL(reference, response.url || url).href);
  }
  let lastError = new Error("Aucune piste vidéo disponible dans la playlist");
  for (const variant of [...new Set(variants)]) {
    try { return await loadHlsDuration(variant, { signal }, depth + 1); }
    catch (error) {
      if (error.name === "AbortError" || error.status === 401 || error.status === 403) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
