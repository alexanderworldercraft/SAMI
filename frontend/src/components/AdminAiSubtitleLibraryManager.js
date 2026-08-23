import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import api from "../services/api";
import PaginationPage from "./PaginationPage";

const ACTIVE_STATUSES = new Set(["QUEUED", "PREPARING", "LEASED"]);

const formatTime = (seconds) => {
  const milliseconds = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
};

const statusLabel = (job) => {
  if (!job) return "Piste importée sans historique";
  if (job.status === "QUEUED") return "Recréation en attente";
  if (job.status === "PREPARING") return "Préparation de la source";
  if (job.status === "LEASED") return `Recréation ${job.progress || 0} %`;
  if (job.status === "FAILED") return "Dernier traitement en échec";
  return "Génération terminée";
};

const TextEditorDialog = ({ subtitle, saving, error, onChange, onClose, onSave }) => {
  if (!subtitle) return null;
  return (
    <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-subtitle-text-editor-title"
        className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-fuchsia-400/25 bg-white shadow-2xl dark:bg-slate-950"
      >
        <header className="flex items-start justify-between gap-4 border-b border-fuchsia-500/15 px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-wide text-fuchsia-600 dark:text-fuchsia-300">
              Modification du texte
            </p>
            <h3 id="ai-subtitle-text-editor-title" className="mt-1 truncate text-xl font-black text-slate-950 dark:text-white">
              {subtitle.video.title}
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Les horodatages sont verrouillés dans cet éditeur.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-500/10" aria-label="Fermer l'éditeur">
            <XMarkIcon className="size-6" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {error && <p role="alert" className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm font-bold text-red-700 dark:text-red-200">{error}</p>}
          <ol className="grid gap-3">
            {subtitle.segments.map((segment, index) => (
              <li key={`${index}-${segment.start}`} className="grid gap-3 rounded-xl border border-slate-500/15 bg-slate-500/5 p-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                <p className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                  {formatTime(segment.start)}<br />
                  {formatTime(segment.end)}
                </p>
                <textarea
                  aria-label={`Texte du segment ${index + 1}`}
                  value={segment.text}
                  onChange={(event) => onChange(index, event.target.value)}
                  rows={2}
                  maxLength={4000}
                  className="w-full resize-y rounded-lg border border-fuchsia-500/20 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 dark:bg-slate-900 dark:text-white"
                />
              </li>
            ))}
          </ol>
        </div>
        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-fuchsia-500/15 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-500/10 dark:text-slate-300">
            Annuler
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-fuchsia-600 px-5 py-2 text-sm font-black text-white hover:bg-fuchsia-500 disabled:opacity-60"
          >
            {saving ? "Enregistrement…" : "Enregistrer le texte"}
          </button>
        </footer>
      </section>
    </div>
  );
};

const AdminAiSubtitleLibraryManager = () => {
  const sectionRef = useRef(null);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 40, total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedSubtitleIds, setSelectedSubtitleIds] = useState({});
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState(null);
  const [editor, setEditor] = useState(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editorError, setEditorError] = useState("");

  const load = useCallback(async (page = 1, requestedSearch = "", { quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const response = await api.get("/ai-subtitles/admin/generated", {
        params: { page, search: requestedSearch },
      });
      const nextItems = response.data?.items || [];
      setItems(nextItems);
      setSelectedSubtitleIds((current) => Object.fromEntries(nextItems.map((group) => {
        const currentId = Number(current[group.video.id]);
        const selectedId = group.subtitles.some((subtitle) => subtitle.id === currentId)
          ? currentId
          : group.subtitles[0]?.id;
        return [group.video.id, selectedId];
      })));
      setPagination(response.data?.pagination || { page: 1, pageSize: 40, total: 0, totalPages: 1 });
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Impossible de charger les sous-titres IA.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!items.some((group) => group.subtitles.some((item) => ACTIVE_STATUSES.has(item.job?.status)))) return undefined;
    const timer = window.setInterval(() => load(pagination.page, search, { quiet: true }), 10_000);
    return () => window.clearInterval(timer);
  }, [items, load, pagination.page, search]);

  const submitSearch = (event) => {
    event.preventDefault();
    const nextSearch = searchInput.trim();
    if (!nextSearch) {
      setHasSearched(false);
      setSearch("");
      setItems([]);
      setSelectedSubtitleIds({});
      setPagination({ page: 1, pageSize: 40, total: 0, totalPages: 1 });
      setError("");
      return;
    }
    setHasSearched(true);
    setSearch(nextSearch);
    load(1, nextSearch);
  };

  const openEditor = async (item) => {
    setEditorLoading(true);
    setPendingId(item.id);
    setEditorError("");
    try {
      const response = await api.get(`/ai-subtitles/admin/subtitles/${item.id}`);
      setEditor(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Impossible d'ouvrir ce sous-titre.");
    } finally {
      setEditorLoading(false);
      setPendingId(null);
    }
  };

  const saveText = async () => {
    if (!editor) return;
    setSaving(true);
    setEditorError("");
    try {
      const response = await api.put(`/ai-subtitles/admin/subtitles/${editor.id}/text`, {
        texts: editor.segments.map((segment) => segment.text),
      });
      setEditor(response.data);
      setMessage(`Le texte de « ${editor.video.title} » a été enregistré.`);
      setEditor(null);
    } catch (requestError) {
      setEditorError(requestError.response?.data?.error || "Impossible d'enregistrer le texte.");
    } finally {
      setSaving(false);
    }
  };

  const recreate = async (item) => {
    if (!window.confirm(
      `Retranscrire entièrement « ${item.video.title} » ? L'ancienne piste restera disponible jusqu'à la réussite du nouveau traitement.`
    )) return;
    setPendingId(item.id);
    setMessage("");
    setError("");
    try {
      await api.post(`/ai-subtitles/admin/subtitles/${item.id}/recreate`);
      setMessage(`La retranscription complète de « ${item.video.title} » a été planifiée.`);
      await load(pagination.page, search, { quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Impossible de recréer ce sous-titre.");
    } finally {
      setPendingId(null);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(
      `Supprimer définitivement le sous-titre ${item.label} de « ${item.video.title} » ?`
    )) return;
    setPendingId(item.id);
    setMessage("");
    setError("");
    try {
      await api.delete(`/ai-subtitles/admin/subtitles/${item.id}`);
      setMessage(`Le sous-titre de « ${item.video.title} » a été supprimé.`);
      await load(pagination.page, search, { quiet: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Impossible de supprimer ce sous-titre.");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section ref={sectionRef} className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-fuchsia-500/15 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70">
      <header className="border-b border-fuchsia-500/15 bg-gradient-to-r from-fuchsia-500/15 via-violet-500/10 to-transparent px-5 py-5 sm:px-6">
        <p className="text-sm font-bold uppercase text-fuchsia-600 dark:text-fuchsia-300">Administration</p>
        <div className="mt-1 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">Sous-titres créés par IA</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Corrige le texte sans modifier les horaires, supprime une piste ou relance sa transcription complète.
            </p>
          </div>
          <button type="button" onClick={() => load(pagination.page, search)} disabled={loading || !hasSearched} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-2 text-sm font-black text-fuchsia-800 hover:bg-fuchsia-500/20 disabled:opacity-60 dark:text-fuchsia-100">
            <ArrowPathIcon className={`size-5 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </button>
        </div>
        <form onSubmit={submitSearch} className="mt-4 flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Rechercher un sous-titre IA</span>
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Rechercher une vidéo, une série ou une langue" className="w-full rounded-lg border border-fuchsia-500/20 bg-white py-2 pl-10 pr-3 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 dark:bg-slate-950 dark:text-white" />
          </label>
          <button type="submit" className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-black text-white hover:bg-fuchsia-500">Rechercher</button>
        </form>
      </header>

      <div className="p-4 sm:p-5">
        {message && <p className="mb-4 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-200">{message}</p>}
        {error && <p role="alert" className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm font-bold text-red-700 dark:text-red-200">{error}</p>}
        {!hasSearched ? (
          <p className="rounded-xl border border-slate-500/15 px-4 py-6 text-center text-sm font-semibold text-slate-500">Recherchez une vidéo pour afficher ses sous-titres IA.</p>
        ) : loading && items.length === 0 ? (
          <p className="py-8 text-center text-sm font-semibold text-slate-500">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="rounded-xl border border-slate-500/15 px-4 py-6 text-center text-sm font-semibold text-slate-500">Aucun sous-titre IA trouvé.</p>
        ) : (
          <ul className="grid gap-3">
            {items.map((group) => {
              const selectedSubtitle = group.subtitles.find(
                (subtitle) => subtitle.id === Number(selectedSubtitleIds[group.video.id])
              ) || group.subtitles[0];
              const item = selectedSubtitle ? { ...selectedSubtitle, video: group.video } : null;
              if (!item) return null;
              const active = ACTIVE_STATUSES.has(item.job?.status);
              return (
                <li key={group.video.id} className="min-w-0 overflow-hidden rounded-xl border border-fuchsia-500/10 bg-white/70 p-4 dark:bg-slate-950/45">
                  <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 break-words text-sm font-black leading-5 text-slate-950 dark:text-white" title={group.video.title}>{group.video.title}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {group.video.seriesTitle ? `${group.video.seriesTitle} · saison ${group.video.seasonNumber}` : "Film"}
                      </p>
                      <label className="mt-3 block text-xs font-black text-slate-600 dark:text-slate-300">
                        Sous-titre IA
                        <select
                          aria-label={`Sous-titre IA de ${group.video.title}`}
                          value={item.id}
                          onChange={(event) => setSelectedSubtitleIds((current) => ({
                            ...current,
                            [group.video.id]: Number(event.target.value),
                          }))}
                          className="mt-1 w-full rounded-lg border border-fuchsia-500/20 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 dark:bg-slate-950 dark:text-white"
                        >
                          {group.subtitles.map((subtitle) => (
                            <option key={subtitle.id} value={subtitle.id}>
                              {subtitle.label} — {statusLabel(subtitle.job)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button type="button" onClick={() => openEditor(item)} disabled={active || pendingId === item.id} className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-xs font-black text-sky-700 hover:bg-sky-500/20 disabled:opacity-50 dark:text-sky-200">
                        <PencilSquareIcon className="size-4" /> {editorLoading && pendingId === item.id ? "Ouverture…" : "Modifier"}
                      </button>
                      <button type="button" onClick={() => recreate(item)} disabled={active || pendingId === item.id} className="inline-flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-700 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-200">
                        <ArrowPathIcon className={`size-4 ${active ? "animate-spin" : ""}`} /> {active ? "En cours" : "Recréer"}
                      </button>
                      <button type="button" onClick={() => remove(item)} disabled={active || pendingId === item.id} className="inline-flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-500/20 disabled:opacity-50 dark:text-red-200">
                        <TrashIcon className="size-4" /> Supprimer
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {hasSearched && pagination.total > 0 && (
        <PaginationPage currentPage={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.total} itemsPerPage={40} onPageChange={(page) => load(page, search)} scrollTarget={sectionRef} />
      )}

      <TextEditorDialog
        subtitle={editor}
        saving={saving}
        error={editorError}
        onClose={() => !saving && setEditor(null)}
        onSave={saveText}
        onChange={(index, text) => setEditor((current) => ({
          ...current,
          segments: current.segments.map((segment, segmentIndex) => (
            segmentIndex === index ? { ...segment, text } : segment
          )),
        }))}
      />
    </section>
  );
};

export default AdminAiSubtitleLibraryManager;
