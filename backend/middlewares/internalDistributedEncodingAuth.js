import { timingSafeEqual } from "crypto";

import {
  assertDistributedPrimaryConfig,
  DISTRIBUTED_ENCODING_SIGNATURE_DOMAIN,
} from "../services/distributedEncoding/config.js";
import { ENCODING_WORKER_ROLE } from "../services/distributedEncoding/constants.js";
import {
  consumeEncodingRequestNonce,
  getEncodingWorker,
} from "../services/distributedEncoding/persistence.js";
import {
  sha256String,
  stableStringify,
  verifyTransferHeaders,
} from "../services/videoTransferSecurity.js";

const NONCE_TTL_MS = 10 * 60 * 1000;

const sendAuthError = (reply, error) => {
  const parsed = Number(error?.statusCode);
  const statusCode =
    Number.isInteger(parsed) && parsed >= 400 && parsed <= 599 ? parsed : 401;
  return reply.status(statusCode).send({
    error: error?.message || "Signature d'encodage distribué invalide.",
    ...(error?.code ? { code: error.code } : {}),
  });
};

const consumePersistentNonce = async ({ workerId, nonce, timestampMs }) => {
  try {
    await consumeEncodingRequestNonce({
      workerId,
      nonce,
      expiresAt: new Date(Math.max(Date.now(), timestampMs) + NONCE_TTL_MS),
    });
  } catch (error) {
    if (error?.code === "ENCODING_NONCE_REPLAYED") {
      error.statusCode = 409;
    }
    throw error;
  }
};

const authenticateRequest = async (request) => {
  const config = assertDistributedPrimaryConfig();
  const auth = verifyTransferHeaders({
    headers: request.headers,
    secret: config.sharedSecret,
    signatureDomain: DISTRIBUTED_ENCODING_SIGNATURE_DOMAIN,
    method: request.method,
    rawPathAndQuery: request.raw.url,
    // Le replay est persisté juste après la vérification cryptographique.
    nonceCache: { consume: () => true },
  });

  const worker = await getEncodingWorker(auth.sourceInstanceId);
  if (
    !worker
    || !worker.Enabled
    || String(worker.Role).toUpperCase() !== ENCODING_WORKER_ROLE.CLONE
  ) {
    const error = new Error("Ce worker d'encodage n'est pas autorisé.");
    error.statusCode = 403;
    error.code = "DISTRIBUTED_ENCODING_WORKER_FORBIDDEN";
    throw error;
  }

  await consumePersistentNonce({
    workerId: worker.VideoEncodingWorkerID,
    nonce: auth.nonce,
    timestampMs: auth.timestampMs,
  });
  return { ...auth, worker };
};

export const internalDistributedEncodingRawAuth = async (request, reply) => {
  try {
    request.encodingAuth = await authenticateRequest(request);
  } catch (error) {
    request.raw.resume();
    return sendAuthError(reply, error);
  }
};

export const internalDistributedEncodingBodyIntegrity = async (request, reply) => {
  try {
    const announced = String(request.encodingAuth?.bodySha256 || "");
    const serialized = request.body === undefined ? "" : stableStringify(request.body);
    const actual = sha256String(serialized);
    const announcedBuffer = Buffer.from(announced, "hex");
    const actualBuffer = Buffer.from(actual, "hex");
    if (
      announcedBuffer.length !== 32
      || actualBuffer.length !== 32
      || !timingSafeEqual(announcedBuffer, actualBuffer)
    ) {
      const error = new Error(
        "Le corps reçu ne correspond pas à son empreinte signée."
      );
      error.statusCode = 401;
      error.code = "DISTRIBUTED_ENCODING_BODY_DIGEST_MISMATCH";
      throw error;
    }
  } catch (error) {
    return sendAuthError(reply, error);
  }
};
