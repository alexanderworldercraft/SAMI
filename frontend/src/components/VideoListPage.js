import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import PaginationPage from "./PaginationPage";
import VideoList from "./VideoList";
import GenreList from "./GenreList";
import SortDropdown from "./SortDropdown"; // ⬅️ nouveau
import VideoOptionsDropdown from "./VideoOptionsDropdown";

const apiUrl = process.env.REACT_APP_URL_LOCAL;
const VALID_SORTS = ["az", "za", "recent", "ancien", "most", "least", "trending"];

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
  const [appliedGenres, setAppliedGenres] = useState(genresFromQuery);
  // ⬇️ tri par défaut "A-Z"
  const [sort, setSort] = useState(sortFromQuery);
  const [videoOptions, setVideoOptions] = useState({
    onlyOngoingSeries: false,
    hideWatched: false,
    hidePremium: false,
    onlyNew: false,
    onlyFavorites: false,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [isGenresLoading, setIsGenresLoading] = useState(false);
  const [isVideosLoading, setIsVideosLoading] = useState(false);
  const [error, setError] = useState(null); // Gestion des erreurs
  const currentPageRef = useRef(currentPage);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Fonction pour extraire le paramètre `search` de l'URL
  const getSearchQuery = () => {
    const params = new URLSearchParams(location.search);
    return params.get("search") || ""; // Retourne la valeur de `search`, ou une chaîne vide si absent
  };

  const fetchGenres = async () => {
    try {
      setIsGenresLoading(true);
      const response = await fetch(`${apiUrl}/api/genres`);
      if (!response.ok) throw new Error("Erreur lors de la récupération des genres.");
      const data = await response.json();
      setGenres(data);
    } catch (error) {
      setError(error.message);
    } finally {
      setIsGenresLoading(false);
    }
  };

  const fetchVideos = async (page = 1) => {
    try {
      setIsVideosLoading(true);
      setError(null);

      const search = getSearchQuery();
      const genresQuery = appliedGenres.length > 0
        ? `&genres=${appliedGenres.join(",")}`
        : "";

      // ⬇️ on bascule vers ?sort= (az|za|recent|ancien). 'order' reste géré en back pour rétro-compat.
      const optionsQuery = [
        videoOptions.onlyOngoingSeries ? "ongoing=1" : "",
        videoOptions.hideWatched ? "hideWatched=1" : "",
        videoOptions.hidePremium ? "hidePremium=1" : "",
        videoOptions.onlyNew ? "newOnly=1" : "",
        videoOptions.onlyFavorites ? "favorites=1" : "",
      ].filter(Boolean).map((value) => `&${value}`).join("");

      const response = await fetch(
        `${apiUrl}/api/videos?page=${page}&sort=${sort}&search=${encodeURIComponent(search)}${genresQuery}${optionsQuery}`,
        { credentials: "include" }
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
      setIsVideosLoading(false);
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
    setAppliedGenres((currentGenres) => {
      const currentKey = currentGenres.join(",");
      const nextKey = genresFromQuery.join(",");
      return currentKey === nextKey ? currentGenres : genresFromQuery;
    });
  }, [genresFromQuery]);

  const didMountRef = useRef(false);

  useEffect(() => {
    if (didMountRef.current) {
      if (currentPageRef.current === 1) {
        fetchVideos(1);
      } else {
        setCurrentPage(1);
      }
    } else {
      didMountRef.current = true;
    }
  }, [appliedGenres, sort, location.search, videoOptions]);


  return (
    <div className="container mx-auto px-4 py-10 dark:text-white sm:px-6 lg:px-8">

      {error && (
        <div className="text-center text-red-500">
          <p>{error}</p>
        </div>
      )}
      {!error && (
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
              onSelectionCommit={setAppliedGenres}
              allowNegation
            />
            <VideoOptionsDropdown options={videoOptions} setOptions={setVideoOptions} />
            </div>
          </div>
          <div className="relative z-0 grid grid-cols-1 gap-4">

            {isVideosLoading || isGenresLoading ? (
              <div className="text-center dark:text-white">
                <p>Chargement en cours...</p>
              </div>
            ) : (
              <VideoList videos={videos} />
            )}
             
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
