import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowPathIcon, LanguageIcon } from "@heroicons/react/24/outline";

import api from "../services/api";
import PaginationPage from "./PaginationPage";

const ACTIVE_STATUSES = new Set(["QUEUED", "PREPARING", "LEASED"]);

const jobLabel = (job) => {
  if (!job) return "À générer";
  if (job.status === "QUEUED") return "En attente";
  if (job.status === "PREPARING") return "Préparation audio";
  if (job.status === "LEASED") return `Génération ${job.progress || 0} %`;
  if (job.status === "FAILED") return "Échec — relancer";
  return job.status;
};

const AdminAiSubtitleManager = () => {
  const sectionRef = useRef(null);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 40, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [pendingVideoId, setPendingVideoId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (page = 1, { quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const response = await api.get("/ai-subtitles/admin/videos-without-french", {
        params: { page },
      });
      setItems(response.data?.items || []);
      setPagination(response.data?.pagination || {
        page: 1, pageSize: 40, total: 0, totalPages: 1,
      });
      setError("");
    } catch (requestError) {
      setError(
        requestError.response?.data?.error
        || "Impossible de charger les vidéos sans sous-titres français."
      );
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  useEffect(() => {
    if (!items.some((item) => ACTIVE_STATUSES.has(item.job?.status))) return undefined;
    const timer = window.setInterval(() => load(pagination.page, { quiet: true }), 10_000);
    return () => window.clearInterval(timer);
  }, [items, load, pagination.page]);

  const requestFrench = async (video) => {
    setPendingVideoId(video.videoId);
    setMessage("");
    setError("");
    try {
      await api.post(`/ai-subtitles/videos/${video.videoId}/requests`, { language: "fr" });
      setMessage(`La génération française de « ${video.title} » a été ajoutée à la file.`);
      await load(pagination.page, { quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Impossible de planifier ce sous-titre.");
    } finally {
      setPendingVideoId(null);
    }
  };

  return (
    <section ref={sectionRef} className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-fuchsia-500/15 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70">
      <div className="border-b border-fuchsia-500/15 bg-gradient-to-r from-fuchsia-500/15 via-violet-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-fuchsia-600 dark:text-fuchsia-300">Administration</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">
              Sous-titres français manquants
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Films et épisodes actifs sans sous-titre français complet. Les pistes françaises
              forcées ne sont pas considérées comme un sous-titre complet.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load(pagination.page)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-2 text-sm font-black text-fuchsia-800 hover:bg-fuchsia-500/20 disabled:opacity-60 dark:text-fuchsia-100"
          >
            <ArrowPathIcon className={`size-5 ${loading ? "animate-spin" : ""}`} />
            Actualiser
          </button>
        </div>
      </div>

      <div className="p-5">
        {message && <p className="mb-4 break-words rounded-lg bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-200">{message}</p>}
        {error && <p role="alert" className="mb-4 break-words rounded-lg bg-red-500/10 px-4 py-3 text-sm font-bold text-red-700 dark:text-red-200">{error}</p>}
        {loading && items.length === 0 ? (
          <p className="py-8 text-center text-sm font-semibold text-slate-500">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-5 text-sm font-bold text-emerald-700 dark:text-emerald-200">
            Toutes les vidéos actives disposent d'un sous-titre français complet.
          </p>
        ) : (
          <ul className="grid gap-3">
            {items.map((video) => {
              const active = ACTIVE_STATUSES.has(video.job?.status);
              return (
                <li key={video.videoId} className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border border-fuchsia-500/10 bg-white/70 p-4 dark:bg-slate-950/45 sm:flex-row sm:items-center sm:justify-between">
                  <div className="w-full min-w-0 sm:flex-1">
                    <p className="line-clamp-2 max-w-full break-words text-sm font-black leading-5 text-slate-950 dark:text-white" title={video.title}>
                      {video.title}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {video.seriesTitle
                        ? `${video.seriesTitle} · saison ${video.seasonNumber}`
                        : "Film"}
                      {video.job ? ` · ${jobLabel(video.job)}` : ""}
                    </p>
                    {video.job?.error && (
                      <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-300">
                        {video.job.error}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => requestFrench(video)}
                    disabled={active || pendingVideoId === video.videoId}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-2 text-sm font-black text-fuchsia-800 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-55 dark:text-fuchsia-100"
                  >
                    <LanguageIcon className="size-5" />
                    {pendingVideoId === video.videoId
                      ? "Planification…"
                      : active ? jobLabel(video.job) : video.job?.status === "FAILED" ? "Relancer" : "Générer en français"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pagination.total > 0 && (
        <PaginationPage
          currentPage={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.total}
          itemsPerPage={40}
          onPageChange={(page) => load(page)}
          scrollTarget={sectionRef}
        />
      )}
    </section>
  );
};

export default AdminAiSubtitleManager;
