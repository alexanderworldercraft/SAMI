import React from "react";
import { useNavigate } from "react-router-dom";
import { PlayIcon } from "@heroicons/react/24/solid";
import ContentPreviewTooltip from "./ContentPreviewTooltip";

const apiUrl = process.env.REACT_APP_URL_LOCAL;

const GenreFeaturedVideoSection = ({
  title,
  genreId,
  videos = [],
  featured,
}) => {
  const navigate = useNavigate();

  const getImageUrl = (cheminImage) => {
    if (!cheminImage) return `./imageDefault.png`;
    if (/^https?:\/\//i.test(cheminImage)) return cheminImage;
    return `${apiUrl}/${cheminImage.replace(/^\/+/, "")}`;
  };

  const getTargetUrl = (item) => {
    if (!item) return "#";
    if (item.type === "series") return item.FirstVideoID ? `/lecture/${item.FirstVideoID}` : "#";
    return `/lecture/${item.VideoID || item.id}`;
  };

  const getSeasonLabel = (item) => {
    if (item?.type !== "series") return null;
    const seasons = Number(item.Saisons || 0);
    if (!seasons) return null;
    return `${seasons} Saison${seasons > 1 ? "s" : ""}`;
  };

  const getContentKey = (item) => {
    if (!item) return "";
    return `${item.type || "video"}:${item.id || item.VideoID || item.SeriesID || ""}`;
  };

  const featuredKey = getContentKey(featured);
  const standardVideos = videos
    .filter((item) => getContentKey(item) !== featuredKey)
    .slice(0, 5);

  const handleSeeAll = () => {
    const params = new URLSearchParams();
    if (genreId) params.set("genres", String(genreId));
    navigate(`/videos${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const renderSmallCard = (item, className = "") => {
    if (!item) {
      return (
        <div className={`min-h-[116px] rounded-xl border border-white/10 bg-white/5 ${className}`} />
      );
    }

    return (
      <ContentPreviewTooltip item={item} title={item.Titre} className={className}>
        <a
          href={getTargetUrl(item)}
          className="group relative block min-h-[116px] overflow-hidden rounded-xl border border-white/15 bg-slate-950 transition duration-300 hover:-translate-y-1 hover:border-sky-300/70"
        >
          <img
            src={getImageUrl(item.CheminImage)}
            alt={item.Titre}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/45 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-3">
            <h3 className="line-clamp-2 text-sm font-black text-white">{item.Titre}</h3>
            {getSeasonLabel(item) && (
              <p className="mt-0.5 line-clamp-1 text-xs text-slate-300">{getSeasonLabel(item)}</p>
            )}
          </div>
        </a>
      </ContentPreviewTooltip>
    );
  };

  const renderFeaturedCard = () => {
    if (!featured) {
      return (
        <div className="min-h-[260px] rounded-xl border border-white/10 bg-white/5 xl:col-start-2 xl:row-span-2" />
      );
    }

    return (
      <ContentPreviewTooltip item={featured} title={featured.Titre} className="xl:col-start-2 xl:row-span-2">
        <a
          href={getTargetUrl(featured)}
          className="group relative block min-h-[260px] overflow-hidden rounded-xl border border-sky-200/40 bg-slate-950 shadow-2xl shadow-sky-950/40 transition duration-300 hover:-translate-y-1 hover:border-sky-300/80"
        >
          <img
            src={getImageUrl(featured.CheminImage)}
            alt={featured.Titre}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
          <span className="absolute right-3 top-3 rounded-md bg-gradient-to-r from-sky-400 to-violet-500 px-3 py-1 text-xs font-black text-white shadow-xl">
            À la une
          </span>
          <div className="absolute inset-x-0 bottom-0 p-4">
            <h3 className="line-clamp-2 text-base font-black text-white">{featured.Titre}</h3>
            {getSeasonLabel(featured) && (
              <p className="mt-1 line-clamp-1 text-sm text-slate-300">{getSeasonLabel(featured)}</p>
            )}
            <span className="mt-3 inline-flex w-max items-center gap-2 rounded-lg border border-white/20 bg-slate-950/55 px-3 py-2 text-xs font-bold text-white backdrop-blur transition group-hover:bg-sky-500/20">
              <PlayIcon className="size-4" />
              Regarder
            </span>
          </div>
        </a>
      </ContentPreviewTooltip>
    );
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-sky-500/10 bg-slate-950/70 shadow-2xl shadow-sky-950/20">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.16),transparent_26%),radial-gradient(circle_at_70%_10%,rgba(139,92,246,0.14),transparent_22%)]" />
      <div className="relative grid gap-6 p-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:p-4">
        <aside className="flex flex-col justify-center">
          <h2 className="max-w-[12rem] text-3xl font-black italic leading-tight text-sky-400">
            {title}
          </h2>
          <div className="mt-3 h-1 w-20 rounded-full bg-gradient-to-r from-sky-400 to-violet-500" />
          <p className="mt-4 max-w-[15rem] text-sm leading-6 text-slate-300">
            Découvrez une sélection autour de ce genre.
          </p>
          <button
            type="button"
            onClick={handleSeeAll}
            className="mt-7 inline-flex w-max items-center rounded-lg border border-white/15 bg-slate-950/40 px-5 py-2.5 text-sm font-bold text-white transition duration-200 hover:border-sky-300/60 hover:bg-sky-500/10"
          >
            Voir tout
          </button>
        </aside>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(150px,1fr)_minmax(280px,1.75fr)_minmax(150px,1fr)_minmax(145px,0.95fr)] xl:grid-rows-2">
          {renderSmallCard(standardVideos[0], "xl:col-start-1 xl:row-start-1")}
          {renderSmallCard(standardVideos[1], "xl:col-start-1 xl:row-start-2")}
          {renderFeaturedCard()}
          {renderSmallCard(standardVideos[2], "xl:col-start-3 xl:row-start-1")}
          {renderSmallCard(standardVideos[3], "xl:col-start-3 xl:row-start-2")}
          {standardVideos[4] ? (
            <ContentPreviewTooltip
              item={standardVideos[4]}
              title={standardVideos[4].Titre}
              className="sm:col-span-2 xl:col-start-4 xl:row-span-2 xl:col-span-1"
            >
              <a
                href={getTargetUrl(standardVideos[4])}
                className="group relative block h-full overflow-hidden rounded-xl border border-white/15 bg-slate-950 transition duration-300 hover:-translate-y-1 hover:border-sky-300/70"
              >
                <img
                  src={getImageUrl(standardVideos[4].CheminImage)}
                  alt={standardVideos[4].Titre}
                  className="aspect-2/3 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <h3 className="line-clamp-2 text-sm font-black text-white">{standardVideos[4].Titre}</h3>
                  {getSeasonLabel(standardVideos[4]) && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-slate-300">{getSeasonLabel(standardVideos[4])}</p>
                  )}
                </div>
              </a>
            </ContentPreviewTooltip>
          ) : (
            <div className="rounded-xl border border-white/10 bg-white/5 sm:col-span-2 xl:col-start-4 xl:row-span-2 xl:col-span-1" />
          )}
        </div>
      </div>
    </section>
  );
};

export default GenreFeaturedVideoSection;
