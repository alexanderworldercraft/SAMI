import React, { useId } from "react";

export const voiceModeLabel = mode => ({ natural: "Naturelle", faithful: "Fidèle à l’original" }[mode] || "Profil historique");

export default function VoiceModeSelect({ value, onChange, allowLegacy = false }) {
  const helpId = useId();
  return <div className="grid gap-2 text-sm">
    <label className="grid gap-2 font-semibold">Mode vocal
      <select value={value} onChange={event => onChange(event.target.value)} aria-describedby={helpId}
        className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-white">
        {allowLegacy && <option value="">Profil historique</option>}
        <option value="faithful">Fidèle à l’original</option>
        <option value="natural">Naturelle</option>
      </select>
    </label>
    <p id={helpId} className="text-xs font-normal text-slate-600 dark:text-slate-300">
      {value === "faithful"
        ? "Cherche à reproduire le rendu de l’extrait, intonations et effets compris. La reproduction exacte des effets n’est pas garantie."
        : value === "natural"
          ? "Privilégie l’identité vocale avec une interprétation plus libre."
          : "Conserve le comportement utilisé lors de cette ancienne génération."}
    </p>
  </div>;
}
