import React, { useState } from "react";
import api from "../services/api";
import { formatCreditTime, parseCreditTime } from "../utils/videoCredits";

const buttonClass = "rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-800 dark:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 hover:bg-sky-500/25 disabled:opacity-40";
const statusLabels = { PENDING: "En attente", APPROVED: "Validé", REJECTED: "Refusé" };

export function CreditEditor({ segment, videoId, videoElement, canModerate, onSaved, onCancel }) {
  const [start, setStart] = useState(formatCreditTime(segment?.Start));
  const [end, setEnd] = useState(formatCreditTime(segment?.End));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async status => {
    const Start = parseCreditTime(start), End = parseCreditTime(end);
    if (status !== "REJECTED" && (!Number.isFinite(Start) || !Number.isFinite(End) || End <= Start)) {
      setError("Saisissez des timecodes HH:MM:SS avec une fin après le début."); return;
    }
    setBusy(true); setError("");
    try {
      const body = status === "REJECTED" ? { Status: status } : { Start, End, ...(status ? { Status: status } : {}) };
      if (segment) await api.patch(`/videos/${videoId}/credits/${segment.ID}`, body);
      else await api.post(`/videos/${videoId}/credits`, body);
      await onSaved();
    } catch (err) { setError(err.response?.data?.error || "Enregistrement impossible."); }
    finally { setBusy(false); }
  };
  return <div className="mt-3 space-y-3 rounded-xl border border-sky-500/20 bg-slate-50/70 p-3 text-slate-900 dark:bg-slate-900/50 dark:text-slate-100">
    <div className="flex flex-wrap gap-4">
      {[["Début", start, setStart], ["Fin", end, setEnd]].map(([label, value, setter]) => <label key={label} className="flex flex-col gap-2 text-sm">
        {label}
        <input aria-label={label} value={value} onChange={event => setter(event.target.value)} placeholder="HH:MM:SS" className="w-32 rounded-lg border border-slate-300 bg-white p-2 text-slate-950 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400" disabled={busy} />
        {videoElement && <button type="button" className={buttonClass} disabled={busy} onClick={() => setter(formatCreditTime(videoElement.currentTime))}>Utiliser la position actuelle — {label.toLowerCase()}</button>}
      </label>)}
    </div>
    {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="button" className={buttonClass} disabled={busy} onClick={() => save()}>{segment ? "Enregistrer les bornes" : "Proposer ce générique"}</button>
      {segment && canModerate && <>
        <button type="button" className={buttonClass} disabled={busy} onClick={() => save("APPROVED")}>Valider</button>
        <button type="button" className={buttonClass} disabled={busy} onClick={() => save("REJECTED")}>Refuser</button>
      </>}
      {onCancel && <button type="button" className={buttonClass} disabled={busy} onClick={onCancel}>Annuler</button>}
    </div>
  </div>;
}

export default function VideoCreditPanel({ videoId, videoElement, data, error, onRefresh }) {
  const [editing, setEditing] = useState(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const saved = async () => { setEditing(null); setAdding(false); await onRefresh(); };
  const remove = async item => {
    setBusy(true); setMutationError("");
    try { await api.delete(`/videos/${videoId}/credits/${item.ID}`); await saved(); }
    catch (err) { setMutationError(err.response?.data?.error || "Suppression impossible."); }
    finally { setBusy(false); }
  };
  return <div className="mt-6 border-t border-sky-500/20 pt-5 text-slate-900 dark:text-slate-100">
    <h3 className="text-lg font-bold">Génériques</h3>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Proposez le début et la fin des génériques. Ils seront utilisables après vérification par un administrateur.</p>
    {(error || mutationError) && <p role="alert" className="mt-2 text-red-700 dark:text-red-300">{error || mutationError} <button type="button" onClick={onRefresh}>Réessayer</button></p>}
    {!data && !error && <p role="status">Chargement des génériques…</p>}
    {data && <>
      {data.items.length === 0 && <p className="my-3 text-sm text-slate-600 dark:text-slate-300">Aucun générique proposé.</p>}
      <ul className="my-3 space-y-3">{data.items.map(item => <li key={item.ID} className="rounded-lg border border-sky-500/15 p-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-mono">{formatCreditTime(item.Start)} → {formatCreditTime(item.End)}</span>
          <span className="rounded-full bg-sky-500/15 px-2 py-1 text-sky-800 dark:text-sky-200">{statusLabels[item.Status]}</span>
          {item.AuthorID === data.userId && <span className="text-slate-600 dark:text-slate-400">Votre proposition</span>}
          {videoElement && <button type="button" className={buttonClass} onClick={() => { videoElement.currentTime = item.Start; }}>Vérifier dans le lecteur</button>}
          {(data.canModerate || (item.AuthorID === data.userId && item.Status === "PENDING")) && <>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => setEditing(item.ID)}>{data.canModerate ? "Examiner / modifier" : "Modifier"}</button>
            <button type="button" className={buttonClass} disabled={busy} onClick={() => remove(item)}>Supprimer</button>
          </>}
        </div>
        {editing === item.ID && <CreditEditor segment={item} videoId={videoId} videoElement={videoElement} canModerate={data.canModerate} onSaved={saved} onCancel={() => setEditing(null)} />}
      </li>)}</ul>
      {adding ? <CreditEditor videoId={videoId} videoElement={videoElement} onSaved={saved} onCancel={() => setAdding(false)} /> : <button type="button" className={buttonClass} onClick={() => setAdding(true)}>Ajouter un générique</button>}
    </>}
  </div>;
}
