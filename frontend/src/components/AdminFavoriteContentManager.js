import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { StarIcon } from "@heroicons/react/24/solid";
import api from "../services/api";
import PaginationPage from "./PaginationPage";

const apiBaseUrl = process.env.REACT_APP_URL_LOCAL;
const fieldClass = "rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";

const getImageUrl = (path) => {
  if (!path) return "./imageDefault.png";
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiBaseUrl}/${String(path).replace(/^\/+/, "")}`;
};

const AdminFavoriteContentManager = () => {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("desc");
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const sectionRef = useRef(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await api.get("/users/favorites/summary", {
        params: {
          search,
          sort,
          page,
          take: 6,
        },
      });
      setItems(response.data?.items || []);
      setTotalItems(response.data?.totalItems || 0);
      setTotalPages(response.data?.totalPages || 1);
    } catch (error) {
      console.error("Erreur lors du chargement des favoris globaux :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de charger les favoris.");
    } finally {
      setLoading(false);
    }
  }, [page, search, sort]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [search, sort]);

  return (
    <section ref={sectionRef} className="relative mx-auto mb-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 p-6 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:text-white dark:shadow-sky-950/20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.12),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
      <div className="relative">
        <div className="mb-5">
          <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Favoris des utilisateurs</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Classe les films et séries selon le nombre d&apos;utilisateurs qui les ont ajoutés en favoris.
          </p>
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un contenu"
            className={`${fieldClass} flex-1`}
          />
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className={fieldClass}
          >
            <option value="desc">Plus de favoris</option>
            <option value="asc">Moins de favoris</option>
          </select>
        </div>

        {errorMessage && (
          <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">Chargement des favoris...</p>
        ) : items.length === 0 ? (
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">Aucun favori trouvé.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <Link
                key={`${item.type}-${item.id}`}
                to={item.targetUrl}
                className="group overflow-hidden rounded-xl border border-sky-500/10 bg-white/85 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-sky-300/50 hover:shadow-xl hover:shadow-sky-950/10 dark:bg-slate-950/65 dark:shadow-sky-950/20"
              >
                <div className="flex gap-4 p-4">
                  <img
                    src={getImageUrl(item.image)}
                    alt={item.title}
                    className="h-28 w-20 shrink-0 rounded-lg object-cover ring-1 ring-sky-500/10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="line-clamp-2 text-sm font-black text-slate-950 group-hover:text-sky-700 dark:text-white dark:group-hover:text-sky-200">
                        {item.title}
                      </h3>
                      <span className="rounded-full border border-sky-300/25 bg-sky-500/10 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-200">
                        {item.type === "series" ? "Série" : "Film"}
                      </span>
                    </div>
                    {item.type === "series" && (
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {item.seasons || 0} saison{Number(item.seasons || 0) > 1 ? "s" : ""}
                      </p>
                    )}
                    <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-700 dark:text-amber-200">
                      <StarIcon className="size-4" />
                      {item.favoriteCount} favori{item.favoriteCount > 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {totalItems > 0 && (
          <div className="mt-6">
            <PaginationPage
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={6}
              onPageChange={setPage}
              scrollTarget={sectionRef}
              scrollOffset={16}
            />
          </div>
        )}
      </div>
    </section>
  );
};

export default AdminFavoriteContentManager;
