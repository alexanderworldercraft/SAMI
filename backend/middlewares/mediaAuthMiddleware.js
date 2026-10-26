import { validateSessionClaims } from "../services/userSessionService.js";
import { authMiddleware } from "./authMiddleware.js";
import { verifyVideoMediaAccessToken } from "../services/videoMediaAccessToken.js";

export const VIDEO_MEDIA_TOKEN_HEADER = "x-sami-media-token";

export const mediaAuthMiddleware = async (request, reply) => {
  const headerValue = request.headers[VIDEO_MEDIA_TOKEN_HEADER];
  const mediaToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!mediaToken) return authMiddleware(request, reply);

  try {
    const decoded = verifyVideoMediaAccessToken(mediaToken, request.params?.videoId);
    const session = await validateSessionClaims({ ...decoded, tokenUse: "session" });
    request.user = { ...session, tokenUse: decoded.tokenUse, videoId: decoded.videoId };
  } catch (error) {
    console.error("Invalid video media token:", error?.message || error);
    return reply.status(401).send({ error: "Invalid media access token" });
  }
};
