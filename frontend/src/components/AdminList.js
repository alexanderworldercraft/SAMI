// AdminList.js
import React, { useEffect, useRef, useState } from "react";
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

const apiBaseUrl = process.env.REACT_APP_URL_LOCAL;
const panelClass = "overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20";
const panelHeaderClass = "border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5";
const cardClass = "col-span-1 overflow-hidden rounded-xl border border-sky-500/10 bg-white/85 shadow-sm transition duration-200 hover:-translate-y-1 hover:border-sky-300/50 hover:shadow-xl hover:shadow-sky-950/10 dark:bg-slate-950/65 dark:shadow-sky-950/20";
const actionClass = "flex w-0 flex-1 items-center justify-center gap-x-2 py-3 text-xs font-bold text-slate-700 transition duration-200 hover:bg-sky-500/10 hover:text-sky-700 dark:text-slate-200 dark:hover:text-sky-300";
const chipClass = "inline-flex items-center rounded-full border border-sky-500/10 bg-sky-500/10 px-3 py-1 text-xs font-bold text-slate-700 dark:text-slate-200";


  // Image par défaut pour le profil
  const defaultImage = 'https://via.placeholder.com/150?text=Profile'
// Formatage des dates (même helper que dans UserManagerCard)
function formatDateTime(value) {
  if (!value) return "—";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Petite fonction utilitaire pour concaténer les classes Tailwind
function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

// Même algorithme de risque que pour les utilisateurs classiques
function computeRiskLevel(activity) {
  if (!activity) {
    return { label: "Aucune activité", color: "bg-purple-500", score: 0 };
  }

  const crit1 = activity.byCriticite?.[1] || 0;
  const crit2 = activity.byCriticite?.[2] || 0;
  const crit3 = activity.byCriticite?.[3] || 0;
  const total = activity.totalLogsLastNDays || 0;

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

// Drawer pour afficher tous les détails d'un admin
function AdminDrawer({ open, onClose, admin, activity, watchHistory, loadingWatchHistory }) {
  const [watchRawMode, setWatchRawMode] = useState(false);

  if (!admin) return null;

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
      {/* Overlay */}
      <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-md" aria-hidden="true" />

      {/* Panneau glissant */}
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
                      <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
                      <DialogTitle className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                        Détails administrateur
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
                              alt={admin.Surnom}
                              src={
                                admin.CheminImage
                                  ? `${apiBaseUrl}${admin.CheminImage}`
                                  : "https://via.placeholder.com/256?text=Admin"
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
                              {admin.Surnom}
                            </h3>
                            {/* Badge état */}
                            <span
                              className={classNames(
                                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
                                admin.EtatID === 1
                                  ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                                  : admin.EtatID === 3
                                    ? "bg-amber-500/10 text-amber-400 ring-amber-500/20"
                                    : "bg-red-500/10 text-red-400 ring-red-500/20"
                              )}
                            >
                              {admin.EtatID === 1
                                ? "Actif"
                                : admin.EtatID === 3
                                  ? "Bloqué"
                                  : "Supprimé"}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {admin.Email}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Grade : {admin.Grade?.Nom || `#${admin.GradeID}`}
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
                      {/* Infos compte */}
                      <div>
                        <dt className="text-sm font-black text-slate-950 dark:text-white">
                          Informations du compte
                        </dt>
                        <dd className="mt-2 space-y-2 text-sm text-slate-700 dark:text-slate-100">
                          <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-400">
                              Création du compte
                            </span>
                            <span className="font-mono text-slate-700 dark:text-slate-100">
                              {formatDateTime(admin.CreateDate)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500 dark:text-slate-400">
                              Dernière connexion
                            </span>
                            <span className="font-mono text-slate-700 dark:text-slate-100">
                              {formatDateTime(admin.LastLogin)}
                            </span>
                          </div>
                        </dd>
                      </div>

                      {/* Résumé criticité */}
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

                      {/* Détails par type d'action (dropdown + dates) */}
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
                                              (a, b) =>
                                                new Date(b) - new Date(a) // plus récent en haut
                                            )
                                            .map((date, index) => (
                                              <li
                                                key={index}
                                                className="flex justify-between"
                                              >
                                                <span className="font-mono">
                                                  {formatDateTime(date)}
                                                </span>
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
                          emptyText="Aucun contenu regardé pour cet administrateur."
                          rawMode={watchRawMode}
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

const AdminList = () => {
  const [admins, setAdmins] = useState([]);
  const [currentUserGrade, setCurrentUserGrade] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Activité (logs) map[UtilisateurID] -> activity
  const [activityMap, setActivityMap] = useState({});
  const [loadingAdmins, setLoadingAdmins] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [loadingWatchHistory, setLoadingWatchHistory] = useState(false);

  // Drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [watchHistoryMap, setWatchHistoryMap] = useState({});

  // Pagination
  const itemsPerPage = 20; // 20 admins par page (grille 4x4)
  const [currentPage, setCurrentPage] = useState(1);
  const sectionRef = useRef(null);

  const fetchAdmins = async () => {
    try {
      setLoadingAdmins(true);
      setErrorMessage("");

      const response = await axios.get(`${apiBaseUrl}/api/users/admins`, {
        withCredentials: true,
      });
      setAdmins(response.data || []);
      setCurrentPage(1); // reset page si la liste change
    } catch (error) {
      console.error("Erreur lors de la récupération des admins:", error);
      setErrorMessage("Impossible de charger la liste des admins.");
    } finally {
      setLoadingAdmins(false);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const response = await axios.get(`${apiBaseUrl}/api/users/me`, {
        withCredentials: true,
      });
      setCurrentUserGrade(response.data.GradeID);
    } catch (error) {
      console.error("Erreur lors de la récupération de l'utilisateur:", error);
    }
  };

  // Récupération du résumé d'activité (logs) pour tous les utilisateurs
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
    } catch (error) {
      console.error(
        "Erreur lors du chargement du résumé d'activité (admins):",
        error
      );
      // pas bloquant, juste moins d'info
    } finally {
      setLoadingActivity(false);
    }
  };

  // Action bloquer/débloquer
  const handleChangeEtat = async (userId, currentEtat) => {
    const newEtat = currentEtat === 1 ? 3 : 1;

    try {
      await axios.put(
        `${apiBaseUrl}/api/users/change-etat`,
        { userId, newEtat },
        { withCredentials: true }
      );
      fetchAdmins();
    } catch (error) {
      console.error("Erreur lors du changement d'état :", error);
      setErrorMessage("Action impossible.");
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
    } catch (error) {
      console.error("Erreur lors du chargement de l'historique:", error);
      setWatchHistoryMap((prev) => ({ ...prev, [userId]: [] }));
    } finally {
      setLoadingWatchHistory(false);
    }
  };

  const openDrawerForAdmin = (admin) => {
    setSelectedAdmin(admin);
    setDrawerOpen(true);
    if (admin?.UtilisateurID) {
      fetchWatchHistory(admin.UtilisateurID);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setSelectedAdmin(null);
  };

  useEffect(() => {
    fetchAdmins();
    fetchCurrentUser();
    fetchActivitySummary();
  }, []);

  // Pagination calcul
  const totalItems = admins.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const paginatedAdmins = admins.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="w-full mb-12">
      <section ref={sectionRef} className={panelClass}>
        <div className={panelHeaderClass}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Administrateurs</h3>
          </div>
          {(loadingAdmins || loadingActivity) && (
            <span className="text-xs text-slate-400">
              Chargement des données...
            </span>
          )}
        </div>
        </div>

        <div className="relative p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
          <div className="relative">
        {errorMessage && (
          <p className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">{errorMessage}</p>
        )}

        {/* Grille de cartes admins (même structure que UserManagerCard) */}
        <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
          {paginatedAdmins.map((admin) => {
            const isBlocked = admin.EtatID === 3;
            const isSuperAdmin = admin.GradeID === 1;

            const activity = activityMap[admin.UtilisateurID];
            const risk = computeRiskLevel(activity);

            return (
              <li
                key={admin.UtilisateurID}
                className={cardClass}
              >
                <div className="flex items-center justify-between p-6">
                  <div className="flex-1 truncate">
                    {/* Nom + badge état */}
                    <div className="flex items-center space-x-3">
                      <h3 className="truncate text-sm font-black text-slate-950 dark:text-white">
                        {admin.Surnom}
                      </h3>

                      <span
                        className={classNames(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                          admin.EtatID === 1
                            ? "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20"
                            : admin.EtatID === 3
                              ? "bg-amber-500/10 text-amber-400 ring-amber-500/20"
                              : "bg-red-500/10 text-red-400 ring-red-500/20"
                        )}
                      >
                        {admin.EtatID === 1
                          ? "Actif"
                          : admin.EtatID === 3
                            ? "Bloqué"
                            : "Supprimé"}
                      </span>
                    </div>

                    {/* Grade + email */}
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Grade : {admin.Grade?.Nom || `#${admin.GradeID}`}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      {admin.Email}
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

                  {/* Avatar admin */}
                <UserAvatar
                        src={admin?.CheminImage
                            ? `${apiBaseUrl}${admin.CheminImage}`
                            : defaultImage}
                        alt={admin.Surnom}
                        name={admin.Surnom}
                        size="AdminCards"
                        isPremium={admin.isPremium} // <-- flag renvoyé par /users/me
                      />
                </div>

                {/* Bas de carte : Email / Bloquer / Détails */}
                <div className="-mt-px flex divide-x divide-sky-500/10 border-t border-sky-500/10">
                  {/* Bouton email */}
                  <a
                    href={`mailto:${admin.Email}`}
                    className={actionClass}
                  >
                    <EnvelopeIcon
                      aria-hidden="true"
                      className="size-4 text-gray-400"
                    />
                    Email
                  </a>

                  {/* Bloquer / Débloquer (seulement SuperAdmin, et pas sur un SuperAdmin) */}
                  {currentUserGrade === 1 && !isSuperAdmin && (
                    <button
                      onClick={() =>
                        handleChangeEtat(admin.UtilisateurID, admin.EtatID)
                      }
                      className={actionClass}
                    >
                      {isBlocked ? (
                        <>
                          <LockOpenIcon
                            aria-hidden="true"
                            className="size-4 text-emerald-400"
                          />
                          Activer
                        </>
                      ) : (
                        <>
                          <LockClosedIcon
                            aria-hidden="true"
                            className="size-4 text-amber-400"
                          />
                          Bloquer
                        </>
                      )}
                    </button>
                  )}

                  {/* Bouton détails (drawer) */}
                  <button
                    onClick={() => openDrawerForAdmin(admin)}
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
          <div className="mt-8">
            <PaginationPage
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              scrollTarget={sectionRef}
              scrollOffset={16}
            />
          </div>
        )}

        {/* Drawer détails admin */}
        <AdminDrawer
          open={drawerOpen}
          onClose={closeDrawer}
          admin={selectedAdmin}
          watchHistory={
            selectedAdmin
              ? watchHistoryMap[selectedAdmin.UtilisateurID] || []
              : []
          }
          loadingWatchHistory={loadingWatchHistory}
          activity={
            selectedAdmin
              ? activityMap[selectedAdmin.UtilisateurID] || {
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
    </div>
  );
};

export default AdminList;
