import React, { useEffect, useMemo, useState } from "react";
import PaginationPage from "./PaginationPage";

const apiBaseUrl = process.env.REACT_APP_URL_LOCAL;

function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getImageUrl(cheminImage) {
  if (cheminImage) return `${apiBaseUrl}/${cheminImage}`;
  return `${apiBaseUrl}/uploads/images/videos/default.webp`;
}

function buildWatchGroups(watchLogs) {
  const filmMap = new Map();
  const seriesMap = new Map();

  (watchLogs || []).forEach((log) => {
    const video = log?.Video;
    if (!video?.VideoID) return;

    const series = log?.Series;
    const seriesId = series?.SeriesID || null;
    const date = log?.DateAction ? new Date(log.DateAction) : null;
    const dateTs = date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;

    if (seriesId) {
      if (!seriesMap.has(seriesId)) {
        seriesMap.set(seriesId, {
          type: "series",
          seriesId,
          title: series?.Titre || "Série",
          image: series?.CheminImage || null,
          firstEpisodeId: series?.FirstEpisodeID || null,
          episodes: new Map(),
          latestDate: 0,
          latestEpisodeId: null,
        });
      }

      const seriesEntry = seriesMap.get(seriesId);
      if (!seriesEntry.episodes.has(video.VideoID)) {
        seriesEntry.episodes.set(video.VideoID, {
          videoId: video.VideoID,
          title: video.Titre || `Episode ${video.VideoID}`,
          seasonNumber: video.SaisonNumero ?? null,
          dates: [],
        });
      }

      const episodeEntry = seriesEntry.episodes.get(video.VideoID);
      episodeEntry.dates.push(log.DateAction);

      if (dateTs > seriesEntry.latestDate) {
        seriesEntry.latestDate = dateTs;
        seriesEntry.latestEpisodeId = video.VideoID;
      }
    } else {
      if (!filmMap.has(video.VideoID)) {
        filmMap.set(video.VideoID, {
          type: "video",
          videoId: video.VideoID,
          title: video.Titre || `Video ${video.VideoID}`,
          image: video.CheminImage || null,
          dates: [],
          latestDate: 0,
        });
      }

      const filmEntry = filmMap.get(video.VideoID);
      filmEntry.dates.push(log.DateAction);
      if (dateTs > filmEntry.latestDate) {
        filmEntry.latestDate = dateTs;
      }
    }
  });

  const filmCards = Array.from(filmMap.values()).map((entry) => ({
    ...entry,
    dates: entry.dates
      .slice()
      .sort((a, b) => new Date(b) - new Date(a)),
  }));

  const seriesCards = Array.from(seriesMap.values()).map((entry) => {
    const episodes = Array.from(entry.episodes.values()).map((episode) => ({
      ...episode,
      dates: episode.dates
        .slice()
        .sort((a, b) => new Date(b) - new Date(a)),
      latestDate: episode.dates.reduce((max, value) => {
        const ts = new Date(value).getTime();
        return Number.isFinite(ts) && ts > max ? ts : max;
      }, 0),
    }));

    episodes.sort((a, b) => b.latestDate - a.latestDate);

    return {
      ...entry,
      episodes,
    };
  });

  return [...filmCards, ...seriesCards].sort((a, b) => b.latestDate - a.latestDate);
}

const ITEMS_PER_PAGE = 6;
const DATES_PER_PAGE = 20;

const DateList = ({ dates = [], buttonClassName = "" }) => {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [open, dates.length]);

  if (!dates.length) {
    return (
      <p className="text-xs text-slate-500">Aucune date disponible.</p>
    );
  }

  const totalPages = Math.max(1, Math.ceil(dates.length / DATES_PER_PAGE));
  const start = (page - 1) * DATES_PER_PAGE;
  const pageItems = dates.slice(start, start + DATES_PER_PAGE);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={classNames(
          "text-xs font-semibold text-slate-300 hover:text-white",
          buttonClassName
        )}
      >
        {open ? "Masquer les dates" : "Afficher les dates"}
      </button>

      {open && (
        <div className="mt-1 space-y-1">
          {pageItems.map((date, idx) => (
            <div key={idx} className="text-slate-400 text-xs">
              {formatDateTime(date)}
            </div>
          ))}

          {totalPages > 1 && (
            <div className="mt-2">
              <PaginationPage
                currentPage={page}
                totalPages={totalPages}
                totalItems={dates.length}
                itemsPerPage={DATES_PER_PAGE}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const WatchHistoryCards = ({
  watchLogs = [],
  title = "Contenu regardé",
  emptyText = "Aucun contenu regardé pour le moment.",
  loading = false,
}) => {
  const [page, setPage] = useState(1);
  const cards = useMemo(() => buildWatchGroups(watchLogs), [watchLogs]);
  const totalPages = Math.max(1, Math.ceil(cards.length / ITEMS_PER_PAGE));

  useEffect(() => {
    setPage(1);
  }, [cards.length, title]);

  const pageCards = cards.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  return (
    <div>
      <h2 className="text-sm font-medium text-slate-400">{title}</h2>
      {loading ? (
        <p className="mt-2 text-sm text-slate-500">Chargement de l'historique...</p>
      ) : cards.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
            {pageCards.map((card) => {
            const isSeries = card.type === "series";
            const imageHref = isSeries
              ? card.firstEpisodeId
                ? `/lecture/${card.firstEpisodeId}`
                : card.latestEpisodeId
                  ? `/lecture/${card.latestEpisodeId}`
                  : "#"
              : `/lecture/${card.videoId}`;

            return (
              <li
                key={isSeries ? `series-${card.seriesId}` : `video-${card.videoId}`}
                className="col-span-1 flex max-h-60 rounded-md"
              >
                <a
                  href={imageHref}
                  className={classNames(
                    "flex max-h-60 shrink-0 items-center justify-center rounded-l-md text-sm font-medium text-white",
                    "bg-slate-800"
                  )}
                >
                  <img
                    src={getImageUrl(card.image)}
                    alt={card.title}
                    className="object-cover w-full h-full aspect-2/3 rounded-l-md"
                  />
                </a>
                <div className="flex flex-1 items-stretch justify-between rounded-r-md border-b border-r border-t border-white/10 bg-slate-900/50 overflow-hidden">
                  <div className="flex-1 px-4 py-3 text-sm overflow-y-auto max-h-60">
                    {isSeries ? (
                      <div className="font-medium text-white truncate">{card.title}</div>
                    ) : (
                      <a
                        href={`/lecture/${card.videoId}`}
                        className="font-medium text-white truncate hover:text-white"
                      >
                        {card.title}
                      </a>
                    )}
                    {isSeries ? (
                      <div className="mt-1 space-y-2 text-xs text-slate-300">
                        {card.episodes.map((episode) => (
                          <div key={episode.videoId}>
                            <a
                              href={`/lecture/${episode.videoId}`}
                              className="font-semibold text-slate-200 truncate hover:text-white"
                            >
                              {episode.title}
                              {episode.seasonNumber
                                ? ` (S${episode.seasonNumber})`
                                : ""}
                            </a>
                            <DateList dates={episode.dates} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        <p className="text-slate-400">
                          {card.dates.length} lecture{card.dates.length > 1 ? "s" : ""}
                        </p>
                        <DateList dates={card.dates} />
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
          </ul>

          {totalPages > 1 && (
            <div className="mt-4">
              <PaginationPage
                currentPage={page}
                totalPages={totalPages}
                totalItems={cards.length}
                itemsPerPage={ITEMS_PER_PAGE}
                onPageChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WatchHistoryCards;
