import React, { useCallback, useEffect, useState } from "react";
import { PlusIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import MusicStickyPlayer, { normalizeMusique } from "./MusicStickyPlayer";

const apiUrl = process.env.REACT_APP_URL_LOCAL;

const imageSrc = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiUrl}/${path}`;
};

const MusicPage = () => {
  const [musiques, setMusiques] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [playlist, setPlaylist] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.get("/music/musiques"), api.get("/music/albums")])
      .then(([musiquesResponse, albumsResponse]) => {
        setMusiques(Array.isArray(musiquesResponse.data) ? musiquesResponse.data : []);
        setAlbums(Array.isArray(albumsResponse.data) ? albumsResponse.data : []);
      })
      .catch((err) => {
        console.error("Erreur chargement musiques :", err);
        setError("Impossible de charger les contenus musicaux.");
      });
  }, []);

  const addMusicsToPlaylist = useCallback((items) => {
    const playableItems = items.filter((item) => item?.MusiqueID && item?.CheminAcces);
    if (playableItems.length === 0) return;

    setPlaylist((current) => [
      ...current,
      ...playableItems.map((item) => normalizeMusique(item)),
    ]);
  }, []);

  const addMusicToPlaylist = (musique) => {
    addMusicsToPlaylist([musique]);
  };

  const addAlbumToPlaylist = (album) => {
    addMusicsToPlaylist(album.Musiques || []);
  };

  return (
    <main className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
      <MusicStickyPlayer playlist={playlist} setPlaylist={setPlaylist} />

      <section className="mx-auto max-w-5xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:text-white dark:shadow-sky-950/20">
        <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
          <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">SAMI</p>
          <h1 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Musique</h1>
        </div>
        <div className="grid gap-8 px-6 py-6">
          {error && (
            <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">
              {error}
            </div>
          )}

          <section>
            <h2 className="mb-3 text-lg font-black text-slate-950 dark:text-white">Toutes les musiques</h2>
            {musiques.length === 0 ? (
              <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
                Aucune musique disponible.
              </p>
            ) : (
              <ul className="divide-y divide-sky-500/10 overflow-hidden rounded-xl border border-sky-500/10 bg-white/70 dark:bg-slate-950/40">
                {musiques.map((musique) => (
                  <li key={musique.MusiqueID} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-950 dark:text-white">{musique.Titre}</p>
                      <p className="mt-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                        #{musique.MusiqueID}
                        {musique.Genres?.length ? ` - ${musique.Genres.map((genre) => genre.Nom).join(", ")}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {musique.Premium && (
                        <span className="rounded-full border border-amber-300/40 bg-amber-500/15 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-200">
                          Premium
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => addMusicToPlaylist(musique)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-sky-500/25 dark:text-white"
                      >
                        <PlusIcon className="size-5" />
                        Ajouter à la playlist
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-lg font-black text-slate-950 dark:text-white">Albums</h2>
            {albums.length === 0 ? (
              <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
                Aucun album disponible.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {albums.map((album) => (
                  <article key={album.AlbumID} className="overflow-hidden rounded-xl border border-sky-500/10 bg-white/70 shadow-sm dark:bg-slate-950/40">
                    <div className="aspect-square bg-slate-200 dark:bg-slate-800">
                      {album.CheminImage && (
                        <img src={imageSrc(album.CheminImage)} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="truncate font-black text-slate-950 dark:text-white">{album.Titre}</h3>
                      <p className="mt-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                        {album.Musiques?.length || 0} musique{album.Musiques?.length > 1 ? "s" : ""}
                      </p>
                      <button
                        type="button"
                        onClick={() => addAlbumToPlaylist(album)}
                        disabled={!album.Musiques?.length}
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white"
                      >
                        <PlusIcon className="size-5" />
                        Ajouter à la playlist
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
};

export default MusicPage;
