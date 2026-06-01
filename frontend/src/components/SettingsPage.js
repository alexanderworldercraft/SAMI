import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import UpdateSettings from "./UpdateSettings";
import DeleteAccount from "./DeleteAccount";
import SubscriptionPlans from "./SubscriptionPlans";
import WatchHistoryCards from "./WatchHistoryCards";

import { ChevronDownIcon } from "@heroicons/react/16/solid";
import {
  BuildingOfficeIcon,
  ClockIcon,
  CreditCardIcon,
  TagIcon,
  UserIcon,
} from "@heroicons/react/20/solid";

// Helper pour les classes conditionnelles
function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

// Définition des tabs
const tabs = [
  { id: "settings", name: "Paramètres", icon: UserIcon },
  { id: "subscription", name: "Abonnement", icon: CreditCardIcon },
  { id: "watchHistory", name: "Contenu regardé", icon: ClockIcon },
  { id: "genreGroups", name: "Groupes par genre", icon: TagIcon },
  { id: "deleteAccount", name: "Supprimer son compte", icon: BuildingOfficeIcon },
];

const SettingsPage = () => {
  const DEFAULT_GENRE_NAMES = ["Épique", "Romance", "Animé", "Aventure", "Horreur"];

  // Onglet actif
  const [currentTabId, setCurrentTabId] = useState(tabs[0].id);
  const [watchLogs, setWatchLogs] = useState([]);
  const [watchLoading, setWatchLoading] = useState(false);
  const [watchError, setWatchError] = useState("");
  const [watchSearch, setWatchSearch] = useState("");
  const [watchLoaded, setWatchLoaded] = useState(false);

  const [genreLoaded, setGenreLoaded] = useState(false);
  const [genreSaving, setGenreSaving] = useState(false);
  const [genreError, setGenreError] = useState("");
  const [genreSuccess, setGenreSuccess] = useState("");
  const [allGenres, setAllGenres] = useState([]);
  const [selectedGenres, setSelectedGenres] = useState(["", "", "", "", ""]);
  const [userId, setUserId] = useState(null);

  const filteredWatchLogs = useMemo(() => {
    if (!watchSearch.trim()) return watchLogs;
    const s = watchSearch.trim().toLowerCase();
    return (watchLogs || []).filter((log) => {
      const videoTitle = log?.Video?.Titre?.toLowerCase() || "";
      const seriesTitle = log?.Series?.Titre?.toLowerCase() || "";
      return videoTitle.includes(s) || seriesTitle.includes(s);
    });
  }, [watchLogs, watchSearch]);

  const fetchWatchHistory = async () => {
    try {
      setWatchLoading(true);
      setWatchError("");
      const response = await axios.get("/api/users/watch-history/me", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      setWatchLogs(response.data || []);
      setWatchLoaded(true);
    } catch (error) {
      console.error("Erreur lors du chargement de l'historique:", error);
      setWatchError("Impossible de charger l'historique.");
    } finally {
      setWatchLoading(false);
    }
  };

  useEffect(() => {
    if (currentTabId !== "watchHistory" || watchLoaded) return;
    fetchWatchHistory();
  }, [currentTabId, watchLoaded]);

  const resolveDefaultIds = (genres) =>
    DEFAULT_GENRE_NAMES.map((name) => {
      const match = genres.find(
        (genre) => genre?.Nom?.toLowerCase() === name.toLowerCase()
      );
      return match?.GenreID ? String(match.GenreID) : "";
    });

  const fetchGenreGroups = async () => {
    try {
      setGenreError("");
      setGenreSuccess("");

      const [userResponse, genresResponse] = await Promise.all([
        axios.get("/api/users/me", {
          headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
        }),
        axios.get("/api/genres"),
      ]);

      const fetchedUserId = userResponse.data?.UtilisateurID;
      setUserId(fetchedUserId || null);

      const genres = Array.isArray(genresResponse.data) ? genresResponse.data : [];
      setAllGenres(genres);

      let userGenres = [];
      if (fetchedUserId) {
        try {
          const userGenresResponse = await axios.get(`/api/genres/${fetchedUserId}`);
          userGenres = Array.isArray(userGenresResponse.data)
            ? userGenresResponse.data
            : [];
        } catch (err) {
          if (err.response?.status !== 404) {
            console.error("Erreur lors du chargement des genres utilisateur:", err);
          }
        }
      }

      const defaultIds = resolveDefaultIds(genres);
      const selectedFromUser = userGenres
        .slice(0, 5)
        .map((entry) => (entry?.Genre?.GenreID ? String(entry.Genre.GenreID) : ""))
        .filter(Boolean);

      const nextSelection = [...selectedFromUser];
      while (nextSelection.length < 5) {
        const nextDefault = defaultIds[nextSelection.length] || "";
        nextSelection.push(nextDefault);
      }

      setSelectedGenres(nextSelection);
      setGenreLoaded(true);
    } catch (err) {
      console.error("Erreur lors du chargement des genres:", err);
      setGenreError("Impossible de charger les genres.");
    }
  };

  useEffect(() => {
    if (currentTabId !== "genreGroups" || genreLoaded) return;
    fetchGenreGroups();
  }, [currentTabId, genreLoaded]);

  const handleGenreChange = (index, value) => {
    setSelectedGenres((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleSaveGenres = async () => {
    if (!userId) {
      setGenreError("Utilisateur introuvable.");
      return;
    }

    const defaultIds = resolveDefaultIds(allGenres);
    const filled = selectedGenres.map((value, idx) => value || defaultIds[idx] || "");
    const finalIds = filled.filter(Boolean).slice(0, 5);

    setGenreSaving(true);
    setGenreError("");
    setGenreSuccess("");

    try {
      await axios.put(
        `/api/genres/${userId}`,
        { GenreIDs: finalIds },
        { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
      );
      setGenreSuccess("Genres enregistrés.");
    } catch (err) {
      console.error("Erreur lors de la sauvegarde des genres:", err);
      setGenreError("Impossible d'enregistrer les genres.");
    } finally {
      setGenreSaving(false);
    }
  };

  // Rendu du contenu en fonction de l'onglet actif
  const renderTabContent = () => {
    switch (currentTabId) {
      case "settings":
        return <UpdateSettings />;
      case "deleteAccount":
        return <DeleteAccount />;
      case "subscription":
        return <SubscriptionPlans />;
      case "watchHistory":
        return (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <input
                type="text"
                placeholder="Rechercher par titre"
                className="w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-slate-100 sm:w-80"
                value={watchSearch}
                onChange={(e) => setWatchSearch(e.target.value)}
              />
            </div>

            {watchError && (
              <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">
                {watchError}
              </div>
            )}

            <WatchHistoryCards
              watchLogs={filteredWatchLogs}
              loading={watchLoading}
              title="Contenu regardé"
              emptyText="Aucun contenu regardé pour le moment."
            />
          </div>
        );
      case "genreGroups":
        return (
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Choisis jusqu&apos;à 5 genres pour personnaliser les groupes affichés sur l&apos;accueil.
            </p>

            {genreError && (
              <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">
                {genreError}
              </div>
            )}

            {genreSuccess && (
              <div className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">
                {genreSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {selectedGenres.map((value, index) => (
                <div key={`genre-slot-${index}`}>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Groupe {index + 1}
                  </label>
                  <select
                    className="w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-slate-100"
                    value={value}
                    onChange={(e) => handleGenreChange(index, e.target.value)}
                  >
                    <option value="">Par défaut</option>
                    {allGenres.map((genre) => (
                      <option key={genre.GenreID} value={genre.GenreID}>
                        {genre.Nom}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveGenres}
                className="inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-2.5 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white"
                disabled={genreSaving}
              >
                {genreSaving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <main className="container mx-auto flex grow flex-col px-4 py-10 sm:px-6 lg:px-8">

      <div className="relative overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 p-6 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.12),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.10),transparent_22%)]" />
        <div className="relative">
        {/* Tabs mobile : select */}
        <div className="grid grid-cols-1 sm:hidden">
          <select
            value={currentTabId}
            onChange={(e) => setCurrentTabId(e.target.value)}
            aria-label="Sélectionner une section"
            className="col-start-1 row-start-1 w-full appearance-none rounded-xl border border-sky-500/20 bg-white/85 py-3 pl-4 pr-10 text-base font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-gray-100 dark:*:bg-slate-900"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.name}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            aria-hidden="true"
            className="pointer-events-none col-start-1 row-start-1 mr-3 size-5 self-center justify-self-end fill-sky-500 dark:fill-sky-300"
          />
        </div>

        <div className="hidden sm:block">
          <div className="rounded-xl border border-sky-500/10 bg-slate-950/5 p-1 dark:bg-slate-950/40">
            <nav aria-label="Tabs" className="flex gap-2 overflow-x-auto">
              {tabs.map((tab) => {
                const isCurrent = tab.id === currentTabId;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCurrentTabId(tab.id)}
                    aria-current={isCurrent ? "page" : undefined}
                    className={classNames(
                      isCurrent
                        ? "border-sky-300/60 bg-gradient-to-r from-sky-500/25 via-blue-500/15 to-transparent text-sky-800 shadow-[0_0_22px_rgba(56,189,248,0.22)] dark:text-white"
                        : "border-transparent text-slate-600 hover:border-sky-400/40 hover:bg-sky-500/10 hover:text-sky-700 dark:text-slate-300 dark:hover:text-white",
                      "group inline-flex shrink-0 items-center rounded-xl border px-4 py-2.5 text-sm font-bold transition duration-200"
                    )}
                  >
                    <tab.icon
                      aria-hidden="true"
                      className={classNames(
                        isCurrent
                          ? "text-sky-500 dark:text-sky-300"
                          : "text-slate-400 group-hover:text-sky-500 dark:group-hover:text-sky-300",
                        "mr-2 size-5"
                      )}
                    />
                    <span>{tab.name}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Contenu de l’onglet */}
        <div className="mt-6">
          {renderTabContent()}
        </div>
        </div>
      </div>

    </main>
  );
};

export default SettingsPage;
