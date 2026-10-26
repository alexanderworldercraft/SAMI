import jwt from "jsonwebtoken";
import { describe, expect, it, vi } from "vitest";

import { authMiddleware } from "../middlewares/authMiddleware.js";
import { mediaAuthMiddleware, VIDEO_MEDIA_TOKEN_HEADER } from "../middlewares/mediaAuthMiddleware.js";
import {
  createVideoMediaAccessToken,
  verifyVideoMediaAccessToken,
  VIDEO_MEDIA_TOKEN_USE,
} from "../services/videoMediaAccessToken.js";

const database = vi.hoisted(() => ({ userSession: { findUnique: vi.fn() } }));
vi.mock("../services/db.js", () => ({ prisma: database }));
const sessionId = "00000000-0000-4000-8000-000000000007";
const session = { UserSessionID: sessionId, UtilisateurID: 7, Scope: "session", AuthVersion: 1,
  ExpiresAt: new Date(Date.now()+3600000), Utilisateur: { UtilisateurID: 7, EtatID: 1, AuthVersion: 1, PasswordChangeRequired: false } };
const createReply = () => ({
  statusCode: 200,
  payload: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  send(payload) {
    this.payload = payload;
    return this;
  },
});

describe("videoMediaAccessToken", () => {
  it("crée une autorisation limitée à l'utilisateur, la vidéo et la session", () => {
    const now = Math.floor(Date.now() / 1000);
    const token = createVideoMediaAccessToken({
      userId: 7,
      videoId: 42,
      sessionExpiresAt: now + 900, sessionId, authVersion: 1,
    });

    const decoded = verifyVideoMediaAccessToken(token, 42);
    expect(decoded).toMatchObject({
      userId: 7,
      videoId: 42,
      tokenUse: VIDEO_MEDIA_TOKEN_USE,
    });
    expect(decoded.exp).toBeLessThanOrEqual(now + 900);
    expect(() => verifyVideoMediaAccessToken(token, 43)).toThrow();
  });

  it("autorise le HLS avec l'en-tête média sans rendre le jeton valable sur l'API", async () => {
    const token = createVideoMediaAccessToken({ userId: 7, videoId: 42, sessionId, authVersion: 1 });
    const mediaRequest = {
      headers: { [VIDEO_MEDIA_TOKEN_HEADER]: token },
      params: { videoId: "42" },
    };
    database.userSession.findUnique.mockResolvedValue(session);
    const mediaReply = createReply();

    await mediaAuthMiddleware(mediaRequest, mediaReply);
    expect(mediaReply.statusCode).toBe(200);
    expect(mediaRequest.user).toMatchObject({ userId: 7, videoId: 42, sessionId, authVersion: 1 });

    const apiReply = createReply();
    await authMiddleware({
      headers: { authorization: `Bearer ${token}` },
    }, apiReply);
    expect(apiReply.statusCode).toBe(401);
    expect(apiReply.payload.code).toBe("INVALID_SESSION");
  });

  it("refuse un jeton signé qui n'est pas une autorisation média SAMI", async () => {
    const token = jwt.sign(
      { userId: 7, videoId: 42, tokenUse: "autre" },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );
    const reply = createReply();

    await mediaAuthMiddleware({
      headers: { [VIDEO_MEDIA_TOKEN_HEADER]: token },
      params: { videoId: "42" },
    }, reply);
    expect(reply.statusCode).toBe(401);
  });
});
