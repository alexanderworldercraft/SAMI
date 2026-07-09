import React, { useState, useEffect } from "react";
import Notification from "./Notification";
import { Listbox, ListboxButton, ListboxOptions, ListboxOption } from '@headlessui/react';
import { CheckIcon } from '@heroicons/react/20/solid';
import { ChevronUpDownIcon } from '@heroicons/react/16/solid';
import api from '../services/api';

const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "mb-2 block text-sm/6 font-bold text-slate-700 dark:text-slate-200";
const submitClass = "inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 dark:text-white";
const listboxOptionsClass = "z-[9999] max-h-72 w-[var(--button-width)] overflow-auto rounded-xl border border-sky-500/20 bg-white py-2 text-sm shadow-2xl shadow-sky-950/20 focus:outline-none dark:bg-slate-950 dark:text-slate-100";

const SeasonsManager = () => {
    const [series, setSeries] = useState([]);
    const [selectedSeries, setSelectedSeries] = useState(null);
    const [newSeasonNumber, setNewSeasonNumber] = useState("");
    const [notification, setNotification] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");

    const filteredSeries = series.filter((serie) =>
        (serie.Titre || "").toLowerCase().includes(searchTerm.toLowerCase())
    );

    useEffect(() => {
        const fetchSeries = async () => {
            try {
                const response = await api.get("/series");
                setSeries(Array.isArray(response.data) ? response.data : []);
            } catch (error) {
                console.error("Erreur lors de la récupération des séries :", error);
                setSeries([]);
            }
        };
        fetchSeries();
    }, []);

    const showNotification = (message, icon = "ℹ️", type = "success") => {
        setNotification({ message, icon, type });
        setTimeout(() => setNotification(null), 5000);
    };

    const handleAddSeason = async (e) => {
        e.preventDefault();

        if (!selectedSeries) {
            showNotification("Veuillez sélectionner une série.", "⚠️", "error");
            return;
        }

        try {
            const response = await api.post(`/series/${selectedSeries.SeriesID}/saisons`, {
                Numero: parseInt(newSeasonNumber, 10),
            });

            if (response.status >= 200 && response.status < 300) {
                showNotification("Saison ajoutée avec succès !", "✅", "success");
                setNewSeasonNumber("");
            } else {
                console.error("Erreur :", response.data);
                showNotification("Erreur lors de l'ajout de la saison.", "⚠️", "error");
            }
        } catch (error) {
            console.error("Erreur lors de l'ajout de la saison :", error.response?.data || error);
            showNotification("Erreur lors de l'ajout de la saison.", "⚠️", "error");
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
                    onClose={() => console.log('Notification fermée')}
                />
            )}

            <form onSubmit={handleAddSeason}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    <div>
                        <label className={labelClass}>Série</label>
                        <Listbox value={selectedSeries} onChange={setSelectedSeries}>
                            <div className="relative z-[60]">
                                <ListboxButton className={fieldClass}>
                                    <span>
                                        {selectedSeries ? selectedSeries.Titre : "Rechercher une série..."}
                                    </span>
                                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                                        <ChevronUpDownIcon className="h-5 w-5 text-sky-500 dark:text-sky-300" aria-hidden="true" />
                                    </span>
                                </ListboxButton>
                                <ListboxOptions anchor={{ to: "bottom start", gap: 8 }} className={listboxOptionsClass}>
                                    <div className="sticky top-0 z-10 bg-white px-3 pb-2 dark:bg-slate-950">
                                        <input
                                            type="text"
                                            placeholder="Rechercher une série..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full rounded-lg border border-sky-500/20 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 dark:bg-slate-900 dark:text-slate-100"
                                        />
                                    </div>
                                    {filteredSeries.length > 0 ? (
                                        filteredSeries.map((serie) => (
                                            <ListboxOption
                                                key={serie.SeriesID}
                                                value={serie}
                                                className={({ active, selected }) =>
                                                    `relative cursor-default select-none py-2.5 pl-10 pr-4 ${active ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300' : 'text-slate-700 dark:text-slate-200'
                                                    }`
                                                }
                                            >
                                                {({ selected }) => (
                                                    <>
                                                        <span className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}>
                                                            {serie.Titre}
                                                        </span>
                                                        {selected ? (
                                                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400">
                                                                <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                                            </span>
                                                        ) : null}
                                                    </>
                                                )}
                                            </ListboxOption>
                                        ))
                                    ) : (
                                        <div className="px-4 py-3 text-center text-slate-500">Aucune série trouvée</div>
                                    )}
                                </ListboxOptions>
                            </div>
                        </Listbox>
                    </div>

                    <div>
                        <label className={labelClass}>Saison</label>
                        <input
                            type="number"
                            value={newSeasonNumber}
                            onChange={(e) => setNewSeasonNumber(e.target.value)}
                            className={fieldClass}
                            required
                        />
                    </div>
                </div>
                <button type="submit" className={submitClass}>
                    Ajouter la saison
                </button>
            </form>
            </div>
        </section>
    );
};

export default SeasonsManager;
