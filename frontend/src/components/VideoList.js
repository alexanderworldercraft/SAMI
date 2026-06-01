import React from "react";

const apiUrl = process.env.REACT_APP_URL_LOCAL;

const VideoList = ({ videos = [], overlayActions }) => {
  const getImageUrl = (cheminImage, type) => {
    // Fallbacks locaux (évite via.placeholder.*)
    if (cheminImage) return `${apiUrl}/${cheminImage}`;
    if (type === "person") return `${apiUrl}/uploads/images/people/default.webp`;
    // à ajuster si tu as un default pour vidéos/séries
    return `${apiUrl}/uploads/images/videos/default.webp`;
  };

  const renderBadges = (item) => {
    const badges = [];

    if (item.Premium) {
      badges.push(
        <span
          key="premium"
          className="inline-flex items-center rounded-full bg-yellow-500 text-black text-[10px] font-bold px-2 py-0.5 shadow-xl tracking-wide"
        >
          Premium
        </span>
      );
    }

    let watchLabel = null;
    let watchClass = "bg-emerald-500 text-black";

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
          watchClass = "bg-slate-200 text-slate-900";
        }
      }
    }

    if (watchLabel) {
      badges.push(
        <span
          key="watched"
          className={`inline-flex items-center rounded-full ${watchClass} text-[10px] font-bold px-2 py-0.5 shadow-xl tracking-wide`}
        >
          {watchLabel}
        </span>
      );
    }

    if (!badges.length) return null;

    return (
      <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 group-hover:opacity-0 duration-300">
        {badges}
      </div>
    );
  };

  if (!videos.length) {
    return <p className="text-center text-neutral-400">Aucun résultat.</p>;
  }

  return (
    <div className="container grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-4 mx-auto">
      {videos.map((item) =>
        // --- NOUVEAU: cartes "personne"
        item.type === "person" ? (
          <a
            key={`person-${item.id}`}
            href={`/personnes/${item.id}`} // pour le moment: /personne/:ID
            className="group hover:-translate-y-2 duration-300"
          >
            <div className="min-h-max h-max max-h-max">
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
          item.type === "series" ? (
            <a
              key={`series-${item.id}`}
              href={item.FirstVideoID ? `/lecture/${item.FirstVideoID}` : "#"} // Lien vers la première vidéo
              className="group hover:-translate-y-2 duration-300"
            >
              <div className="min-h-max h-max max-h-max">
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

                  <div className="px-4 py-2 h-full absolute top-0 left-0 opacity-0 group-hover:opacity-100 group-hover:bg-neutral-950/50 group-hover:backdrop-blur-2xl duration-300">
                    <p className="line-clamp-15 text-xs text-neutral-50 text-justify">{item.Resumer} {/* Affichage résumer */}</p>
                  </div>
                </div>
                <div className="relative capitalize text-center px-2 py-1 font-bold dark:text-neutral-300">
                  <p className="group-hover:opacity-0 opacity-100 duration-300 text-sm line-clamp-2">{item.Titre} ({item.Saisons} Saisons)</p>
                  <div className="absolute top-0 left-0 opacity-0 group-hover:opacity-100 duration-300">
                    <p className="text-xs text-neutral-400 text-center line-clamp-2">
                      {item.Genres.map((genre, index) => {
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
            </a>
          )
            :
            (
              <a key={`video-${item.id}`} href={`/lecture/${item.id}`} className="group hover:-translate-y-2 duration-300">
                <div className="min-h-max h-max max-h-max">
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

                    <div className="px-4 py-2 h-full absolute top-0 left-0 opacity-0 group-hover:opacity-100 group-hover:bg-neutral-950/50 group-hover:backdrop-blur-2xl duration-300">
                      <p className="line-clamp-15 text-xs text-neutral-50 text-justify">{item.Resumer} {/* Affichage résumer */}</p>
                    </div>
                  </div>
                  <div className="relative capitalize text-center px-2 py-1 font-bold dark:text-neutral-300">
                    <p className="group-hover:opacity-0 opacity-100 duration-300 text-sm line-clamp-2">{item.Titre}</p>
                    <div className="absolute top-0 left-0 opacity-0 group-hover:opacity-100 duration-300">
                      <p className="text-xs text-neutral-400 text-center line-clamp-2">
                        {item.Genres.map((genre, index) => {
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
              </a>
            )
      )}
    </div>
  );
};

export default VideoList;
