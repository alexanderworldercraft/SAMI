import { CONFIG } from "./config.js";
import { callExtensionApi } from "./extensionApi.js";
import { classifyMedia, headerValue, mediaIdentity, normalizeMediaUrl, parseHlsManifest, selectDisplayCandidates } from "./mediaDetection.js";
const mediaByTab = new Map();
const originHeaders = new Map();
const requestHeaders = new Map();
const generations = new Map();
const jobs = new Map();
const nativePorts = new Map();
const session = chrome.storage.session;
const ready = session.get(["media", "origins", "jobs"]).then((saved) => {
  for (const [key, value] of Object.entries(saved.media || {})) if (!mediaByTab.has(Number(key)) && !generations.has(Number(key))) mediaByTab.set(Number(key), value);
  for (const [key, value] of Object.entries(saved.origins || {})) if (!originHeaders.has(Number(key)) && !generations.has(Number(key))) originHeaders.set(Number(key), value);
  for (const [key, value] of Object.entries(saved.jobs || {})) jobs.set(Number(key), value.state === "running" ? { ...value, state: "error", error: "Compagnon interrompu. Vérifiez le dossier de destination ou SAMI avant de relancer." } : value);
}).catch(() => {});
let saveTimer;
const persist = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => session.set({ media: Object.fromEntries(mediaByTab), origins: Object.fromEntries(originHeaders) }).catch(() => {}), 150);
};
const saveJobs = () => session.set({ jobs: Object.fromEntries(jobs) }).catch(() => {});
const resetTab = (tabId) => {
  generations.set(tabId, (generations.get(tabId) || 0) + 1);
  mediaByTab.delete(tabId); originHeaders.delete(tabId); persist();
};
chrome.webNavigation.onCommitted.addListener(({ tabId, frameId }) => { if (frameId === 0) resetTab(tabId); });
chrome.webNavigation.onHistoryStateUpdated.addListener(({ tabId, frameId }) => { if (frameId === 0) resetTab(tabId); });
chrome.tabs.onRemoved.addListener((tabId) => { resetTab(tabId); if (jobs.get(tabId)?.state !== "running") { jobs.delete(tabId); saveJobs(); } });
const storeCandidate = (tabId, candidate) => {
  const entries = mediaByTab.get(tabId) || [];
  const identity = mediaIdentity(candidate);
  const previous = entries.find((entry) => mediaIdentity(entry) === identity);
  mediaByTab.set(tabId, [{ ...previous, ...candidate, id: previous?.id || candidate.id || crypto.randomUUID() },
    ...entries.filter((entry) => mediaIdentity(entry) !== identity)].slice(0, 200));
  persist();
};
const scopedHeaders = (url, candidate) => {
  const headers = { ...candidate.headers };
  if (new URL(url).origin !== new URL(candidate.url).origin) { delete headers.cookie; delete headers.authorization; }
  return headers;
};
const analyzeHlsCandidate = async (tabId, candidate) => {
  const generation = generations.get(tabId) || 0;
  try {
    // This enriches the list only; native retrieval remains authoritative if browser fetch fails.
    const response = await fetch(candidate.url, { credentials: "include", signal: AbortSignal.timeout(10000) });
    if (!response.ok) return;
    const reader = response.body.getReader(); const decoder = new TextDecoder();
    let text = ""; let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.length; if (length > 4 * 1024 * 1024) return;
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { await reader.cancel(); }
    if ((generations.get(tabId) || 0) !== generation) return;
    const analysis = parseHlsManifest(text, response.url || candidate.url);
    storeCandidate(tabId, { ...candidate, ...analysis, analyzed: true });
    for (const variant of analysis.variants) storeCandidate(tabId, {
      ...candidate, ...variant, headers: scopedHeaders(variant.url, candidate),
      audioCandidate: variant.audio ? { kind: "hls", url: variant.audio.url, headers: scopedHeaders(variant.audio.url, candidate) } : undefined,
      id: crypto.randomUUID(), isMaster: false, analyzed: false, variantOf: candidate.url,
    });
  } catch {} // A failed optional preview must not hide a usable playlist.
};
chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  if (details.tabId < 0) return;
  const headers = {};
  for (const name of ["cookie", "authorization", "referer", "origin", "user-agent"]) {
    const value = headerValue(details.requestHeaders, name); if (value) headers[name] = value;
  }
  requestHeaders.set(details.requestId, { headers, time: Date.now(), generation: generations.get(details.tabId) || 0 });
  if (requestHeaders.size > 1000) for (const [id, request] of requestHeaders) {
    if (Date.now() - request.time > 60000 || requestHeaders.size > 1000) requestHeaders.delete(id);
  }
}, { urls: ["<all_urls>"] }, ["requestHeaders", "extraHeaders"]);
chrome.webRequest.onHeadersReceived.addListener((details) => {
  if (details.tabId < 0 || details.statusCode < 200 || details.statusCode >= 300) return;
  const request = requestHeaders.get(details.requestId);
  if (request && request.generation !== (generations.get(details.tabId) || 0)) return;
  const contentType = headerValue(details.responseHeaders, "content-type");
  const kind = classifyMedia(details.url, contentType);
  const headers = requestHeaders.get(details.requestId)?.headers || {};
  if (kind || details.type === "media" || /\.(ts|m4s|aac|key)(?:$|\?)/i.test(details.url)) {
    const entries = originHeaders.get(details.tabId) || {};
    entries[new URL(details.url).origin] = headers;
    // Session-only, bounded, and forwarded only to this exact origin by the companion.
    originHeaders.set(details.tabId, Object.fromEntries(Object.entries(entries).slice(-50)));
    persist();
  }
  if (!kind) return;
  const candidate = {
    url: normalizeMediaUrl(details.url), kind, contentType, headers, detectedAt: Date.now(),
    size: Number(headerValue(details.responseHeaders, "content-length")) || null,
  };
  storeCandidate(details.tabId, candidate);
  if (kind === "hls") analyzeHlsCandidate(details.tabId, candidate);
}, { urls: ["<all_urls>"] }, ["responseHeaders", "extraHeaders"]);
for (const event of [chrome.webRequest.onCompleted, chrome.webRequest.onErrorOccurred]) {
  event.addListener((details) => requestHeaders.delete(details.requestId), { urls: ["<all_urls>"] });
}
function nativeRequest(payload, onProgress, key) {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connectNative(CONFIG.companionHost);
    if (key) nativePorts.set(key, port);
    let settled = false;
    const timer = payload.action === "ping" ? setTimeout(() => { port.disconnect(); reject(new Error("Le compagnon ne répond pas.")); }, 15000) : null;
    const cleanup = () => { clearTimeout(timer); if (key) nativePorts.delete(key); };
    port.onMessage.addListener((message) => {
      if (message.type === "progress") { onProgress?.(message); return; }
      settled = true; cleanup(); port.disconnect();
      message.ok ? resolve(message) : reject(new Error(message.error || "Opération refusée par le compagnon."));
    });
    port.onDisconnect.addListener(() => { cleanup(); if (!settled) reject(new Error(chrome.runtime.lastError?.message || "Compagnon local interrompu.")); });
    port.postMessage(payload);
  });
}
const encoder = new TextEncoder();
const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const randomValue = (size = 32) => base64url(crypto.getRandomValues(new Uint8Array(size)));
const sha256 = async (value) => crypto.subtle.digest("SHA-256", encoder.encode(value));

async function authenticate() {
  const verifier = randomValue(48);
  const state = randomValue(24);
  const challenge = base64url(await sha256(verifier));
  const redirectUri = chrome.identity.getRedirectURL("sami-auth");
  const clientId = chrome.runtime.id;
  const url = new URL(`${CONFIG.apiBaseUrl}/login`);
  url.searchParams.set("client", "browser-extension");
  url.searchParams.set("clientId", clientId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("codeChallenge", challenge);
  url.searchParams.set("extensionName", `${CONFIG.appName} - Import vidéo`);

  const responseUrl = await callExtensionApi(chrome.identity, "launchWebAuthFlow", { url: url.toString(), interactive: true });
  const callback = new URL(responseUrl);
  if (callback.searchParams.get("state") !== state) throw new Error("Réponse d'autorisation invalide.");
  const response = await fetch(`${CONFIG.apiBaseUrl}/api/extension-auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: callback.searchParams.get("code"), codeVerifier: verifier, clientId, redirectUri,
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Connexion refusée.");
  await callExtensionApi(chrome.storage.local, "set", { auth: payload });
  return payload;
}


chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await ready;
    if (sender.id !== chrome.runtime.id) throw new Error("Expéditeur non autorisé.");
    if (message.type === "REPORT_MEDIA") {
      if (sender.tab?.id == null || !/^https?:/.test(sender.url || "")) throw new Error("Page invalide.");
      if (!/^https?:\/\//.test(message.url || "")) return;
      const kind = classifyMedia(message.url) || (["video", "audio"].includes(message.kind) ? message.kind : null);
      if (kind) storeCandidate(sender.tab.id, { url: normalizeMediaUrl(message.url), kind, detectedAt: Date.now() });
      return;
    }
    if (!sender.url?.startsWith(chrome.runtime.getURL(""))) throw new Error("Cette commande est réservée à la fenêtre de l’extension.");
    const tabId = Number(message.tabId);
    if (message.type === "AUTHENTICATE") return authenticate();
    if (message.type === "GET_MEDIA_CANDIDATES") return selectDisplayCandidates(mediaByTab.get(tabId) || []);
    if (message.type === "GET_JOB") return jobs.get(tabId) || null;
    if (message.type === "CANCEL_JOB") { nativePorts.get(jobs.get(tabId)?.id)?.postMessage({ action: "cancel" }); return; }
    if (message.type === "PING_COMPANION") return nativeRequest({ action: "ping" });
    if (["COMPANION_DOWNLOAD", "COMPANION_IMPORT"].includes(message.type)) {
      if (!Number.isInteger(tabId) || tabId < 0) throw new Error("Onglet invalide.");
      if (jobs.get(tabId)?.state === "running") throw new Error("Une opération est déjà en cours pour cet onglet.");
      const headersByOrigin = originHeaders.get(tabId) || {};
      const candidate = { ...message.candidate, headersByOrigin };
      if (candidate.audioCandidate) candidate.audioCandidate = { ...candidate.audioCandidate, headersByOrigin };
      let payload = { action: "download", candidate, title: message.title };
      if (message.type === "COMPANION_IMPORT") {
        const { auth } = await callExtensionApi(chrome.storage.local, "get", "auth");
        if (!auth?.accessToken || Date.parse(auth.expiresAt) <= Date.now()) throw new Error(`Connectez l’extension à ${CONFIG.appName} avant l’import.`);
        payload = { action: "import", candidate, metadata: message.metadata, apiBaseUrl: CONFIG.apiBaseUrl, accessToken: auth.accessToken };
      }
      const job = { id: crypto.randomUUID(), state: "running", action: payload.action, startedAt: Date.now(), stage: "starting" };
      jobs.set(tabId, job); await saveJobs();
      nativeRequest(payload, (progress) => { Object.assign(job, progress, { state: "running" }); saveJobs(); }, job.id)
        .then((result) => Object.assign(job, { state: "done", result }))
        .catch((error) => Object.assign(job, { state: "error", error: error.message }))
        .finally(saveJobs);
      return job;
    }
    if (message.type === "LOGOUT") {
      const { auth } = await callExtensionApi(chrome.storage.local, "get", "auth");
      if (auth?.accessToken) await fetch(`${CONFIG.apiBaseUrl}/api/extension-auth/revoke`, {
        method: "POST", headers: { Authorization: `Bearer ${auth.accessToken}` },
      }).catch(() => {});
      await callExtensionApi(chrome.storage.local, "remove", "auth"); return;
    }
    throw new Error("Commande inconnue.");
  })().then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
