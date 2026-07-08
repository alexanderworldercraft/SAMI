import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowPathIcon,
  ArrowsRightLeftIcon,
  Bars3Icon,
  BackwardIcon,
  ChevronDownIcon,
  ForwardIcon,
  PauseIcon,
  PlayIcon,
  QueueListIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import api from "../services/api";
import { useMusicPlayer } from "../context/MusicPlayerContext";

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

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
  if (hours > 0) {
    const remainingMinutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    return `${hours}:${remainingMinutes}:${remainingSeconds}`;
  }
  return `${minutes}:${remainingSeconds}`;
};

const MusicStickyPlayer = ({ playlist, setPlaylist }) => {
  const audioRef = useRef(null);
  const ringRef = useRef(null);
  const previousPlaylistLengthRef = useRef(playlist.length);
  const {
    playerCollapsed,
    setPlayerCollapsed,
    playlistOpen,
    setPlaylistOpen,
    repeatMode,
    setRepeatMode,
    playedIds,
    setPlayedIds,
    volume,
    setVolume,
  } = useMusicPlayer();
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [draggedPlaylistKey, setDraggedPlaylistKey] = useState("");
  const currentMusic = playlist[0] || null;
  const audioSrc = useMemo(() => resolveAudioSrc(currentMusic), [currentMusic]);
  const imageSrc = useMemo(() => resolveImageSrc(currentMusic), [currentMusic]);
  const currentTrackKey = currentMusic?.playlistKey || "";
  const progressRatio = duration > 0 ? Math.min(currentTime / duration, 1) : 0;
  const progressPercent = progressRatio * 100;
  const progressAngle = progressRatio * Math.PI * 2 + Math.PI / 2;
  const progressDotPosition = {
    left: `${50 + Math.cos(progressAngle) * 50}%`,
    top: `${50 + Math.sin(progressAngle) * 50}%`,
  };

  useEffect(() => {
    const previousLength = previousPlaylistLengthRef.current;

    if (playlist.length === 0) {
      setPlayerCollapsed(true);
    } else if (previousLength === 0) {
      setPlayerCollapsed(false);
    }

    previousPlaylistLengthRef.current = playlist.length;
  }, [playlist.length, setPlayerCollapsed]);

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
  }, [currentMusic?.MusiqueID, currentTrackKey, setPlayedIds]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (!audioSrc) {
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    setCurrentTime(0);
    setDuration(0);
    audioRef.current.load();
    audioRef.current.play().then(() => {
      setIsPlaying(true);
    }).catch(() => {
      setIsPlaying(false);
      // Les navigateurs peuvent bloquer l'autoplay tant que l'utilisateur n'a pas interagi.
    });
  }, [audioSrc, currentTrackKey]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

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

  const togglePlay = () => {
    if (!audioRef.current || !audioSrc) return;

    if (audioRef.current.paused) {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(() => {
        setIsPlaying(false);
      });
      return;
    }

    audioRef.current.pause();
  };

  const handleLoadedMetadata = () => {
    const nextDuration = audioRef.current?.duration || 0;
    setDuration(Number.isFinite(nextDuration) ? nextDuration : 0);
  };

  const handleTimeUpdate = () => {
    setCurrentTime(audioRef.current?.currentTime || 0);
  };

  const seekToTime = (nextTime) => {
    const boundedTime = Math.max(0, Math.min(nextTime, duration || 0));
    setCurrentTime(boundedTime);
    if (audioRef.current) audioRef.current.currentTime = boundedTime;
  };

  const handleCircularSeek = (event) => {
    if (!duration || !ringRef.current) return;

    const rect = ringRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) - Math.PI / 2;
    const normalizedAngle = angle < 0 ? angle + Math.PI * 2 : angle;

    seekToTime((normalizedAngle / (Math.PI * 2)) * duration);
  };

  const handleRingKeyDown = (event) => {
    if (!duration) return;

    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      seekToTime(currentTime - 5);
    }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      seekToTime(currentTime + 5);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
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

  const handleVolumeChange = (event) => {
    setVolume(Number(event.target.value));
  };

  const movePlaylistItem = (sourceKey, targetKey) => {
    if (!sourceKey || !targetKey || sourceKey === targetKey) return;

    setPlaylist((current) => {
      const sourceIndex = current.findIndex((item) => item.playlistKey === sourceKey);
      const targetIndex = current.findIndex((item) => item.playlistKey === targetKey);

      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return current;

      const next = [...current];
      const [movedItem] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, movedItem);
      return next;
    });
  };

  const handlePlaylistDragStart = (event, playlistKey) => {
    setDraggedPlaylistKey(playlistKey);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", playlistKey);
  };

  const handlePlaylistDrop = (event, targetKey) => {
    event.preventDefault();
    const sourceKey = draggedPlaylistKey || event.dataTransfer.getData("text/plain");
    movePlaylistItem(sourceKey, targetKey);
    setDraggedPlaylistKey("");
  };

  return (
    <section className={`fixed bottom-4 right-4 z-50 overflow-hidden rounded-2xl border border-sky-500/10 bg-white/95 shadow-2xl/30 shadow-slate-950/20 backdrop-blur max-sm:left-4 dark:bg-slate-950/95 dark:text-white dark:shadow-sky-950/30 ${playerCollapsed ? "w-fit max-w-[calc(100vw-2rem)]" : "w-[min(960px,calc(100vw-2rem))] max-sm:max-h-[calc(100dvh-2rem)] max-sm:overflow-y-auto"}`}>
      <div className="bg-[radial-gradient(circle_at_50%_0%,rgba(14,165,233,0.24),transparent_42%),linear-gradient(135deg,rgba(2,132,199,0.18),rgba(15,23,42,0.04)_48%,rgba(14,165,233,0.12))] dark:bg-[radial-gradient(circle_at_50%_0%,rgba(14,165,233,0.30),transparent_42%),linear-gradient(135deg,rgba(2,6,23,0.96),rgba(12,74,110,0.35)_54%,rgba(2,6,23,0.94))]">
        {playerCollapsed ? (
          <div className="flex items-center gap-2 px-3 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="size-10 shrink-0 overflow-hidden rounded-full border border-sky-300/30 bg-slate-200 dark:bg-slate-800">
                {imageSrc ? (
                  <img src={imageSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-black text-sky-500">S</div>
                )}
              </div>
              <div className="hidden min-w-0 sm:block sm:max-w-44">
                <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                  {currentMusic ? currentMusic.Titre : "Aucune musique en lecture"}
                </p>
                <p className="mt-1 text-xs font-bold text-sky-600 dark:text-sky-300">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-center gap-1">
              <button type="button" onClick={playPrevious} disabled={!currentMusic} className="rounded-full p-2 text-slate-800 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-40 dark:text-white" aria-label="Musique précédente">
                <BackwardIcon className="size-5" />
              </button>
              <button type="button" onClick={togglePlay} disabled={!audioSrc} className="flex size-10 items-center justify-center rounded-full bg-sky-500 text-white shadow-lg shadow-sky-500/25 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50" aria-label={isPlaying ? "Mettre en pause" : "Lire"}>
                {isPlaying ? <PauseIcon className="size-5" /> : <PlayIcon className="ml-0.5 size-5" />}
              </button>
              <button type="button" onClick={playNext} disabled={playlist.length <= 1} className="rounded-full p-2 text-slate-800 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-40 dark:text-white" aria-label="Musique suivante">
                <ForwardIcon className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => setPlayerCollapsed(false)}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-sky-300/40 bg-sky-500/15 px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-sky-500/25 dark:text-white"
                aria-expanded="false"
                aria-label="Deplier le lecteur"
              >
                <span className="sr-only">Deplier</span>
                <ChevronDownIcon className="size-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className={`relative ${playlistOpen ? "md:pr-[320px]" : ""}`}>
            <div className="grid gap-5 px-4 py-5 sm:px-6 xl:grid-cols-[220px_minmax(0,1fr)_auto] xl:items-center">
              <button
                type="button"
                onClick={() => setPlayerCollapsed(true)}
                className="absolute right-4 top-4 z-20 inline-flex shrink-0 items-center gap-2 rounded-full border border-sky-300/40 bg-white/80 px-4 py-2 text-sm font-bold text-slate-900 shadow-lg shadow-slate-950/10 backdrop-blur transition hover:bg-sky-500/25 dark:bg-slate-950/80 dark:text-white"
                aria-expanded="true"
                aria-label="Reduire le lecteur"
              >
                <span>Reduire</span>
                <ChevronDownIcon className="size-4 rotate-180 transition" />
              </button>
              <div className="mx-auto flex w-full max-w-[220px] flex-col items-center">
                <div
                  ref={ringRef}
                  role="slider"
                  tabIndex={audioSrc ? 0 : -1}
                  aria-label="Progression circulaire de la musique"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(duration || 0)}
                  aria-valuenow={Math.round(currentTime || 0)}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    handleCircularSeek(event);
                  }}
                  onPointerMove={(event) => {
                    if (event.buttons === 1) handleCircularSeek(event);
                  }}
                  onKeyDown={handleRingKeyDown}
                  className={`relative flex aspect-square w-44 items-center justify-center rounded-full p-3 shadow-2xl shadow-sky-950/20 outline-none transition focus-visible:ring-2 focus-visible:ring-sky-300 sm:w-52 dark:shadow-sky-500/10 ${audioSrc ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                  style={{
                    background: `conic-gradient(from 180deg, #0ea5e9 ${progressPercent}%, rgba(14,165,233,0.16) ${progressPercent}%, rgba(14,165,233,0.16) 100%)`,
                  }}
                >
                  <div className="absolute inset-0 rounded-full border border-sky-300/20" />
                  <div className="absolute inset-5 rounded-full border border-sky-400/25" />
                  <div className="pointer-events-none absolute left-1/2 top-full size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sky-300/80 bg-white/70 shadow-sm dark:bg-slate-950/80" />
                  <div
                    className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400 shadow-lg shadow-sky-400/50"
                    style={progressDotPosition}
                  />
                  <div className="relative h-full w-full overflow-hidden rounded-full border border-white/40 bg-slate-200 shadow-inner dark:border-sky-200/20 dark:bg-slate-800">
                    {imageSrc ? (
                      <img src={imageSrc} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 via-sky-100 to-slate-100 text-4xl font-black text-sky-500 dark:from-slate-900 dark:via-sky-950 dark:to-slate-950">
                        S
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-tr from-slate-950/35 via-transparent to-white/10" />
                  </div>
                </div>
                <div className="mt-3 flex w-36 justify-around text-[11px] font-black text-sky-600 dark:text-sky-300">
                  <span>{formatTime(currentTime)}</span>
                  /
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div className="min-w-0 text-center xl:text-left">
            <p className="text-xs font-bold uppercase text-sky-500 dark:text-sky-300">Lecteur musique</p>
            <h2 className="mt-1 truncate text-2xl font-black text-slate-950 dark:text-white">
              {currentMusic ? currentMusic.Titre : "Aucune musique en lecture"}
            </h2>
            <p className="mt-1 truncate text-sm font-semibold text-slate-500 dark:text-slate-400">
              {playlist.length > 0 ? `${playlist.length} titre${playlist.length > 1 ? "s" : ""} dans la playlist` : "Ajoute une musique ou un album à la playlist"}
            </p>

            <div className="mt-5 flex items-center justify-center gap-5 xl:justify-start">
              <button type="button" onClick={playPrevious} disabled={!currentMusic} className="rounded-full p-3 text-slate-800 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-40 dark:text-white" aria-label="Musique précédente">
                <BackwardIcon className="size-7" />
              </button>
              <button type="button" onClick={togglePlay} disabled={!audioSrc} className="flex size-16 items-center justify-center rounded-full aspect-square bg-sky-500 text-white shadow-xl shadow-sky-500/30 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50" aria-label={isPlaying ? "Mettre en pause" : "Lire"}>
                {isPlaying ? <PauseIcon className="size-8" /> : <PlayIcon className="ml-1 size-8" />}
              </button>
              <button type="button" onClick={playNext} disabled={playlist.length <= 1} className="rounded-full p-3 text-slate-800 transition hover:bg-sky-500/15 disabled:cursor-not-allowed disabled:opacity-40 dark:text-white" aria-label="Musique suivante">
                <ForwardIcon className="size-7" />
              </button>
            </div>
              </div>

              <div className="flex items-center justify-center gap-2 xl:flex-col">
            <button type="button" onClick={toggleRepeatMode} className={`rounded-full border p-3 transition ${repeatMode === "off" ? "border-sky-300/30 bg-sky-500/10 text-slate-700 hover:bg-sky-500/20 dark:text-white" : "border-sky-300/50 bg-sky-500 text-white shadow-lg shadow-sky-500/25"}`} aria-label="Mode de répétition" title={repeatMode === "all" ? "Répéter tout" : repeatMode === "one" ? "Répéter un titre" : "Répétition désactivée"}>
              {repeatMode === "off" ? <ArrowsRightLeftIcon className="size-5" /> : <ArrowPathIcon className="size-5" />}
            </button>
            <button type="button" onClick={() => setPlaylistOpen((current) => !current)} className="inline-flex items-center gap-2 rounded-full border border-sky-300/40 bg-sky-500/15 px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-sky-500/25 dark:text-white" aria-expanded={playlistOpen}>
              <QueueListIcon className="size-5" />
              <span className="hidden sm:inline">Playlist</span>
              <ChevronDownIcon className={`size-4 transition ${playlistOpen ? "rotate-180" : ""}`} />
            </button>
            <div className="relative">
              {volumeOpen && (
                <div className="absolute bottom-full left-1/2 mb-3 flex h-36 -translate-x-1/2 items-center rounded-full border border-sky-300/40 bg-white/95 px-3 py-4 shadow-xl shadow-slate-950/10 backdrop-blur dark:bg-slate-950/95 dark:shadow-sky-950/30">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="h-24 w-2 cursor-pointer accent-sky-500"
                    style={{ writingMode: "vertical-lr", direction: "rtl" }}
                    aria-label="Volume"
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => setVolumeOpen((current) => !current)}
                className={`rounded-full border p-3 transition ${volumeOpen ? "border-sky-300/50 bg-sky-500 text-white shadow-lg shadow-sky-500/25" : "border-sky-300/30 bg-sky-500/10 text-slate-700 hover:bg-sky-500/20 dark:text-white"}`}
                aria-expanded={volumeOpen}
                aria-label="Volume"
                title={`Volume ${Math.round(volume * 100)}%`}
              >
                {volume === 0 ? <SpeakerXMarkIcon className="size-5" /> : <SpeakerWaveIcon className="size-5" />}
              </button>
            </div>
            {repeatMode === "one" && <span className="text-xs font-black text-sky-500 dark:text-sky-300">1</span>}
              </div>
            </div>

            {playlistOpen && (
              <aside className="max-h-72 overflow-auto border-t border-sky-500/10 bg-slate-50/70 px-4 py-4 dark:bg-slate-950/60 sm:px-6 md:absolute md:bottom-0 md:right-0 md:top-0 md:h-auto md:w-[320px] md:max-h-none md:border-l md:border-t-0">
                <div className="mb-3 py-2 flex items-center justify-start gap-3">
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
                      <li
                        key={musique.playlistKey}
                        draggable
                        onDragStart={(event) => handlePlaylistDragStart(event, musique.playlistKey)}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(event) => handlePlaylistDrop(event, musique.playlistKey)}
                        onDragEnd={() => setDraggedPlaylistKey("")}
                        className={`flex items-center gap-3 px-4 py-3 transition ${draggedPlaylistKey === musique.playlistKey ? "bg-sky-500/10 opacity-60" : "hover:bg-sky-500/5"}`}
                      >
                        <span className="shrink-0 cursor-grab text-slate-400 active:cursor-grabbing dark:text-slate-500" aria-hidden="true">
                          <Bars3Icon className="size-4" />
                        </span>
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
              </aside>
            )}
          </div>
        )}

        <audio
          ref={audioRef}
          className="hidden"
          src={audioSrc}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={handleEnded}
        >
          Votre navigateur ne supporte pas le lecteur audio.
        </audio>
      </div>
    </section>
  );
};

export { normalizeMusique };
export default MusicStickyPlayer;
