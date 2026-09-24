import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import * as detection from "../src/mediaDetection.js";

function setup(saved = {}) {
  const event = () => ({ listeners: [], addListener(fn) { this.listeners.push(fn); }, emit(...args) { this.listeners.forEach((fn) => fn(...args)); } });
  const session = { ...saved }; const ports = [];
  const chrome = {
    storage: { session: { get: async () => session, set: async (values) => Object.assign(session, structuredClone(values)) }, local: { get: async () => ({ auth: { accessToken: "sami-token", expiresAt: "2099-01-01" } }) } },
    webRequest: { onBeforeSendHeaders: event(), onHeadersReceived: event(), onCompleted: event(), onErrorOccurred: event() },
    webNavigation: { onCommitted: event(), onHistoryStateUpdated: event() },
    tabs: { onRemoved: event() },
    runtime: { id: "test", onMessage: event(), getURL: (suffix) => "chrome-extension://test/" + suffix, connectNative: () => {
      const port = { onMessage: event(), onDisconnect: event(), sent: [], postMessage(message) { this.sent.push(message); }, disconnect() { this.onDisconnect.emit(); } };
      ports.push(port); return port;
    } },
  };
  const code = fs.readFileSync(new URL("../src/background.js", import.meta.url), "utf8").replace(/^import .*;$/gm, "");
  const imports = { chrome, CONFIG: { apiBaseUrl: "https://configured.test/samihub", companionHost: "test.host", appName: "Test" },
    callExtensionApi: (context, method, ...args) => context[method](...args), ...detection };
  new Function(...Object.keys(imports), code)(...Object.values(imports));
  const ui = { id: "test", url: "chrome-extension://test/popup.html" };
  const send = (message, sender = ui) => new Promise((resolve) => chrome.runtime.onMessage.listeners[0](message, sender, resolve));
  const capture = (url) => {
    chrome.webRequest.onBeforeSendHeaders.emit({ requestId: url, tabId: 1, requestHeaders: [{ name: "Cookie", value: "media-session" }] });
    chrome.webRequest.onHeadersReceived.emit({ requestId: url, tabId: 1, statusCode: 200, url, responseHeaders: [{ name: "Content-Type", value: "video/mp4" }] });
    chrome.webRequest.onCompleted.emit({ requestId: url });
  };
  return { chrome, session, ports, send, capture };
}
test("les pages peuvent signaler un média mais pas lancer un transfert ou lire les autres onglets", async () => {
  const { send, ports } = setup();
  const page = { id: "test", url: "https://player.test/", tab: { id: 1 } };
  assert.equal((await send({ type: "REPORT_MEDIA", url: "https://cdn.test/a.mp4" }, page)).ok, true);
  assert.equal((await send({ type: "COMPANION_DOWNLOAD", tabId: 1 }, page)).ok, false);
  assert.equal((await send({ type: "GET_MEDIA_CANDIDATES", tabId: 2 }, page)).ok, false);
  assert.equal(ports.length, 0);
  assert.equal((await send({ type: "GET_MEDIA_CANDIDATES", tabId: 1 })).result.length, 1);
});
test("l’observation conserve les headers, une navigation efface les anciens médias", async () => {
  const { chrome, send, capture } = setup();
  await send({ type: "GET_JOB", tabId: 1 });
  capture("https://cdn.test/a.mp4");
  const candidates = (await send({ type: "GET_MEDIA_CANDIDATES", tabId: 1 })).result;
  assert.equal(candidates[0].headers.cookie, "media-session");
  chrome.webNavigation.onHistoryStateUpdated.emit({ tabId: 1, frameId: 0 });
  assert.deepEqual((await send({ type: "GET_MEDIA_CANDIDATES", tabId: 1 })).result, []);
});
test("local ne transmet aucun jeton SAMI, import utilise uniquement l’URL configurée, suivi persistant et annulation", async () => {
  const { send, ports } = setup();
  const candidate = { kind: "video", url: "https://cdn.test/a.mp4" };
  const started = await send({ type: "COMPANION_DOWNLOAD", tabId: 1, candidate, apiBaseUrl: "https://bad.test" });
  assert.equal(started.ok, true); assert.equal(ports[0].sent[0].action, "download");
  assert.equal(ports[0].sent[0].accessToken, undefined); assert.equal(ports[0].sent[0].apiBaseUrl, undefined);
  assert.equal((await send({ type: "COMPANION_IMPORT", tabId: 1, candidate })).ok, false);
  ports[0].onMessage.emit({ ok: true, outputPath: "/downloads/movie.mkv" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await send({ type: "GET_JOB", tabId: 1 })).result.state, "done");
  await send({ type: "COMPANION_IMPORT", tabId: 1, candidate, metadata: { titre: "Test" }, apiBaseUrl: "https://bad.test" });
  assert.equal(ports[1].sent[0].apiBaseUrl, "https://configured.test/samihub");
  assert.equal(ports[1].sent[0].accessToken, "sami-token");
  await send({ type: "CANCEL_JOB", tabId: 1 });
  assert.equal(ports[1].sent[1].action, "cancel");
  ports[1].onMessage.emit({ ok: false, error: "annulé" });
});
test("restaure les médias du service worker et signale un ancien transfert interrompu", async () => {
  const { send } = setup({ media: { 1: [{ kind: "video", url: "https://cdn.test/a.mp4", id: "saved" }] }, jobs: { 1: { id: "old", state: "running" } } });
  assert.equal((await send({ type: "GET_MEDIA_CANDIDATES", tabId: 1 })).result[0].id, "saved");
  assert.equal((await send({ type: "GET_JOB", tabId: 1 })).result.state, "error");
});
