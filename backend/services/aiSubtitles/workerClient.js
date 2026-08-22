import { Readable } from "stream";

import { buildTransferHeaders, canonicalRequestPath, sha256String, stableStringify } from "../videoTransferSecurity.js";
import { AI_SUBTITLE_SIGNATURE_DOMAIN } from "./constants.js";
import { assertAiSubtitleConfig } from "./config.js";
import { aiSubtitleError } from "./error.js";

const CONTROL_TIMEOUT_MS = 30_000;
const SOURCE_TIMEOUT_MS = 30 * 60 * 1000;
const internalPath = (suffix) => `/api/internal/ai-subtitles${suffix}`;

const remoteConfig = () => {
  const config = assertAiSubtitleConfig();
  if (config.role !== "CLONE" || !config.primaryBaseUrl) {
    throw aiSubtitleError("Le client IA distant nécessite un clone.", "AI_SUBTITLE_CLONE_REQUIRED");
  }
  return config;
};

const parseResponse = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { error: text.slice(0, 500) }; }
};

const responseError = (response, payload, fallbackMessage) => {
  if (response.status === 404) {
    return aiSubtitleError(
      "Le serveur principal ne propose pas encore l'API interne de sous-titrage IA. Déployez la même version de SAMI sur le primary.",
      "AI_SUBTITLE_PRIMARY_API_UNAVAILABLE",
      404
    );
  }
  return aiSubtitleError(payload?.error || fallbackMessage, payload?.code, response.status);
};

async function signedFetch({ method = "GET", path, body, headers = {}, timeoutMs, signal, stream = false }) {
  const config = remoteConfig();
  const url = new URL(path, `${config.primaryBaseUrl.href.replace(/\/+$/, "")}/`);
  if (url.origin !== config.primaryBaseUrl.origin) {
    throw aiSubtitleError("La cible IA sort du primary configuré.", "AI_SUBTITLE_PRIMARY_SCOPE");
  }
  const serialized = body === undefined ? "" : stableStringify(body);
  const signedHeaders = buildTransferHeaders({
    secret: config.sharedSecret,
    signatureDomain: AI_SUBTITLE_SIGNATURE_DOMAIN,
    method,
    path: canonicalRequestPath(`${url.pathname}${url.search}`),
    bodySha256: sha256String(serialized),
    sourceInstanceId: config.instanceId,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs || CONTROL_TIMEOUT_MS);
  timer.unref?.();
  const abort = () => controller.abort(signal.reason || new Error("cancelled"));
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  let deferredCleanup = false;
  const cleanup = () => {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", abort);
  };
  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...signedHeaders,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : serialized,
      redirect: "error",
      signal: controller.signal,
    });
    if (stream) {
      if (!response.ok) {
        const payload = await parseResponse(response);
        throw responseError(response, payload, "Source IA indisponible.");
      }
      const readable = Readable.fromWeb(response.body);
      deferredCleanup = true;
      readable.once("close", cleanup);
      readable.once("end", cleanup);
      readable.once("error", cleanup);
      return { headers: response.headers, stream: readable };
    }
    const payload = await parseResponse(response);
    if (!response.ok) {
      throw responseError(response, payload, `Le primary a répondu ${response.status}.`);
    }
    return payload;
  } catch (error) {
    if (error?.name === "AiSubtitleError") throw error;
    throw aiSubtitleError(
      controller.signal.aborted ? "Le primary IA n'a pas répondu à temps." : "Le primary IA est indisponible.",
      "AI_SUBTITLE_PRIMARY_UNAVAILABLE",
      503,
      error
    );
  } finally {
    if (!deferredCleanup) cleanup();
  }
}

export const sendRemoteAiHeartbeat = (body, options = {}) => signedFetch({
  method: "POST", path: internalPath("/workers/heartbeat"), body, ...options,
});
export const claimRemoteAiJob = (body = {}, options = {}) => signedFetch({
  method: "POST", path: internalPath("/jobs/claim"), body, ...options,
});
export const renewRemoteAiJob = ({ jobId, ...body }, options = {}) => signedFetch({
  method: "POST", path: internalPath(`/jobs/${encodeURIComponent(jobId)}/renew`), body, ...options,
});
export const completeRemoteAiJob = ({ jobId, ...body }, options = {}) => signedFetch({
  method: "POST", path: internalPath(`/jobs/${encodeURIComponent(jobId)}/complete`), body, timeoutMs: SOURCE_TIMEOUT_MS, ...options,
});
export const failRemoteAiJob = ({ jobId, ...body }, options = {}) => signedFetch({
  method: "POST", path: internalPath(`/jobs/${encodeURIComponent(jobId)}/fail`), body, ...options,
});
export const openRemoteAiSource = ({ jobId, leaseToken, leaseGeneration, offset = 0, signal }) => {
  const query = new URLSearchParams({ offset: String(offset) });
  return signedFetch({
    path: internalPath(`/jobs/${encodeURIComponent(jobId)}/source?${query}`),
    headers: {
      "x-sami-ai-lease": leaseToken,
      "x-sami-ai-lease-generation": String(leaseGeneration),
    },
    timeoutMs: SOURCE_TIMEOUT_MS,
    signal,
    stream: true,
  });
};
