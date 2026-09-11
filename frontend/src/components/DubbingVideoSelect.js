import React, { useEffect, useState } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import api from "../services/api";

export default function DubbingVideoSelect({ value, onChange }) {
  const [videos, setVideos] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.get("/videos/admin").then(response => {
      if (active) setVideos(Array.isArray(response.data) ? response.data : []);
    }).catch(() => { if (active) setError("Impossible de charger les vidéos."); });
    return () => { active = false; };
  }, []);
  const selected = videos.find(video => String(video.VideoID) === String(value));
  const filtered = videos.filter(video => [video.Titre, video.SeriesTitre, video.VideoID]
    .some(text => String(text || "").toLocaleLowerCase().includes(search.toLocaleLowerCase())));
  return <div className="grid gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
    <label htmlFor="dubbing-video-search">Rechercher une vidéo par titre ou ID</label>
    <input id="dubbing-video-search" value={search} onChange={event => setSearch(event.target.value)}
      className="rounded-xl border border-slate-300 bg-white p-3 text-slate-950 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-400" placeholder="Titre, série ou ID" />
    <Listbox value={String(value)} onChange={onChange}>
      <ListboxButton aria-label="Vidéo" className="rounded-xl border border-slate-300 bg-white p-3 text-left text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white">
        {selected ? `#${selected.VideoID} — ${selected.Titre}` : "Sélectionner une vidéo"}
      </ListboxButton>
      <ListboxOptions anchor="bottom" className="z-[9999] max-h-72 w-[var(--button-width)] overflow-auto rounded-xl border border-slate-200 bg-white p-2 text-slate-950 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-white">
        {filtered.map(video => <ListboxOption key={video.VideoID} value={String(video.VideoID)}
          className="cursor-pointer rounded p-3 data-[focus]:bg-sky-100 data-[focus]:text-sky-950 data-[selected]:font-bold dark:data-[focus]:bg-sky-500/20 dark:data-[focus]:text-sky-100">
          #{video.VideoID} — {video.Titre}{video.SeriesTitre ? ` · ${video.SeriesTitre}` : ""}
        </ListboxOption>)}
        {!filtered.length && <p className="p-3">Aucune vidéo correspondante.</p>}
      </ListboxOptions>
    </Listbox>
    {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
  </div>;
}
