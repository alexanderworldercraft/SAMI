import { timingSafeEqual } from "crypto";

import { consumeEncodingRequestNonce, getEncodingWorker } from "../services/distributedEncoding/persistence.js";
import { assertAiDubbingConfig } from "../services/aiDubbing/config.js";
import { AI_DUBBING_SIGNATURE_DOMAIN } from "../services/aiDubbing/constants.js";
import { sha256String, stableStringify, verifyTransferHeaders } from "../services/videoTransferSecurity.js";

const NONCE_TTL_MS = 10 * 60 * 1000;

const sendError = (reply, error) => reply.status(Number(error?.statusCode) || 401).send({
  error: error?.message || "Signature du clone de doublage invalide.",
  ...(error?.code ? { code: error.code } : {}),
});

const authenticate = async (request) => {
  const config = assertAiDubbingConfig();
  if (config.role !== "PRIMARY") {
    const error = new Error("Les routes internes de doublage sont réservées au primary.");
    error.statusCode = 403;
    throw error;
  }
  const auth = verifyTransferHeaders({
    headers: request.headers,
    secret: config.sharedSecret,
    signatureDomain: AI_DUBBING_SIGNATURE_DOMAIN,
    method: request.method,
    rawPathAndQuery: request.raw.url,
    nonceCache: { consume: () => true },
  });
  const worker = await getEncodingWorker(auth.sourceInstanceId);
  if (!worker || !worker.Enabled || String(worker.Role).toUpperCase() !== "CLONE") {
    const error = new Error("Ce clone de doublage n'est pas autorisé.");
    error.statusCode = 403;
    error.code = "AI_DUBBING_WORKER_FORBIDDEN";
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

export const internalAiDubbingRawAuth = async (request, reply) => {
  try {
    request.aiDubbingAuth = await authenticate(request);
  } catch (error) {
    request.raw.resume();
    return sendError(reply, error);
  }
};

export const internalAiDubbingBodyIntegrity = async (request, reply) => {
  try {
    const announced = Buffer.from(String(request.aiDubbingAuth?.bodySha256 || ""), "hex");
    const serialized = request.body === undefined ? "" : stableStringify(request.body);
    const actual = Buffer.from(sha256String(serialized), "hex");
    if (announced.length !== 32 || actual.length !== 32 || !timingSafeEqual(announced, actual)) {
      const error = new Error("Le corps de doublage ne correspond pas à son empreinte signée.");
      error.statusCode = 401;
      error.code = "AI_DUBBING_BODY_DIGEST_MISMATCH";
      throw error;
    }
  } catch (error) {
    return sendError(reply, error);
  }
};
