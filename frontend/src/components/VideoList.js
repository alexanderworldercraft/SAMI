import React from "react";
import ContentPreviewTooltip from "./ContentPreviewTooltip";

const apiUrl = process.env.REACT_APP_URL_LOCAL;
const NEW_CONTENT_WINDOW_DAYS = 30;

const isRecentDate = (date) => {
  if (!date) return false;

  const value = new Date(date).getTime();
  if (!Number.isFinite(value)) return false;

  return value >= Date.now() - NEW_CONTENT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
};

const VideoList = ({ videos = [], overlayActions, onItemClick, gridClassName = "" }) => {
  const getImageUrl = (cheminImage, type) => {
    // Fallbacks locaux (évite via.placeholder.*)
    if (cheminImage) return `${apiUrl}/${cheminImage}`;
    if (type === "person") return `${apiUrl}/uploads/images/people/default.webp`;
    // à ajuster si tu as un default pour vidéos/séries
    return `./imageDefault.png`;
  };

  const renderBadges = (item) => {
    const badges = [];
    const badgeBaseClass =
      "inline-flex w-fit max-w-full items-center justify-center bg-gradient-to-br rounded-md border px-2.5 py-1 text-center text-[10px] font-black uppercase leading-tight tracking-wide backdrop-blur-md shadow-inner whitespace-normal";

    if (item.type === "series" && item.HasNewEpisode) {
      badges.push(
        <span
          key="new-episode"
          className={`${badgeBaseClass} border-sky-200/35 from-sky-400/95 via-blue-500/95 to-cyan-400/95 text-white shadow-sky-950/55 ring-1 ring-sky-100/25`}
        >
          Nouvel épisode
        </span>
      );
    }

    if (item.type === "video" && isRecentDate(item.CreateDate)) {
      badges.push(
        <span
          key="new-film"
          className={`${badgeBaseClass} border-sky-200/35 from-sky-400/95 via-blue-500/95 to-cyan-400/95 text-white shadow-sky-950/55 ring-1 ring-sky-100/25`}
        >
          Nouveau film
        </span>
      );
    }

    if (item.Premium) {
      badges.push(
        <span
          key="premium"
          className={`${badgeBaseClass} border-amber-200/40 from-amber-300/95 via-yellow-400/95 to-orange-400/95 text-slate-950 shadow-amber-950/45 ring-1 ring-amber-100/30`}
        >
          Premium
        </span>
      );
    }

    let watchLabel = null;
    let watchClass =
      "border-emerald-200/35 bg-gradient-to-br from-emerald-300/95 via-emerald-400/95 to-teal-400/95 text-slate-950 shadow-emerald-950/45 ring-1 ring-emerald-100/25";

    if (item.type === "video" && item.Watched) {
      watchLabel = "Vu";
    } else if (item.type === "series") {
      const total = Number(item.TotalEpisodes || 0);
      const watched = Number(item.WatchedCount || 0);
      if (total > 0 && watched > 0) {
        if (watched >= total || item.WatchedAll) {
          watchLabel = "Vu";
        } else {
          watchLabel = `${watched}/${total}`;
          watchClass =
            "border-white/25 bg-gradient-to-br from-slate-100/95 via-slate-200/95 to-sky-100/95 text-slate-950 shadow-slate-950/50 ring-1 ring-white/30";
        }
      }
    }

    if (watchLabel) {
      badges.push(
        <span
          key="watched"
          className={`${badgeBaseClass} ${watchClass}`}
        >
          {watchLabel}
        </span>
      );
    }

    if (!badges.length) return null;

    return (
      <div className="absolute top-2 left-2 z-10 flex max-w-[calc(100%-1rem)] flex-col items-start gap-1 group-hover:opacity-0 duration-300">
        {badges}
      </div>
    );
  };

  if (!videos.length) {
    return <p className="text-center text-neutral-400">Aucun résultat.</p>;
  }

  return (
    <div className={`container grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-4 mx-auto ${gridClassName}`}>
      {videos.map((item) =>
        // --- NOUVEAU: cartes "personne"
        item.type === "person" ? (
          <a
            key={`person-${item.id}`}
            href={`/personnes/${item.id}`} // pour le moment: /personne/:ID
            className="group hover:-translate-y-2 duration-300"
          >
            <div className="min-h-full h-max max-h-max">
              <div className="rounded-xl overflow-hidden border border-neutral-400 bg-gradient-to-br from-slate-950 to-slate-900 mb-2 relative transition duration-300 ease-in-out group-hover:border-blue-500">
                <img
                  src={getImageUrl(item.CheminImage)}
                  alt={item.Titre} // ici Titre = "Prénom Nom"
                  className="object-cover w-full h-full aspect-2/3 dark:text-white group-hover:scale-110 duration-300"
                />
                {typeof overlayActions === "function" && (
                  <div
                    className="absolute top-2 right-2 z-10"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  >
                    {overlayActions(item)}
                  </div>
                )}
              </div>



              <div className="relative capitalize text-center px-2 py-1 font-bold dark:text-neutral-300">
                <p className="group-hover:opacity-0 opacity-100 duration-300 text-sm line-clamp-2">{item.Titre}</p>
                <div className="absolute top-0 left-0 opacity-0 group-hover:opacity-100 duration-300">
                  <p className="text-xs text-neutral-400 text-center">{item.Surnom}</p>
                </div>
              </div>
            </div>
          </a>
        )
          :
          item.type === "saga" ? (
            <button
              key={`saga-${item.id}`}
              type="button"
              onClick={() => typeof onItemClick === "function" && onItemClick(item)}
              className="group text-left hover:-translate-y-2 duration-300"
            >
              <div className="min-h-full h-max max-h-max">
                <div className="rounded-xl overflow-hidden border border-neutral-400 bg-gradient-to-br from-slate-950 to-slate-900 mb-2 relative transition duration-300 ease-in-out group-hover:border-blue-500">
                  <img
                    src={getImageUrl(item.CheminImage)}
                    alt={item.Titre}
                    className="object-cover w-full h-full aspect-2/3 dark:text-white group-hover:scale-110 duration-300"
                  />

                  {renderBadges(item)}

                  {typeof overlayActions === "function" && (
                    <div
                      className="absolute top-2 right-2 z-10"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    >
                      {overlayActions(item)}
                    </div>
                  )}
                  <div className="px-4 py-2 rounded-xl h-full w-full absolute top-0 left-0 opacity-0 group-hover:opacity-100 group-hover:bg-neutral-950/50 group-hover:backdrop-blur-2xl duration-300">
                    <p className="line-clamp-5 text-xs text-neutral-50 text-justify">{item.Resumer}</p>
                  </div>
                </div>
                <div className="relative capitalize text-center px-2 py-1 font-bold dark:text-neutral-300">
                  <p className="text-sm line-clamp-2">{item.Titre}</p>
                </div>
              </div>
            </button>
          )
            :
          item.type === "series" ? (
            <a
              key={`series-${item.id}`}
              href={item.FirstVideoID ? `/lecture/${item.FirstVideoID}` : "#"} // Lien vers la première vidéo
              className="group hover:-translate-y-2 duration-300"
            >
              <ContentPreviewTooltip item={item} title={item.Titre}>
              <div className="min-h-full h-max max-h-max">
                <div className="rounded-xl overflow-hidden border border-neutral-400 bg-gradient-to-br from-slate-950 to-slate-900 mb-2 relative transition duration-300 ease-in-out group-hover:border-blue-500">
                  <img
                    src={getImageUrl(item.CheminImage)}
                    alt={item.Titre}
                    className="object-cover w-full h-full aspect-2/3 dark:text-white group-hover:scale-110 duration-300"
                  />


                  {renderBadges(item)}

                  {/* Overlay actions (ex: Retirer) */}
                  {typeof overlayActions === "function" && (
                    <div
                      className="absolute top-2 right-2 z-10"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    >
                      {overlayActions(item)}
                    </div>
                  )}

                  <div className="px-4 py-2 rounded-xl h-full w-full absolute top-0 left-0 opacity-0 group-hover:opacity-100 group-hover:bg-neutral-950/50 group-hover:backdrop-blur-2xl duration-300">
                    <p className="line-clamp-5 text-xs text-neutral-50 text-justify">{item.Resumer} {/* Affichage résumer */}</p>
                  </div>
                </div>
                <div className="relative capitalize text-center px-2 py-1 font-bold dark:text-neutral-300">
                  <p className="group-hover:opacity-0 opacity-100 duration-300 text-sm line-clamp-2">{item.Titre} ({item.Saisons} Saisons)</p>
                  <div className="absolute top-0 left-0 opacity-0 group-hover:opacity-100 duration-300">
                    <p className="text-xs text-neutral-400 text-center line-clamp-2">
                      {(item.Genres || []).map((genre, index) => {
                        const colorClasses = [
                          "bg-red-400/10 text-red-400 ring-red-600/10 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20",
                          "bg-yellow-400/10 text-yellow-900 ring-yellow-600/20 dark:bg-yellow-400/10 dark:text-yellow-300 dark:ring-yellow-400/20",
                          "bg-green-400/10 text-green-600 ring-green-600/20 dark:bg-green-400/10 dark:text-green-400 dark:ring-green-500/20",
                          "bg-blue-400/10 text-blue-400 ring-blue-700/10 dark:bg-blue-400/10 dark:text-blue-400 dark:ring-blue-400/30",
                          "bg-indigo-400/10 text-indigo-400 ring-indigo-700/10 dark:bg-indigo-400/10 dark:text-indigo-400 dark:ring-indigo-400/30",
                          "bg-purple-400/10 text-purple-400 ring-purple-700/10 dark:bg-purple-400/10 dark:text-purple-400 dark:ring-purple-400/30",
                          "bg-pink-400/10 text-pink-400 ring-pink-700/10 dark:bg-pink-400/10 dark:text-pink-400 dark:ring-pink-400/20",
                        ];

                        const color = colorClasses[index % colorClasses.length];

                        return (
                          <span
                            key={genre}
                            className={`backdrop-blur-xl inline-flex items-center rounded-full px-2 py-1 mx-1 ring-1 ring-inset text-[0.65rem] ${color}`}
                          >
                            {genre}
                          </span>
                        );
                      })}
                    </p>

                  </div>
                </div>
              </div>
              </ContentPreviewTooltip>
            </a>
          )
            :
            (
              <a key={`video-${item.id}`} href={`/lecture/${item.id}`} className="group hover:-translate-y-2 duration-300">
                <ContentPreviewTooltip item={item} title={item.Titre}>
                <div className="min-h-full h-max max-h-max">
                  <div className="rounded-xl overflow-hidden border border-neutral-400 bg-gradient-to-br from-slate-950 to-slate-900 mb-2 relative transition duration-300 ease-in-out group-hover:border-blue-500">
                    <img
                      src={getImageUrl(item.CheminImage)}
                      alt={item.Titre}
                      className="object-cover w-full h-full aspect-2/3 dark:text-white group-hover:scale-110 duration-300"
                    />

                    {renderBadges(item)}

                    {/* Overlay actions (ex: Retirer) */}
                    {typeof overlayActions === "function" && (
                      <div
                        className="absolute top-2 right-2 z-10"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                      >
                        {overlayActions(item)}
                      </div>
                    )}

                    <div className="px-4 py-2 rounded-xl h-full w-full absolute top-0 left-0 opacity-0 group-hover:opacity-100 group-hover:bg-neutral-950/50 group-hover:backdrop-blur-2xl duration-300">
                      <p className="line-clamp-5 text-xs text-neutral-50 text-justify">{item.Resumer} {/* Affichage résumer */}</p>
                    </div>
                  </div>
                  <div className="relative capitalize text-center px-2 py-1 font-bold dark:text-neutral-300">
                    <p className="group-hover:opacity-0 opacity-100 duration-300 text-sm line-clamp-2">{item.Titre}</p>
                    <div className="absolute top-0 left-0 opacity-0 group-hover:opacity-100 duration-300">
                      <p className="text-xs text-neutral-400 text-center line-clamp-2">
                        {(item.Genres || []).map((genre, index) => {
                          const colorClasses = [
                            "bg-red-400/10 text-red-400 ring-red-600/10 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20",
                            "bg-yellow-400/10 text-yellow-900 ring-yellow-600/20 dark:bg-yellow-400/10 dark:text-yellow-300 dark:ring-yellow-400/20",
                            "bg-green-400/10 text-green-600 ring-green-600/20 dark:bg-green-400/10 dark:text-green-400 dark:ring-green-500/20",
                            "bg-blue-400/10 text-blue-400 ring-blue-700/10 dark:bg-blue-400/10 dark:text-blue-400 dark:ring-blue-400/30",
                            "bg-indigo-400/10 text-indigo-400 ring-indigo-700/10 dark:bg-indigo-400/10 dark:text-indigo-400 dark:ring-indigo-400/30",
                            "bg-purple-400/10 text-purple-400 ring-purple-700/10 dark:bg-purple-400/10 dark:text-purple-400 dark:ring-purple-400/30",
                            "bg-pink-400/10 text-pink-400 ring-pink-700/10 dark:bg-pink-400/10 dark:text-pink-400 dark:ring-pink-400/20",
                          ];

                          const color = colorClasses[index % colorClasses.length];

                          return (
                            <span
                              key={genre}
                              className={`backdrop-blur-xl inline-flex items-center rounded-full px-2 py-1 mx-1 ring-1 ring-inset text-[0.65rem] ${color}`}
                            >
                              {genre}
                            </span>
                          );
                        })}
                      </p>
                    </div>
                  </div>
                </div>
                </ContentPreviewTooltip>
              </a>
            )
      )}
    </div>
  );
};

export default VideoList;
