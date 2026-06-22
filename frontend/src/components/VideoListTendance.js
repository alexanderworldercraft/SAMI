import React from "react";
import { useNavigate } from "react-router-dom";

const apiUrl = process.env.REACT_APP_URL_LOCAL;

const VideoListTendance = ({
  videos = [],
  title = "Tendances en ce moment",
  description = "Les contenus les plus regardes cette semaine.",
}) => {
  const navigate = useNavigate();

  const getImageUrl = (cheminImage) => {
    if (!cheminImage) return `./imageDefault.png`;
    if (/^https?:\/\//i.test(cheminImage)) return cheminImage;
    return `${apiUrl}/${cheminImage.replace(/^\/+/, "")}`;
  };

  const getTargetUrl = (item) => {
    if (item.type === "series") {
      return item.FirstVideoID ? `/lecture/${item.FirstVideoID}` : "#";
    }

    return `/lecture/${item.VideoID || item.id}`;
  };

  const getWatchBadge = (item) => {
    if (item.type === "video" && item.Watched) return "Vu";

    if (item.type === "series") {
      const total = Number(item.TotalEpisodes || 0);
      const watched = Number(item.WatchedCount || 0);

      if (total > 0 && watched > 0) {
        return watched >= total || item.WatchedAll ? "Vu" : `${watched}/${total}`;
      }
    }

    return null;
  };

  const getPrimaryGenre = (item) => {
    if (!Array.isArray(item.Genres) || item.Genres.length === 0) return null;
    return item.Genres[0];
  };

  const handleSeeAll = () => {
    navigate("/videos?sort=most");
  };

  if (!videos.length) {
    return (
      <section className="rounded-2xl border border-sky-500/10 bg-slate-950/55 p-6 text-center text-neutral-400 shadow-2xl shadow-sky-950/20">
        Aucun résultat.
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-sky-500/10 bg-slate-950/70 shadow-2xl shadow-sky-950/20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(14,165,233,0.18),transparent_28%),radial-gradient(circle_at_85%_0%,rgba(59,130,246,0.12),transparent_24%)]" />

      <div className="relative grid gap-6 p-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:p-4">
        <aside className="flex flex-col justify-center">
          <h2 className="max-w-[12rem] text-3xl font-black italic leading-tight text-sky-400">
            {title}
          </h2>
          <div className="mt-3 h-1 w-20 rounded-full bg-gradient-to-r from-sky-400 to-violet-500" />
          <p className="mt-4 max-w-[15rem] text-sm leading-6 text-slate-300">
            {description}
          </p>
          <button
            type="button"
            onClick={handleSeeAll}
            className="mt-7 inline-flex w-max items-center rounded-lg border border-white/15 bg-slate-950/40 px-5 py-2.5 text-sm font-bold text-white transition duration-200 hover:border-sky-300/60 hover:bg-sky-500/10"
          >
            Voir tout
          </button>
        </aside>

        <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-3 xl:grid-cols-[minmax(220px,1.28fr)_repeat(4,minmax(135px,1fr))]">
          {videos.slice(0, 5).map((item, index) => {
            const watchBadge = getWatchBadge(item);
            const genre = getPrimaryGenre(item);
            const isLead = index === 0;

            return (
              <a
                key={`${item.type || "video"}-${item.id || item.VideoID || index}`}
                href={getTargetUrl(item)}
                className={`min-h-full h-max max-h-max min-h-full h-max max-h-max min-h-full h-max max-h-max group min-w-0 transition duration-300 hover:-translate-y-1 ${
                  isLead ? "col-span-2 sm:col-span-2 xl:col-span-1" : ""
                }`}
              >
                <article className="min-w-0">
                  <div
                    className={`relative overflow-hidden rounded-xl border bg-slate-950 shadow-xl transition duration-300 group-hover:border-sky-300/80 ${
                      isLead
                        ? "border-sky-200/50 shadow-2xl shadow-sky-950/50"
                        : "border-white/15 shadow-black/30"
                    }`}
                  >
                    <img
                      src={getImageUrl(item.CheminImage)}
                      alt={item.Titre}
                      className="aspect-2/3 w-full object-cover transition duration-500 group-hover:scale-105"
                    />

                    <span className="absolute left-2 top-2 z-20 grid size-9 place-items-center rounded-lg border border-white/15 bg-slate-950/80 text-base font-black text-white shadow-inner backdrop-blur">
                      {index + 1}
                    </span>

                    {item.Premium && (
                      <span className="inline-flex w-fit max-w-full items-center justify-center border text-center uppercase leading-tight tracking-wide backdrop-blur-md whitespace-normal border-yellow-200/35 bg-gradient-to-br from-yellow-300/95 via-yellow-400/95 to-orange-400/95 shadow-yellow-950/45 ring-1 ring-yellow-100/25              absolute right-2 top-2 z-20 rounded-md px-2 py-1 text-[10px] font-black text-slate-950 shadow-inner">
                        Premium
                      </span>
                    )}

                    {watchBadge && (
                      <span className="inline-flex w-fit max-w-full items-center justify-center border text-center uppercase leading-tight tracking-wide backdrop-blur-md shadow-inner whitespace-normal border-emerald-200/35 bg-gradient-to-br from-emerald-300/95 via-emerald-400/95 to-teal-400/95 shadow-emerald-950/45 ring-1 ring-emerald-100/25              absolute bottom-2 right-2 z-20 rounded-md px-2 py-1 text-[10px] font-black text-slate-950">
                        {watchBadge}
                      </span>
                    )}

                    <div className="absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-slate-950 via-slate-950/65 to-transparent" />

                    {isLead && (
                      <div className="absolute inset-x-0 bottom-0 z-20 px-4 pb-4 pt-10">
                        <h3 className="line-clamp-2 text-base font-black text-white">
                          {item.Titre}
                          {item.type === "series" && item.Saisons ? ` (${item.Saisons} S${item.Saisons > 1 ? "aisons" : "aison"})` : ""}
                        </h3>
                        {genre && (
                          <p className="mt-1 line-clamp-1 text-sm text-slate-300">
                            {genre}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="absolute inset-0 z-10 flex items-start opacity-0 transition duration-300 group-hover:opacity-100">
                      <div className="h-full w-full bg-slate-950/55 px-4 py-12 backdrop-blur-xl">
                        <p className="line-clamp-10 text-xs leading-5 text-slate-50">
                          {item.Resumer || "Aucun résumé disponible."}
                        </p>
                      </div>
                    </div>
                  </div>

                  {!isLead && (
                    <div className="mt-3 min-w-0 px-1">
                      <h3 className="line-clamp-2 text-sm font-black text-white">
                        {item.Titre}
                        {item.type === "series" && item.Saisons ? ` (${item.Saisons} S${item.Saisons > 1 ? "aisons" : "aison"})` : ""}
                      </h3>
                      {genre && (
                        <p className="mt-1 line-clamp-1 text-xs text-slate-400">
                          {genre}
                        </p>
                      )}
                    </div>
                  )}
                </article>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default VideoListTendance;
