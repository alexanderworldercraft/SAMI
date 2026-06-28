import React, { useEffect, useMemo, useState } from "react";
import api from "../services/api";

const apiUrl = process.env.REACT_APP_URL_LOCAL;

const MusicPage = () => {
  const [musiques, setMusiques] = useState([]);
  const [selectedMusic, setSelectedMusic] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/music/musiques")
      .then((response) => {
        const rows = Array.isArray(response.data) ? response.data : [];
        setMusiques(rows);
        setSelectedMusic(rows[0] || null);
      })
      .catch((err) => {
        console.error("Erreur chargement musiques :", err);
        setError("Impossible de charger les musiques.");
      });
  }, []);

  const audioSrc = useMemo(() => {
    if (!selectedMusic?.CheminAcces) return "";
    if (/^https?:\/\//i.test(selectedMusic.CheminAcces)) return selectedMusic.CheminAcces;
    return `${apiUrl}/${selectedMusic.CheminAcces}`;
  }, [selectedMusic]);

  return (
    <main className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:text-white dark:shadow-sky-950/20">
        <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
          <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">SAMI</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Musique</h1>
        </div>
        <div className="grid gap-6 px-6 py-6 md:grid-cols-[1fr_360px]">
          <div>
            {error && <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">{error}</div>}
            <h2 className="mb-3 text-lg font-black text-slate-950 dark:text-white">Toutes les musiques</h2>
            {musiques.length === 0 ? (
              <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">Aucune musique disponible.</p>
            ) : (
              <ul className="divide-y divide-sky-500/10 overflow-hidden rounded-xl border border-sky-500/10 bg-white/70 dark:bg-slate-950/40">
                {musiques.map((musique) => (
                  <li key={musique.MusiqueID}>
                    <button
                      type="button"
                      onClick={() => setSelectedMusic(musique)}
                      className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-sky-500/10 ${selectedMusic?.MusiqueID === musique.MusiqueID ? "bg-sky-500/15" : ""}`}
                    >
                      <span>
                        <span className="block font-black text-slate-950 dark:text-white">{musique.Titre}</span>
                        <span className="mt-1 block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                          #{musique.MusiqueID}
                          {musique.Genres?.length ? ` - ${musique.Genres.map((genre) => genre.Nom).join(", ")}` : ""}
                        </span>
                      </span>
                      {musique.Premium && <span className="rounded-full border border-amber-300/40 bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-200">Premium</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <aside className="rounded-2xl border border-sky-500/10 bg-white/70 p-5 dark:bg-slate-950/40">
            <h2 className="text-lg font-black text-slate-950 dark:text-white">Lecteur audio</h2>
            {selectedMusic ? (
              <div className="mt-4">
                {selectedMusic.CheminImage && <img src={`${apiUrl}/${selectedMusic.CheminImage}`} alt="" className="mb-4 aspect-square w-full rounded-xl object-cover" />}
                <p className="mb-3 font-bold text-slate-800 dark:text-slate-100">{selectedMusic.Titre}</p>
                <audio key={audioSrc} controls className="w-full" src={audioSrc}>
                  Votre navigateur ne supporte pas le lecteur audio.
                </audio>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Sélectionne une musique.</p>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
};

export default MusicPage;
