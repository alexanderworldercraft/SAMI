import React, { useEffect, useState } from "react";
import api from "../services/api";

const AdminAiSubtitleWorkers = () => {
  const [workers, setWorkers] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      try {
        const response = await api.get("/ai-subtitles/admin/workers");
        if (!cancelled) { setWorkers(response.data?.workers || []); setError(""); }
      } catch (requestError) {
        if (!cancelled) setError(requestError.response?.data?.error || "Serveurs de sous-titrage indisponibles.");
      } finally { pending = false; }
    };
    refresh();
    const timer = window.setInterval(refresh, 10_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  return (
    <div className="mt-4 border-t border-fuchsia-400/20 pt-4">
      <h4 className="font-black text-slate-900 dark:text-white">Serveurs de sous-titrage IA</h4>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Les clones IA libres peuvent générer chacun un sous-titre en parallèle, après les encodages compatibles en attente. Sans clone IA connecté, le primary nécessite une autorisation par sous-titre.</p>
      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
      {!workers && !error && <p className="mt-3 text-sm">Chargement des serveurs…</p>}
      {workers?.length === 0 && <p className="mt-3 text-sm text-slate-500">Aucun serveur de sous-titrage IA enregistré.</p>}
      <ul className="mt-3 grid gap-3 sm:grid-cols-2" aria-label="Serveurs de sous-titrage IA">
        {workers?.map((worker) => <li key={worker.id} className="rounded-xl border border-fuchsia-400/20 bg-white/70 p-4 dark:bg-slate-950/45">
          <h5 className="font-black text-slate-950 dark:text-white">{worker.displayName || worker.id}</h5>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{worker.role === "PRIMARY" ? "Primary" : "Clone"} · {worker.id}</p>
          <p className="mt-3 text-sm font-bold text-fuchsia-800 dark:text-fuchsia-200">{worker.unavailableReason || "Disponible pour les sous-titres"}</p>
          <p className="mt-2 break-words text-xs text-slate-500 dark:text-slate-400">{[worker.engine, worker.device, worker.model, worker.translationModel].filter(Boolean).join(" · ")}</p>
          {worker.lastError && <p className="mt-2 break-words text-xs text-red-600 dark:text-red-300">{worker.lastError}</p>}
        </li>)}
      </ul>
    </div>
  );
};

export default AdminAiSubtitleWorkers;
