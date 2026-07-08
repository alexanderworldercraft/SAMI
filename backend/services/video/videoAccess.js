import { GRADE } from "../../constants.js";

export const isVideoPremium = (video) => {
  const videoPremium = !!video.Premium;
  const seriesPremium = !!video.Saison?.Series?.Premium;
  return videoPremium || seriesPremium;
};

export const canAccessPremium = (user) => {
  if (!user) return false;

  const isAdmin = user.GradeID === GRADE.SUPER_ADMIN || user.GradeID === GRADE.ADMIN;
  if (isAdmin) return true;

  if (!user.PremiumEndDate) return false;

  const now = new Date();
  const end = new Date(user.PremiumEndDate);
  return end > now;
};

export const normalizeProgress = (progress) => {
  if (!progress) return null;
  const progressPercent =
    progress.ProgressPercent === null || progress.ProgressPercent === undefined
      ? (progress.Timecode / progress.Duration) * 100
      : Number(progress.ProgressPercent);

  return {
    UserVideoProgressID: progress.UserVideoProgressID?.toString?.() || String(progress.UserVideoProgressID),
    UserID: progress.UserID,
    VideoID: progress.VideoID,
    Timecode: progress.Timecode,
    Duration: progress.Duration,
    ProgressPercent: Number.isFinite(progressPercent) ? Number(progressPercent.toFixed(2)) : 0,
    UpdatedAt: progress.UpdatedAt,
  };
};
