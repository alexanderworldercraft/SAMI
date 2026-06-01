import React, { useState } from "react";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";

/**
 * Tri disponible:
 *  - "az"      => A-Z (par titre)
 *  - "za"      => Z-A (par titre)
 *  - "recent"  => Récent -> Ancien (CreateDate desc; null = très ancien)
 *  - "ancien"  => Ancien -> Récent (CreateDate asc; null = très ancien en premier)
 *  - "most"    => Regardé le plus (logs / points)
 *  - "least"   => Regardé le moins (logs / points)
 */
// const OPTIONS = [
//   { value: "az",     label: "A-Z" },
//   { value: "za",     label: "Z-A" },
//   { value: "recent", label: "Récent → Ancien" },
//   { value: "ancien", label: "Ancien → Récent" },
//   { value: "most",   label: "Regardé le plus" },
//   { value: "least",  label: "Regardé le moins" },
// ];
const OPTIONS = [
  { value: "az",     label: "Titre — A → Z" },
  { value: "za",     label: "Titre — Z → A" },

  { value: "recent", label: "Ajout — plus récent" },
  { value: "ancien", label: "Ajout — plus ancien" },

  { value: "most",   label: "Popularité — la plus vue" },
  { value: "least",  label: "Popularité — la moins vue" },
];

const SortDropdown = ({ sort, setSort }) => {
  const [open, setOpen] = useState(false);

  const current = OPTIONS.find(o => o.value === sort) || OPTIONS[0];

  const handlePick = (value) => {
    setSort(value);     // on propage la valeur au parent
    setOpen(false);     // on ferme le menu
  };

  return (
    <div className="w-full">
      <label className="mb-2 block text-sm/6 font-bold text-slate-700 dark:text-slate-200">
        Tri
      </label>

      <div className={open ? "relative z-[100]" : "relative z-0"}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 hover:bg-sky-500/10 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white dark:shadow-sky-950/20"
        >
          <span className="truncate">{current.label}</span>
          <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
        </button>

        {open && (
          <div className="absolute z-[9999] mt-2 w-full overflow-hidden rounded-xl border border-sky-500/20 bg-white text-sm shadow-2xl shadow-sky-950/20 dark:bg-slate-950 dark:text-slate-100">
            {OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => handlePick(opt.value)}
                className={`w-full px-4 py-2.5 text-left transition duration-150 hover:bg-sky-500/10 ${
                  sort === opt.value ? "bg-sky-500/15 font-black text-sky-700 dark:text-sky-300" : "font-semibold"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SortDropdown;
