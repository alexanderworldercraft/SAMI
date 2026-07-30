import { timingSafeEqual } from "crypto";

import { assertPrimaryTransferConfiguration } from "../services/videoTransferConfig.js";
import {
  sha256String,
  stableStringify,
  verifyTransferHeaders,
} from "../services/videoTransferSecurity.js";

const sendAuthenticationError = (reply, error) => {
  const statusCode = Number(error?.statusCode);
  return reply
    .status(
      Number.isInteger(statusCode) && statusCode >= 400 && statusCode <= 599
        ? statusCode
        : 401
    )
    .send({
      error: error?.message || "Signature de transfert invalide.",
      ...(error?.code ? { code: error.code } : {}),
    });
};

const verifyRequest = (request) => {
  const config = assertPrimaryTransferConfiguration();
  return verifyTransferHeaders({
    headers: request.headers,
    secret: config.sharedSecret,
    method: request.method,
    rawPathAndQuery: request.raw.url,
  });
};

/**
 * Authentifie le flux avant que Fastify ne tente de le parser. Son empreinte
 * annoncée est comparée aux octets réellement lus par le service d'import.
 */
export const internalVideoTransferRawAuth = async (request, reply) => {
  try {
    request.transferAuth = verifyRequest(request);
  } catch (error) {
    request.raw.resume();
    return sendAuthenticationError(reply, error);
  }
};

/**
 * Compare le JSON parsé au hash déjà authentifié en onRequest. La signature est
 * ainsi contrôlée avant le parsing, puis l'intégrité exacte du corps après.
 */
export const internalVideoTransferBodyIntegrity = async (request, reply) => {
  try {
    const announcedDigest = String(request.transferAuth?.bodySha256 || "");
    const serializedBody =
      request.body === undefined
        ? ""
        : stableStringify(request.body);
    const actualDigest = sha256String(serializedBody);
    const announcedBuffer = Buffer.from(announcedDigest, "hex");
    const actualBuffer = Buffer.from(actualDigest, "hex");
    if (
      announcedBuffer.length !== 32
      || actualBuffer.length !== 32
      || !timingSafeEqual(announcedBuffer, actualBuffer)
    ) {
      const error = new Error(
        "Le corps reçu ne correspond pas à son empreinte signée."
      );
      error.statusCode = 401;
      error.code = "TRANSFER_BODY_DIGEST_MISMATCH";
      throw error;
    }
  } catch (error) {
    return sendAuthenticationError(reply, error);
  }
};
