import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BackwardIcon,
  ChevronDownIcon,
  ForwardIcon,
  QueueListIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import api from "../services/api";

const apiUrl = process.env.REACT_APP_URL_LOCAL;

const resolveAudioSrc = (musique) => {
  if (!musique?.CheminAcces) return "";
  if (/^https?:\/\//i.test(musique.CheminAcces)) return musique.CheminAcces;
  return `${apiUrl}/${musique.CheminAcces}`;
};

const resolveImageSrc = (musique) => {
  if (!musique?.CheminImage) return "";
  if (/^https?:\/\//i.test(musique.CheminImage)) return musique.CheminImage;
  return `${apiUrl}/${musique.CheminImage}`;
};

const normalizeMusique = (musique) => ({
  ...musique,
  playlistKey: `${musique.MusiqueID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
});

const MusicStickyPlayer = ({ playlist, setPlaylist }) => {
  const audioRef = useRef(null);
  const [playlistOpen, setPlaylistOpen] = useState(true);
  const [repeatMode, setRepeatMode] = useState("off");
  const [playedIds, setPlayedIds] = useState([]);
  const currentMusic = playlist[0] || null;
  const audioSrc = useMemo(() => resolveAudioSrc(currentMusic), [currentMusic]);
  const imageSrc = useMemo(() => resolveImageSrc(currentMusic), [currentMusic]);

  useEffect(() => {
    if (!currentMusic?.MusiqueID) return;

    setPlayedIds((current) =>
      current[current.length - 1] === currentMusic.MusiqueID
        ? current
        : [...current, currentMusic.MusiqueID].slice(-25)
    );

    api.post("/logs/musique-first-play", { MusiqueID: currentMusic.MusiqueID }).catch((error) => {
      console.error("Erreur log musique_first_play :", error);
    });
  }, [currentMusic?.MusiqueID]);

  useEffect(() => {
    if (!audioRef.current || !audioSrc) return;
    audioRef.current.load();
    audioRef.current.play().catch(() => {
      // Les navigateurs peuvent bloquer l'autoplay tant que l'utilisateur n'a pas interagi.
    });
  }, [audioSrc]);

  const playPrevious = async () => {
    const localPreviousId = playedIds.length > 1 ? playedIds[playedIds.length - 2] : null;
    const localPrevious = localPreviousId
      ? playlist.find((item) => item.MusiqueID === localPreviousId)
      : null;

    if (localPrevious) {
      setPlaylist((current) => [
        normalizeMusique(localPrevious),
        ...current.filter((item) => item.playlistKey !== localPrevious.playlistKey),
      ]);
      return;
    }

    try {
      const response = await api.get("/logs/musique-previous-play", {
        params: { currentMusiqueId: currentMusic?.MusiqueID || "" },
      });
      if (response.data?.musique) {
        setPlaylist((current) => [normalizeMusique(response.data.musique), ...current]);
      }
    } catch (error) {
      console.error("Erreur récupération musique précédente :", error);
    }
  };

  const playNext = () => {
    setPlaylist((current) => current.slice(1));
  };

  const handleEnded = () => {
    if (!currentMusic) return;

    if (repeatMode === "one") {
      if (audioRef.current) audioRef.current.currentTime = 0;
      audioRef.current?.play?.();
      return;
    }

    setPlaylist((current) => {
      if (current.length === 0) return current;
      const [finished, ...rest] = current;
      if (repeatMode === "all") {
        if (rest.length === 0) {
          window.setTimeout(() => {
            if (audioRef.current) audioRef.current.currentTime = 0;
            audioRef.current?.play?.();
          }, 0);
          return current;
        }
        return [...rest, normalizeMusique(finished)];
      }
      return rest;
    });
  };

  const toggleRepeatMode = () => {
    setRepeatMode((current) => {
      if (current === "off") return "all";
      if (current === "all") return "one";
      return "off";
    });
  };

  const removeFromPlaylist = (playlistKey) => {
    setPlaylist((current) => current.filter((item) => item.playlistKey !== playlistKey));
  };

  const clearPlaylist = () => {
    setPlaylist([]);
  };

  return (
    <section className="sticky top-4 z-30 mx-auto mb-8 max-w-5xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/95 shadow-2xl shadow-slate-950/10 backdrop-blur dark:bg-slate-950/95 dark:text-white dark:shadow-sky-950/30">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-200 dark:bg-slate-800">
              {imageSrc && <img src={imageSrc} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase text-sky-500 dark:text-sky-300">Lecteur musique</p>
              <h2 className="truncate text-lg font-black text-slate-950 dark:text-white">
                {currentMusic ? currentMusic.Titre : "Aucune musique en lecture"}
              </h2>
              <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                {playlist.length > 0 ? `${playlist.length} titre${playlist.length > 1 ? "s" : ""} dans la playlist` : "Ajoute une musique ou un album à la playlist"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={playPrevious} className="rounded-lg border border-sky-300/40 bg-sky-500/15 p-3 text-slate-900 transition hover:bg-sky-500/25 dark:text-white" aria-label="Musique précédente">
              <BackwardIcon className="size-5" />
            </button>
            <button type="button" onClick={playNext} disabled={playlist.length <= 1} className="rounded-lg border border-sky-300/40 bg-sky-500/15 p-3 text-slate-900 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white" aria-label="Musique suivante">
              <ForwardIcon className="size-5" />
            </button>
            <button type="button" onClick={toggleRepeatMode} className="rounded-lg border border-sky-300/40 bg-sky-500/15 px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-sky-500/25 dark:text-white">
              {repeatMode === "all" ? "Répéter tout" : repeatMode === "one" ? "Répéter 1" : "Répéter off"}
            </button>
            <button type="button" onClick={() => setPlaylistOpen((current) => !current)} className="inline-flex items-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-sky-500/25 dark:text-white">
              <QueueListIcon className="size-5" />
              Playlist
              <ChevronDownIcon className={`size-4 transition ${playlistOpen ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        <audio
          ref={audioRef}
          controls
          className="mt-4 w-full"
          src={audioSrc}
          onEnded={handleEnded}
        >
          Votre navigateur ne supporte pas le lecteur audio.
        </audio>
      </div>

      {playlistOpen && (
        <footer className="max-h-72 overflow-auto bg-slate-50/70 px-4 py-4 dark:bg-slate-950/60 sm:px-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-black uppercase text-slate-600 dark:text-slate-300">Playlist</h3>
            {playlist.length > 0 && (
              <button type="button" onClick={clearPlaylist} className="text-sm font-bold text-red-600 hover:text-red-700 dark:text-red-300">
                Vider
              </button>
            )}
          </div>
          {playlist.length === 0 ? (
            <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-4 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
              La playlist est vide.
            </p>
          ) : (
            <ul className="divide-y divide-sky-500/10 overflow-hidden rounded-xl border border-sky-500/10 bg-white/70 dark:bg-slate-950/40">
              {playlist.map((musique, index) => (
                <li key={musique.playlistKey} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-7 shrink-0 text-xs font-black text-sky-500 dark:text-sky-300">
                    {index === 0 ? "On" : index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-950 dark:text-white">{musique.Titre}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">#{musique.MusiqueID}</p>
                  </div>
                  <button type="button" onClick={() => removeFromPlaylist(musique.playlistKey)} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-300" aria-label="Retirer de la playlist">
                    <XMarkIcon className="size-5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </footer>
      )}
    </section>
  );
};

export { normalizeMusique };
export default MusicStickyPlayer;
