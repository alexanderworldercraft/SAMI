import React, { useState } from "react";

const AdminEncodingWorkerCard = ({ worker, saving, onSave, onAvailability }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const primary = worker.role === "primary";
  const beginEdit = () => {
    setDraft({ displayName: worker.displayName, performanceScore: worker.performanceScore || 1,
      maxNominalHeight: worker.maxNominalHeight, maxSlots: worker.maxSlots || 1 });
    setEditing(true);
  };
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    const saved = await onSave(worker, { displayName: draft.displayName.trim(),
      performanceScore: Number(draft.performanceScore), maxNominalHeight: Number(draft.maxNominalHeight),
      maxSlots: Number(draft.maxSlots) });
    if (saved) setEditing(false);
  };
  const status = worker.draining ? "Drainage" : !worker.enabled ? "Désactivé"
    : worker.status === "online" ? "En ligne" : "Hors ligne";
  const inputClass = "rounded-lg border border-violet-400/25 bg-white px-3 py-2 text-slate-900 dark:bg-slate-950 dark:text-white";
  return (
    <li className="rounded-xl border border-violet-400/20 bg-white/70 p-4 text-sm dark:bg-slate-950/45">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h5 className="font-black text-slate-900 dark:text-white">{worker.displayName}</h5>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{primary ? "Primary" : "Clone"} · {worker.id} · {status}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={saving} onClick={beginEdit} className="rounded-lg border border-violet-400/30 px-3 py-2 font-bold dark:text-slate-100" aria-label={`Modifier ${worker.displayName}`}>Modifier</button>
          <button type="button" disabled={saving} onClick={() => onAvailability(worker)} className="rounded-lg border border-violet-400/30 px-3 py-2 font-bold dark:text-slate-100">{worker.enabled ? "Désactiver" : "Activer"}</button>
        </div>
      </div>
      <p className="mt-3 text-slate-600 dark:text-slate-300">
        {worker.maxNominalHeight === 0 ? "Pas d’encodage" : `Résolution maximale : ${worker.maxNominalHeight}p`}
        {` · Priorité ${worker.performanceScore || 1} · ${worker.activeLeaseCount}/${worker.maxSlots || 1} slots`}
      </p>
      {primary && <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">La limite s’applique au multi-encodage. Après cinq minutes sans réponse des clones, le primary peut prendre le relais, même avec « Pas d’encodage ». L’encodage classique conserve son fonctionnement.</p>}
      {worker.lastError && <p className="mt-2 break-words text-xs text-red-600 dark:text-red-300">{worker.lastError}</p>}
      {editing && (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 dark:text-slate-100" aria-label={`Réglages de ${worker.displayName}`}>
          <label className="grid gap-1 font-bold">Nom affiché<input aria-label={`Nom de ${worker.id}`} className={inputClass} value={draft.displayName} onChange={(event) => update("displayName", event.target.value)} required maxLength={191} /></label>
          <label className="grid gap-1 font-bold">Priorité de performance<input aria-label={`Priorité de ${worker.id}`} className={inputClass} type="number" min="0.001" step="0.001" value={draft.performanceScore} onChange={(event) => update("performanceScore", event.target.value)} required /></label>
          <label className="grid gap-1 font-bold">Résolution maximale<select aria-label={`Résolution de ${worker.id}`} className={inputClass} value={draft.maxNominalHeight} onChange={(event) => update("maxNominalHeight", event.target.value)}>
            {primary && <option value="0">Pas d’encodage</option>}
            {[240, 360, 480, 720, 1080, 1440, 2160, 4320].map((height) => <option key={height} value={height}>{height}p</option>)}
          </select></label>
          <label className="grid gap-1 font-bold">Slots maximum<input aria-label={`Slots de ${worker.id}`} className={inputClass} type="number" min="1" max="32" step="1" value={draft.maxSlots} onChange={(event) => update("maxSlots", event.target.value)} required /></label>
          <div className="flex gap-2 sm:col-span-2">
            <button disabled={saving} className="rounded-lg bg-violet-500/15 px-4 py-2 font-black">Enregistrer les réglages</button>
            <button type="button" disabled={saving} onClick={() => setEditing(false)} className="rounded-lg border border-violet-400/30 px-4 py-2 font-bold">Annuler</button>
          </div>
        </form>
      )}
    </li>
  );
};

export default AdminEncodingWorkerCard;
