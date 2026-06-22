import React, { useEffect, useMemo, useState } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { XMarkIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import PaginationPage from "./PaginationPage";
import VideoList from "./VideoList";

const apiUrl = process.env.REACT_APP_URL_LOCAL;
const ITEMS_PER_PAGE = 40;
const sortOptions = [
  { id: "az", label: "A-Z" },
  { id: "za", label: "Z-A" },
  { id: "recent", label: "Plus récent" },
  { id: "ancien", label: "Plus ancien" },
];
const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const listboxOptionsClass = "z-[9999] max-h-72 w-[var(--button-width)] overflow-auto rounded-xl border border-sky-500/20 bg-white py-2 text-sm shadow-2xl shadow-sky-950/20 focus:outline-none dark:bg-slate-950 dark:text-slate-100";

const getImageUrl = (cheminImage) => {
  if (cheminImage) return `${apiUrl}/${cheminImage}`;
  return "./imageDefault.png";
};

const SagaListPage = () => {
  const [sagas, setSagas] = useState([]);
  const [selectedSaga, setSelectedSaga] = useState(null);
  const [sagaDetails, setSagaDetails] = useState(null);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [sort, setSort] = useState("az");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState("");

  const modalContents = useMemo(
    () => (Array.isArray(sagaDetails?.Contents) ? sagaDetails.Contents : []),
    [sagaDetails]
  );
  const selectedSort = sortOptions.find((option) => option.id === sort) || sortOptions[0];

  const fetchSagas = async (page = 1) => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get("/sagas", {
        params: {
          page,
          limit: ITEMS_PER_PAGE,
          search: appliedSearch,
          sort,
        },
      });
      setSagas(response.data?.items || []);
      setTotalItems(response.data?.totalItems || 0);
      setTotalPages(response.data?.totalPages || 1);
      setCurrentPage(page);
    } catch (err) {
      console.error("Erreur lors de la récupération des sagas :", err);
      setError(err.response?.data?.error || "Impossible de récupérer les sagas.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSagas(1);
  }, [appliedSearch, sort]);

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

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    setAppliedSearch(search.trim());
  };

  return (
    <div className="container mx-auto px-4 py-10 dark:text-white sm:px-6 lg:px-8">
      <div className="relative z-30 mb-8 overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 p-5 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.12),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.10),transparent_22%)]" />
        <form onSubmit={handleSearchSubmit} className="relative grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_auto]">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une saga..."
            className={fieldClass}
          />
          <Listbox value={selectedSort} onChange={(option) => setSort(option.id)}>
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
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 dark:text-white"
          >
            Rechercher
          </button>
        </form>
      </div>

      {error && <p className="mb-6 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">{error}</p>}

      {loading ? (
        <p className="text-center text-neutral-400">Chargement en cours...</p>
      ) : sagas.length === 0 ? (
        <p className="text-center text-neutral-400">Aucune saga.</p>
      ) : (
        <div className="container mx-auto grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-8">
          {sagas.map((saga) => (
            <button
              key={saga.SagaID}
              type="button"
              onClick={() => openSaga(saga)}
              className="group text-left transition duration-300 hover:-translate-y-2"
            >
              <div className="min-h-max h-max max-h-max">
                <div className="relative mb-2 overflow-hidden rounded-xl border border-neutral-400 bg-gradient-to-br from-slate-950 to-slate-900 transition duration-300 ease-in-out group-hover:border-blue-500">
                  <img
                    src={getImageUrl(saga.CheminImage)}
                    alt={saga.Titre}
                    className="aspect-2/3 h-full w-full object-cover duration-300 group-hover:scale-110"
                  />
                  {saga.Premium && (
                    <span className="absolute left-2 top-2 z-10 inline-flex max-w-[calc(100%-1rem)] items-center rounded-full border border-amber-200/40 bg-gradient-to-br from-amber-300/95 via-yellow-400/95 to-orange-400/95 px-2.5 py-1 text-[10px] font-black uppercase leading-tight text-slate-950 shadow-inner shadow-amber-950/45 ring-1 ring-amber-100/30">
                      Premium
                    </span>
                  )}
                  <div className="absolute inset-0 px-4 py-2 opacity-0 duration-300 group-hover:bg-neutral-950/50 group-hover:opacity-100 group-hover:backdrop-blur-2xl">
                    <p className="line-clamp-15 text-xs text-neutral-50">{saga.Resumer}</p>
                  </div>
                </div>
                <p className="px-2 py-1 text-center text-sm font-bold capitalize text-slate-900 line-clamp-2 dark:text-neutral-300">
                  {saga.Titre}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <PaginationPage
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={fetchSagas}
      />

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
