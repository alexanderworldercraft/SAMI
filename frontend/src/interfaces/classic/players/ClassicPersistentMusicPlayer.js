import React from "react";
import { useLocation } from "react-router-dom";
import { useMusicPlayer } from "../../../context/MusicPlayerContext";
import MusicStickyPlayer from "./MusicStickyPlayer";

export default function ClassicPersistentMusicPlayer() {
  const location = useLocation();
  const { playlist, setPlaylist } = useMusicPlayer();
  const isMusicPage = location.pathname === "/musique";
  const canShowMusicPlayer =
    isMusicPage ||
    location.pathname === "/nouvelle-video" ||
    location.pathname === "/nouvelle-musique" ||
    location.pathname === "/personnes" ||
    location.pathname.startsWith("/personnes/") ||
    location.pathname === "/sagas" ||
    location.pathname === "/videos";

  if (!canShowMusicPlayer || (!isMusicPage && playlist.length === 0)) return null;

  return <MusicStickyPlayer playlist={playlist} setPlaylist={setPlaylist} />;
}


