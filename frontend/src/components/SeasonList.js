import React from "react";
import { ChevronDownIcon } from '@heroicons/react/16/solid';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

const SeasonList = ({ seasons, currentSeason, onSeasonChange }) => {
  return (
    <div>
      {/* Version mobile : Select */}
      <div className="grid grid-cols-1 sm:hidden relative">
        <select
          defaultValue={currentSeason?.Numero}
          aria-label="Sélectionner une saison"
          onChange={(e) => {
            const selected = seasons.find(season => season.Numero === parseInt(e.target.value));
            if (selected) onSeasonChange(selected);
          }}
          className="w-full appearance-none rounded-md bg-white py-2 pl-3 pr-8 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-sky-600"
        >
          {seasons.map((season) => (
            <option key={season.Numero} value={season.Numero}>
              Saison {season.Numero} ({season.Episodes?.length || 0})
            </option>
          ))}
        </select>
        <ChevronDownIcon
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-2.5 size-5 fill-gray-500"
        />
      </div>

      {/* Version desktop : Tabs */}
      <div className="hidden sm:block">
        <div className="border-b border-gray-700">
          <nav className="-mb-px flex flex-wrap gap-4" aria-label="Tabs">
            {seasons.map((season) => {
              const isCurrent = currentSeason?.Numero === season.Numero;
              return (
                <button
                  key={season.Numero}
                  onClick={() => onSeasonChange(season)}
                  className={classNames(
                    isCurrent
                      ? 'border-sky-500 text-sky-300'
                      : 'border-transparent text-neutral-400 hover:border-gray-500 hover:dark:text-white',
                    'flex items-center border-b-2 px-4 py-2 text-sm font-semibold'
                  )}
                >
                  Saison {season.Numero}
                  <span className={classNames(
                    isCurrent ? 'bg-sky-800 text-white' : 'bg-neutral-800 text-neutral-300',
                    'ml-3 rounded-full px-2 py-0.5 text-xs font-medium'
                  )}>
                    {season.Episodes?.length || 0}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
};

export default SeasonList;