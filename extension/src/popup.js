import { CONFIG } from "./config.js";
import { callExtensionApi } from "./extensionApi.js";
import { classifyMedia, mediaIdentity, normalizeMediaUrl, selectDisplayCandidates } from "./mediaDetection.js";
const $ = (id) => document.getElementById(id);
let pageInfo = null;
let candidates = [];
let series = [];
let genres = [];
let selectedImageFile = null;
let imageObjectUrl = "";
let tabId = null;
let currentJob = null;
let preparing = false;
let authenticated = false;
const selectedGenreIds = new Set();
const send = (message) => callExtensionApi(chrome.runtime, "sendMessage", message).then((response) => {
  if (!response?.ok) throw new Error(response?.error || "Action impossible.");
  return response.result;
});
const setStatus = (message, error = false) => { $("status").textContent = message; $("status").style.color = error ? "#fca5a5" : "#fbbf24"; };
const apiUrl = (path) => `${CONFIG.apiBaseUrl}/api${path}`;
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
  const audio = candidates.find((item) => item.id === $("audio").value);
  if (!candidate) return null;
  return audio ? { ...candidate, audioCandidate: audio } : candidate;
};
const refreshControls = () => {
  const busy = preparing || currentJob?.state === "running";
  $("download").disabled = busy || candidates.length === 0;
  $("import").disabled = busy || !authenticated || candidates.length === 0;
  $("cancel").hidden = currentJob?.state !== "running";
};
const showJob = (job) => {
  currentJob = job; refreshControls();
  if (!job) return;
  if (job.state === "error") return setStatus(job.error, true);
  if (job.state === "done") return setStatus(job.action === "download"
    ? `Téléchargement terminé : ${job.result?.outputPath || ""}`
    : `Import accepté par ${CONFIG.appName}. L’encodage est suivi dans l’application.`);
  const labels = { starting: "Préparation", assembly: "Téléchargement et assemblage", uploading: `Envoi vers ${CONFIG.appName}` };
  setStatus(`${labels[job.stage] || "Traitement"} — ${job.elapsedSeconds || 0} s${job.time ? ` · média ${job.time}` : ""}. Vous pouvez fermer la popup.`);
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
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(blob.type)) throw new Error("Le fichier sélectionné n’est pas une image reconnue.");
  if (blob.size > 10 * 1024 * 1024) throw new Error("L’image dépasse la limite de 10 Mo.");
  return { name, type: blob.type, data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
};
const renderSeries = () => {
  const selected = $("series").value;
  const query = $("series-search").value.trim().toLocaleLowerCase("fr");
  $("series").replaceChildren(new Option("Aucune série", ""), ...series.filter((item) => String(item.Titre || "").toLocaleLowerCase("fr").includes(query)).map((item) => new Option(item.Titre, item.SeriesID)));
  if ([...$("series").options].some((option) => option.value === selected)) $("series").value = selected;
  else if (selected) loadSeasons();
};
const loadSeasons = async () => {
  const seriesId = $("series").value;
  $("season").replaceChildren(new Option("Aucune saison", ""));
  $("season").disabled = !seriesId;
  if (!seriesId) return;
  try {
    const seasons = await apiGet(`/series/${encodeURIComponent(seriesId)}/saisons`);
    if ($("series").value !== seriesId) return;
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
  const { auth } = await callExtensionApi(chrome.storage.local, "get", "auth");
  const option = $("encoding-mode").querySelector('[value="distributed"]');
  if (!auth?.accessToken) { option.disabled = true; $("encoding-mode").value = "classic"; return; }
  try {
    const config = await apiGet("/video-encoding/extension-config", auth.accessToken);
    const available = config?.enabled === true && config?.operational !== false && config?.canStart !== false && Number(config?.activeCloneCount) > 0;
    option.disabled = !available; option.textContent = available ? "Multi-serveur — clones d’encodage" : "Multi-serveur — indisponible";
    $("encoding-hint").textContent = available ? `${config.activeCloneCount} clone(s) actif(s).` : (config?.reason || "Aucun clone actif.");
  } catch (error) { option.disabled = true; $("encoding-mode").value = "classic"; $("encoding-hint").textContent = `Multi-serveur indisponible : ${error.message}`; }
};
async function refreshAuth() {
  const { auth } = await callExtensionApi(chrome.storage.local, "get", "auth");
  const connected = authenticated = Boolean(auth?.accessToken && Date.parse(auth.expiresAt) > Date.now());
  $("login").hidden = connected; $("logout").hidden = !connected; refreshControls();
}
async function refreshMedia() {
  await callExtensionApi(chrome.tabs, "sendMessage", tabId, { type: "SCAN_MEDIA" }).catch(() => {});
  candidates = await send({ type: "GET_MEDIA_CANDIDATES", tabId });
  // A user-triggered read of DOM/resources and standard player metadata. No
  // signature deciphering, private APIs or credentials harvested from the page.
  const frames = await callExtensionApi(chrome.scripting, "executeScript", {
    target: { tabId, allFrames: true }, world: "MAIN", func: () => {
      const result = [];
      document.querySelectorAll("video,audio").forEach((media) => {
        for (const url of [media.currentSrc, media.src, ...[...media.querySelectorAll("source")].map((source) => source.src)])
          if (/^https?:/.test(url || "")) result.push({ url, kind: media.tagName === "AUDIO" ? "audio" : "video" });
      });
      for (const entry of performance.getEntriesByType("resource")) if (/\.(m3u8|mpd|mp4|webm|m4a)(?:$|\?)/i.test(entry.name)) result.push({ url: entry.name });
      const streaming = window.ytInitialPlayerResponse?.streamingData;
      if (streaming) {
        for (const key of ["hlsManifestUrl", "dashManifestUrl"]) if (streaming[key]) result.push({ url: streaming[key] });
        for (const item of [...(streaming.formats || []), ...(streaming.adaptiveFormats || [])]) if (item.url) result.push({
          url: item.url, kind: item.mimeType?.startsWith("audio/") ? "audio" : "video",
          resolution: item.qualityLabel, requiresAudio: item.mimeType?.startsWith("video/") && !item.audioQuality,
        });
      }
      return result.slice(0, 200);
    },
  }).catch(() => []);
  const seen = new Set(candidates.map(mediaIdentity));
  for (const frame of frames) for (const item of frame.result || []) {
    try {
      if (!/^https?:\/\//.test(item.url || "")) continue;
      const candidate = { ...item, kind: classifyMedia(item.url) || item.kind, url: normalizeMediaUrl(item.url), id: crypto.randomUUID() };
      if (!candidate.kind || seen.has(mediaIdentity(candidate))) continue;
      candidates.push(candidate); seen.add(mediaIdentity(candidate));
    } catch {}
  }
  candidates = selectDisplayCandidates(candidates);
  const previous = $("media").value;
  $("media").replaceChildren();
  $("audio").replaceChildren(new Option("Automatique / piste intégrée", ""));
  for (const candidate of candidates) {
    const label = [candidate.kind.toUpperCase(), candidate.resolution,
      candidate.audioCandidate ? "+ audio associé" : candidate.requiresAudio ? "audio séparé requis" : "",
      formatDuration(candidate.duration), new URL(candidate.url).hostname].filter(Boolean).join(" · ");
    $("media").append(new Option(label, candidate.id));
    if (candidate.kind === "audio") $("audio").append(new Option(label, candidate.id));
  }
  if (candidates.some((candidate) => candidate.id === previous)) $("media").value = previous;
  refreshControls();
  if (!candidates.length) setStatus("Lancez la lecture de la vidéo, puis actualisez les médias.");
}
async function init() {
  $("title").textContent = `${CONFIG.appName} - Import vidéo`;
  const [tab] = await callExtensionApi(chrome.tabs, "query", { active: true, currentWindow: true });
  tabId = tab?.id;
  try { pageInfo = await callExtensionApi(chrome.tabs, "sendMessage", tabId, { type: "GET_PAGE_INFO" }, { frameId: 0 }); } catch {}
  if (!pageInfo) {
    const [injected] = await callExtensionApi(chrome.scripting, "executeScript", { target: { tabId }, func: () => ({
      url: location.href, title: document.querySelector('meta[property="og:title"]')?.content || document.title,
      description: document.querySelector('meta[name="description"]')?.content || "",
      image: document.querySelector('meta[property="og:image"]')?.content || "",
    }) }).catch(() => []);
    pageInfo = injected?.result || { title: tab?.title || "", url: tab?.url || "" };
  }
  $("page-title").textContent = pageInfo.title || "Page sans titre"; $("page-url").textContent = pageInfo.url;
  $("video-title").value = pageInfo.title || ""; $("description").value = pageInfo.description || "";
  if (pageInfo.image) { try { pageInfo.image = new URL(pageInfo.image, pageInfo.url).href; } catch { pageInfo.image = ""; } }
  if (!pageInfo.image) document.querySelector('input[name="image-mode"][value="none"]').checked = true;
  updateImageChoice();
  await refreshMedia(); await refreshAuth();
  showJob(await send({ type: "GET_JOB", tabId }));
  setInterval(async () => {
    try { const job = await send({ type: "GET_JOB", tabId }); if (JSON.stringify(job) !== JSON.stringify(currentJob)) showJob(job); } catch {}
  }, 1000);
  send({ type: "PING_COMPANION" }).then((info) => $("companion-state").textContent = `Compagnon ${info.version} · ${info.platform} · FFmpeg connecté.`)
    .catch((error) => $("companion-state").textContent = error.message);
  if (authenticated) await Promise.all([loadCatalog(), loadEncodingAvailability()]);
}
$("login").addEventListener("click", async () => { setStatus("Ouverture de la connexion sécurisée…"); try { await send({ type: "AUTHENTICATE" }); setStatus("Connexion validée."); await refreshAuth(); await Promise.all([loadCatalog(), loadEncodingAvailability()]); } catch (error) { setStatus(error.message, true); } });
$("logout").addEventListener("click", async () => { await send({ type: "LOGOUT" }); setStatus("Extension déconnectée."); await refreshAuth(); });
$("series-search").addEventListener("input", renderSeries);
$("series").addEventListener("change", loadSeasons);
$("genre-search").addEventListener("input", renderGenres);
document.querySelectorAll('input[name="image-mode"]').forEach((input) => input.addEventListener("change", updateImageChoice));
$("image-file").addEventListener("change", () => { selectedImageFile = $("image-file").files?.[0] || null; updateImageChoice(); });
$("refresh-media").addEventListener("click", () => refreshMedia().catch((error) => setStatus(error.message, true)));
$("cancel").addEventListener("click", async () => { await send({ type: "CANCEL_JOB", tabId }); setStatus("Annulation demandée…"); });
$("download").addEventListener("click", async () => {
  const candidate = selectedCandidate(); if (!candidate || $("download").disabled) return;
  preparing = true; refreshControls();
  try { showJob(await send({ type: "COMPANION_DOWNLOAD", tabId, candidate, title: metadata().titre })); }
  catch (error) { setStatus(error.message, true); }
  finally { preparing = false; refreshControls(); }
});
$("import").addEventListener("click", async () => {
  if ($("import").disabled) return;
  const candidate = selectedCandidate(); const form = metadata();
  if (!candidate || !form.titre) return setStatus("Sélectionnez un média et renseignez son titre.", true);
  if ($("series").value && !form.SaisonID) return setStatus("Sélectionnez une saison pour la série choisie.", true);
  preparing = true; refreshControls(); setStatus("Préparation de l’affiche…");
  try { form.image = await imagePayload(); showJob(await send({ type: "COMPANION_IMPORT", tabId, candidate, metadata: form })); }
  catch (error) { setStatus(error.message, true); }
  finally { preparing = false; refreshControls(); }
});
init().catch((error) => setStatus(error.message, true));
