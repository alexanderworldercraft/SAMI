// UserManagerCard.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import {
  EnvelopeIcon,
  LockClosedIcon,
  LockOpenIcon,
  InformationCircleIcon,
} from "@heroicons/react/20/solid";
import { XMarkIcon } from "@heroicons/react/24/outline";
import PaginationPage from "./PaginationPage";
import UserAvatar from "./UserAvatar";
import WatchHistoryCards from "./WatchHistoryCardsAdminPanel";
import FavoriteContentList from "./FavoriteContentList";

const apiBaseUrl = process.env.REACT_APP_URL_LOCAL;
const panelClass = "overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20";
const panelHeaderClass = "border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5";
const fieldClass = "rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const cardClass = "col-span-1 overflow-hidden rounded-xl border border-sky-500/10 bg-white/85 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-sky-300/50 hover:shadow-xl hover:shadow-sky-950/10 dark:bg-slate-950/65 dark:shadow-sky-950/20";
const actionClass = "flex w-0 flex-1 items-center justify-center gap-x-2 py-3 text-xs font-bold text-slate-700 transition duration-200 hover:bg-sky-500/10 hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-300";
const chipClass = "inline-flex items-center rounded-full border border-sky-500/10 bg-sky-500/10 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200";

// Formatage des dates
function formatDateTime(value) {
  if (!value) return "—";

  // Prisma renvoie une string ISO ou un Date selon la config/transport.
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  // Format simple FR : 31/12/2025 14:23
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Définition des onglets
const TABS = [
  {
    id: "active",
    label: "Actifs & Bloqués",
    scope: "activeBlocked",
  },
  {
    id: "deleted",
    label: "Supprimés",
    scope: "deleted",
  },
];

  // Image par défaut pour le profil
  const defaultImage = 'https://via.placeholder.com/150?text=Profile'

// Petite fonction utilitaire pour les classes Tailwind
function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

// Calcule un niveau de risque à partir de l'activité
function computeRiskLevel(activity) {
  if (!activity) {
    return { label: "Aucune activité", color: "bg-purple-500", score: 0 };
  }

  const crit1 = activity.byCriticite?.[1] || 0;
  const crit2 = activity.byCriticite?.[2] || 0;
  const crit3 = activity.byCriticite?.[3] || 0;
  const total = activity.totalLogsLastNDays || 0;

  // Score simple : Crit1 * 1 + Crit2 * 3 + Crit3 * 7
  const score = crit1 * 1 + crit2 * 4 + crit3 * 10;

  if (crit3 >= 2 || score >= 50) {
    return { label: "Risque élevé", color: "bg-red-600 text-white", score };
  }
  if (crit2 >= 3 || crit3 === 1 || score >= 20) {
    return { label: "Risque moyen", color: "bg-amber-500 text-black", score };
  }
  if (total > 0) {
    return { label: "Risque faible", color: "bg-emerald-500 text-black", score };
  }

  return { label: "Inactif", color: "bg-gray-500", score: 0 };
}

// Onglets responsive (mobile + desktop)
function UserTabs({ currentTab, onChange }) {
  return (
    <div className="w-full">
      {/* Version mobile */}
      <div className="grid grid-cols-1 sm:hidden mb-4">
        <select
          value={currentTab}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Sélectionner un onglet"
          className="col-start-1 row-start-1 w-full appearance-none rounded-xl border border-sky-500/20 bg-white/85 py-3 pl-4 pr-10 text-base font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-gray-100"
        >
          {TABS.map((tab) => (
            <option key={tab.id} value={tab.id} className="bg-gray-900">
              {tab.label}
            </option>
          ))}
        </select>
      </div>

      {/* Version desktop */}
      <div className="hidden sm:block mb-4">
        <div className="rounded-xl border border-sky-500/10 bg-slate-950/5 p-1 dark:bg-slate-950/40">
          <nav aria-label="Tabs" className="flex gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onChange(tab.id)}
                className={classNames(
                  currentTab === tab.id
                    ? "border-sky-300/60 bg-gradient-to-r from-sky-500/25 via-blue-500/15 to-transparent text-sky-800 shadow-[0_0_22px_rgba(56,189,248,0.22)] dark:text-white"
                    : "border-transparent text-slate-600 hover:border-sky-400/40 hover:bg-sky-500/10 hover:text-sky-700 dark:text-slate-300 dark:hover:text-white",
                  "w-1/2 rounded-xl border px-4 py-2.5 text-center text-sm font-bold transition duration-200"
                )}
                aria-current={currentTab === tab.id ? "page" : undefined}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

// Drawer pour afficher tous les détails d'un utilisateur
function UserDrawer({
  open,
  onClose,
  user,
  activity,
  watchHistory,
  loadingWatchHistory,
  favorites,
  loadingFavorites,
}) {
  const [watchRawMode, setWatchRawMode] = useState(false);

  if (!user) return null;

  const risk = computeRiskLevel(activity);

  const crit1 = activity?.byCriticite?.[1] || 0;
  const crit2 = activity?.byCriticite?.[2] || 0;
  const crit3 = activity?.byCriticite?.[3] || 0;
  const total = activity?.totalLogsLastNDays || 0;

  const actions = activity?.byAction
  ? Object.entries(activity.byAction).sort(
      (a, b) => (b[1]?.count || 0) - (a[1]?.count || 0)
    )
  : [];

  return (
    <Dialog open={open} onClose={onClose} className="relative z-[120]">
      <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-md" aria-hidden="true" />

      <div className="fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
            <DialogPanel
              transition
              className="pointer-events-auto w-screen max-w-2xl transform transition duration-500 ease-in-out data-[closed]:translate-x-full sm:duration-700"
            >
              <div className="relative flex h-full flex-col overflow-y-auto border-l border-sky-500/10 bg-white/95 shadow-2xl shadow-slate-950/20 backdrop-blur dark:bg-slate-950/95 dark:shadow-sky-950/30">
                {/* Header */}
                <div className={panelHeaderClass}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Utilisateur</p>
                      <DialogTitle className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                        Détails utilisateur
                      </DialogTitle>
                    </div>
                    <div className="ml-3 flex h-7 items-center">
                      <button
                        type="button"
                        onClick={onClose}
                        className="relative grid size-9 place-items-center rounded-lg border border-sky-300/30 bg-white/60 text-slate-500 transition hover:border-sky-300/70 hover:text-sky-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 dark:bg-slate-950/50 dark:text-slate-300"
                      >
                        <span className="absolute -inset-2.5" />
                        <span className="sr-only">Fermer le panneau</span>
                        <XMarkIcon aria-hidden="true" className="size-6" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Main */}
                <div className="divide-y divide-sky-500/10">
                  {/* Bandeau + Avatar + Info principale */}
                  <div className="pb-6">
                    <div className="h-24 bg-gradient-to-r from-sky-500/30 via-blue-500/20 to-violet-500/20 sm:h-20 lg:h-28" />
                    <div className="-mt-12 flow-root px-4 sm:-mt-8 sm:flex sm:items-end sm:px-6 lg:-mt-16">
                      <div>
                        <div className="-m-1 flex">
                          <div className="inline-flex overflow-hidden rounded-xl border-4 border-white shadow-xl dark:border-slate-950">
                            <img
                              alt={user.Surnom}
                              src={
                                user.CheminImage
                                  ? `${apiBaseUrl}${user.CheminImage}`
                                  : "https://via.placeholder.com/256?text=User"
                              }
                              className="size-24 shrink-0 bg-gray-800 object-cover outline outline-1 -outline-offset-1 outline-sky-500/20 sm:size-32 lg:size-40"
                            />
                          </div>
                        </div>
                      </div>
                      <div className="mt-6 sm:ml-6 sm:flex-1">
                        <div>
                          <div className="flex items-center gap-3">
                            <h3 className="text-xl font-black text-slate-950 dark:text-white sm:text-2xl">
                              {user.Surnom}
                            </h3>
                            {/* Badge état */}
                            <span
                              className={classNames(
                                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                                user.EtatID === 1
                                  ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                                  : user.EtatID === 3
                                    ? "bg-amber-500/10 text-amber-400 ring-amber-500/20"
                                    : "bg-red-500/10 text-red-400 ring-red-500/20"
                              )}
                            >
                              {user.EtatID === 1
                                ? "Actif"
                                : user.EtatID === 3
                                  ? "Bloqué"
                                  : "Supprimé"}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {user.Email}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Grade : {user.Grade?.Nom || `#${user.GradeID}`}
                          </p>
                        </div>

                        {/* Risque global */}
                        <div className="mt-4 flex flex-wrap gap-3 items-center">
                          <span className="inline-flex items-center gap-2 rounded-full border border-sky-500/10 bg-sky-500/10 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200">
                            <span
                              className={classNames(
                                "inline-block h-2 w-2 rounded-full",
                                risk.color
                              )}
                            />
                            {risk.label}
                            {risk.score > 0 && (
                              <span className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                                (score {risk.score})
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                            <InformationCircleIcon className="h-4 w-4" />
                            <span>Activité sur les 7 derniers jours.</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Détails activité */}
                  <div className="px-4 py-5 sm:px-6">
                    <dl className="space-y-6">
                      <div>
                        <dt className="text-sm font-black text-slate-950 dark:text-white">
                          Informations du compte
                        </dt>
                        <dd className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-100">
                          <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-400">Création du compte</span>
                            <span className="font-mono text-slate-700 dark:text-slate-100">
                              {formatDateTime(user.CreateDate)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-400">Dernière connexion</span>
                            <span className="font-mono text-slate-700 dark:text-slate-100">
                              {formatDateTime(user.LastLogin)}
                            </span>
                          </div>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-sm font-black text-slate-950 dark:text-white">
                          Résumé criticité (7 jours)
                        </dt>
                        <dd className="mt-2">
                          <div className="flex flex-wrap gap-3 text-xs">
                            <span className={chipClass}>
                              Total : {total}
                            </span>
                            <span className={chipClass}>
                              Criticité 1 : {crit1}
                            </span>
                            <span className={chipClass}>
                              Criticité 2 : {crit2}
                            </span>
                            <span className={chipClass}>
                              Criticité 3 : {crit3}
                            </span>
                          </div>
                        </dd>
                      </div>

                      <div>
  <dt className="text-sm font-black text-slate-950 dark:text-white">
    Détail par type d&apos;action
  </dt>
  <dd className="mt-2">
    {actions.length === 0 ? (
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Aucune activité récente enregistrée.
      </p>
    ) : (
      <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-100">
        {actions.map(([actionName, info]) => (
          <li
            key={actionName}
            className="rounded-xl border border-sky-500/10 bg-white/70 dark:bg-slate-950/65"
          >
            <details className="group">
              {/* Header cliquable */}
              <summary className="flex cursor-pointer items-center justify-between px-3 py-2">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {actionName}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  x{info?.count ?? 0}
                </span>
              </summary>

              {/* Contenu déroulant */}
              <div className="border-t border-sky-500/10 px-3 py-2">
                {!info?.dates || info.dates.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Aucun détail individuel disponible pour cette action.
                  </p>
                ) : (
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-300">
                    {info.dates
                      .slice()
                      .sort(
                        (a, b) => new Date(b) - new Date(a) // plus récent en haut
                      )
                      .map((date, index) => (
                        <li
                          key={index}
                          className="flex justify-between"
                        >
                          <span className="font-mono">
                            {formatDateTime(date)}
                          </span>
                          {/* Option : tu peux ajouter des infos ici (IP, criticité, etc.) */}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    )}
  </dd>
                      </div>
                      <div>
                        <div className="mb-4 flex justify-end">
                          <label className="inline-flex items-center gap-3 rounded-xl border border-sky-500/20 bg-white/70 px-4 py-3 text-sm font-bold text-slate-700 shadow-sm dark:bg-slate-950/55 dark:text-slate-200">
                            <span>Historique brut</span>
                            <button
                              type="button"
                              role="switch"
                              aria-checked={watchRawMode}
                              onClick={() => setWatchRawMode((prev) => !prev)}
                              className={classNames(
                                watchRawMode ? "bg-sky-500" : "bg-slate-500/40",
                                "relative inline-flex h-6 w-11 shrink-0 rounded-full transition duration-200 focus:outline-none focus:ring-2 focus:ring-sky-400"
                              )}
                            >
                              <span
                                className={classNames(
                                  watchRawMode ? "translate-x-6" : "translate-x-1",
                                  "mt-1 inline-block size-4 rounded-full bg-white shadow transition duration-200"
                                )}
                              />
                            </button>
                          </label>
                        </div>
                        <WatchHistoryCards
                          watchLogs={watchHistory}
                          loading={loadingWatchHistory}
                          title="Contenu regardé"
                          emptyText="Aucun contenu regardé pour cet utilisateur."
                          rawMode={watchRawMode}
                        />
                      </div>
                      <div>
                        <FavoriteContentList
                          favorites={favorites}
                          loading={loadingFavorites}
                          title="Favoris"
                          emptyText="Aucun favori pour cet utilisateur."
                        />
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            </DialogPanel>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

const UserManagerCard = ({ onStateChange }) => {
  const [currentTab, setCurrentTab] = useState("active");

  const [users, setUsers] = useState([]);
  const [activityMap, setActivityMap] = useState({});

  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [loadingWatchHistory, setLoadingWatchHistory] = useState(false);
  const [loadingFavorites, setLoadingFavorites] = useState(false);
  const [error, setError] = useState("");

  // Filtres / tri
  const [search, setSearch] = useState("");
  const [etatFilter, setEtatFilter] = useState("all"); // seulement pour l'onglet actifs/bloqués
  const [sortType, setSortType] = useState("AZ");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20; // 20 cartes par page (grille 4x4)
  const sectionRef = useRef(null);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [watchHistoryMap, setWatchHistoryMap] = useState({});
  const [favoritesMap, setFavoritesMap] = useState({});

  // Charge les utilisateurs pour le panel (actifs+bloqués ou supprimés)
  const fetchUsers = async () => {
    try {
      setLoadingUsers(true);
      setError("");

      const tabConfig = TABS.find((t) => t.id === currentTab) || TABS[0];

      const response = await axios.get(
        `${apiBaseUrl}/api/users/panel-users`,
        {
          params: {
            gradeId: 3, // utilisateurs classiques
            scope: tabConfig.scope,
          },
          withCredentials: true,
        }
      );

      setUsers(response.data || []);
      setCurrentPage(1);
    } catch (err) {
      console.error("Erreur lors du chargement des utilisateurs panel:", err);
      setError("Impossible de charger les utilisateurs.");
    } finally {
      setLoadingUsers(false);
    }
  };

  // Charge le résumé d'activité (logs) sur 7 jours
  const fetchActivitySummary = async () => {
    try {
      setLoadingActivity(true);
      const response = await axios.get(
        `${apiBaseUrl}/api/users/activity-summary`,
        {
          params: { days: 7 },
          withCredentials: true,
        }
      );

      const map = {};
      (response.data || []).forEach((item) => {
        map[item.UtilisateurID] = item.activity;
      });
      setActivityMap(map);
    } catch (err) {
      console.error("Erreur lors du chargement du résumé d'activité:", err);
      // pas d'erreur bloquante, on peut vivre sans
    } finally {
      setLoadingActivity(false);
    }
  };

  // Recharger quand on change d'onglet
  useEffect(() => {
    fetchUsers();
  }, [currentTab]);

  // Charger le résumé d'activité une fois (ou quand tu veux rafraîchir)
  useEffect(() => {
    fetchActivitySummary();
  }, []);

  // Liste filtrée + triée
  const filteredUsers = useMemo(() => {
    let result = [...users];

    // Filtre état seulement pour onglet actif
    if (currentTab === "active") {
      if (etatFilter === "actif") {
        result = result.filter((u) => u.EtatID === 1);
      } else if (etatFilter === "bloque") {
        result = result.filter((u) => u.EtatID === 3);
      }
    }

    // Recherche par surnom
    if (search.trim() !== "") {
      const s = search.toLowerCase();
      result = result.filter((u) => u.Surnom.toLowerCase().includes(s));
    }

    // Tri
    switch (sortType) {
      case "AZ":
        result.sort((a, b) => a.Surnom.localeCompare(b.Surnom));
        break;
      case "ZA":
        result.sort((a, b) => b.Surnom.localeCompare(a.Surnom));
        break;
      case "etat":
        result.sort((a, b) => a.EtatID - b.EtatID);
        break;
      case "risk":
        // Tri par risque décroissant
        result.sort((a, b) => {
          const riskA = computeRiskLevel(activityMap[a.UtilisateurID]).score;
          const riskB = computeRiskLevel(activityMap[b.UtilisateurID]).score;
          return riskB - riskA;
        });
        break;
      default:
        break;
    }

    return result;
  }, [users, search, etatFilter, sortType, currentTab, activityMap]);

  // Pagination
  const totalItems = filteredUsers.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Quand on change de page, on reste dans les bornes
  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage(page);
  };

  // Bloquer / débloquer un compte
  const handleToggleEtat = async (user) => {
    if (user.EtatID === 2) return; // supprimé → ne pas toucher

    const newEtat = user.EtatID === 1 ? 3 : 1;

    try {
      await axios.put(
        `${apiBaseUrl}/api/users/change-etat`,
        {
          userId: user.UtilisateurID,
          newEtat,
        },
        { withCredentials: true }
      );

      if (onStateChange) onStateChange();

      fetchUsers();
    } catch (err) {
      console.error("Erreur lors du changement d'état:", err);
      setError("Une erreur est survenue lors du changement d'état.");
    }
  };

  const fetchWatchHistory = async (userId) => {
    try {
      setLoadingWatchHistory(true);
      const response = await axios.get(
        `${apiBaseUrl}/api/users/watch-history/${userId}`,
        { withCredentials: true }
      );
      setWatchHistoryMap((prev) => ({
        ...prev,
        [userId]: response.data || [],
      }));
    } catch (err) {
      console.error("Erreur lors du chargement de l'historique:", err);
      setWatchHistoryMap((prev) => ({ ...prev, [userId]: [] }));
    } finally {
      setLoadingWatchHistory(false);
    }
  };

  const fetchFavorites = async (userId) => {
    try {
      setLoadingFavorites(true);
      const response = await axios.get(
        `${apiBaseUrl}/api/users/favorites/${userId}`,
        { withCredentials: true }
      );
      setFavoritesMap((prev) => ({
        ...prev,
        [userId]: response.data || [],
      }));
    } catch (err) {
      console.error("Erreur lors du chargement des favoris:", err);
      setFavoritesMap((prev) => ({ ...prev, [userId]: [] }));
    } finally {
      setLoadingFavorites(false);
    }
  };

  // Ouvrir le drawer
  const openDrawerForUser = (user) => {
    setSelectedUser(user);
    setDrawerOpen(true);
    if (user?.UtilisateurID) {
      fetchWatchHistory(user.UtilisateurID);
      fetchFavorites(user.UtilisateurID);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedUser(null);
  };

  return (
    <section ref={sectionRef} className={panelClass}>
      <div className={panelHeaderClass}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
            Utilisateurs
          </h2>
        </div>
        {(loadingUsers || loadingActivity) && (
          <span className="text-xs text-slate-400">
            Chargement des données...
          </span>
        )}
      </div>
      </div>

      <div className="relative p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative">

      {/* Tabs */}
      <UserTabs currentTab={currentTab} onChange={setCurrentTab} />

      {/* Filtres + tri (uniquement pour l'onglet actifs/bloqués sur certains filtres) */}
      <div className="flex flex-wrap gap-4 mb-4">
        <input
          type="text"
          placeholder="Rechercher par surnom"
          className={fieldClass}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {currentTab === "active" && (
          <select
            className={fieldClass}
            value={etatFilter}
            onChange={(e) => setEtatFilter(e.target.value)}
          >
            <option value="all">Tous</option>
            <option value="actif">Actifs</option>
            <option value="bloque">Bloqués</option>
          </select>
        )}

        <select
          className={fieldClass}
          value={sortType}
          onChange={(e) => setSortType(e.target.value)}
        >
          <option value="AZ">A → Z</option>
          <option value="ZA">Z → A</option>
          <option value="etat">État</option>
          <option value="risk">Risque</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">
          {error}
        </div>
      )}

      {/* Grille de cartes utilisateurs */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        {paginatedUsers.map((user) => {
          const activity = activityMap[user.UtilisateurID];
          const risk = computeRiskLevel(activity);
          const isDeleted = user.EtatID === 2;

          return (
            <li
              key={user.UtilisateurID}
              className={cardClass}
            >
              <div className="flex items-center justify-between p-6">
                <div className="flex-1 truncate">
                  <div className="flex items-center space-x-3">
                    <h3 className="truncate text-sm font-black text-slate-950 dark:text-white">
                      {user.Surnom}
                    </h3>

                    {/* Badge état */}
                    <span
                      className={classNames(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                        user.EtatID === 1
                          ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                          : user.EtatID === 3
                            ? "bg-amber-500/10 text-amber-400 ring-amber-500/20"
                            : "bg-red-500/10 text-red-400 ring-red-500/20"
                      )}
                    >
                      {user.EtatID === 1
                        ? "Actif"
                        : user.EtatID === 3
                          ? "Bloqué"
                          : "Supprimé"}
                    </span>
                  </div>

                  {/* Grade + email */}
                  <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Grade : {user.Grade?.Nom || `#${user.GradeID}`}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {user.Email}
                  </p>

                  {/* Résumé risque */}
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={classNames(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-medium",
                        risk.color
                      )}
                    >
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-950/70" />
                      {risk.label}
                    </span>
                  </div>
                </div>

                {/* Avatar */}
                <UserAvatar
                        src={user?.CheminImage
                            ? `${apiBaseUrl}${user.CheminImage}`
                            : defaultImage}
                        alt={user.Surnom}
                        name={user.Surnom}
                        size="AdminCards"
                        isPremium={user.isPremium} // <-- flag renvoyé par /users/me
                      />
              </div>

              {/* Bas de carte : Email / Bloquer / Détails */}
              <div className="-mt-px flex divide-x divide-sky-500/10 border-t border-sky-500/10">
                {/* Bouton email */}
                <a
                  href={`mailto:${user.Email}`}
                  className={actionClass}
                >
                  <EnvelopeIcon aria-hidden="true" className="size-4 text-gray-400" />
                  Email
                </a>

                {/* Bouton bloquer/débloquer (pas pour les supprimés) */}
                {!isDeleted && (
                  <button
                    onClick={() => handleToggleEtat(user)}
                    className={actionClass}
                  >
                    {user.EtatID === 1 ? (
                      <>
                        <LockClosedIcon
                          aria-hidden="true"
                          className="size-4 text-amber-400"
                        />
                        Bloquer
                      </>
                    ) : (
                      <>
                        <LockOpenIcon
                          aria-hidden="true"
                          className="size-4 text-emerald-400"
                        />
                        Activer
                      </>
                    )}
                  </button>
                )}

                {/* Bouton détails (drawer) */}
                <button
                  onClick={() => openDrawerForUser(user)}
                  className={actionClass}
                >
                  <InformationCircleIcon
                    aria-hidden="true"
                    className="size-4 text-sky-400"
                  />
                  Détails
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {/* Pagination */}
      {totalItems > 0 && (
        <div className="mt-6">
          <PaginationPage
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            scrollTarget={sectionRef}
            scrollOffset={16}
          />
        </div>
      )}

      {/* Drawer */}
      <UserDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        user={selectedUser}
        watchHistory={
          selectedUser
            ? watchHistoryMap[selectedUser.UtilisateurID] || []
            : []
        }
        loadingWatchHistory={loadingWatchHistory}
        favorites={
          selectedUser
            ? favoritesMap[selectedUser.UtilisateurID] || []
            : []
        }
        loadingFavorites={loadingFavorites}
        activity={
          selectedUser
            ? activityMap[selectedUser.UtilisateurID] || {
              totalLogsLastNDays: 0,
              byCriticite: {},
              byAction: {},
            }
            : null
        }
      />
        </div>
      </div>
    </section>
  );
};

export default UserManagerCard;
