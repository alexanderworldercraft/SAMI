import fs from "fs";
import { Readable } from "stream";

import {
  assertDistributedWorkerConfig,
  DISTRIBUTED_ENCODING_SIGNATURE_DOMAIN,
} from "./config.js";
import { ENCODING_WORKER_ROLE } from "./constants.js";
import { distributedEncodingError } from "./error.js";
import {
  buildTransferHeaders,
  canonicalRequestPath,
  sha256String,
  stableStringify,
} from "../videoTransferSecurity.js";

const REQUEST_TIMEOUT_MS = 2 * 60 * 1000;
const CONTROL_TIMEOUT_MS = 15 * 1000;
const SOURCE_TIMEOUT_MS = 30 * 60 * 1000;
const ARTIFACT_TIMEOUT_MS = 30 * 60 * 1000;

const internalPath = (suffix) => `/api/internal/video-encoding${suffix}`;

const getCloneConfig = () => {
  const config = assertDistributedWorkerConfig();
  if (config.role !== ENCODING_WORKER_ROLE.CLONE || !config.primaryBaseUrl) {
    throw distributedEncodingError(
      "Le client worker distant ne peut fonctionner que sur un clone.",
      "DISTRIBUTED_WORKER_ROLE_REQUIRED",
      500
    );
  }
  return config;
};

const buildUrl = (pathAndQuery) => {
  const config = getCloneConfig();
  const base = config.primaryBaseUrl.href.replace(/\/+$/, "");
  const url = new URL(pathAndQuery, `${base}/`);
  if (url.origin !== config.primaryBaseUrl.origin) {
    throw distributedEncodingError(
      "La cible sort du serveur principal configuré.",
      "DISTRIBUTED_PRIMARY_URL_SCOPE",
      500
    );
  }
  return url;
};

const parseResponse = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 500) };
  }
};

const remoteError = (response, payload) =>
  distributedEncodingError(
    payload?.error || `Le primary a répondu ${response.status}.`,
    payload?.code || "DISTRIBUTED_PRIMARY_ERROR",
    response.status >= 400 && response.status <= 499 ? response.status : 502,
    { retryable: response.status >= 500 || response.status === 429 }
  );

async function signedFetch({
  method = "GET",
  path,
  body,
  rawBody,
  bodySha256,
  contentLength,
  extraHeaders,
  timeoutMs = REQUEST_TIMEOUT_MS,
  signal,
  responseMode = "json",
}) {
  const config = getCloneConfig();
  const url = buildUrl(path);
  const canonicalPath = canonicalRequestPath(`${url.pathname}${url.search}`);
  const serializedBody = body === undefined ? null : stableStringify(body);
  const digest =
    bodySha256
    || sha256String(serializedBody === null ? "" : serializedBody);
  const headers = buildTransferHeaders({
    secret: config.sharedSecret,
    signatureDomain: DISTRIBUTED_ENCODING_SIGNATURE_DOMAIN,
    method,
    path: canonicalPath,
    bodySha256: digest,
    sourceInstanceId: config.instanceId,
  });
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("timeout")),
    timeoutMs
  );
  timeout.unref?.();
  const onAbort = () => controller.abort(signal.reason || new Error("cancelled"));
  let cleanupDeferredToStream = false;
  const cleanup = () => {
    clearTimeout(timeout);
    signal?.removeEventListener?.("abort", onAbort);
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...headers,
        ...(serializedBody !== null ? { "content-type": "application/json" } : {}),
        ...(rawBody ? { "content-type": "application/octet-stream" } : {}),
        ...(contentLength !== undefined
          ? { "content-length": String(contentLength) }
          : {}),
        ...(extraHeaders || {}),
      },
      body: rawBody || serializedBody,
      ...(rawBody ? { duplex: "half" } : {}),
      redirect: "error",
      signal: controller.signal,
    });
    if (responseMode === "stream") {
      if (!response.ok) throw remoteError(response, await parseResponse(response));
      const stream = Readable.fromWeb(response.body);
      cleanupDeferredToStream = true;
      let cleaned = false;
      const cleanupOnce = () => {
        if (cleaned) return;
        cleaned = true;
        cleanup();
      };
      stream.once("end", cleanupOnce);
      stream.once("close", cleanupOnce);
      stream.once("error", cleanupOnce);
      return {
        status: response.status,
        headers: response.headers,
        stream,
      };
    }
    const payload = await parseResponse(response);
    if (!response.ok) throw remoteError(response, payload);
    return payload;
  } catch (error) {
    if (error?.name === "DistributedEncodingError") throw error;
    const cancelled = signal?.aborted;
    throw distributedEncodingError(
      cancelled
        ? "La tâche d'encodage a été annulée."
        : controller.signal.aborted
          ? "Le primary n'a pas répondu dans le délai imparti."
          : "Le primary est indisponible.",
      cancelled
        ? "DISTRIBUTED_TASK_CANCELLED"
        : controller.signal.aborted
          ? "DISTRIBUTED_PRIMARY_TIMEOUT"
          : "DISTRIBUTED_PRIMARY_UNAVAILABLE",
      cancelled ? 409 : 503,
      { retryable: !cancelled, cause: error }
    );
  } finally {
    if (!cleanupDeferredToStream) cleanup();
  }
}

export const sendWorkerHeartbeat = (payload, options = {}) =>
  signedFetch({
    method: "POST",
    path: internalPath("/workers/heartbeat"),
    body: payload,
    timeoutMs: CONTROL_TIMEOUT_MS,
    ...options,
  });

export const claimRemoteEncodingTask = (payload, options = {}) =>
  signedFetch({
    method: "POST",
    path: internalPath("/tasks/claim"),
    body: payload,
    timeoutMs: CONTROL_TIMEOUT_MS,
    ...options,
  });

export const renewRemoteEncodingTask = ({ taskId, ...payload }, options = {}) =>
  signedFetch({
    method: "POST",
    path: internalPath(`/tasks/${encodeURIComponent(taskId)}/renew`),
    body: payload,
    timeoutMs: CONTROL_TIMEOUT_MS,
    ...options,
  });

export async function openRemoteEncodingSource({
  jobId,
  taskId,
  leaseToken,
  leaseGeneration,
  offset = 0,
  signal,
}) {
  const query = new URLSearchParams({ offset: String(offset) });
  const response = await signedFetch({
    path: internalPath(
      `/jobs/${encodeURIComponent(jobId)}/source?${query.toString()}`
    ),
    timeoutMs: SOURCE_TIMEOUT_MS,
    extraHeaders: {
      "x-sami-encoding-task-id": String(taskId),
      "x-sami-encoding-lease": String(leaseToken),
      "x-sami-encoding-lease-generation": String(leaseGeneration),
    },
    signal,
    responseMode: "stream",
  });
  return {
    status: response.status,
    etag: String(response.headers.get("etag") || "").replace(/^W\//, "").replaceAll('"', ""),
    totalSize: Number(response.headers.get("x-sami-source-size")),
    contentLength: Number(response.headers.get("content-length")),
    stream: response.stream,
  };
}

export const registerRemoteEncodingArtifacts = (
  { taskId, manifest, manifestHash, leaseToken },
  options = {}
) => signedFetch({
  method: "POST",
  path: internalPath(`/tasks/${encodeURIComponent(taskId)}/artifacts`),
  body: { manifest, manifestHash, leaseToken },
  ...options,
});

export const uploadRemoteEncodingArtifact = ({
  taskId,
  fileId,
  absolutePath,
  size,
  sha256,
  leaseToken,
  leaseGeneration,
  signal,
}) => {
  return signedFetch({
    method: "PUT",
    path: internalPath(
      `/tasks/${encodeURIComponent(taskId)}/artifacts/${encodeURIComponent(fileId)}`
    ),
    rawBody: fs.createReadStream(absolutePath),
    bodySha256: sha256,
    contentLength: size,
    extraHeaders: {
      "x-sami-encoding-lease": leaseToken,
      "x-sami-encoding-lease-generation": String(leaseGeneration),
    },
    timeoutMs: ARTIFACT_TIMEOUT_MS,
    signal,
  });
};

export const completeRemoteEncodingTask = (
  { taskId, ...payload },
  options = {}
) => signedFetch({
  method: "POST",
  path: internalPath(`/tasks/${encodeURIComponent(taskId)}/complete`),
  body: payload,
  timeoutMs: ARTIFACT_TIMEOUT_MS,
  ...options,
});

export const failRemoteEncodingTask = (
  { taskId, ...payload },
  options = {}
) => signedFetch({
  method: "POST",
  path: internalPath(`/tasks/${encodeURIComponent(taskId)}/fail`),
  body: payload,
  timeoutMs: CONTROL_TIMEOUT_MS,
  ...options,
});

export const releaseRemoteEncodingTask = (
  { taskId, ...payload },
  options = {}
) => signedFetch({
  method: "POST",
  path: internalPath(`/tasks/${encodeURIComponent(taskId)}/release`),
  body: payload,
  timeoutMs: CONTROL_TIMEOUT_MS,
  ...options,
});
