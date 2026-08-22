import { timingSafeEqual } from "crypto";

import { consumeEncodingRequestNonce, getEncodingWorker } from "../services/distributedEncoding/persistence.js";
import { sha256String, stableStringify, verifyTransferHeaders } from "../services/videoTransferSecurity.js";
import { assertAiSubtitleConfig } from "../services/aiSubtitles/config.js";
import { AI_SUBTITLE_SIGNATURE_DOMAIN } from "../services/aiSubtitles/constants.js";

const NONCE_TTL_MS = 10 * 60 * 1000;

const sendError = (reply, error) => reply.status(Number(error?.statusCode) || 401).send({
  error: error?.message || "Signature du worker IA invalide.",
  ...(error?.code ? { code: error.code } : {}),
});

const authenticate = async (request) => {
  const config = assertAiSubtitleConfig();
  if (config.role !== "PRIMARY") {
    const error = new Error("Les routes internes IA sont réservées au primary.");
    error.statusCode = 403;
    throw error;
  }
  const auth = verifyTransferHeaders({
    headers: request.headers,
    secret: config.sharedSecret,
    signatureDomain: AI_SUBTITLE_SIGNATURE_DOMAIN,
    method: request.method,
    rawPathAndQuery: request.raw.url,
    nonceCache: { consume: () => true },
  });
  const worker = await getEncodingWorker(auth.sourceInstanceId);
  if (!worker || !worker.Enabled || String(worker.Role).toUpperCase() !== "CLONE") {
    const error = new Error("Ce worker IA n'est pas autorisé.");
    error.statusCode = 403;
    error.code = "AI_SUBTITLE_WORKER_FORBIDDEN";
    throw error;
  }
  try {
    await consumeEncodingRequestNonce({
      workerId: worker.VideoEncodingWorkerID,
      nonce: auth.nonce,
      expiresAt: new Date(Math.max(Date.now(), auth.timestampMs) + NONCE_TTL_MS),
    });
  } catch (error) {
    if (error?.code === "ENCODING_NONCE_REPLAYED") error.statusCode = 409;
    throw error;
  }
  return { ...auth, worker };
};

export const internalAiSubtitleRawAuth = async (request, reply) => {
  try {
    request.aiSubtitleAuth = await authenticate(request);
  } catch (error) {
    request.raw.resume();
    return sendError(reply, error);
  }
};

export const internalAiSubtitleBodyIntegrity = async (request, reply) => {
  try {
    const announced = Buffer.from(String(request.aiSubtitleAuth?.bodySha256 || ""), "hex");
    const serialized = request.body === undefined ? "" : stableStringify(request.body);
    const actual = Buffer.from(sha256String(serialized), "hex");
    if (announced.length !== 32 || actual.length !== 32 || !timingSafeEqual(announced, actual)) {
      const error = new Error("Le corps IA reçu ne correspond pas à son empreinte signée.");
      error.statusCode = 401;
      error.code = "AI_SUBTITLE_BODY_DIGEST_MISMATCH";
      throw error;
    }
  } catch (error) {
    return sendError(reply, error);
  }
};
