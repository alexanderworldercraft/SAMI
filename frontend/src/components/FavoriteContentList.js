import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { StarIcon } from "@heroicons/react/24/solid";
import PaginationPage from "./PaginationPage";

const apiBaseUrl = process.env.REACT_APP_URL_LOCAL;
const ITEMS_PER_PAGE = 6;

const getImageUrl = (path) => {
  if (!path) return "./imageDefault.png";
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiBaseUrl}/${String(path).replace(/^\/+/, "")}`;
};

const FavoriteContentList = ({
  favorites = [],
  loading = false,
  title = "Favoris",
  emptyText = "Aucun contenu en favori.",
}) => {
  const [page, setPage] = useState(1);
  const sectionRef = useRef(null);
  const totalPages = Math.max(1, Math.ceil(favorites.length / ITEMS_PER_PAGE));
  const pageItems = favorites.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  useEffect(() => {
    setPage(1);
  }, [favorites.length, title]);

  return (
    <div ref={sectionRef}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-400">{title}</h2>
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/25 bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-200">
          <StarIcon className="size-4" />
          {favorites.length}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Chargement des favoris...</p>
      ) : favorites.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyText}</p>
      ) : (
        <>
        <ul className="space-y-3">
          {pageItems.map((item) => {
            const targetUrl =
              item.type === "series"
                ? item.FirstVideoID
                  ? `/lecture/${item.FirstVideoID}`
                  : "#"
                : `/lecture/${item.id}`;

            return (
              <li
                key={`${item.type}-${item.id}`}
                className="rounded-2xl border border-white/10 bg-slate-950/55 p-3 text-white shadow-xl shadow-black/20 backdrop-blur-xl"
              >
                <div className="flex items-center gap-4">
                  <Link to={targetUrl} className="shrink-0">
                    <img
                      src={getImageUrl(item.CheminImage)}
                      alt={item.Titre}
                      className="h-24 w-20 rounded-lg object-cover ring-1 ring-white/10"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        to={targetUrl}
                        className="line-clamp-2 text-sm font-bold text-white hover:text-sky-100"
                      >
                        {item.Titre}
                      </Link>
                      <span className="rounded-full border border-sky-300/25 bg-sky-500/10 px-2 py-0.5 text-[11px] font-bold text-sky-200">
                        {item.type === "series" ? "Série" : "Film"}
                      </span>
                      {item.Premium && (
                        <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-bold text-amber-200">
                          Premium
                        </span>
                      )}
                    </div>
                    {item.type === "series" && (
                      <p className="mt-1 text-xs text-slate-300">
                        {item.Saisons || 0} saison{Number(item.Saisons || 0) > 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                  <Link
                    to={targetUrl}
                    className="grid size-12 shrink-0 place-items-center rounded-full border border-white/10 bg-white/10 text-white transition duration-200 hover:bg-sky-500/30"
                    aria-label="Ouvrir le contenu"
                  >
                    <StarIcon className="size-5 text-amber-300" />
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
        {favorites.length > ITEMS_PER_PAGE && (
          <div className="mt-4">
            <PaginationPage
              currentPage={page}
              totalPages={totalPages}
              totalItems={favorites.length}
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

export default FavoriteContentList;
