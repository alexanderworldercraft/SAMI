import { CONFIG } from "./config.js";
import { classifyMedia, headerValue, mediaIdentity, parseHlsManifest, selectDisplayCandidates } from "./mediaDetection.js";

const mediaByTab = new Map();
const requestHeaders = new Map();

const storeCandidate = (tabId, candidate) => {
  const entries = mediaByTab.get(tabId) || [];
  const identity = mediaIdentity(candidate);
  const previous = entries.find((entry) => mediaIdentity(entry) === identity);
  mediaByTab.set(tabId, [{ ...previous, ...candidate, id: previous?.id || candidate.id || crypto.randomUUID() }, ...entries.filter((entry) => mediaIdentity(entry) !== identity)].slice(0, 80));
};

const analyzeHlsCandidate = async (tabId, candidate) => {
  try {
    const headers = {};
    if (candidate.headers?.authorization) headers.Authorization = candidate.headers.authorization;
    const response = await fetch(candidate.url, { credentials: "include", headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const analysis = parseHlsManifest(await response.text(), candidate.url);
    storeCandidate(tabId, { ...candidate, ...analysis, analyzed: true });
    for (const variant of analysis.variants) {
      storeCandidate(tabId, {
        ...candidate,
        ...variant,
        audioCandidate: variant.audio ? {
          kind: "audio",
          url: variant.audio.url,
          headers: candidate.headers || {},
        } : undefined,
        id: crypto.randomUUID(),
        url: variant.url,
        analyzed: true,
        isMaster: false,
        variantOf: candidate.url,
      });
    }
  } catch (error) {
    storeCandidate(tabId, { ...candidate, analyzed: true, analysisError: error.message });
  }
};

chrome.webRequest.onBeforeSendHeaders.addListener((details) => {
  if (details.tabId < 0) return;
  const selected = {};
  for (const name of ["cookie", "authorization", "referer", "origin", "user-agent"]) {
    const value = headerValue(details.requestHeaders, name);
    if (value) selected[name] = value;
  }
  requestHeaders.set(details.requestId, selected);
}, { urls: ["<all_urls>"] }, ["requestHeaders", "extraHeaders"]);

chrome.webRequest.onHeadersReceived.addListener((details) => {
  if (details.tabId < 0) return;
  const contentType = headerValue(details.responseHeaders, "content-type");
  const kind = classifyMedia(details.url, contentType);
  if (!kind) return;
  const candidate = {
    id: crypto.randomUUID(), url: details.url, kind, contentType,
    size: Number(headerValue(details.responseHeaders, "content-length")) || null,
    headers: requestHeaders.get(details.requestId) || {}, detectedAt: Date.now(),
  };
  storeCandidate(details.tabId, candidate);
  if (kind === "hls") analyzeHlsCandidate(details.tabId, candidate);
  requestHeaders.delete(details.requestId);
}, { urls: ["<all_urls>"] }, ["responseHeaders", "extraHeaders"]);

chrome.webRequest.onErrorOccurred.addListener((details) => requestHeaders.delete(details.requestId), { urls: ["<all_urls>"] });

function nativeRequest(payload) {
  return new Promise((resolve, reject) => {
    const port = chrome.runtime.connectNative(CONFIG.companionHost);
    let settled = false;
    port.onMessage.addListener((message) => {
      if (message.type === "progress") return;
      settled = true;
      port.disconnect();
      if (message.ok) resolve(message);
      else reject(new Error(message.error || "Le compagnon a refusé l'opération."));
    });
    port.onDisconnect.addListener(() => {
      if (!settled) reject(new Error(chrome.runtime.lastError?.message || "Compagnon local indisponible."));
    });
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

  const responseUrl = await chrome.identity.launchWebAuthFlow({ url: url.toString(), interactive: true });
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
  await chrome.storage.local.set({ auth: payload });
  return payload;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    if (message.type === "OPEN_POPUP_HINT") {
      await chrome.action.openPopup();
      return { ok: true };
    }
    if (message.type === "AUTHENTICATE") return authenticate();
    if (message.type === "GET_MEDIA_CANDIDATES") return selectDisplayCandidates(mediaByTab.get(Number(message.tabId)) || []);
    if (message.type === "PING_COMPANION") return nativeRequest({ action: "ping" });
    if (message.type === "COMPANION_DOWNLOAD") return nativeRequest({ action: "download", candidate: message.candidate, title: message.title });
    if (message.type === "COMPANION_IMPORT") {
      const { auth } = await chrome.storage.local.get("auth");
      if (!auth?.accessToken) throw new Error(`Connectez l'extension à ${CONFIG.appName} avant l'import.`);
      return nativeRequest({ action: "import", candidate: message.candidate, metadata: message.metadata, apiBaseUrl: CONFIG.apiBaseUrl, accessToken: auth.accessToken });
    }
    if (message.type === "LOGOUT") {
      const { auth } = await chrome.storage.local.get("auth");
      if (auth?.accessToken) {
        await fetch(`${CONFIG.apiBaseUrl}/api/extension-auth/revoke`, {
          method: "POST", headers: { Authorization: `Bearer ${auth.accessToken}` },
        }).catch(() => {});
      }
      await chrome.storage.local.remove("auth");
      return { ok: true };
    }
    if (message.type === "DOWNLOAD_DIRECT") {
      const filename = `${CONFIG.downloadFolder}/${String(message.filename || "video.mp4").replace(/[\\/:*?"<>|]/g, "-")}`;
      const id = await chrome.downloads.download({ url: message.url, filename, saveAs: true });
      return { id };
    }
    throw new Error("Commande inconnue.");
  })().then((result) => sendResponse({ ok: true, result })).catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});
