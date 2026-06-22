import React, { useEffect, useMemo, useState } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/16/solid";
import api from "../services/api";
import Notification from "./Notification";

const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200";
const submitClass = "inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";
const listboxOptionsClass = "z-[9999] max-h-72 w-[var(--button-width)] overflow-auto rounded-xl border border-sky-500/20 bg-white py-2 text-sm shadow-2xl shadow-sky-950/20 focus:outline-none dark:bg-slate-950 dark:text-slate-100";

const UniverseSagaManager = () => {
  const [universes, setUniverses] = useState([]);
  const [sagas, setSagas] = useState([]);
  const [selectedUniverse, setSelectedUniverse] = useState(null);
  const [selectedSaga, setSelectedSaga] = useState(null);
  const [universeSearch, setUniverseSearch] = useState("");
  const [sagaSearch, setSagaSearch] = useState("");
  const [order, setOrder] = useState("");
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  const filteredSagas = useMemo(() => {
    const search = sagaSearch.trim().toLowerCase();
    if (!search) return sagas;

    return sagas.filter((saga) =>
      [saga.Titre, String(saga.SagaID)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [sagaSearch, sagas]);

  const filteredUniverses = useMemo(() => {
    const search = universeSearch.trim().toLowerCase();
    if (!search) return universes;

    return universes.filter((universe) =>
      [universe.Titre, String(universe.UniverseID)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [universeSearch, universes]);

  const showNotification = (message, icon = "ℹ️", type = "success") => {
    setNotification({ message, icon, type });
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [universeResponse, sagaResponse] = await Promise.all([
          api.get("/universes/admin"),
          api.get("/sagas/admin"),
        ]);
        setUniverses(Array.isArray(universeResponse.data) ? universeResponse.data : []);
        setSagas(Array.isArray(sagaResponse.data) ? sagaResponse.data : []);
      } catch (error) {
        console.error("Erreur lors du chargement des univers ou sagas :", error);
        showNotification("Impossible de charger les univers ou sagas.", "⚠️", "error");
      }
    };

    loadData();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedUniverse?.UniverseID || !selectedSaga?.SagaID) {
      showNotification("Sélectionne un univers et une saga.", "⚠️", "error");
      return;
    }

    setSaving(true);

    try {
      await api.post(`/universes/${selectedUniverse.UniverseID}/sagas`, {
        SagaID: Number(selectedSaga.SagaID),
        Ordre: order ? Number(order) : undefined,
      });
      setSelectedSaga(null);
      setUniverseSearch("");
      setSagaSearch("");
      setOrder("");
      showNotification("Saga ajoutée à l'univers.", "✅", "success");
    } catch (error) {
      console.error("Erreur lors de l'ajout de la saga à l'univers :", error);
      showNotification(error.response?.data?.error || "Impossible d'ajouter cette saga.", "⚠️", "error");
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
            <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Univers</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Ajouter une saga à un univers</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelClass}>Univers</label>
              <Listbox value={selectedUniverse} onChange={setSelectedUniverse}>
                <div className="relative z-[70]">
                  <ListboxButton className={`${fieldClass} text-left`}>
                    <span className="block truncate">{selectedUniverse ? selectedUniverse.Titre : "Choisir un univers..."}</span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                      <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
                    </span>
                  </ListboxButton>
                  <ListboxOptions anchor={{ to: "bottom start", gap: 8 }} className={listboxOptionsClass}>
                    <div className="sticky top-0 z-10 bg-white px-3 py-3 dark:bg-slate-950">
                      <input
                        type="text"
                        value={universeSearch}
                        onChange={(event) => setUniverseSearch(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        placeholder="Rechercher un univers..."
                        className="w-full rounded-lg border border-sky-500/20 bg-slate-50 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                    {filteredUniverses.length > 0 ? (
                      filteredUniverses.map((universe) => (
                        <ListboxOption
                          key={universe.UniverseID}
                          value={universe}
                          className={({ active }) =>
                            `relative cursor-default select-none py-2.5 pl-10 pr-4 ${active ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"}`
                          }
                        >
                          {({ selected }) => (
                            <>
                              <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>{universe.Titre}</span>
                              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">#{universe.UniverseID}</span>
                              {selected && <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400"><CheckIcon className="size-5" /></span>}
                            </>
                          )}
                        </ListboxOption>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Aucun univers trouvé.</div>
                    )}
                  </ListboxOptions>
                </div>
              </Listbox>
            </div>

            <div>
              <label className={labelClass}>Ordre dans l'univers</label>
              <input type="number" min="1" value={order} onChange={(event) => setOrder(event.target.value)} className={fieldClass} placeholder="Auto si vide" />
            </div>

            <div className="md:col-span-2">
              <label className={labelClass}>Saga</label>
              <Listbox value={selectedSaga} onChange={setSelectedSaga}>
                <div className="relative z-[60]">
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
          </div>

          <button type="submit" disabled={saving} className={`${submitClass} mt-5`}>
            {saving ? "Ajout..." : "Ajouter à l'univers"}
          </button>
        </form>
      </div>
    </section>
  );
};

export default UniverseSagaManager;
