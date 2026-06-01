import React, { useState, useEffect } from "react";
import { Listbox, ListboxButton, ListboxOptions, ListboxOption } from '@headlessui/react';
import { ChevronUpDownIcon } from '@heroicons/react/16/solid';
import { CheckIcon } from '@heroicons/react/20/solid';

const listboxButtonClass = "w-full cursor-default rounded-xl border border-sky-500/20 bg-white/85 py-3 pl-4 pr-10 text-left text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const listboxOptionsClass = "absolute z-[9999] mt-2 max-h-72 w-full overflow-auto rounded-xl border border-sky-500/20 bg-white py-2 text-sm shadow-2xl shadow-sky-950/20 focus:outline-none dark:bg-slate-950 dark:text-slate-100";
const labelClass = "mb-2 block text-sm/6 font-bold text-slate-700 dark:text-slate-200";

const SeriesAndSeasonSelector = ({ selectedSeries, setSelectedSeries, selectedSeason, setSelectedSeason }) => {
  const [series, setSeries] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchSeriesWithSeasons = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_URL_LOCAL}/api/series`);
        const data = await response.json();

        const seriesWithSeasons = await Promise.all(
          data.map(async (serie) => {
            try {
              const seasonsRes = await fetch(`${process.env.REACT_APP_URL_LOCAL}/api/series/${serie.SeriesID}/saisons`);
              const seasonsData = await seasonsRes.json();
              return { ...serie, hasSeasons: Array.isArray(seasonsData) && seasonsData.length > 0 };
            } catch {
              return { ...serie, hasSeasons: false };
            }
          })
        );

        setSeries(seriesWithSeasons);
      } catch (error) {
        console.error("Erreur lors de la récupération des séries :", error);
      }
    };

    fetchSeriesWithSeasons();
  }, []);

  useEffect(() => {
    if (selectedSeries?.SeriesID) {
      const fetchSeasons = async () => {
        try {
          const response = await fetch(`${process.env.REACT_APP_URL_LOCAL}/api/series/${selectedSeries.SeriesID}/saisons`);
          const data = await response.json();
          setSeasons(data);
        } catch (error) {
          console.error("Erreur lors de la récupération des saisons :", error);
        }
      };

      fetchSeasons();
    } else {
      setSeasons([]);
    }
  }, [selectedSeries]);

  const filteredSeries = series.filter((s) =>
    s.Titre.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="grid grid-cols-1 gap-4">
      <div>
        <label className={labelClass}>Série</label>
        <Listbox value={selectedSeries} onChange={setSelectedSeries}>
          <div className="relative z-[60]">
            <ListboxButton className={listboxButtonClass}>
              <span className="block truncate">
                {selectedSeries ? selectedSeries.Titre : "Rechercher une série..."}
              </span>
              <span className="absolute inset-y-0 right-0 flex items-center pr-2">
                <ChevronUpDownIcon className="h-5 w-5 text-sky-500 dark:text-sky-300" aria-hidden="true" />
              </span>
            </ListboxButton>
            <ListboxOptions className={listboxOptionsClass}>
              <div className="sticky top-0 z-10 bg-white px-3 pb-2 dark:bg-slate-950">
                <input
                  type="text"
                  placeholder="Filtrer par titre..."
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
                    disabled={!serie.hasSeasons}
                    className={({ active, disabled }) =>
                      `relative cursor-default select-none py-2 pl-10 pr-4 ${
                        disabled ? "text-slate-400 italic" :
                        active ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"
                      }`
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>
                          {serie.Titre}
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400">
                            <CheckIcon className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
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

      {selectedSeries && (
        <div>
          <label className={labelClass}>Saison</label>
          <Listbox value={selectedSeason} onChange={setSelectedSeason}>
            <div className="relative z-50">
              <ListboxButton className={listboxButtonClass}>
                <span className="block truncate">
                  {selectedSeason
                    ? `Saison ${seasons.find((s) => s.SaisonID === selectedSeason)?.Numero}`
                    : "Sélectionner une saison"}
                </span>
                <span className="absolute inset-y-0 right-0 flex items-center pr-2">
                  <ChevronUpDownIcon className="h-5 w-5 text-sky-500 dark:text-sky-300" aria-hidden="true" />
                </span>
              </ListboxButton>
              <ListboxOptions className={listboxOptionsClass}>
                <ListboxOption value={""} className="cursor-default select-none py-2.5 pl-10 pr-4 text-slate-700 dark:text-slate-200">
                  Aucune
                </ListboxOption>
                {seasons.map((season) => (
                  <ListboxOption
                    key={season.SaisonID}
                    value={season.SaisonID}
                    className={({ active }) =>
                      `relative cursor-default select-none py-2 pl-10 pr-4 ${
                        active ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"
                      }`
                    }
                  >
                    {({ selected }) => (
                      <>
                        <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>
                          Saison {season.Numero}
                        </span>
                        {selected && (
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400">
                            <CheckIcon className="h-5 w-5" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </ListboxOption>
                ))}
              </ListboxOptions>
            </div>
          </Listbox>
        </div>
      )}
    </div>
  );
};

export default SeriesAndSeasonSelector;
