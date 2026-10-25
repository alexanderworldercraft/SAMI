import React, { useEffect, useState } from "react";
import api from "../../../services/api";
import VideoList from "./VideoList";
import { getCurrentSagaContent, orderSagaContents } from "../../../utils/sagaPlayback";

const SingleSagaSection = ({ saga, videoId, seriesId, linkAnchor, onContentClick, onContentsLoaded, embedded = false }) => {
  const [contents, setContents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    onContentsLoaded?.(null);
    api.get(`/sagas/${saga.SagaID}`)
      .then((response) => {
        if (!cancelled) {
          const items = response.data?.Contents || [];
          setContents(items);
          onContentsLoaded?.({ videoId, sagaId: saga.SagaID, contents: items });
        }
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError.response?.data?.error || "Impossible de charger les contenus de cette saga.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [saga.SagaID, videoId, revision, onContentsLoaded]);

  // Préserve l’ordre de la saga sans modifier le tableau fourni par l’API.
  const orderedContents = orderSagaContents(contents);
  const currentContent = getCurrentSagaContent(orderedContents, videoId, seriesId);

  return (
    <section className={embedded ? undefined : "container mx-auto overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20"} aria-label={`Contenus de la saga ${saga.Titre}`}>
      {embedded ? <h3 className="mb-5 text-xl font-black text-slate-950 dark:text-white">{saga.Titre}</h3> : (
        <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
          <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Sagas</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{saga.Titre}</h2>
        </div>
      )}
      <div className={embedded ? "relative" : "relative p-6"} aria-busy={loading}>
        {!embedded && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />}
        <div className="relative">
          {loading ? <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">Chargement des contenus de la saga…</p>
            : error ? <div role="alert" className="text-sm text-red-700 dark:text-red-300">
              <p>{error}</p>
              <button type="button" onClick={() => setRevision((value) => value + 1)} className="mt-3 rounded-lg border border-sky-400/30 px-4 py-2 font-bold text-slate-900 dark:text-white">Réessayer</button>
            </div>
              : <VideoList videos={orderedContents} currentContent={currentContent} linkAnchor={linkAnchor} onContentClick={onContentClick} />}
        </div>
      </div>
    </section>
  );
};

export default SingleSagaSection;
