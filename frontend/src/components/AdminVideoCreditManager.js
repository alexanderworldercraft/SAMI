import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";
import { CreditEditor } from "./VideoCreditPanel";
import { formatCreditTime } from "../utils/videoCredits";

export default function AdminVideoCreditManager() {
  const [status, setStatus] = useState("PENDING");
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    setData(null); setError("");
    api.get("/videos/credits/review", { params: { status, page } }).then(response => {
      if (!cancelled) {
        if (page > 1 && !response.data.items.length) setPage(p => p - 1);
        else setData(response.data);
      }
    }).catch(err => { if (!cancelled) setError(err.response?.data?.error || "Chargement impossible."); });
    return () => { cancelled = true; };
  }, [status, page, revision]);
  return <section className="mx-auto max-w-4xl rounded-2xl border border-sky-500/20 bg-white/80 p-6 text-slate-900 shadow-xl shadow-slate-950/5 dark:bg-slate-950/70 dark:text-slate-100">
    <h2 className="text-2xl font-black">Validation des génériques</h2>
    <p className="my-3 text-sm text-slate-600 dark:text-slate-300">Vérifiez les bornes dans le lecteur avant de valider. Les génériques validés activent les boutons de lecture pour tous les utilisateurs autorisés.</p>
    <label>Statut <select className="m-2 rounded-lg border border-slate-300 bg-white p-2 text-slate-950 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
      <option value="PENDING">En attente</option><option value="APPROVED">Validés</option><option value="REJECTED">Refusés</option>
    </select></label>
    <button type="button" className="p-2 text-sky-700 underline dark:text-sky-300" onClick={refresh}>Actualiser</button>
    {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
    {!data && !error && <p role="status">Chargement…</p>}
    {data && <>
      <p className="my-3 text-sm">{data.total} proposition(s)</p>
      <ul className="space-y-4">{data.items.map(item => <li key={`${item.ID}-${item.UpdatedAt}`} className="rounded-xl border border-sky-500/20 p-4">
        <h3 className="font-bold">{item.Video.Titre}</h3>
        <p className="my-2 text-sm">{item.Author.Surnom} · {formatCreditTime(item.Start)} → {formatCreditTime(item.End)}</p>
        <Link className="text-sky-700 underline dark:text-sky-300" to={`/lecture/${item.VideoID}?creditStart=${item.Start}`}>Vérifier dans le lecteur</Link>
        <CreditEditor segment={item} videoId={item.VideoID} canModerate onSaved={refresh} />
      </li>)}</ul>
      <div className="mt-4 flex gap-4">
        <button type="button" disabled={page === 1} className="disabled:opacity-30" onClick={() => setPage(p => p - 1)}>Précédent</button>
        <span>Page {page} / {Math.max(1, Math.ceil(data.total / 25))}</span>
        <button type="button" disabled={page * 25 >= data.total} className="disabled:opacity-30" onClick={() => setPage(p => p + 1)}>Suivant</button>
      </div>
    </>}
  </section>;
}
