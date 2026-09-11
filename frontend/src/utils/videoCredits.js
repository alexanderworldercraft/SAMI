export const formatCreditTime = seconds => {
  const n = Math.max(0, Math.floor(Number(seconds) || 0));
  return [Math.floor(n / 3600), Math.floor(n / 60) % 60, n % 60].map(value => String(value).padStart(2, "0")).join(":");
};
export const parseCreditTime = text => {
  const match = /^(\d{2,}):([0-5]\d):([0-5]\d)$/.exec(text.trim());
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : NaN;
};
export function getCreditActions(segments, time, duration) {
  const approved = (segments || []).filter(s => s.Status === "APPROVED" && Number.isFinite(s.Start) && Number.isFinite(s.End) && s.Start >= 0 && s.End > s.Start && s.End <= duration).sort((a, b) => a.Start - b.Start);
  const last = approved[approved.length - 1];
  return {
    active: approved.find(s => time >= s.Start && time < s.End) || null,
    showNext: Boolean(last && duration > 0 && last.Start > duration / 2 && time >= last.Start),
  };
}
// Preserve the series ordering returned by the server and used by EpisodeList.
export function getNextCreditEpisode(series, videoId, premium) {
  const episodes = (series?.Saisons || []).flatMap(season => season.Episodes || []);
  const index = episodes.findIndex(episode => episode.VideoID === Number(videoId));
  const next = index >= 0 ? episodes[index + 1] : null;
  return next && (!(next.Premium || series.Premium) || premium) ? next : null;
}
