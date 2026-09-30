import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../services/api";

export default function TactileSearch({ onNavigate }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    setItems([]); setError(""); setLoading(false);
    if (!query.trim()) return;
    const timeout = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await api.get(`/videos/search?search=${encodeURIComponent(query.trim())}&limit=6`);
        if (active) setItems(response.data.items || []);
      } catch (_) {
        if (active) setError("La recherche est indisponible. Vous pouvez ouvrir la liste des vidéos.");
      } finally { if (active) setLoading(false); }
    }, 300);
    return () => { active = false; clearTimeout(timeout); };
  }, [query]);
  const go = (path) => { onNavigate(); navigate(path); };
  return <>
    <form onSubmit={(event) => { event.preventDefault(); if (query.trim()) go(`/videos?search=${encodeURIComponent(query.trim())}`); }} className="flex flex-col gap-3">
      <label htmlFor="tactile-search" className="font-bold">Titre de vidéo ou de série</label>
      <input id="tactile-search" type="search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} className="rounded-xl border border-sky-400/30 bg-white p-3 text-base text-slate-900 dark:bg-slate-900 dark:text-white" />
      <button type="submit" disabled={!query.trim()} className="tactile-action bg-sky-600 text-white">Voir tous les résultats</button>
    </form>
    {loading && <p role="status" className="mt-4">Recherche…</p>}
    {error && <p role="alert" className="mt-4">{error}</p>}
    <ul className="mt-4 space-y-2" aria-label="Suggestions de recherche">
      {items.map((item) => {
        const id = item.type === "series" ? item.FirstVideoID : item.id;
        return <li key={`${item.type}-${item.id}`}><button className="tactile-action w-full bg-sky-500/10 text-left" disabled={!id} onClick={() => go(`/lecture/${id}`)}>{item.Titre}{!id && " (à venir)"}</button></li>;
      })}
    </ul>
  </>;
}
