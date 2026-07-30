import { beforeEach, describe, expect, it, vi } from "vitest";

const SHARED_SECRET =
  "test-video-transfer-secret-with-at-least-32-bytes";

vi.mock("../services/videoTransferConfig.js", () => ({
  assertPrimaryTransferConfiguration: vi.fn(() => ({
    sharedSecret: SHARED_SECRET,
  })),
}));

import {
  internalVideoTransferBodyIntegrity,
  internalVideoTransferRawAuth,
} from "../middlewares/internalVideoTransferAuth.js";
import {
  buildTransferHeaders,
  stableStringify,
} from "../services/videoTransferSecurity.js";

const createReply = () => {
  const reply = {
    statusCode: 200,
    payload: null,
    status: vi.fn((statusCode) => {
      reply.statusCode = statusCode;
      return reply;
    }),
    send: vi.fn((payload) => {
      reply.payload = payload;
      return payload;
    }),
  };
  return reply;
};

const createRequest = ({ body, signedBody = body } = {}) => {
  const method = "POST";
  const rawUrl = "/api/internal/video-transfers/sessions";
  const serialized =
    signedBody === undefined ? "" : stableStringify(signedBody);
  return {
    method,
    body,
    headers: buildTransferHeaders({
      method,
      path: rawUrl,
      body: serialized,
      secret: SHARED_SECRET,
      sourceInstanceId: "clone-test",
    }),
    raw: {
      url: rawUrl,
      resume: vi.fn(),
    },
  };
};

describe("authentification HMAC interne en deux phases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authentifie les en-têtes avant de valider le JSON parsé", async () => {
    const request = createRequest({
      body: { manifestHash: "a".repeat(64), manifest: { version: 1 } },
    });
    const reply = createReply();

    await internalVideoTransferRawAuth(request, reply);
    expect(reply.send).not.toHaveBeenCalled();
    expect(request.transferAuth).toMatchObject({
      sourceInstanceId: "clone-test",
    });

    await internalVideoTransferBodyIntegrity(request, reply);
    expect(reply.send).not.toHaveBeenCalled();
  });

  it("refuse un corps modifié après la validation anticipée de la signature", async () => {
    const request = createRequest({
      signedBody: { value: "attendu" },
      body: { value: "modifié" },
    });
    const reply = createReply();

    await internalVideoTransferRawAuth(request, reply);
    await internalVideoTransferBodyIntegrity(request, reply);

    expect(reply.statusCode).toBe(401);
    expect(reply.payload).toMatchObject({
      code: "TRANSFER_BODY_DIGEST_MISMATCH",
    });
  });

  it("rejette une mauvaise signature dès onRequest", async () => {
    const request = createRequest({ body: {} });
    request.headers["x-sami-transfer-signature"] = "0".repeat(64);
    const reply = createReply();

    await internalVideoTransferRawAuth(request, reply);

    expect(reply.statusCode).toBe(401);
    expect(reply.payload).toMatchObject({
      code: "INVALID_TRANSFER_SIGNATURE",
    });
    expect(request.raw.resume).toHaveBeenCalled();
  });
});
