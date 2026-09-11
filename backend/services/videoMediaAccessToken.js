import jwt from "jsonwebtoken";

export const VIDEO_MEDIA_TOKEN_USE = "video-media";
const VIDEO_MEDIA_AUDIENCE = "sami-video-media";
const MAX_MEDIA_TOKEN_LIFETIME_SECONDS = 4 * 60 * 60;

const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not configured");
  return secret;
};

const positiveInteger = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export function createVideoMediaAccessToken({ userId, videoId, sessionExpiresAt } = {}) {
  const parsedUserId = positiveInteger(userId);
  const parsedVideoId = positiveInteger(videoId);
  if (!parsedUserId || !parsedVideoId) {
    throw new TypeError("Utilisateur ou vidéo invalide pour le jeton média.");
  }

  const now = Math.floor(Date.now() / 1000);
  const sessionExpiration = positiveInteger(sessionExpiresAt);
  const expiresAt = Math.min(
    sessionExpiration || now + MAX_MEDIA_TOKEN_LIFETIME_SECONDS,
    now + MAX_MEDIA_TOKEN_LIFETIME_SECONDS
  );
  if (expiresAt <= now) throw new Error("La session est déjà expirée.");

  return jwt.sign(
    {
      userId: parsedUserId,
      videoId: parsedVideoId,
      tokenUse: VIDEO_MEDIA_TOKEN_USE,
    },
    getSecret(),
    {
      audience: VIDEO_MEDIA_AUDIENCE,
      expiresIn: expiresAt - now,
    }
  );
}

export function verifyVideoMediaAccessToken(token, expectedVideoId) {
  const parsedVideoId = positiveInteger(expectedVideoId);
  if (!token || !parsedVideoId) throw new Error("Jeton média ou vidéo invalide.");

  const decoded = jwt.verify(token, getSecret(), { audience: VIDEO_MEDIA_AUDIENCE });
  if (
    decoded?.tokenUse !== VIDEO_MEDIA_TOKEN_USE
    || positiveInteger(decoded.videoId) !== parsedVideoId
    || !positiveInteger(decoded.userId)
  ) {
    throw new Error("Ce jeton média ne correspond pas à cette vidéo.");
  }
  return decoded;
}

export const isVideoMediaAccessToken = (decoded) =>
  decoded?.tokenUse === VIDEO_MEDIA_TOKEN_USE;
