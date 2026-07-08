import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PlayIcon } from "@heroicons/react/20/solid";
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
  return `./imageDefault.png`;
}

function formatTimecode(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value < 0) return "--:--";
  const total = Math.floor(value);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function getProgressFromLog(log) {
  const meta = log?.Meta && typeof log.Meta === "object" ? log.Meta : {};
  const duration = Number(meta.duration ?? meta.Duration);
  const endTimecode = Number(meta.endTimecode ?? meta.timecodeEnd ?? meta.Timecode);
  const startTimecode = log?.ActionNom === "video_resume_play"
    ? Number(meta.startTimecode ?? meta.timecodeStart ?? 0)
    : 0;

  if (!Number.isFinite(duration) || duration <= 0) return null;
  if (!Number.isFinite(endTimecode) || endTimecode < 0) return null;

  const safeStart = Number.isFinite(startTimecode) && startTimecode > 0
    ? Math.min(startTimecode, duration)
    : 0;
  const safeEnd = Math.min(Math.max(endTimecode, safeStart), duration);

  return {
    startTimecode: safeStart,
    endTimecode: safeEnd,
    duration,
    startPercent: Math.min((safeStart / duration) * 100, 100),
    watchedPercent: Math.max(Math.min(((safeEnd - safeStart) / duration) * 100, 100), 0),
  };
}

function buildWatchGroups(watchLogs) {
  const filmMap = new Map();
  const seriesMap = new Map();

  (watchLogs || []).forEach((log) => {
    const video = log?.Video;
    if (!video?.VideoID) return;
    const deleted = Boolean(video.Deleted);

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
          deleted,
          plays: [],
        });
      }

      const episodeEntry = seriesEntry.episodes.get(video.VideoID);
      episodeEntry.plays.push({
        date: log.DateAction,
        actionName: log.ActionNom,
        progress: getProgressFromLog(log),
      });

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
          deleted,
          plays: [],
          latestDate: 0,
        });
      }

      const filmEntry = filmMap.get(video.VideoID);
      filmEntry.plays.push({
        date: log.DateAction,
        actionName: log.ActionNom,
        progress: getProgressFromLog(log),
      });
      if (dateTs > filmEntry.latestDate) {
        filmEntry.latestDate = dateTs;
      }
    }
  });

  const filmCards = Array.from(filmMap.values()).map((entry) => ({
    ...entry,
    plays: entry.plays
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
  }));

  const seriesCards = Array.from(seriesMap.values()).map((entry) => {
    const episodes = Array.from(entry.episodes.values()).map((episode) => ({
      ...episode,
      plays: episode.plays
        .slice()
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
      latestDate: episode.plays.reduce((max, value) => {
        const ts = new Date(value.date).getTime();
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

const ITEMS_PER_PAGE = 3;
const DATES_PER_PAGE = 20;
const RAW_ITEMS_PER_PAGE = 6;

const ProgressBar = ({ progress }) => {
  if (!progress) return null;

  return (
    <div className="mt-1">
      <div className="flex justify-between text-[11px] text-slate-500">
        <span>{formatTimecode(progress.startTimecode)}</span>
        <span>{formatTimecode(progress.endTimecode)} / {formatTimecode(progress.duration)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-transparent"
          style={{
            marginLeft: `${progress.startPercent}%`,
            width: `${progress.watchedPercent}%`,
          }}
        >
          <div className="h-full rounded-full bg-gradient-to-r from-sky-300 to-blue-500" />
        </div>
      </div>
    </div>
  );
};

const DateList = ({ plays = [], buttonClassName = "" }) => {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(1);
  const dateListRef = useRef(null);

  useEffect(() => {
    setPage(1);
  }, [open, plays.length]);

  if (!plays.length) {
    return (
      <p className="text-xs text-slate-500">Aucune date disponible.</p>
    );
  }

  const totalPages = Math.max(1, Math.ceil(plays.length / DATES_PER_PAGE));
  const start = (page - 1) * DATES_PER_PAGE;
  const pageItems = plays.slice(start, start + DATES_PER_PAGE);

  return (
    <div ref={dateListRef} className="mt-1">
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
          {pageItems.map((play, idx) => (
            <div key={idx} className="rounded border border-white/5 bg-white/[0.03] p-2 text-slate-400 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span>{formatDateTime(play.date)}</span>
                {play.actionName === "video_resume_play" && (
                  <span className="text-[11px] font-semibold text-sky-300">Reprise</span>
                )}
              </div>
              <ProgressBar progress={play.progress} />
            </div>
          ))}

          {totalPages > 1 && (
            <div className="mt-2">
              <PaginationPage
                currentPage={page}
                totalPages={totalPages}
                totalItems={plays.length}
                itemsPerPage={DATES_PER_PAGE}
                onPageChange={setPage}
                scrollTarget={dateListRef}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

function buildRawWatchItems(watchLogs) {
  return (watchLogs || [])
    .map((log) => {
      const video = log?.Video;
      if (!video?.VideoID) return null;

      const series = log?.Series;
      const isSeries = Boolean(series?.SeriesID);

      return {
        logId: log.LogID || `${video.VideoID}-${log.DateAction}`,
        videoId: video.VideoID,
        deleted: Boolean(video.Deleted),
        title: isSeries ? series?.Titre || "Série" : video.Titre || `Video ${video.VideoID}`,
        subtitle: isSeries
          ? `${video.Titre || `Episode ${video.VideoID}`}${video.SaisonNumero ? ` - Saison ${video.SaisonNumero}` : ""}`
          : null,
        image: isSeries ? series?.CheminImage || video.CheminImage : video.CheminImage,
        date: log.DateAction,
        actionName: log.ActionNom,
        progress: getProgressFromLog(log),
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

const actionLabels = {
  video_first_play: "Lecture",
  video_resume_play: "Reprise",
};

const RawWatchHistoryList = ({ watchLogs = [], emptyText }) => {
  const [page, setPage] = useState(1);
  const listRef = useRef(null);
  const items = useMemo(() => buildRawWatchItems(watchLogs), [watchLogs]);
  const totalPages = Math.max(1, Math.ceil(items.length / RAW_ITEMS_PER_PAGE));

  useEffect(() => {
    setPage(1);
  }, [items.length]);

  const pageItems = items.slice(
    (page - 1) * RAW_ITEMS_PER_PAGE,
    page * RAW_ITEMS_PER_PAGE
  );

  if (!items.length) {
    return <p className="mt-2 text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <div ref={listRef}>
      <ul className="mt-3 space-y-3">
        {pageItems.map((item) => (
          <li
            key={item.logId}
            className="rounded-2xl border border-white/10 bg-slate-950/55 p-4 text-white shadow-xl shadow-black/20 backdrop-blur-xl"
          >
            <div className="flex items-center gap-4">
              {item.deleted ? (
                <div className="shrink-0">
                  <img
                    src={getImageUrl(item.image)}
                    alt={item.title}
                    className="h-24 w-20 rounded-lg object-cover opacity-60 grayscale ring-1 ring-white/10"
                  />
                </div>
              ) : (
              <Link to={`/lecture/${item.videoId}`} className="shrink-0">
                <img
                  src={getImageUrl(item.image)}
                  alt={item.title}
                  className="h-24 w-20 rounded-lg object-cover ring-1 ring-white/10"
                />
              </Link>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {item.deleted ? (
                    <span className="line-clamp-2 text-sm font-bold text-white">{item.title}</span>
                  ) : (
                    <Link
                      to={`/lecture/${item.videoId}`}
                      className="line-clamp-2 text-sm font-bold text-white hover:text-sky-100"
                    >
                      {item.title}
                    </Link>
                  )}
                  <span className="rounded-full border border-sky-300/25 bg-sky-500/10 px-2 py-0.5 text-[11px] font-bold text-sky-200">
                    {actionLabels[item.actionName] || item.actionName || "Lecture"}
                  </span>
                  {item.deleted && (
                    <span className="rounded-full border border-red-300/25 bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-200">
                      Contenu supprimé
                    </span>
                  )}
                </div>
                {item.subtitle && (
                  <p className="mt-1 line-clamp-1 text-xs text-slate-300">
                    {item.subtitle}
                  </p>
                )}
                <p className="mt-2 text-xs font-semibold text-slate-300">
                  {formatDateTime(item.date)}
                </p>
                <ProgressBar progress={item.progress} />
              </div>
              {!item.deleted && (
                <Link
                  to={`/lecture/${item.videoId}`}
                  className="grid size-12 shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-white transition duration-200 hover:bg-sky-500/30"
                  aria-label="Lire"
                >
                  <PlayIcon className="size-5" />
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div className="mt-4">
          <PaginationPage
            currentPage={page}
            totalPages={totalPages}
            totalItems={items.length}
            itemsPerPage={RAW_ITEMS_PER_PAGE}
            onPageChange={setPage}
            scrollTarget={listRef}
          />
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
  rawMode = false,
}) => {
  const [page, setPage] = useState(1);
  const sectionRef = useRef(null);
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
    <div ref={sectionRef}>
      <h2 className="text-sm font-medium text-slate-400">{title}</h2>
      {loading ? (
        <p className="mt-2 text-sm text-slate-500">Chargement de l'historique...</p>
      ) : rawMode ? (
        <RawWatchHistoryList watchLogs={watchLogs} emptyText={emptyText} />
      ) : cards.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <>
          <ul className="mt-3 grid grid-cols-1 gap-4">
            {pageCards.map((card) => {
            const isSeries = card.type === "series";
            const imageHref = isSeries
              ? card.firstEpisodeId
                ? `/lecture/${card.firstEpisodeId}`
                : card.latestEpisodeId
                  ? `/lecture/${card.latestEpisodeId}`
                  : "#"
              : card.deleted ? "#" : `/lecture/${card.videoId}`;
            const imageIsLink = imageHref !== "#" && !card.deleted;

            return (
              <li
                key={isSeries ? `series-${card.seriesId}` : `video-${card.videoId}`}
                className="col-span-1 flex max-h-60 rounded-md"
              >
                {imageIsLink ? (
                  <Link
                    to={imageHref}
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
                  </Link>
                ) : (
                  <div className="flex max-h-60 shrink-0 items-center justify-center rounded-l-md bg-slate-800 text-sm font-medium text-white">
                  <img
                    src={getImageUrl(card.image)}
                    alt={card.title}
                    className="object-cover w-full h-full aspect-2/3 rounded-l-md opacity-60 grayscale"
                  />
                  </div>
                )}
                <div className="flex flex-1 items-stretch justify-between rounded-r-md border-b border-r border-t border-white/10 bg-slate-900/50 overflow-hidden">
                  <div className="flex-1 px-4 py-3 text-sm overflow-y-auto max-h-60">
                    {isSeries ? (
                      <div className="font-medium text-white truncate">{card.title}</div>
                    ) : card.deleted ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-white truncate">{card.title}</span>
                        <span className="rounded-full border border-red-300/25 bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-200">
                          Contenu supprimé
                        </span>
                      </div>
                    ) : (
                      <Link
                        to={`/lecture/${card.videoId}`}
                        className="font-medium text-white truncate hover:text-white"
                      >
                        {card.title}
                      </Link>
                    )}
                    {isSeries ? (
                      <div className="mt-1 space-y-2 text-xs text-slate-300">
                        {card.episodes.map((episode) => (
                          <div key={episode.videoId}>
                            <div className="flex flex-wrap items-center gap-2">
                              {episode.deleted ? (
                                <span className="font-semibold text-slate-200 truncate">
                                  {episode.title}
                                  {episode.seasonNumber
                                    ? ` (S${episode.seasonNumber})`
                                    : ""}
                                </span>
                              ) : (
                                <Link
                                  to={`/lecture/${episode.videoId}`}
                                  className="font-semibold text-slate-200 truncate hover:text-white"
                                >
                                  {episode.title}
                                  {episode.seasonNumber
                                    ? ` (S${episode.seasonNumber})`
                                    : ""}
                                </Link>
                              )}
                              {episode.deleted && (
                                <span className="rounded-full border border-red-300/25 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-200">
                                  Supprimé
                                </span>
                              )}
                            </div>
                            <DateList plays={episode.plays} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <>
                        <p className="text-slate-400">
                          {card.plays.length} lecture{card.plays.length > 1 ? "s" : ""}
                        </p>
                        <DateList plays={card.plays} />
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
                scrollTarget={sectionRef}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default WatchHistoryCards;
