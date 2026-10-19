import React, { useId } from "react";

export default function PersonCharacterFields({ names, onChange, disabled = false }) {
  const id = useId();
  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">Personnages interprétés</legend>
      {names.map((name, index) => (
        <div key={index} className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`${id}-character-${index}`}>Personnage {index + 1}</label>
          <input
            id={`${id}-character-${index}`}
            value={name}
            maxLength={160}
            onChange={(event) => onChange(names.map((value, i) => i === index ? event.target.value : value))}
            className="min-w-0 flex-1 rounded-xl border border-sky-500/20 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950 dark:text-white"
          />
          <button type="button" onClick={() => onChange(names.filter((_, i) => i !== index))}
            aria-label={`Supprimer le personnage ${index + 1}`}
            className="rounded-lg px-3 py-2 text-sm font-bold text-rose-600 hover:bg-rose-500/10 dark:text-rose-300">
            Supprimer
          </button>
        </div>
      ))}
      <button type="button" disabled={names.length >= 50} onClick={() => onChange([...names, ""])}
        className="rounded-lg border border-sky-500/20 px-3 py-2 text-sm font-bold text-sky-700 hover:bg-sky-500/10 disabled:opacity-50 dark:text-sky-300">
        Ajouter un personnage
      </button>
      <p className="text-xs text-slate-500 dark:text-slate-400">Un champ par personnage. Laisse la liste vide si aucun nom n’est renseigné.</p>
    </fieldset>
  );
}
