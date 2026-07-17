import React, { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlassIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import PaginationPage from "./PaginationPage";
import { useMusicPlayer } from "../context/MusicPlayerContext";

const apiUrl = process.env.REACT_APP_URL_LOCAL;
const MUSIC_ITEMS_PER_PAGE = 10;
const ALBUM_ITEMS_PER_PAGE = 6;

const imageSrc = (path) => {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiUrl}/${path}`;
};

const MusicPage = () => {
  const [musiques, setMusiques] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [musicPage, setMusicPage] = useState(1);
  const [albumPage, setAlbumPage] = useState(1);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [error, setError] = useState("");
  const musicSectionRef = useRef(null);
  const albumSectionRef = useRef(null);
  const { addMusicToPlaylist, addAlbumToPlaylist } = useMusicPlayer();

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

  const normalizedSearchTerm = searchTerm.trim().toLocaleLowerCase("fr");

  const filteredMusiques = useMemo(() => {
    if (!normalizedSearchTerm) return musiques;
    return musiques.filter((musique) =>
      (musique.Titre || "").toLocaleLowerCase("fr").includes(normalizedSearchTerm)
    );
  }, [musiques, normalizedSearchTerm]);

  const filteredAlbums = useMemo(() => {
    if (!normalizedSearchTerm) return albums;
    return albums.filter((album) => {
      const albumTitleMatches = (album.Titre || "").toLocaleLowerCase("fr").includes(normalizedSearchTerm);
      const albumMusicMatches = (album.Musiques || []).some((musique) =>
        (musique.Titre || "").toLocaleLowerCase("fr").includes(normalizedSearchTerm)
      );

      return albumTitleMatches || albumMusicMatches;
    });
  }, [albums, normalizedSearchTerm]);

  const totalMusicPages = Math.max(1, Math.ceil(filteredMusiques.length / MUSIC_ITEMS_PER_PAGE));
  const totalAlbumPages = Math.max(1, Math.ceil(filteredAlbums.length / ALBUM_ITEMS_PER_PAGE));

  const paginatedMusiques = filteredMusiques.slice(
    (musicPage - 1) * MUSIC_ITEMS_PER_PAGE,
    musicPage * MUSIC_ITEMS_PER_PAGE
  );
  const paginatedAlbums = filteredAlbums.slice(
    (albumPage - 1) * ALBUM_ITEMS_PER_PAGE,
    albumPage * ALBUM_ITEMS_PER_PAGE
  );

  useEffect(() => {
    setMusicPage(1);
    setAlbumPage(1);
  }, [normalizedSearchTerm]);

  useEffect(() => {
    if (musicPage > totalMusicPages) setMusicPage(totalMusicPages);
  }, [musicPage, totalMusicPages]);

  useEffect(() => {
    if (albumPage > totalAlbumPages) setAlbumPage(totalAlbumPages);
  }, [albumPage, totalAlbumPages]);

  return (
    <main className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
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

          <div className="relative">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Rechercher une musique ou un album..."
              className="w-full rounded-xl border border-sky-500/10 bg-white/80 py-3 pl-12 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 dark:bg-slate-950/50 dark:text-white"
            />
          </div>

          <section ref={albumSectionRef}>
            <h2 className="mb-3 text-lg font-black text-slate-950 dark:text-white">Albums</h2>
            {filteredAlbums.length === 0 ? (
              <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
                Aucun album trouve.
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {paginatedAlbums.map((album) => (
                    <article key={album.AlbumID} className="overflow-hidden rounded-xl border border-sky-500/10 bg-white/70 shadow-sm dark:bg-slate-950/40">
                      <button type="button" onClick={() => setSelectedAlbum(album)} className="block w-full text-left">
                        <div className="aspect-square bg-slate-200 dark:bg-slate-800">
                          {album.CheminImage && (
                            <img src={imageSrc(album.CheminImage)} alt="" className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div className="px-4 pt-4">
                          <h3 className="truncate font-black text-slate-950 dark:text-white">{album.Titre}</h3>
                          <p className="mt-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                            {album.Musiques?.length || 0} musique{album.Musiques?.length > 1 ? "s" : ""}
                          </p>
                        </div>
                      </button>
                      <div className="p-4">
                        <button
                          type="button"
                          onClick={() => addAlbumToPlaylist(album)}
                          disabled={!album.Musiques?.length}
                          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white"
                        >
                          <PlusIcon className="size-5" />
                          Ajouter à la playlist
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {totalAlbumPages > 1 && (
                  <PaginationPage
                    currentPage={albumPage}
                    totalPages={totalAlbumPages}
                    totalItems={filteredAlbums.length}
                    itemsPerPage={ALBUM_ITEMS_PER_PAGE}
                    onPageChange={setAlbumPage}
                    scrollTarget={albumSectionRef}
                    scrollOffset={80}
                  />
                )}
              </>
            )}
          </section>

          <section ref={musicSectionRef}>
            <h2 className="mb-3 text-lg font-black text-slate-950 dark:text-white">Toutes les musiques</h2>
            {filteredMusiques.length === 0 ? (
              <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
                Aucune musique trouvee.
              </p>
            ) : (
              <>
                <ul className="divide-y divide-sky-500/10 overflow-hidden rounded-xl border border-sky-500/10 bg-white/70 dark:bg-slate-950/40">
                  {paginatedMusiques.map((musique) => (
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
                {totalMusicPages > 1 && (
                  <PaginationPage
                    currentPage={musicPage}
                    totalPages={totalMusicPages}
                    totalItems={filteredMusiques.length}
                    itemsPerPage={MUSIC_ITEMS_PER_PAGE}
                    onPageChange={setMusicPage}
                    scrollTarget={musicSectionRef}
                    scrollOffset={80}
                  />
                )}
              </>
            )}
          </section>

        </div>
      </section>

      {selectedAlbum && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="album-modal-title">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white shadow-2xl dark:bg-slate-950 dark:text-white">
            <div className="flex items-start justify-between gap-4 border-b border-sky-500/10 px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase text-sky-500 dark:text-sky-300">Album</p>
                <h2 id="album-modal-title" className="truncate text-xl font-black text-slate-950 dark:text-white">
                  {selectedAlbum.Titre}
                </h2>
              </div>
              <button type="button" onClick={() => setSelectedAlbum(null)} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white" aria-label="Fermer">
                <XMarkIcon className="size-6" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto px-5 py-5">
              {selectedAlbum.Musiques?.length ? (
                <ul className="divide-y divide-sky-500/10 overflow-hidden rounded-xl border border-sky-500/10 bg-white/70 dark:bg-slate-950/40">
                  {selectedAlbum.Musiques.map((musique) => (
                    <li key={musique.MusiqueID} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-slate-950 dark:text-white">{musique.Titre}</p>
                        <p className="mt-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">#{musique.MusiqueID}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addMusicToPlaylist(musique)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-sky-500/25 dark:text-white"
                      >
                        <PlusIcon className="size-5" />
                        Ajouter
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
                  Cet album ne contient aucune musique.
                </p>
              )}
            </div>
            <div className="border-t border-sky-500/10 px-5 py-4">
              <button
                type="button"
                onClick={() => addAlbumToPlaylist(selectedAlbum)}
                disabled={!selectedAlbum.Musiques?.length}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white"
              >
                <PlusIcon className="size-5" />
                Ajouter tout l'album à la playlist
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default MusicPage;
