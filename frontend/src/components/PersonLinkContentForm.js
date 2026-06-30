// src/components/PersonLinkContentForm.js
import React, { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { Listbox, ListboxButton, ListboxOptions, ListboxOption } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/16/solid";

const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200";
const submitClass = "inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";
const listboxOptionsClass = "z-[9999] max-h-72 w-[var(--button-width)] overflow-auto rounded-xl border border-sky-500/20 bg-white py-2 text-sm shadow-2xl shadow-sky-950/20 focus:outline-none dark:bg-slate-950 dark:text-slate-100";

/**
 * Lier un contenu (film OU série) à une personne.
 * - Dropdown HeadlessUI + barre de recherche (filtrage FRONT)
 * - Déduit le type API depuis le contenu sélectionné
 *
 * Props
 *  - personId: number
 *  - onLinked?: (payload) => void
 */
export default function PersonLinkContentForm({ personId, onLinked }) {
  // ---------------- Hooks (jamais conditionnels)
  const [user, setUser] = useState(null);

  // Données chargées
  const [videos, setVideos] = useState([]);
  const [series, setSeries] = useState([]);

  // UI dropdown + recherche
  const [searchTerm, setSearchTerm] = useState("");
  const [fetching, setFetching] = useState(false);

  // Sélection finale
  const [selectedContent, setSelectedContent] = useState(null);

  // Rôles
  const [EstActeur, setEstActeur] = useState(true);
  const [EstRealisateur, setEstRealisateur] = useState(false);

  // Soumission
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // --------- Auth/Grade
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/users/me");
        setUser(data);
      } catch {
        setUser(null);
      }
    })();
  }, []);
  const canEdit = user && (user.GradeID === 1 || user.GradeID === 2);

  // --------- Chargement des contenus disponibles
  useEffect(() => {
    if (!canEdit) return;

    const loadLists = async () => {
      try {
        setFetching(true);
        const [videoResponse, seriesResponse] = await Promise.all([
          api.get("/videos/admin"),
          api.get("/series"),
        ]);
        setVideos(Array.isArray(videoResponse.data) ? videoResponse.data : []);
        setSeries(Array.isArray(seriesResponse.data) ? seriesResponse.data : []);
      } catch (e) {
        console.error("Erreur de chargement (videos/series):", e);
        setMsg({ type: "error", text: "Impossible de charger les contenus." });
      } finally {
        setFetching(false);
      }
    };

    loadLists();
  }, [canEdit]);

  const contents = useMemo(() => {
    const videoItems = videos
      .filter((video) => video.SaisonID === null || video.SaisonID === undefined)
      .map((video) => ({
        key: `video-${video.VideoID}`,
        id: video.VideoID,
        type: "video",
        label: video.Titre,
        meta: `Film #${video.VideoID}`,
        SaisonID: video.SaisonID ?? null,
      }));

    const seriesItems = series.map((serie) => ({
      key: `series-${serie.SeriesID}`,
      id: serie.SeriesID,
      type: "series",
      label: serie.Titre,
      meta: `Série #${serie.SeriesID}`,
      SaisonID: null,
    }));

    return [...videoItems, ...seriesItems].sort((left, right) =>
      (left.label || "").localeCompare(right.label || "")
    );
  }, [series, videos]);

  const filteredContents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return contents;

    return contents.filter((item) =>
      [item.label, item.meta, String(item.id)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [contents, searchTerm]);

  // --------- Validation + submit
  const valid = !!selectedContent?.id && (EstActeur || EstRealisateur);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!valid) {
      setMsg({ type: "error", text: "Choisis un contenu et au moins un rôle." });
      return;
    }
    try {
      setLoading(true);
      setMsg(null);
      await api.post(`/people/${personId}/link`, {
        type: selectedContent.type,
        contenuId: selectedContent.id,
        EstActeur,
        EstRealisateur,
      });
      setMsg({ type: "success", text: "Lien créé." });
      if (onLinked) onLinked({ type: selectedContent.type, contenuId: selectedContent.id, EstActeur, EstRealisateur });
    } catch (e) {
      console.error(e);
      setMsg({ type: "error", text: "Échec de la liaison." });
    } finally {
      setLoading(false);
    }
  };

  // --------- Rendu
  if (!canEdit) return null;

  return (
    <section className="mt-5 relative overflow-visible rounded-2xl border border-sky-500/10 bg-white/70 p-5 shadow-sm dark:bg-slate-950/40 dark:text-neutral-100">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.08),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.06),transparent_22%)]" />
      <div className="relative z-10">
        <div className="mb-5">
          <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Personnes</p>
          <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Lier un film ou une série</h3>
        </div>

        {msg && (
          <div className={`mb-4 rounded-lg border px-4 py-3 text-sm font-semibold ${
            msg.type === "success"
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-red-400/40 bg-red-500/10 text-red-700 dark:text-red-300"
          }`}>
            {msg.text}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className={labelClass}>Film ou série</label>

            <Listbox value={selectedContent} onChange={setSelectedContent}>
              <div className="relative z-[60]">
                <ListboxButton className={`${fieldClass} text-left`}>
                  <span className="block truncate">
                    {selectedContent ? selectedContent.label : "Choisir un film ou une série..."}
                  </span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" aria-hidden="true" />
                  </span>
                </ListboxButton>

                <ListboxOptions anchor={{ to: "bottom start", gap: 8 }} className={listboxOptionsClass}>
                  <div className="sticky top-0 z-10 bg-white px-3 py-3 dark:bg-slate-950">
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      onKeyDown={(event) => event.stopPropagation()}
                      placeholder="Rechercher un film ou une série..."
                      className="w-full rounded-lg border border-sky-500/20 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>

                  {fetching ? (
                    <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Chargement...</div>
                  ) : filteredContents.length > 0 ? (
                    filteredContents.map((item) => (
                      <ListboxOption
                        key={item.key}
                        value={item}
                        className={({ active }) =>
                          `relative cursor-default select-none py-2.5 pl-10 pr-4 ${
                            active ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"
                          }`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>{item.label}</span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{item.meta}</span>
                            {selected && (
                              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400">
                                <CheckIcon className="size-5" aria-hidden="true" />
                              </span>
                            )}
                          </>
                        )}
                      </ListboxOption>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Aucun film ou série trouvé.</div>
                  )}
                </ListboxOptions>
              </div>
            </Listbox>
          </div>

          {/* Rôles */}
          <div>
            <span className={labelClass}>Rôle</span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 rounded-lg border border-sky-500/20 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-950/55 dark:text-slate-200">
                <input type="checkbox" checked={EstActeur} onChange={(e) => setEstActeur(e.target.checked)} className="size-4 accent-sky-500" />
                Acteur
              </label>
              <label className="inline-flex items-center gap-2 rounded-lg border border-sky-500/20 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 dark:bg-slate-950/55 dark:text-slate-200">
                <input type="checkbox" checked={EstRealisateur} onChange={(e) => setEstRealisateur(e.target.checked)} className="size-4 accent-sky-500" />
                Réalisateur
              </label>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!valid || loading}
            className={submitClass}
          >
            {loading ? "Enregistrement..." : "Lier à cette personne"}
          </button>
        </form>
      </div>
    </section>
  );
}
