import fs from "fs";
import crypto from "crypto";
import http from "http";
import https from "https";
import { Readable } from "stream";

import { buildTransferHeaders, canonicalRequestPath, sha256String, stableStringify } from "../videoTransferSecurity.js";
import { assertAiDubbingConfig } from "./config.js";
import { AI_DUBBING_SIGNATURE_DOMAIN } from "./constants.js";

const CONTROL_TIMEOUT_MS = 2 * 60 * 1000;
const FILE_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const prefix = "/api/internal/ai-dubbing";
const internalPath = (suffix) => `${prefix}${suffix}`;

const remoteConfig = () => {
  const config = assertAiDubbingConfig();
  if (config.role !== "CLONE" || !config.primaryBaseUrl) {
    throw new Error("Le client de doublage distant est réservé à un clone configuré.");
  }
  return config;
};

const parseResponse = async (response) => {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { error: text }; }
};

const nativeFetch = ({ url, method, headers, body, rawBody, signal, config }) => new Promise((resolve, reject) => {
  const transport = url.protocol === "https:" ? https : http;
  const ca = config.primaryTlsCaFile ? fs.readFileSync(config.primaryTlsCaFile) : undefined;
  const options = {
    method,
    headers,
    signal,
    ...(ca ? { ca } : {}),
    ...(config.primaryTlsCertSha256 ? {
      checkServerIdentity: (_hostname, certificate) => {
        const actual = crypto.createHash("sha256").update(certificate.raw).digest("hex");
        if (actual !== config.primaryTlsCertSha256) {
          return new Error("L'empreinte TLS du primary de doublage ne correspond pas au certificat attendu.");
        }
        return undefined;
      },
    } : {}),
  };
  const request = transport.request(url, options, (response) => {
    const responseBody = Readable.toWeb(response);
    resolve({
      ok: response.statusCode >= 200 && response.statusCode < 300,
      status: response.statusCode,
      headers: new Headers(Object.entries(response.headers).flatMap(([name, value]) => (
        Array.isArray(value) ? value.map((item) => [name, item]) : value == null ? [] : [[name, value]]
      ))),
      body: responseBody,
      text: async () => {
        const chunks = [];
        for await (const chunk of response) chunks.push(Buffer.from(chunk));
        return Buffer.concat(chunks).toString("utf8");
      },
    });
  });
  request.once("error", reject);
  if (rawBody) {
    rawBody.once("error", (error) => request.destroy(error));
    rawBody.pipe(request);
  } else {
    request.end(body);
  }
});

async function signedFetch({
  method = "GET",
  path,
  body,
  rawBody,
  bodySha256,
  contentLength,
  headers = {},
  timeoutMs = CONTROL_TIMEOUT_MS,
  signal,
  stream = false,
}) {
  const config = remoteConfig();
  const url = new URL(path, `${config.primaryBaseUrl.href.replace(/\/+$/, "")}/`);
  if (url.origin !== config.primaryBaseUrl.origin) throw new Error("La cible de doublage sort du primary configuré.");
  const serialized = body === undefined ? "" : stableStringify(body);
  const digest = bodySha256 || sha256String(serialized);
  const signedHeaders = buildTransferHeaders({
    secret: config.sharedSecret,
    signatureDomain: AI_DUBBING_SIGNATURE_DOMAIN,
    method,
    path: canonicalRequestPath(`${url.pathname}${url.search}`),
    bodySha256: digest,
    sourceInstanceId: config.instanceId,
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
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
    const requestHeaders = {
      ...signedHeaders,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(contentLength == null ? {} : { "content-length": String(contentLength) }),
      ...headers,
    };
    const requestBody = rawBody || (body === undefined ? undefined : serialized);
    const response = config.primaryTlsCaFile ? await nativeFetch({
      url,
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : serialized,
      rawBody,
      signal: controller.signal,
      config,
    }) : await fetch(url, {
      method,
      headers: requestHeaders,
      body: requestBody,
      duplex: rawBody ? "half" : undefined,
      redirect: "error",
      signal: controller.signal,
    });
    if (stream) {
      if (!response.ok) {
        const payload = await parseResponse(response);
        throw new Error(payload.error || `Le primary a répondu ${response.status}.`);
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
      const error = new Error(payload.error || `Le primary a répondu ${response.status}.`);
      error.statusCode = response.status;
      error.code = payload.code;
      throw error;
    }
    return payload;
  } finally {
    if (!deferredCleanup) cleanup();
  }
}

export const sendRemoteDubbingHeartbeat = (body, options = {}) => signedFetch({
  method: "POST", path: internalPath("/workers/heartbeat"), body, ...options,
});
export const sendRemoteDubbingDiagnostic = (body, options = {}) => signedFetch({
  method: "POST", path: internalPath("/diagnostics"), body, timeoutMs: 15_000, ...options,
});
export const claimRemoteDubbingJob = (body = {}, options = {}) => signedFetch({
  method: "POST", path: internalPath("/jobs/claim"), body, ...options,
});
export const renewRemoteDubbingJob = ({ jobId, ...body }, options = {}) => signedFetch({
  method: "POST", path: internalPath(`/jobs/${encodeURIComponent(jobId)}/renew`), body, ...options,
});
export const failRemoteDubbingJob = ({ jobId, ...body }, options = {}) => signedFetch({
  method: "POST", path: internalPath(`/jobs/${encodeURIComponent(jobId)}/fail`), body, ...options,
});
export const openRemoteDubbingAsset = ({
  jobId, fileId, leaseToken, leaseGeneration, offset = 0, signal,
}) => signedFetch({
  path: internalPath(
    `/jobs/${encodeURIComponent(jobId)}/assets/${encodeURIComponent(fileId)}?offset=${encodeURIComponent(offset)}`
  ),
  headers: {
    "x-sami-ai-dubbing-lease": leaseToken,
    "x-sami-ai-dubbing-lease-generation": String(leaseGeneration),
  },
  timeoutMs: FILE_TIMEOUT_MS,
  signal,
  stream: true,
});
export const registerRemoteDubbingArtifacts = ({ jobId, ...body }, options = {}) => signedFetch({
  method: "POST", path: internalPath(`/jobs/${encodeURIComponent(jobId)}/artifacts`), body, ...options,
});
export const uploadRemoteDubbingArtifact = ({
  jobId, fileId, absolutePath, size, sha256, leaseToken, leaseGeneration, signal,
}) => signedFetch({
  method: "PUT",
  path: internalPath(`/jobs/${encodeURIComponent(jobId)}/artifacts/${encodeURIComponent(fileId)}`),
  rawBody: fs.createReadStream(absolutePath),
  bodySha256: sha256,
  contentLength: size,
  headers: {
    "x-sami-ai-dubbing-lease": leaseToken,
    "x-sami-ai-dubbing-lease-generation": String(leaseGeneration),
  },
  timeoutMs: FILE_TIMEOUT_MS,
  signal,
});
export const completeRemoteDubbingJob = ({ jobId, ...body }, options = {}) => signedFetch({
  method: "POST",
  path: internalPath(`/jobs/${encodeURIComponent(jobId)}/complete`),
  body,
  timeoutMs: FILE_TIMEOUT_MS,
  ...options,
});
