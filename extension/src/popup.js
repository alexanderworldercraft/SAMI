import { CONFIG } from "./config.js";
const $ = (id) => document.getElementById(id);
let pageInfo = null;
let candidates = [];
let series = [];
let genres = [];
let selectedImageFile = null;
let imageObjectUrl = "";
const selectedGenreIds = new Set();
const send = (message) => chrome.runtime.sendMessage(message).then((response) => {
  if (!response?.ok) throw new Error(response?.error || "Action impossible.");
  return response.result;
});
const setStatus = (message, error = false) => { $("status").textContent = message; $("status").style.color = error ? "#fca5a5" : "#fbbf24"; };
const apiUrl = (path) => new URL(`/api${path}`, CONFIG.apiBaseUrl).toString();
const apiGet = async (path, accessToken = "") => {
  const response = await fetch(apiUrl(path), { headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {} });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `SAMI a répondu ${response.status}.`);
  return payload;
};
const formatDuration = (seconds) => {
  const value = Number(seconds); if (!Number.isFinite(value) || value <= 0) return "";
  const hours = Math.floor(value / 3600); const minutes = Math.floor((value % 3600) / 60); const remainder = Math.floor(value % 60);
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` : `${minutes}:${String(remainder).padStart(2, "0")}`;
};
const selectedCandidate = () => {
  const candidate = candidates.find((item) => item.id === $("media").value);
  if (!candidate || candidate.audioCandidate || candidate.kind !== "video") return candidate;
  const host = new URL(candidate.url).hostname;
  const compatibleHost = (otherHost) => otherHost === host
    || (host.endsWith(".googlevideo.com") && otherHost.endsWith(".googlevideo.com"));
  const audioCandidate = candidates.filter((item) => item.kind === "audio" && compatibleHost(new URL(item.url).hostname))
    .sort((left, right) => Math.abs(Number(left.detectedAt || 0) - Number(candidate.detectedAt || 0)) - Math.abs(Number(right.detectedAt || 0) - Number(candidate.detectedAt || 0)))[0];
  return audioCandidate ? { ...candidate, audioCandidate } : candidate;
};
const metadata = () => ({
  titre: $("video-title").value.trim(), resumer: $("description").value.trim(),
  SaisonID: $("season").value.trim() || null,
  genres: [...selectedGenreIds],
  encodingMode: $("encoding-mode").value,
});
const bytesToBase64 = (bytes) => {
  let value = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) value += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(value);
};
const imagePayload = async () => {
  const mode = document.querySelector('input[name="image-mode"]:checked')?.value || "none";
  if (mode === "none") return null;
  let blob; let name;
  if (mode === "file") {
    if (!selectedImageFile) throw new Error("Choisissez une image personnelle ou sélectionnez « Aucune ».");
    blob = selectedImageFile; name = selectedImageFile.name;
  } else {
    if (!pageInfo?.image) throw new Error("Cette page ne fournit aucune image. Choisissez un fichier ou « Aucune ».");
    const response = await fetch(pageInfo.image);
    if (!response.ok) throw new Error(`Impossible de récupérer l’image de la page (${response.status}).`);
    blob = await response.blob();
    name = new URL(pageInfo.image).pathname.split("/").pop() || "affiche.jpg";
  }
  if (!blob.type.startsWith("image/")) throw new Error("Le fichier sélectionné n’est pas une image reconnue.");
  if (blob.size > 10 * 1024 * 1024) throw new Error("L’image dépasse la limite de 10 Mo.");
  return { name, type: blob.type, data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
};
const renderSeries = () => {
  const selected = $("series").value;
  const query = $("series-search").value.trim().toLocaleLowerCase("fr");
  $("series").replaceChildren(new Option("Aucune série", ""), ...series.filter((item) => String(item.Titre || "").toLocaleLowerCase("fr").includes(query)).map((item) => new Option(item.Titre, item.SeriesID)));
  if ([...$("series").options].some((option) => option.value === selected)) $("series").value = selected;
};
const loadSeasons = async () => {
  const seriesId = $("series").value;
  $("season").replaceChildren(new Option("Aucune saison", ""));
  $("season").disabled = !seriesId;
  if (!seriesId) return;
  try {
    const seasons = await apiGet(`/series/${encodeURIComponent(seriesId)}/saisons`);
    for (const season of seasons) $("season").append(new Option(`Saison ${season.Numero}`, season.SaisonID));
  } catch (error) { setStatus(error.message, true); }
};
const renderGenres = () => {
  const query = $("genre-search").value.trim().toLocaleLowerCase("fr");
  $("genres").replaceChildren(...genres.filter((genre) => String(genre.Nom || "").toLocaleLowerCase("fr").includes(query)).map((genre) => {
    const label = document.createElement("label"); const input = document.createElement("input");
    input.type = "checkbox"; input.value = genre.GenreID; input.checked = selectedGenreIds.has(genre.GenreID);
    input.addEventListener("change", () => input.checked ? selectedGenreIds.add(genre.GenreID) : selectedGenreIds.delete(genre.GenreID));
    label.append(input, document.createTextNode(genre.Nom)); return label;
  }));
};
const updateImageChoice = () => {
  const mode = document.querySelector('input[name="image-mode"]:checked')?.value;
  $("image-file").hidden = mode !== "file";
  if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
  imageObjectUrl = mode === "file" && selectedImageFile ? URL.createObjectURL(selectedImageFile) : "";
  const source = mode === "page" ? pageInfo?.image : mode === "file" ? imageObjectUrl : "";
  $("image-preview").src = source || ""; $("image-preview-wrap").classList.toggle("empty", !source);
  $("image-hint").textContent = mode === "none" ? "Aucune affiche ne sera envoyée." : source ? (mode === "page" ? "Image détectée sur la page." : selectedImageFile.name) : "Aucune image détectée.";
};
const loadCatalog = async () => {
  try {
    [series, genres] = await Promise.all([apiGet("/series"), apiGet("/genres")]);
    renderSeries(); renderGenres();
  } catch (error) { setStatus(`Catalogue SAMI indisponible : ${error.message}`, true); }
};
const loadEncodingAvailability = async () => {
  const { auth } = await chrome.storage.local.get("auth");
  const option = $("encoding-mode").querySelector('[value="distributed"]');
  if (!auth?.accessToken) return;
  try {
    const config = await apiGet("/video-encoding/extension-config", auth.accessToken);
    const available = config?.enabled === true && config?.operational !== false && config?.canStart !== false && Number(config?.activeCloneCount) > 0;
    option.disabled = !available; option.textContent = available ? "Multi-serveur — clones d’encodage" : "Multi-serveur — indisponible";
    $("encoding-hint").textContent = available ? `${config.activeCloneCount} clone(s) actif(s).` : (config?.reason || "Aucun clone actif.");
  } catch { option.disabled = true; $("encoding-hint").textContent = "Le multi-serveur est réservé au SuperAdmin."; }
};
async function refreshAuth() {
  const { auth } = await chrome.storage.local.get("auth");
  const connected = Boolean(auth?.accessToken && Date.parse(auth.expiresAt) > Date.now());
  $("login").hidden = connected; $("logout").hidden = !connected; $("import").disabled = !connected || candidates.length === 0;
}
async function init() {
  $("title").textContent = `${CONFIG.appName} - Import vidéo`;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    pageInfo = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_INFO" });
  } catch {
    try {
      const [injected] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => ({
        url: document.querySelector('link[rel="canonical"]')?.href || location.href,
        title: document.querySelector('meta[property="og:title"]')?.content || document.title,
        description: document.querySelector('meta[property="og:description"]')?.content || document.querySelector('meta[name="description"]')?.content || "",
        image: document.querySelector('meta[property="og:image"]')?.content || "",
        mediaUrls: [],
      }) });
      pageInfo = injected?.result || null;
    } catch { pageInfo = null; }
  }
  if (pageInfo) {
    $("page-title").textContent = pageInfo.title || "Page sans titre"; $("page-url").textContent = pageInfo.url;
    $("video-title").value = pageInfo.title || ""; $("description").value = pageInfo.description || "";
    updateImageChoice();
  } else setStatus("Cette page n’est pas prise en charge.", true);
  candidates = await send({ type: "GET_MEDIA_CANDIDATES", tabId: tab.id }).catch(() => []);
  if (!candidates.length && pageInfo?.mediaUrls?.length) candidates = pageInfo.mediaUrls.map((url, index) => ({ id: `page-${index}`, url, kind: "video", headers: {} }));
  for (const candidate of candidates) {
    const option = document.createElement("option"); option.value = candidate.id;
    option.textContent = [candidate.kind.toUpperCase(), candidate.resolution, candidate.audioCandidate ? "+ audio" : "", formatDuration(candidate.duration), candidate.size ? `${Math.round(candidate.size / 1048576)} Mo` : "", new URL(candidate.url).hostname].filter(Boolean).join(" · ");
    $("media").appendChild(option);
  }
  $("download").disabled = candidates.length === 0;
  send({ type: "PING_COMPANION" }).then(() => $("companion-state").textContent = "Compagnon local connecté.").catch(() => $("companion-state").textContent = "Compagnon local non installé ou non configuré.");
  await refreshAuth();
  await Promise.all([loadCatalog(), loadEncodingAvailability()]);
}
$("login").addEventListener("click", async () => { setStatus("Ouverture de la connexion sécurisée…"); try { await send({ type: "AUTHENTICATE" }); setStatus("Connexion validée."); await refreshAuth(); await loadEncodingAvailability(); } catch (error) { setStatus(error.message, true); } });
$("logout").addEventListener("click", async () => { await send({ type: "LOGOUT" }); setStatus("Extension déconnectée."); await refreshAuth(); });
$("series-search").addEventListener("input", renderSeries);
$("series").addEventListener("change", loadSeasons);
$("genre-search").addEventListener("input", renderGenres);
document.querySelectorAll('input[name="image-mode"]').forEach((input) => input.addEventListener("change", updateImageChoice));
$("image-file").addEventListener("change", () => { selectedImageFile = $("image-file").files?.[0] || null; updateImageChoice(); });
$("download").addEventListener("click", async () => {
  const candidate = selectedCandidate(); if (!candidate) return setStatus("Aucun média sélectionné.", true);
  setStatus("Téléchargement ou assemblage en cours…");
  try {
    const sameOrigin = pageInfo?.url && new URL(candidate.url).origin === new URL(pageInfo.url).origin;
    if (candidate.kind === "video" && !candidate.audioCandidate && sameOrigin) await send({ type: "DOWNLOAD_DIRECT", url: candidate.url, filename: `${metadata().titre || "video"}.mp4` });
    else await send({ type: "COMPANION_DOWNLOAD", candidate, title: metadata().titre });
    setStatus("Téléchargement lancé.");
  } catch (error) { setStatus(error.message, true); }
});
$("import").addEventListener("click", async () => {
  const candidate = selectedCandidate(); const form = metadata();
  if (!candidate || !form.titre) return setStatus("Sélectionnez un média et renseignez son titre.", true);
  if ($("series").value && !form.SaisonID) return setStatus("Sélectionnez une saison pour la série choisie.", true);
  setStatus("Assemblage puis import dans SAMI…");
  try { form.image = await imagePayload(); await send({ type: "COMPANION_IMPORT", candidate, metadata: form }); setStatus(form.encodingMode === "distributed" ? "Encodage multi-serveur lancé." : "Vidéo importée dans SAMI."); } catch (error) { setStatus(error.message, true); }
});
init();
