import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import PaginationPage from "./PaginationPage";
import VideoList from "./VideoList";
import GenreList from "./GenreList";
import SortDropdown from "./SortDropdown"; // ⬅️ nouveau

const apiUrl = process.env.REACT_APP_URL_LOCAL;
const VALID_SORTS = ["az", "za", "recent", "ancien", "most", "least"];

const VideoListPage = () => {
  const location = useLocation();

  const sortFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const value = params.get("sort") || "";
    return VALID_SORTS.includes(value) ? value : "az";
  }, [location.search]);

  const genresFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get("genres") || "")
      .split(",")
      .map((value) => Number.parseInt(value, 10))
      .filter(Number.isInteger);
  }, [location.search]);

  const [videos, setVideos] = useState([]);
  const [genres, setGenres] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState(genresFromQuery);
  // ⬇️ tri par défaut "A-Z"
  const [sort, setSort] = useState(sortFromQuery);
  const [onlyOngoingSeries, setOnlyOngoingSeries] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [isLoading, setIsLoading] = useState(false); // Indicateur de chargement
  const [error, setError] = useState(null); // Gestion des erreurs
  // Fonction pour extraire le paramètre `search` de l'URL
  const getSearchQuery = () => {
    const params = new URLSearchParams(location.search);
    return params.get("search") || ""; // Retourne la valeur de `search`, ou une chaîne vide si absent
  };

  const fetchGenres = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`${apiUrl}/api/genres`);
      if (!response.ok) throw new Error("Erreur lors de la récupération des genres.");
      const data = await response.json();
      setGenres(data);
    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchVideos = async (page = 1) => {
    try {
      setIsLoading(true);
      setError(null);

      const search = getSearchQuery();
      const genresQuery = selectedGenres.length > 0
        ? `&genres=${selectedGenres.join(",")}`
        : "";

      // ⬇️ on bascule vers ?sort= (az|za|recent|ancien). 'order' reste géré en back pour rétro-compat.
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      const ongoingQuery = onlyOngoingSeries ? "&ongoing=1" : "";

      const response = await fetch(
        `${apiUrl}/api/videos?page=${page}&sort=${sort}&search=${encodeURIComponent(search)}${genresQuery}${ongoingQuery}`,
        headers ? { headers } : undefined
      );

      if (!response.ok) throw new Error("Erreur lors de la récupération des vidéos.");

      const data = await response.json();

      // Log des données brutes reçues de l'API
      console.log("Données brutes reçues de l'API:", data);

      // Utiliser directement les genres présents dans les données
      const videosWithGenres = data.items.map(item => ({
        ...item,
        Genres: item.Genres || [],
      }));

      // Log des vidéos avec genres après transformation
      // console.log("Vidéos avec genres après transformation:", videosWithGenres);

      setVideos(videosWithGenres);
      setTotalItems(data.totalItems || 0);
      setTotalPages(data.totalPages || 1);
      setCurrentPage(page); // Met à jour la page actuelle
    } catch (error) {
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };



  useEffect(() => {
    fetchVideos(currentPage);
  }, [currentPage]);


  useEffect(() => {
    fetchGenres();
  }, []);

  useEffect(() => {
    setSort((currentSort) => (currentSort === sortFromQuery ? currentSort : sortFromQuery));
  }, [sortFromQuery]);

  useEffect(() => {
    setSelectedGenres((currentGenres) => {
      const currentKey = currentGenres.join(",");
      const nextKey = genresFromQuery.join(",");
      return currentKey === nextKey ? currentGenres : genresFromQuery;
    });
  }, [genresFromQuery]);

  const didMountRef = useRef(false);

  useEffect(() => {
    if (didMountRef.current) {
      fetchVideos(1);
    } else {
      didMountRef.current = true;
    }
  }, [selectedGenres, sort, location.search, onlyOngoingSeries]);


  return (
    <div className="container mx-auto px-4 py-10 dark:text-white sm:px-6 lg:px-8">

      {isLoading && (
        <div className="text-center dark:text-white">
          <p>Chargement en cours...</p>
        </div>
      )}
      {error && (
        <div className="text-center text-red-500">
          <p>{error}</p>
        </div>
      )}
      {!isLoading && !error && (
        <>
          <div className="relative z-30 mb-8 overflow-visible rounded-2xl border border-sky-500/10 bg-white/80 p-5 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.12),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.10),transparent_22%)]" />
            <div className="relative grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* ⬇️ Nouveau dropdown de tri */}
            <SortDropdown sort={sort} setSort={setSort} />
            <GenreList
              genres={genres}
              selectedGenres={selectedGenres}
              setSelectedGenres={setSelectedGenres}
            />
            <div className="rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 shadow-sm transition duration-200 dark:bg-slate-950/65 dark:shadow-sky-950/20">
              <div className="flex items-center justify-between gap-4">
              <span className="flex grow flex-col">
                <label id="ongoing-series-label" className="text-sm/6 font-bold text-slate-700 dark:text-slate-200">
                  Séries en cours
                </label>
                <span id="ongoing-series-description" className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Cela permet de lister vos séries en cours de visionnage.
                </span>
              </span>
              <div className="group relative inline-flex w-12 shrink-0 rounded-full border border-sky-500/20 bg-slate-200 p-0.5 outline-offset-2 outline-sky-400 transition-colors duration-200 ease-in-out has-[:checked]:bg-gradient-to-r has-[:checked]:from-sky-400 has-[:checked]:to-violet-500 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 dark:bg-white/10">
                <span className="size-5 rounded-full bg-white shadow-sm ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-[:checked]:translate-x-6" />
                <input
                  id="ongoing-series"
                  name="ongoing-series"
                  type="checkbox"
                  aria-labelledby="ongoing-series-label"
                  aria-describedby="ongoing-series-description"
                  className="absolute inset-0 size-full appearance-none focus:outline-none"
                  checked={onlyOngoingSeries}
                  onChange={(e) => setOnlyOngoingSeries(e.target.checked)}
                />
              </div>
              </div>
            </div>
            </div>
          </div>
          <div className="relative z-0 grid grid-cols-1 gap-4">

            <VideoList videos={videos} />
             
            <PaginationPage
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={40}
              onPageChange={(newPage) => setCurrentPage(newPage)}
            />

          </div>
        </>
      )}
    </div>
  );
};

export default VideoListPage;
