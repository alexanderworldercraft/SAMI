import fs from "fs";

import {
  assertCloneTransferConfiguration,
} from "./videoTransferConfig.js";
import { VideoTransferError } from "./videoTransferError.js";
import {
  buildTransferHeaders,
  canonicalRequestPath,
  sha256String,
  stableStringify,
} from "./videoTransferSecurity.js";

const combineAbortSignals = (externalSignal, timeoutMs) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  timeout.unref?.();

  const onExternalAbort = () =>
    controller.abort(externalSignal.reason || new Error("cancelled"));
  if (externalSignal) {
    if (externalSignal.aborted) onExternalAbort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      externalSignal?.removeEventListener?.("abort", onExternalAbort);
    },
  };
};

const buildPrimaryUrl = (pathAndQuery) => {
  const { primaryBaseUrl } = assertCloneTransferConfiguration();
  const target = new URL(pathAndQuery, `${primaryBaseUrl.href.replace(/\/+$/, "")}/`);
  if (target.origin !== primaryBaseUrl.origin) {
    throw new VideoTransferError("La cible du transfert sort du serveur principal.", {
      statusCode: 500,
      code: "PRIMARY_URL_SCOPE_ERROR",
    });
  }
  return target;
};

const responsePayload = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 500) };
  }
};

const throwRemoteError = (response, payload) => {
  throw new VideoTransferError(
    payload?.error || `Le serveur principal a répondu ${response.status}.`,
    {
      statusCode:
        response.status >= 400 && response.status <= 499
          ? response.status
          : 502,
      code: payload?.code || "PRIMARY_SERVER_ERROR",
    }
  );
};

async function primaryRequest({
  method = "GET",
  path,
  body,
  rawBody,
  bodyDigest,
  contentLength,
  timeoutMs,
  signal,
}) {
  const config = assertCloneTransferConfiguration();
  const url = buildPrimaryUrl(path);
  const requestPath = canonicalRequestPath(`${url.pathname}${url.search}`);
  const hasJsonBody = body !== undefined;
  const serializedBody = hasJsonBody ? stableStringify(body) : null;
  const digest =
    bodyDigest
    || (serializedBody === null
      ? sha256String("")
      : sha256String(serializedBody));
  const signedHeaders = buildTransferHeaders({
    method,
    path: requestPath,
    bodyDigest: digest,
    secret: config.sharedSecret,
    sourceInstanceId: config.instanceId,
  });
  const abort = combineAbortSignals(
    signal,
    timeoutMs ?? config.requestTimeoutMs
  );

  try {
    const response = await fetch(url, {
      method,
      headers: {
        ...signedHeaders,
        ...(hasJsonBody ? { "content-type": "application/json" } : {}),
        ...(rawBody ? { "content-type": "application/octet-stream" } : {}),
        ...(contentLength !== undefined
          ? { "content-length": String(contentLength) }
          : {}),
      },
      body: rawBody || serializedBody,
      ...(rawBody ? { duplex: "half" } : {}),
      redirect: "error",
      signal: abort.signal,
    });
    const payload = await responsePayload(response);
    if (!response.ok) throwRemoteError(response, payload);
    return payload;
  } catch (error) {
    if (error instanceof VideoTransferError) throw error;
    if (abort.signal.aborted) {
      const cancelled = signal?.aborted;
      throw new VideoTransferError(
        cancelled
          ? "Le transfert a été annulé."
          : "Le serveur principal n'a pas répondu dans le délai imparti.",
        {
          statusCode: cancelled ? 409 : 504,
          code: cancelled ? "TRANSFER_CANCELLED" : "PRIMARY_TIMEOUT",
          cause: error,
        }
      );
    }
    throw new VideoTransferError("Le serveur principal est indisponible.", {
      statusCode: 503,
      code: "PRIMARY_UNAVAILABLE",
      cause: error,
    });
  } finally {
    abort.cleanup();
  }
}

const internalPath = (suffix) => `/api/internal/video-transfers${suffix}`;

export const fetchPrimaryCapabilities = () =>
  primaryRequest({ path: internalPath("/capabilities") });

export const fetchPrimaryGenres = async () =>
  (await primaryRequest({ path: internalPath("/catalog/genres") }))?.genres || [];

export const fetchPrimarySeries = async () =>
  (await primaryRequest({ path: internalPath("/catalog/series") }))?.series || [];

export const fetchPrimarySeriesSeasons = async (seriesId) =>
  (
    await primaryRequest({
      path: internalPath(`/catalog/series/${Number(seriesId)}/seasons`),
    })
  )?.seasons || [];

export const createPrimaryImportSession = ({ manifest, manifestHash, signal }) =>
  primaryRequest({
    method: "POST",
    path: internalPath("/sessions"),
    body: { manifest, manifestHash },
    signal,
  });

export const getPrimaryImportSession = ({ transferId, signal }) =>
  primaryRequest({
    path: internalPath(`/sessions/${encodeURIComponent(transferId)}`),
    signal,
  });

export const uploadPrimaryImportFile = ({
  transferId,
  fileId,
  absolutePath,
  size,
  sha256,
  signal,
}) =>
  primaryRequest({
    method: "PUT",
    path: internalPath(
      `/sessions/${encodeURIComponent(transferId)}/files/${encodeURIComponent(fileId)}`
    ),
    rawBody: fs.createReadStream(absolutePath),
    bodyDigest: sha256,
    contentLength: size,
    signal,
  });

export const verifyPrimaryImportSession = ({ transferId, signal }) =>
  primaryRequest({
    method: "POST",
    path: internalPath(`/sessions/${encodeURIComponent(transferId)}/verify`),
    body: {},
    signal,
  });

export const finalizePrimaryImportSession = ({ transferId, signal }) =>
  primaryRequest({
    method: "POST",
    path: internalPath(`/sessions/${encodeURIComponent(transferId)}/finalize`),
    body: {},
    signal,
  });

export const cancelPrimaryImportSession = ({ transferId }) =>
  primaryRequest({
    method: "POST",
    path: internalPath(`/sessions/${encodeURIComponent(transferId)}/cancel`),
    body: {},
  });
