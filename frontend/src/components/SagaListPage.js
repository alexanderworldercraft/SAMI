import React, { useEffect, useMemo, useRef, useState } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { XMarkIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import PaginationPage from "./PaginationPage";
import VideoList from "./VideoList";

const ITEMS_PER_PAGE = 8;
const sortOptions = [
  { id: "az", label: "A-Z" },
  { id: "za", label: "Z-A" },
  { id: "recent", label: "Plus récent" },
  { id: "ancien", label: "Plus ancien" },
];
const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const listboxOptionsClass = "z-[9999] max-h-72 w-[var(--button-width)] overflow-auto rounded-xl border border-sky-500/20 bg-white py-2 text-sm shadow-2xl shadow-sky-950/20 focus:outline-none dark:bg-slate-950 dark:text-slate-100";

const SagaListPage = () => {
  const [universes, setUniverses] = useState([]);
  const [selectedSaga, setSelectedSaga] = useState(null);
  const [sagaDetails, setSagaDetails] = useState(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("az");
  const [universePages, setUniversePages] = useState({});
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");
  const sectionRefs = useRef({});

  const modalContents = useMemo(
    () => (Array.isArray(sagaDetails?.Contents) ? sagaDetails.Contents : []),
    [sagaDetails]
  );
  const selectedSort = sortOptions.find((option) => option.id === sort) || sortOptions[0];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const fetchUniverses = async () => {
        setLoading(true);
        setError("");

        try {
          const response = await api.get("/universes", {
            params: {
              search: search.trim(),
              sort,
            },
          });
          setUniverses(response.data?.items || []);
        } catch (err) {
          console.error("Erreur lors de la récupération des univers :", err);
          setError(err.response?.data?.error || "Impossible de récupérer les univers.");
        } finally {
          setLoading(false);
        }
      };

      fetchUniverses();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [search, sort]);

  useEffect(() => {
    const targetId = decodeURIComponent(window.location.hash.replace(/^#/, ""));
    if (!targetId || !universes.some((universe) => `universe-${universe.UniverseID}` === targetId)) return;

    const animationFrame = window.requestAnimationFrame(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [universes]);

  const openSaga = async (saga) => {
    setSelectedSaga(saga);
    setSagaDetails(null);
    setDetailsLoading(true);

    try {
      const response = await api.get(`/sagas/${saga.SagaID}`);
      setSagaDetails(response.data);
    } catch (err) {
      console.error("Erreur lors de la récupération de la saga :", err);
      setError(err.response?.data?.error || "Impossible de charger cette saga.");
      setSelectedSaga(null);
    } finally {
      setDetailsLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-10 dark:text-white">
      <div className="relative z-30 mb-8 overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 p-5 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.12),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.10),transparent_22%)]" />
        <div className="relative grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
          <input
            type="text"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setUniversePages({});
            }}
            placeholder="Rechercher un univers, une saga, un film ou une série..."
            className={fieldClass}
          />
          <Listbox
            value={selectedSort}
            onChange={(option) => {
              setSort(option.id);
              setUniversePages({});
            }}
          >
            <div className="relative z-[60] min-w-44">
              <ListboxButton className={`${fieldClass} text-left`}>
                <span className="block truncate">{selectedSort.label}</span>
                <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                  <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
                </span>
              </ListboxButton>
              <ListboxOptions anchor={{ to: "bottom start", gap: 8 }} className={listboxOptionsClass}>
                {sortOptions.map((option) => (
                  <ListboxOption
                    key={option.id}
                    value={option}
                    className={({ active }) =>
                      `relative cursor-default select-none py-2.5 pl-10 pr-4 ${active ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"}`
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>{option.label}</span>
                        {selected && <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400"><CheckIcon className="size-5" /></span>}
                      </>
                    )}
                  </ListboxOption>
                ))}
              </ListboxOptions>
            </div>
          </Listbox>
        </div>
      </div>

      {error && <p className="mb-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">{error}</p>}

      {loading ? (
        <p className="text-center text-neutral-400">Chargement en cours...</p>
      ) : universes.length === 0 ? (
        <p className="text-center text-neutral-400">Aucun univers avec contenu.</p>
      ) : (
        <div className="grid gap-6">
          {universes.map((universe) => {
            const universeItems = Array.isArray(universe.Items)
              ? universe.Items
              : Array.isArray(universe.Sagas)
                ? universe.Sagas
                : [];
            const universeKey = String(universe.UniverseID);
            const currentUniversePage = universePages[universeKey] || 1;
            const universeTotalPages = Math.max(1, Math.ceil(universeItems.length / ITEMS_PER_PAGE));
            const paginatedItems = universeItems.slice(
              (currentUniversePage - 1) * ITEMS_PER_PAGE,
              currentUniversePage * ITEMS_PER_PAGE
            );

            return (
              <section
                key={universe.UniverseID}
                id={`universe-${universe.UniverseID}`}
                aria-labelledby={`universe-title-${universe.UniverseID}`}
                ref={(element) => {
                  if (element) {
                    sectionRefs.current[universeKey] = element;
                  } else {
                    delete sectionRefs.current[universeKey];
                  }
                }}
                className="scroll-mt-24 overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 p-5 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20"
              >
                <div className="mb-4">
                  <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Univers</p>
                  <h2 id={`universe-title-${universe.UniverseID}`} className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{universe.Titre}</h2>
                  {universe.Resume && (
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{universe.Resume}</p>
                  )}
                </div>
                <div className="[&_.container]:w-full">
                  <VideoList videos={paginatedItems} onItemClick={openSaga} />
                </div>
                {universeItems.length > ITEMS_PER_PAGE && (
                  <div className="mt-6">
                    <PaginationPage
                      currentPage={currentUniversePage}
                      totalPages={universeTotalPages}
                      totalItems={universeItems.length}
                      itemsPerPage={ITEMS_PER_PAGE}
                      onPageChange={(page) =>
                        setUniversePages((current) => ({
                          ...current,
                          [universeKey]: page,
                        }))
                      }
                      scrollTarget={() => sectionRefs.current[universeKey]}
                      scrollOffset={16}
                    />
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {selectedSaga && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur">
          <div className="max-h-full w-full max-w-6xl overflow-y-auto rounded-2xl border border-sky-500/10 bg-white shadow-2xl dark:bg-slate-950 dark:text-white">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-sky-500/10 bg-white/95 px-6 py-5 backdrop-blur dark:bg-slate-950/95">
              <div>
                <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Saga</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{selectedSaga.Titre}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSaga(null)}
                className="rounded-lg border border-slate-300/60 p-2 text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <XMarkIcon className="size-5" />
              </button>
            </div>
            <div className="p-6">
              {detailsLoading ? (
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">Chargement...</p>
              ) : modalContents.length === 0 ? (
                <p className="rounded-xl border border-sky-500/10 bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  Aucun contenu dans cette saga.
                </p>
              ) : (
                <VideoList videos={modalContents} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SagaListPage;
