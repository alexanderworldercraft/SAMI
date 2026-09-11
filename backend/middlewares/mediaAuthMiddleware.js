import { authMiddleware } from "./authMiddleware.js";
import { verifyVideoMediaAccessToken } from "../services/videoMediaAccessToken.js";

export const VIDEO_MEDIA_TOKEN_HEADER = "x-sami-media-token";

export const mediaAuthMiddleware = async (request, reply) => {
  const headerValue = request.headers[VIDEO_MEDIA_TOKEN_HEADER];
  const mediaToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!mediaToken) return authMiddleware(request, reply);

  try {
    request.user = verifyVideoMediaAccessToken(mediaToken, request.params?.videoId);
  } catch (error) {
    console.error("Invalid video media token:", error?.message || error);
    return reply.status(401).send({ error: "Invalid media access token" });
  }
};
