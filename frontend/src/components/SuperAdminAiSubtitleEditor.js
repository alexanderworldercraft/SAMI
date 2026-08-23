import React, { useCallback, useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import {
  ArrowsPointingOutIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import api from "../services/api";
import PaginationPage from "./PaginationPage";

const apiUrl = String(process.env.REACT_APP_URL_LOCAL || "").replace(/\/$/, "");
const MIN_CUE_DURATION = 0.1;

const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

const formatTime = (seconds, compact = false) => {
  const milliseconds = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  const base = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return compact ? base : `${base}.${String(ms).padStart(3, "0")}`;
};

const sourceUrl = (relativePath) => `${apiUrl}/${String(relativePath || "").replace(/^\/+/, "")}`;

const validateSegments = (segments) => {
  const normalized = segments.map((segment, index) => {
    const start = Number(segment.start);
    const end = Number(segment.end);
    const text = String(segment.text || "").replace(/\s+/g, " ").trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < MIN_CUE_DURATION || !text) {
      throw new Error(`Le segment ${index + 1} contient un texte ou un horodatage invalide.`);
    }
    if (text.length > 4000) throw new Error(`Le texte du segment ${index + 1} est trop long.`);
    return { start, end, text };
  });
  normalized.forEach((segment, index) => {
    if (index > 0 && segment.start < normalized[index - 1].end) {
      throw new Error(`Le segment ${index + 1} chevauche le segment précédent.`);
    }
  });
  return normalized;
};

const TimelineWorkspace = ({ initialSubtitle, onClose, onSaved }) => {
  const workspaceRef = useRef(null);
  const videoRef = useRef(null);
  const timelineContentRef = useRef(null);
  const dragMovedRef = useRef(false);
  const [subtitle, setSubtitle] = useState(initialSubtitle);
  const [segments, setSegments] = useState(initialSubtitle.segments || []);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(null);

  const timelineDuration = Math.max(
    duration,
    ...segments.map((segment) => Number(segment.end) || 0),
    1
  );
  const activeIndex = segments.findIndex(
    (segment) => currentTime >= Number(segment.start) && currentTime < Number(segment.end)
  );
  const displayedIndex = selectedIndex !== null && segments[selectedIndex]
    ? selectedIndex
    : activeIndex;
  const displayedSegment = displayedIndex >= 0 ? segments[displayedIndex] : null;

  useEffect(() => {
    const updateFullscreenState = () => {
      setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    };
    document.addEventListener("fullscreenchange", updateFullscreenState);
    return () => document.removeEventListener("fullscreenchange", updateFullscreenState);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !subtitle.video.path) return undefined;
    const url = sourceUrl(subtitle.video.path);
    let hls = null;
    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
    }
    const updateTime = () => setCurrentTime(video.currentTime || 0);
    const updateDuration = () => {
      if (Number.isFinite(video.duration)) setDuration(video.duration);
    };
    video.addEventListener("timeupdate", updateTime);
    video.addEventListener("loadedmetadata", updateDuration);
    video.addEventListener("durationchange", updateDuration);
    return () => {
      video.removeEventListener("timeupdate", updateTime);
      video.removeEventListener("loadedmetadata", updateDuration);
      video.removeEventListener("durationchange", updateDuration);
      hls?.destroy();
    };
  }, [subtitle.video.path]);

  useEffect(() => {
    if (!drag) return undefined;
    const move = (event) => {
      const rect = timelineContentRef.current?.getBoundingClientRect();
      if (!rect?.width) return;
      const deltaSeconds = ((event.clientX - drag.startX) / rect.width) * drag.timelineDuration;
      if (Math.abs(event.clientX - drag.startX) > 2) dragMovedRef.current = true;
      const snapshot = drag.segments;
      const original = snapshot[drag.index];
      const previousEnd = drag.index > 0 ? Number(snapshot[drag.index - 1].end) : 0;
      const nextStart = drag.index < snapshot.length - 1
        ? Number(snapshot[drag.index + 1].start)
        : drag.timelineDuration;
      let start = Number(original.start);
      let end = Number(original.end);
      if (drag.mode === "start") {
        start = clamp(start + deltaSeconds, previousEnd, end - MIN_CUE_DURATION);
      } else if (drag.mode === "end") {
        end = clamp(end + deltaSeconds, start + MIN_CUE_DURATION, nextStart);
      } else {
        const cueDuration = end - start;
        start = clamp(start + deltaSeconds, previousEnd, Math.max(previousEnd, nextStart - cueDuration));
        end = start + cueDuration;
      }
      setSegments(snapshot.map((segment, index) => (
        index === drag.index ? { ...segment, start, end } : segment
      )));
    };
    const end = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end, { once: true });
    window.addEventListener("pointercancel", end, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [drag]);

  const seek = (time) => {
    const nextTime = clamp(Number(time) || 0, 0, timelineDuration);
    if (videoRef.current) videoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const startDrag = (event, index, mode) => {
    event.preventDefault();
    event.stopPropagation();
    dragMovedRef.current = false;
    setSelectedIndex(index);
    if (mode === "move") seek(segments[index].start);
    setDrag({
      index,
      mode,
      startX: event.clientX,
      timelineDuration,
      segments: segments.map((segment) => ({ ...segment })),
    });
  };

  const changeSegment = (index, field, value) => {
    setSegments((current) => current.map((segment, segmentIndex) => (
      segmentIndex === index
        ? { ...segment, [field]: field === "text" ? value : Number(value) }
        : segment
    )));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const normalized = validateSegments(segments);
      const response = await api.put(`/ai-subtitles/admin/subtitles/${subtitle.id}/segments`, {
        segments: normalized,
      });
      setSubtitle(response.data);
      setSegments(response.data.segments || normalized);
      setMessage("Les textes et les horodatages ont été enregistrés.");
      onSaved?.(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === workspaceRef.current) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        if (document.fullscreenElement) await document.exitFullscreen();
        await workspaceRef.current?.requestFullscreen?.();
        setIsFullscreen(document.fullscreenElement === workspaceRef.current);
      }
    } catch (fullscreenError) {
      setError("Le navigateur n'a pas autorisé le plein écran.");
    }
  };

  const close = async () => {
    if (document.fullscreenElement === workspaceRef.current) {
      await document.exitFullscreen().catch(() => {});
    }
    onClose();
  };

  return (
    <div
      ref={workspaceRef}
      role={isFullscreen ? "dialog" : "region"}
      aria-modal={isFullscreen ? "true" : undefined}
      aria-label={`Éditeur temporel de ${subtitle.video.title}`}
      className={`relative flex w-full flex-col overflow-hidden bg-slate-950 text-white shadow-2xl ${isFullscreen ? "rounded-none" : "rounded-2xl border border-fuchsia-400/20"}`}
      style={{
        height: isFullscreen ? "100vh" : "min(900px, calc(100vh - 7rem))",
        minHeight: isFullscreen ? undefined : "650px",
      }}
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-fuchsia-300">Éditeur temporel IA</p>
          <h2 className="truncate text-lg font-black sm:text-xl">{subtitle.video.title} · {subtitle.label}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={saving} className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-black text-white hover:bg-fuchsia-500 disabled:opacity-60">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" onClick={toggleFullscreen} className="rounded-lg border border-white/15 p-2 hover:bg-white/10" aria-label="Basculer le plein écran">
            <ArrowsPointingOutIcon className="size-5" />
          </button>
          <button type="button" onClick={close} className="rounded-lg border border-white/15 p-2 hover:bg-white/10" aria-label="Fermer l'éditeur temporel">
            <XMarkIcon className="size-5" />
          </button>
        </div>
      </header>

      {(error || message) && (
        <div className={`shrink-0 px-4 py-2 text-sm font-bold ${error ? "bg-red-600/30 text-red-100" : "bg-emerald-600/25 text-emerald-100"}`} role={error ? "alert" : undefined}>
          {error || message}
        </div>
      )}

      <div className="grid min-h-0 flex-1 grid-rows-[minmax(220px,42vh)_auto_minmax(220px,1fr)] xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] xl:grid-rows-[minmax(300px,55vh)_minmax(220px,1fr)]">
        <section className="relative min-h-0 bg-black xl:col-start-1 xl:row-start-1">
          <video ref={videoRef} controls className="size-full object-contain" preload="metadata" />
          {activeIndex >= 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-14 flex justify-center px-6 text-center">
              <p className="max-w-[90%] rounded-md bg-black/75 px-3 py-1.5 text-lg font-bold leading-snug text-white shadow-lg">
                {segments[activeIndex].text}
              </p>
            </div>
          )}
        </section>

        <section className="min-h-0 overflow-y-auto border-l border-white/10 bg-slate-900 xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <div className="sticky top-0 z-10 border-b border-white/10 bg-slate-900/95 px-4 py-3 backdrop-blur">
            <h3 className="font-black">Texte et horodatages</h3>
            <p className="mt-1 text-xs text-slate-400">Clique sur une ligne pour positionner la vidéo.</p>
          </div>
          <ol className="grid gap-2 p-3">
            {segments.map((segment, index) => (
              <li key={`${index}-${subtitle.id}`} onFocus={() => setSelectedIndex(index)} className={`rounded-lg border p-3 ${displayedIndex === index ? "border-fuchsia-400 bg-fuchsia-500/15" : "border-white/10 bg-white/5"}`}>
                <button type="button" onClick={() => { setSelectedIndex(index); seek(segment.start); }} className="mb-2 text-left text-xs font-black text-fuchsia-300">
                  Segment {index + 1}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[11px] font-bold text-slate-400">Début
                    <input type="number" min="0" step="0.001" value={Number(segment.start).toFixed(3)} onChange={(event) => changeSegment(index, "start", event.target.value)} className="mt-1 w-full rounded border border-white/15 bg-slate-950 px-2 py-1.5 font-mono text-xs text-white" />
                  </label>
                  <label className="text-[11px] font-bold text-slate-400">Fin
                    <input type="number" min="0.1" step="0.001" value={Number(segment.end).toFixed(3)} onChange={(event) => changeSegment(index, "end", event.target.value)} className="mt-1 w-full rounded border border-white/15 bg-slate-950 px-2 py-1.5 font-mono text-xs text-white" />
                  </label>
                </div>
                <textarea value={segment.text} onChange={(event) => changeSegment(index, "text", event.target.value)} rows={2} maxLength={4000} aria-label={`Texte temporel du segment ${index + 1}`} className="mt-2 w-full resize-y rounded border border-white/15 bg-slate-950 px-2 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400" />
              </li>
            ))}
          </ol>
        </section>

        <section className="flex min-h-0 flex-col border-t border-white/10 bg-slate-900 xl:col-start-1 xl:row-start-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
            <div>
              <h3 className="text-sm font-black">Timeline des sous-titres</h3>
              <p className="text-xs font-semibold text-slate-400">{formatTime(currentTime)} / {formatTime(timelineDuration)}</p>
            </div>
            <label className="flex items-center gap-3 text-xs font-bold text-slate-300">
              Zoom {zoom.toFixed(1)}×
              <input aria-label="Zoom de la timeline" type="range" min="1" max="20" step="0.5" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="w-36 accent-fuchsia-500" />
            </label>
            <div className="flex flex-wrap gap-3 text-[10px] font-bold text-slate-400">
              <span><i className="mr-1 inline-block h-2 w-1 bg-sky-400" />début</span>
              <span><i className="mr-1 inline-block h-2 w-3 bg-fuchsia-500" />ensemble</span>
              <span><i className="mr-1 inline-block h-2 w-1 bg-amber-400" />fin</span>
            </div>
          </div>
          <div className="h-[150px] shrink-0 overflow-x-auto overflow-y-hidden p-3">
            <div
              ref={timelineContentRef}
              className="relative h-24 min-w-full cursor-crosshair rounded-lg bg-slate-950 ring-1 ring-white/10"
              style={{ width: `${zoom * 100}%` }}
              onClick={(event) => {
                if (dragMovedRef.current) {
                  dragMovedRef.current = false;
                  return;
                }
                if (event.target !== event.currentTarget) return;
                setSelectedIndex(null);
                const rect = event.currentTarget.getBoundingClientRect();
                seek(((event.clientX - rect.left) / rect.width) * timelineDuration);
              }}
            >
              <div className="absolute inset-y-0 z-20 w-0.5 bg-white shadow-[0_0_8px_white]" style={{ left: `${(currentTime / timelineDuration) * 100}%` }} />
              {segments.map((segment, index) => {
                const left = (Number(segment.start) / timelineDuration) * 100;
                const width = ((Number(segment.end) - Number(segment.start)) / timelineDuration) * 100;
                return (
                  <div
                    key={`${index}-${subtitle.id}-timeline`}
                    className={`absolute top-7 flex h-12 min-w-[22px] overflow-hidden rounded border shadow ${displayedIndex === index ? "border-white ring-2 ring-fuchsia-400" : "border-fuchsia-300/40"}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${formatTime(segment.start)} → ${formatTime(segment.end)} · ${segment.text}`}
                  >
                    <button type="button" aria-label={`Déplacer le début du segment ${index + 1}`} onPointerDown={(event) => startDrag(event, index, "start")} className="w-2 shrink-0 cursor-ew-resize bg-sky-400 hover:bg-sky-300" />
                    <button type="button" aria-label={`Déplacer le segment ${index + 1}`} onPointerDown={(event) => startDrag(event, index, "move")} className="min-w-0 flex-1 cursor-grab truncate bg-fuchsia-600 px-1 text-[10px] font-black text-white active:cursor-grabbing">
                      {index + 1}
                    </button>
                    <button type="button" aria-label={`Déplacer la fin du segment ${index + 1}`} onPointerDown={(event) => startDrag(event, index, "end")} className="w-2 shrink-0 cursor-ew-resize bg-amber-400 hover:bg-amber-300" />
                  </div>
                );
              })}
            </div>
          </div>
          {isFullscreen && (
            <div className="min-h-0 flex-1 overflow-y-auto border-t border-white/10 bg-slate-950/55 p-3">
              {displayedSegment ? (
                <div className="rounded-xl border border-fuchsia-400/25 bg-white/5 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-fuchsia-300">
                        Segment sélectionné {displayedIndex + 1}
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-400">
                        {selectedIndex !== null ? "Sélection manuelle prioritaire" : "Sélection automatique selon la lecture"}
                      </p>
                    </div>
                    {selectedIndex !== null && (
                      <button type="button" onClick={() => setSelectedIndex(null)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-black text-slate-200 hover:bg-white/10">
                        Suivre la lecture
                      </button>
                    )}
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[150px_150px_minmax(0,1fr)]">
                    <label className="text-[11px] font-bold text-slate-400">
                      Début
                      <input
                        aria-label={`Début du segment sélectionné ${displayedIndex + 1}`}
                        type="number"
                        min="0"
                        step="0.001"
                        value={Number(displayedSegment.start).toFixed(3)}
                        onChange={(event) => changeSegment(displayedIndex, "start", event.target.value)}
                        className="mt-1 w-full rounded border border-white/15 bg-slate-950 px-2 py-2 font-mono text-xs text-white"
                      />
                    </label>
                    <label className="text-[11px] font-bold text-slate-400">
                      Fin
                      <input
                        aria-label={`Fin du segment sélectionné ${displayedIndex + 1}`}
                        type="number"
                        min="0.1"
                        step="0.001"
                        value={Number(displayedSegment.end).toFixed(3)}
                        onChange={(event) => changeSegment(displayedIndex, "end", event.target.value)}
                        className="mt-1 w-full rounded border border-white/15 bg-slate-950 px-2 py-2 font-mono text-xs text-white"
                      />
                    </label>
                    <label className="text-[11px] font-bold text-slate-400">
                      Texte
                      <textarea
                        aria-label={`Texte du segment sélectionné ${displayedIndex + 1}`}
                        value={displayedSegment.text}
                        onChange={(event) => changeSegment(displayedIndex, "text", event.target.value)}
                        rows={2}
                        maxLength={4000}
                        className="mt-1 w-full resize-y rounded border border-white/15 bg-slate-950 px-3 py-2 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-fuchsia-400"
                      />
                    </label>
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-white/15 px-4 py-5 text-center text-xs font-semibold text-slate-400">
                  Lancez la lecture ou sélectionnez un segment dans la timeline.
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

const SuperAdminAiSubtitleEditor = () => {
  const sectionRef = useRef(null);
  const [authorized, setAuthorized] = useState(null);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 40, total: 0, totalPages: 1 });
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedSubtitleIds, setSelectedSubtitleIds] = useState({});
  const [loading, setLoading] = useState(true);
  const [openingId, setOpeningId] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async (page = 1, requestedSearch = "") => {
    setLoading(true);
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const response = await api.get("/users/me");
        const allowed = response.data?.GradeID === 1;
        if (cancelled) return;
        setAuthorized(allowed);
        setLoading(false);
      } catch (requestError) {
        if (!cancelled) {
          setAuthorized(false);
          setLoading(false);
        }
      }
    };
    initialize();
    return () => { cancelled = true; };
  }, [load]);

  const open = async (item) => {
    setOpeningId(item.id);
    setError("");
    try {
      const response = await api.get(`/ai-subtitles/admin/subtitles/${item.id}`);
      setWorkspace(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Impossible d'ouvrir l'éditeur temporel.");
    } finally {
      setOpeningId(null);
    }
  };

  const submitSearch = (event) => {
    event.preventDefault();
    const value = searchInput.trim();
    if (!value) {
      setHasSearched(false);
      setSearch("");
      setItems([]);
      setSelectedSubtitleIds({});
      setPagination({ page: 1, pageSize: 40, total: 0, totalPages: 1 });
      setWorkspace(null);
      setError("");
      return;
    }
    setHasSearched(true);
    setSearch(value);
    setWorkspace(null);
    load(1, value);
  };

  if (authorized === false) {
    return (
      <section className="mx-auto my-8 max-w-4xl rounded-2xl border border-amber-500/20 bg-amber-500/10 px-5 py-6 text-sm font-bold text-amber-800 dark:text-amber-200">
        Cette section est réservée au super administrateur.
      </section>
    );
  }

  return (
    <section ref={sectionRef} className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-fuchsia-500/15 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70">
      <header className="border-b border-fuchsia-500/15 bg-gradient-to-r from-fuchsia-500/15 via-violet-500/10 to-transparent px-5 py-5 sm:px-6">
        <p className="text-sm font-bold uppercase text-fuchsia-600 dark:text-fuchsia-300">Super administration</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Correction temporelle</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Ouvre un espace de montage intégré avec vidéo, timeline zoomable et poignées indépendantes. Le plein écran reste disponible à la demande.
        </p>
        <form onSubmit={submitSearch} className="mt-4 flex gap-2">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Rechercher une piste à corriger</span>
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Rechercher une vidéo" className="w-full rounded-lg border border-fuchsia-500/20 bg-white py-2 pl-10 pr-3 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 dark:bg-slate-950 dark:text-white" />
          </label>
          <button type="submit" className="rounded-lg bg-fuchsia-600 px-4 py-2 text-sm font-black text-white hover:bg-fuchsia-500">Rechercher</button>
        </form>
      </header>
      <div className="p-4 sm:p-5">
        {error && <p role="alert" className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm font-bold text-red-700 dark:text-red-200">{error}</p>}
        {!hasSearched && !loading ? (
          <p className="py-8 text-center text-sm font-semibold text-slate-500">Recherchez une vidéo pour afficher ses sous-titres IA.</p>
        ) : loading ? (
          <p className="py-8 text-center text-sm font-semibold text-slate-500">Chargement…</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-sm font-semibold text-slate-500">Aucune vidéo avec un sous-titre IA pour « {search} ».</p>
        ) : (
          <ul className="grid gap-3">
            {items.map((group) => {
              const selectedSubtitle = group.subtitles.find(
                (subtitle) => subtitle.id === Number(selectedSubtitleIds[group.video.id])
              ) || group.subtitles[0];
              const item = selectedSubtitle ? { ...selectedSubtitle, video: group.video } : null;
              if (!item) return null;
              return (
                <li key={group.video.id} className="flex min-w-0 flex-col gap-3 overflow-hidden rounded-xl border border-fuchsia-500/10 bg-white/70 p-4 dark:bg-slate-950/45 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 break-words text-sm font-black leading-5 text-slate-950 dark:text-white" title={group.video.title}>{group.video.title}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{group.video.seriesTitle ? `${group.video.seriesTitle} · saison ${group.video.seasonNumber}` : "Film"}</p>
                    <label className="mt-3 block text-xs font-black text-slate-600 dark:text-slate-300">
                      Sous-titre IA
                      <select
                        aria-label={`Sous-titre IA à corriger de ${group.video.title}`}
                        value={item.id}
                        onChange={(event) => setSelectedSubtitleIds((current) => ({
                          ...current,
                          [group.video.id]: Number(event.target.value),
                        }))}
                        className="mt-1 w-full rounded-lg border border-fuchsia-500/20 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 dark:bg-slate-950 dark:text-white"
                      >
                        {group.subtitles.map((subtitle) => (
                          <option key={subtitle.id} value={subtitle.id}>{subtitle.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button type="button" onClick={() => open(item)} disabled={openingId === item.id} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-2 text-sm font-black text-fuchsia-800 hover:bg-fuchsia-500/20 disabled:opacity-60 dark:text-fuchsia-100">
                    {openingId === item.id ? <ArrowPathIcon className="size-5 animate-spin" /> : <PencilSquareIcon className="size-5" />}
                    {openingId === item.id ? "Ouverture…" : "Corriger en direct"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {hasSearched && pagination.total > 0 && (
        <PaginationPage currentPage={pagination.page} totalPages={pagination.totalPages} totalItems={pagination.total} itemsPerPage={40} onPageChange={(page) => load(page, search)} scrollTarget={sectionRef} />
      )}
      {workspace && (
        <div className="px-4 pb-5 sm:px-5">
          <TimelineWorkspace
            initialSubtitle={workspace}
            onClose={() => setWorkspace(null)}
            onSaved={(saved) => setWorkspace(saved)}
          />
        </div>
      )}
    </section>
  );
};

export default SuperAdminAiSubtitleEditor;
