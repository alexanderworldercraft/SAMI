import { loadHlsDuration } from "../utils/hlsDuration";
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const EpisodeList = ({
  episodes,
  currentEpisode,
  canAccessPremium = false,
  linkAnchor = "",
  onEpisodeClick,
}) => {
  const [durations, setDurations] = useState({});

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    episodes.forEach(async episode => {
      if (!episode.CheminAcces || (episode.Premium && !canAccessPremium)) return;
      try {
        const apiBase = new URL(`${(process.env.REACT_APP_URL_LOCAL || window.location.origin).replace(/\/+$/, "")}/`);
        const masterUrl = new URL(episode.CheminAcces, apiBase).href;
        const total = await loadHlsDuration(masterUrl, { signal: controller.signal });
        if (active) setDurations(prev => ({ ...prev, [episode.VideoID]: total }));
      } catch (error) {
        if (!active || error.name === "AbortError") return;
        console.warn(`Durée HLS indisponible pour ${episode.Titre}`, error.message);
        setDurations(prev => ({ ...prev, [episode.VideoID]: null }));
      }
    });
    return () => { active = false; controller.abort(); };
  }, [episodes, canAccessPremium]);

  return (
    <div>
      <ul role="list" className="divide-y">
        {episodes.map((episode) => {
          const isActive = currentEpisode?.VideoID === episode.VideoID;
          const duration = durations[episode.VideoID];
          const isPremiumEpisode = !!episode.Premium;
          const isLocked = isPremiumEpisode && !canAccessPremium;
          const hasWatched = !!episode.Watched;
          const watchLabel = hasWatched ? "✅" : "❌";
          const watchTitle = hasWatched ? "Épisode déjà vu" : "Épisode pas encore vu";
          const watchBadgeClass = hasWatched
            ? "bg-neutral-500 dark:bg-neutral-900 text-white border-emerald-700"
            : "bg-neutral-500 dark:bg-neutral-900 text-slate-800 dark:text-slate-100 border-red-700";

          const card = (
            <li
              key={episode.VideoID}
              className={`flex justify-between gap-x-6 py-5 px-2 rounded-lg transition ${
                isLocked
                  ? "bg-neutral-100 text-neutral-400 dark:bg-slate-900/60 dark:text-slate-500 cursor-not-allowed"
                  : "hover:bg-neutral-200 dark:hover:bg-slate-800"
              }`}
            >
              <div className="flex min-w-0 gap-x-4">
                <div
                  className={`rounded font-bold size-12 flex items-center justify-center shadow-xl/30 border ${watchBadgeClass}`}
                  title={watchTitle}
                >
                  {watchLabel}
                </div>
                <div className="min-w-0 flex-auto">
                  <p
                    className={`text-base font-semibold flex items-center gap-2 ${
                      isActive
                        ? "dark:text-sky-300 text-sky-500 italic underline"
                        : isLocked
                          ? "text-neutral-400 dark:text-slate-500"
                          : "hover:text-neutral-700 dark:text-neutral-200 hover:dark:text-white"
                    }`}
                  >
                    {episode.Titre}
                    {isPremiumEpisode && (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800">
                        Premium
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-sm text-neutral-400">
                    {isLocked
                      ? "Réservé aux membres Premium"
                      : duration === undefined
                        ? "Chargement..."
                        : duration === null
                          ? "Erreur"
                          : formatDuration(duration)}
                  </p>
                </div>
              </div>
              <div className="hidden sm:flex items-center text-sm text-sky-500 dark:text-sky-400 italic">
                {isLocked ? "🔒" : isActive ? "🎬 En cours" : null}
              </div>
            </li>
          );

          return isLocked ? (
            card
          ) : (
            <Link
              key={episode.VideoID}
              to={`/lecture/${episode.VideoID}${linkAnchor}`}
              onClick={() => onEpisodeClick?.(episode)}
            >
              {card}
            </Link>
          );
        })}
      </ul>
    </div>
  );
};

const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return "–";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [
    h > 0 ? String(h).padStart(2, "0") : null,
    String(m).padStart(2, "0"),
    String(s).padStart(2, "0"),
  ].filter(Boolean).join(":");
};

export default EpisodeList;
