import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

const MusicPlayerContext = createContext(null);

const normalizeMusique = (musique) => ({
  ...musique,
  playlistKey: `${musique.MusiqueID}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
});

export const MusicPlayerProvider = ({ children }) => {
  const [playlist, setPlaylist] = useState([]);
  const [playerCollapsed, setPlayerCollapsed] = useState(true);
  const [playlistOpen, setPlaylistOpen] = useState(true);
  const [repeatMode, setRepeatMode] = useState("off");
  const [playedIds, setPlayedIds] = useState([]);
  const [volume, setVolume] = useState(0.8);

  const addMusicsToPlaylist = useCallback((items) => {
    const playableItems = (items || []).filter((item) => item?.MusiqueID && item?.CheminAcces);
    if (playableItems.length === 0) return;

    setPlaylist((current) => [
      ...current,
      ...playableItems.map((item) => normalizeMusique(item)),
    ]);
  }, []);

  const value = useMemo(
    () => ({
      playlist,
      setPlaylist,
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
      addMusicsToPlaylist,
      addMusicToPlaylist: (musique) => addMusicsToPlaylist([musique]),
      addAlbumToPlaylist: (album) => addMusicsToPlaylist(album?.Musiques || []),
    }),
    [addMusicsToPlaylist, playedIds, playerCollapsed, playlist, playlistOpen, repeatMode, volume]
  );

  return <MusicPlayerContext.Provider value={value}>{children}</MusicPlayerContext.Provider>;
};

export const useMusicPlayer = () => {
  const context = useContext(MusicPlayerContext);
  if (!context) {
    throw new Error("useMusicPlayer doit etre utilise dans MusicPlayerProvider");
  }
  return context;
};
