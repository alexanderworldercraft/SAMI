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
  return <div className="grid gap-2 text-sm font-bold">
    <label htmlFor="dubbing-video-search">Rechercher une vidéo par titre ou ID</label>
    <input id="dubbing-video-search" value={search} onChange={event => setSearch(event.target.value)}
      className="rounded-xl border p-3 text-slate-950" placeholder="Titre, série ou ID" />
    <Listbox value={String(value)} onChange={onChange}>
      <ListboxButton aria-label="Vidéo" className="rounded-xl border bg-white p-3 text-left text-slate-950">
        {selected ? `#${selected.VideoID} — ${selected.Titre}` : "Sélectionner une vidéo"}
      </ListboxButton>
      <ListboxOptions anchor="bottom" className="z-[9999] max-h-72 w-[var(--button-width)] overflow-auto rounded-xl bg-white p-2 text-slate-950 shadow-xl">
        {filtered.map(video => <ListboxOption key={video.VideoID} value={String(video.VideoID)}
          className="cursor-pointer rounded p-3 data-[focus]:bg-sky-100 data-[selected]:font-bold">
          #{video.VideoID} — {video.Titre}{video.SeriesTitre ? ` · ${video.SeriesTitre}` : ""}
        </ListboxOption>)}
        {!filtered.length && <p className="p-3">Aucune vidéo correspondante.</p>}
      </ListboxOptions>
    </Listbox>
    {error && <p role="alert">{error}</p>}
  </div>;
}
