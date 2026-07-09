import React, { useEffect, useMemo, useState } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/16/solid";
import api from "../services/api";
import Notification from "./Notification";

const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200";
const submitClass = "inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";
const listboxOptionsClass = "z-[9999] max-h-72 w-[var(--button-width)] overflow-auto rounded-xl border border-sky-500/20 bg-white py-2 text-sm shadow-2xl shadow-sky-950/20 focus:outline-none dark:bg-slate-950 dark:text-slate-100";

const SagaContentManager = () => {
  const [sagas, setSagas] = useState([]);
  const [videos, setVideos] = useState([]);
  const [series, setSeries] = useState([]);
  const [selectedSaga, setSelectedSaga] = useState(null);
  const [selectedContent, setSelectedContent] = useState(null);
  const [sagaSearch, setSagaSearch] = useState("");
  const [contentSearch, setContentSearch] = useState("");
  const [order, setOrder] = useState("");
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  const contents = useMemo(() => {
    const filmItems = videos
      .filter((video) => video.type === "film" || !video.SaisonID)
      .map((video) => ({
        key: `video-${video.VideoID}`,
        id: video.VideoID,
        type: "video",
        label: video.Titre,
        meta: `Film #${video.VideoID}`,
      }));

    const seriesItems = series.map((serie) => ({
      key: `series-${serie.SeriesID}`,
      id: serie.SeriesID,
      type: "series",
      label: serie.Titre,
      meta: `Série #${serie.SeriesID}`,
    }));

    return [...filmItems, ...seriesItems].sort((left, right) => left.label.localeCompare(right.label));
  }, [series, videos]);

  const filteredContents = useMemo(() => {
    const search = contentSearch.trim().toLowerCase();
    if (!search) return contents;

    return contents.filter((item) =>
      [item.label, item.meta, String(item.id)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [contentSearch, contents]);

  const filteredSagas = useMemo(() => {
    const search = sagaSearch.trim().toLowerCase();
    if (!search) return sagas;

    return sagas.filter((saga) =>
      [saga.Titre, String(saga.SagaID)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [sagaSearch, sagas]);

  const showNotification = (message, icon = "ℹ️", type = "success") => {
    setNotification({ message, icon, type });
  };

  useEffect(() => {
    const loadData = async () => {
      const [sagaResult, videoResult, seriesResult] = await Promise.allSettled([
        api.get("/sagas/admin"),
        api.get("/videos/admin"),
        api.get("/series"),
      ]);

      if (sagaResult.status === "fulfilled") {
        setSagas(Array.isArray(sagaResult.value.data) ? sagaResult.value.data : []);
      } else {
        console.error("Erreur lors du chargement admin des sagas :", sagaResult.reason);
        try {
          const fallbackResponse = await api.get("/sagas");
          const fallbackSagas = Array.isArray(fallbackResponse.data)
            ? fallbackResponse.data
            : Array.isArray(fallbackResponse.data?.items)
              ? fallbackResponse.data.items
              : [];
          setSagas(fallbackSagas);
        } catch (fallbackError) {
          console.error("Erreur lors du chargement public des sagas :", fallbackError);
          setSagas([]);
        }
      }

      if (videoResult.status === "fulfilled") {
        setVideos(Array.isArray(videoResult.value.data) ? videoResult.value.data : []);
      } else {
        console.error("Erreur lors du chargement des vidéos admin :", videoResult.reason);
        setVideos([]);
      }

      if (seriesResult.status === "fulfilled") {
        setSeries(Array.isArray(seriesResult.value.data) ? seriesResult.value.data : []);
      } else {
        console.error("Erreur lors du chargement des séries :", seriesResult.reason);
        setSeries([]);
      }

      if ([sagaResult, videoResult, seriesResult].some((result) => result.status === "rejected")) {
        showNotification("Certaines listes n'ont pas pu être chargées.", "⚠️", "error");
      }
    };

    loadData();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedSaga?.SagaID || !selectedContent?.id) {
      showNotification("Sélectionne une saga et un contenu.", "⚠️", "error");
      return;
    }

    setSaving(true);

    try {
      await api.post(`/sagas/${selectedSaga.SagaID}/contents`, {
        type: selectedContent.type,
        id: Number(selectedContent.id),
        Ordre: order ? Number(order) : undefined,
      });
      setSelectedContent(null);
      setSagaSearch("");
      setContentSearch("");
      setOrder("");
      showNotification("Contenu ajouté à la saga.", "✅", "success");
    } catch (error) {
      console.error("Erreur lors de l'ajout du contenu à la saga :", error);
      showNotification(error.response?.data?.error || "Impossible d'ajouter ce contenu.", "⚠️", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="relative overflow-visible rounded-2xl border border-sky-500/10 bg-white/70 p-6 shadow-sm dark:bg-slate-950/40 dark:text-neutral-100">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.08),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.06),transparent_22%)]" />
      <div className="relative z-10">
        {notification && (
          <Notification
            message={notification.message}
            type={notification.type}
            icon={notification.icon}
            duration={4000}
            onClose={() => setNotification(null)}
          />
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Sagas</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Ajouter un contenu à une saga</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Saga</label>
              <Listbox value={selectedSaga} onChange={setSelectedSaga}>
                <div className="relative z-[70]">
                  <ListboxButton className={`${fieldClass} text-left`}>
                    <span className="block truncate">{selectedSaga ? selectedSaga.Titre : "Choisir une saga..."}</span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                      <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
                    </span>
                  </ListboxButton>
                  <ListboxOptions anchor={{ to: "bottom start", gap: 8 }} className={listboxOptionsClass}>
                    <div className="sticky top-0 z-10 bg-white px-3 py-3 dark:bg-slate-950">
                      <input
                        type="text"
                        value={sagaSearch}
                        onChange={(event) => setSagaSearch(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        placeholder="Rechercher une saga..."
                        className="w-full rounded-lg border border-sky-500/20 bg-slate-50 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                    {filteredSagas.length > 0 ? (
                      filteredSagas.map((saga) => (
                        <ListboxOption
                          key={saga.SagaID}
                          value={saga}
                          className={({ active }) =>
                            `relative cursor-default select-none py-2.5 pl-10 pr-4 ${active ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"}`
                          }
                        >
                          {({ selected }) => (
                            <>
                              <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>{saga.Titre}</span>
                              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">#{saga.SagaID}</span>
                              {selected && <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400"><CheckIcon className="size-5" /></span>}
                            </>
                          )}
                        </ListboxOption>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Aucune saga trouvée.</div>
                    )}
                  </ListboxOptions>
                </div>
              </Listbox>
            </div>

            <div>
              <label className={labelClass}>Ordre dans la saga</label>
              <input type="number" min="1" value={order} onChange={(event) => setOrder(event.target.value)} className={fieldClass} placeholder="Auto si vide" />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Contenu</label>
              <Listbox value={selectedContent} onChange={setSelectedContent}>
                <div className="relative z-[60]">
                  <ListboxButton className={`${fieldClass} text-left`}>
                    <span className="block truncate">{selectedContent ? selectedContent.label : "Choisir un film ou une série..."}</span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                      <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
                    </span>
                  </ListboxButton>
                  <ListboxOptions anchor={{ to: "bottom start", gap: 8 }} className={listboxOptionsClass}>
                    <div className="sticky top-0 z-10 bg-white px-3 py-3 dark:bg-slate-950">
                      <input
                        type="text"
                        value={contentSearch}
                        onChange={(event) => setContentSearch(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        placeholder="Rechercher un film ou une série..."
                        className="w-full rounded-lg border border-sky-500/20 bg-slate-50 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                    {filteredContents.length > 0 ? (
                      filteredContents.map((item) => (
                        <ListboxOption
                          key={item.key}
                          value={item}
                          className={({ active }) =>
                            `relative cursor-default select-none py-2.5 pl-10 pr-4 ${active ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"}`
                          }
                        >
                          {({ selected }) => (
                            <>
                              <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>{item.label}</span>
                              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{item.meta}</span>
                              {selected && <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400"><CheckIcon className="size-5" /></span>}
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
          </div>

          <button type="submit" disabled={saving} className={`${submitClass} mt-5`}>
            {saving ? "Ajout..." : "Ajouter à la saga"}
          </button>
        </form>
      </div>
    </section>
  );
};

export default SagaContentManager;
