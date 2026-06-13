import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowPathIcon, TrashIcon } from "@heroicons/react/24/outline";
import api from "../services/api";

const apiUrl = process.env.REACT_APP_URL_LOCAL;

const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";
const dangerButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-red-300/50 bg-red-500/15 px-5 py-3 text-sm font-bold text-red-700 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200";

const videoLabel = (video) => {
  if (!video) return "";
  if (video.type === "episode") {
    return `${video.Titre} - ${video.SeriesTitre || "Série inconnue"} S${video.SaisonNumero || "?"}`;
  }
  return video.Titre;
};

const SuperAdminVideoTrashManager = () => {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [videos, setVideos] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const filteredVideos = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return videos.filter((video) =>
      [video.Titre, video.SeriesTitre, String(video.VideoID)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [searchTerm, videos]);

  const loadDeletedVideos = useCallback(async () => {
    if (!isSuperAdmin) return;

    try {
      const response = await api.get("/videos/admin/deleted");
      setVideos(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Erreur lors de la récupération des vidéos en corbeille :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de récupérer les vidéos en corbeille.");
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
    loadDeletedVideos();
  }, [loadDeletedVideos]);

  const resetFeedback = () => {
    setMessage("");
    setErrorMessage("");
  };

  const handleRestore = async (video) => {
    setSaving(true);
    resetFeedback();

    try {
      await api.put(`/videos/${video.VideoID}/restore`);
      await loadDeletedVideos();
      setMessage(`Vidéo restaurée : ${video.Titre}`);
    } catch (error) {
      console.error("Erreur lors de la restauration :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de restaurer cette vidéo.");
    } finally {
      setSaving(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!pendingAction?.video?.VideoID) return;

    setSaving(true);
    resetFeedback();

    try {
      await api.delete(`/videos/${pendingAction.video.VideoID}/permanent`);
      await loadDeletedVideos();
      setMessage(`Vidéo supprimée définitivement : ${pendingAction.video.Titre}`);
      setPendingAction(null);
    } catch (error) {
      console.error("Erreur lors de la suppression définitive :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de supprimer définitivement cette vidéo.");
    } finally {
      setSaving(false);
    }
  };

  if (!loadingAuth && !isSuperAdmin) {
    return (
      <section className="mx-auto my-8 max-w-2xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
        <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
          <h2 className="text-xl font-black text-slate-950 dark:text-white">Corbeille vidéos</h2>
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
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Corbeille vidéos</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Restaure une vidéo mise en corbeille ou supprime définitivement ses fichiers et données.
        </p>
      </div>

      <div className="relative px-6 py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative">
          {message && (
            <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">
              {message}
            </div>
          )}
          {errorMessage && (
            <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">
              {errorMessage}
            </div>
          )}

          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              type="text"
              placeholder="Filtrer par titre, série ou ID..."
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white sm:max-w-md"
            />
            <button type="button" onClick={loadDeletedVideos} disabled={saving} className={buttonClass}>
              <ArrowPathIcon className="size-5" />
              Actualiser
            </button>
          </div>

          {loadingAuth ? (
            <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
              Vérification des droits...
            </p>
          ) : filteredVideos.length === 0 ? (
            <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
              Aucune vidéo en corbeille.
            </p>
          ) : (
            <ul className="divide-y divide-sky-500/10 overflow-hidden rounded-xl border border-sky-500/10 bg-white/70 dark:bg-slate-950/40">
              {filteredVideos.map((video) => (
                <li key={video.VideoID} className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center">
                  <div className="flex flex-1 items-center gap-4">
                    <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-800">
                      {video.CheminImage && (
                        <img src={`${apiUrl}/${video.CheminImage}`} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div>
                      <p className="font-black text-slate-950 dark:text-white">{videoLabel(video)}</p>
                      <p className="mt-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                        #{video.VideoID} - {video.type === "episode" ? "Épisode" : "Film"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button type="button" onClick={() => handleRestore(video)} disabled={saving} className={buttonClass}>
                      Restaurer
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingAction({ type: "delete", video })}
                      disabled={saving}
                      className={dangerButtonClass}
                    >
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

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-red-300/20 bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-white">
            <h3 className="text-xl font-black text-slate-950 dark:text-white">Suppression définitive</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Supprimer définitivement "{pendingAction.video.Titre}" ? Cette action efface les données liées et les fichiers vidéo.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300/60 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button type="button" onClick={handlePermanentDelete} disabled={saving} className={dangerButtonClass}>
                <TrashIcon className="size-5" />
                {saving ? "Suppression..." : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default SuperAdminVideoTrashManager;
