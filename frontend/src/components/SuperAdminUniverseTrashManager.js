import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowPathIcon, TrashIcon } from "@heroicons/react/24/outline";
import api from "../services/api";

const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";
const dangerButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-red-300/50 bg-red-500/15 px-5 py-3 text-sm font-bold text-red-700 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200";

const SuperAdminUniverseTrashManager = () => {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [universes, setUniverses] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const filteredUniverses = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return universes.filter((universe) =>
      [universe.Titre, String(universe.UniverseID)].filter(Boolean).some((value) => String(value).toLowerCase().includes(search))
    );
  }, [universes, searchTerm]);

  const loadDeletedUniverses = useCallback(async () => {
    if (!isSuperAdmin) return;

    try {
      const response = await api.get("/universes/admin/deleted");
      setUniverses(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Erreur lors de la récupération des univers en corbeille :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de récupérer les univers en corbeille.");
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    const checkSuperAdmin = async () => {
      try {
        const response = await api.get("/users/me");
        setIsSuperAdmin(response.data?.GradeID === 1);
      } catch (error) {
        console.error("Failed to verify super admin:", error);
        setIsSuperAdmin(false);
      } finally {
        setLoadingAuth(false);
      }
    };

    checkSuperAdmin();
  }, []);

  useEffect(() => {
    loadDeletedUniverses();
  }, [loadDeletedUniverses]);

  const resetFeedback = () => {
    setMessage("");
    setErrorMessage("");
  };

  const handleRestore = async (universe) => {
    setSaving(true);
    resetFeedback();

    try {
      await api.put(`/universes/${universe.UniverseID}/restore`);
      await loadDeletedUniverses();
      setMessage(`Univers restauré : ${universe.Titre}`);
    } catch (error) {
      console.error("Erreur lors de la restauration :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de restaurer cet univers.");
    } finally {
      setSaving(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!pendingDelete?.UniverseID) return;

    setSaving(true);
    resetFeedback();

    try {
      await api.delete(`/universes/${pendingDelete.UniverseID}/permanent`);
      await loadDeletedUniverses();
      setMessage(`Univers supprimé définitivement : ${pendingDelete.Titre}`);
      setPendingDelete(null);
    } catch (error) {
      console.error("Erreur lors de la suppression définitive :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de supprimer définitivement cet univers.");
    } finally {
      setSaving(false);
    }
  };

  if (!loadingAuth && !isSuperAdmin) {
    return (
      <section className="mx-auto my-8 max-w-2xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
        <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
          <h2 className="text-xl font-black text-slate-950 dark:text-white">Corbeille univers</h2>
        </div>
        <div className="px-6 py-8 text-center">
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            <span className="font-bold text-sky-600 dark:text-sky-300">Accès interdit :</span><br />
            cette section est réservée au super administrateur.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Super administration</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Corbeille univers</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Restaure un univers ou supprime définitivement ses liaisons avec les sagas.
        </p>
      </div>

      <div className="relative px-6 py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative">
          {message && <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">{message}</div>}
          {errorMessage && <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">{errorMessage}</div>}

          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="text"
              placeholder="Filtrer par titre ou ID..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white sm:max-w-md"
            />
            <button type="button" onClick={loadDeletedUniverses} disabled={saving} className={buttonClass}>
              <ArrowPathIcon className="size-5" />
              Actualiser
            </button>
          </div>

          {loadingAuth ? (
            <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">Vérification des droits...</p>
          ) : filteredUniverses.length === 0 ? (
            <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">Aucun univers en corbeille.</p>
          ) : (
            <ul className="divide-y divide-sky-500/10 overflow-hidden rounded-xl border border-sky-500/10 bg-white/70 dark:bg-slate-950/40">
              {filteredUniverses.map((universe) => (
                <li key={universe.UniverseID} className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <p className="font-black text-slate-950 dark:text-white">{universe.Titre}</p>
                    <p className="mt-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">#{universe.UniverseID}</p>
                    {universe.Resume && <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{universe.Resume}</p>}
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button type="button" onClick={() => handleRestore(universe)} disabled={saving} className={buttonClass}>Restaurer</button>
                    <button type="button" onClick={() => setPendingDelete(universe)} disabled={saving} className={dangerButtonClass}>
                      <TrashIcon className="size-5" />
                      Supprimer définitivement
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-red-300/20 bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-white">
            <h3 className="text-xl font-black text-slate-950 dark:text-white">Suppression définitive</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Supprimer définitivement "{pendingDelete.Titre}" ? Cette action retire les liaisons avec les sagas et supprime l'univers. Les sagas ne seront pas supprimées.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPendingDelete(null)} disabled={saving} className="inline-flex items-center justify-center rounded-lg border border-slate-300/60 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Annuler</button>
              <button type="button" onClick={handlePermanentDelete} disabled={saving} className={dangerButtonClass}>
                {saving ? "Suppression..." : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default SuperAdminUniverseTrashManager;
