export const orderSagaContents = (contents = []) => [...contents].sort((left, right) =>
  Number(left.Ordre || 0) - Number(right.Ordre || 0)
  || Number(left.SagaContentID || 0) - Number(right.SagaContentID || 0)
);

export function getCurrentSagaContent(contents, videoId, seriesId) {
  if (videoId == null) return null;
  return contents.find((item) => item.type === "video" && String(item.id) === String(videoId))
    || contents.find((item) => item.type === "series" && seriesId != null && String(item.id) === String(seriesId))
    || null;
}

export function getNextSagaContent({ contents = [], sagaCount, videoId, series, premium = false }) {
  if (sagaCount !== 1 || videoId == null) return null;

  // Le passage à l’entrée suivante de la saga attend le dernier épisode de
  // toute la série, y compris lorsque la saison courante vient de se terminer.
  const episodes = (series?.Saisons || []).flatMap((season) => season.Episodes || []);
  if (series) {
    const episodeIndex = episodes.findIndex((episode) => String(episode.VideoID) === String(videoId));
    if (episodeIndex < 0 || episodeIndex !== episodes.length - 1) return null;
  }

  const ordered = orderSagaContents(contents);
  const current = getCurrentSagaContent(ordered, videoId, series?.SeriesID);
  const index = current ? ordered.indexOf(current) : -1;
  const next = index >= 0 ? ordered[index + 1] : null;
  if (!next || ((next.Premium || next.PlaybackPremium) && !premium)) return null;

  const nextVideoId = Number(next.type === "series" ? next.FirstVideoID
    : next.type === "video" ? (next.VideoID ?? next.id) : null);
  if (!Number.isSafeInteger(nextVideoId) || nextVideoId <= 0 || nextVideoId === Number(videoId)) return null;
  return { ...next, VideoID: nextVideoId };
}
