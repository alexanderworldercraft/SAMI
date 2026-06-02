import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import api from "../services/api";

const VideoPlayer = ({ video, backgroundBlur, onVideoElement, skipFirstPlayLogKey = 0 }) => {
  const videoRef = useRef(null);
  const fitContainerRef = useRef(null);

  // Qualités HLS
  const [availableLevels, setAvailableLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [playerSize, setPlayerSize] = useState({ width: 0, height: 0 });

  // Réfs internes
  const hlsRef = useRef(null);
  const blurIntervalRef = useRef(null);

  // ✅ 1 seule fois par chargement de page (par vidéo affichée)
  const hasLoggedFirstPlayRef = useRef(false);

  // Reset du flag à chaque changement de vidéo (si le composant reste monté)
  useEffect(() => {
    hasLoggedFirstPlayRef.current = false;
  }, [video?.VideoID]);

  useEffect(() => {
    if (skipFirstPlayLogKey) {
      hasLoggedFirstPlayRef.current = true;
    }
  }, [skipFirstPlayLogKey]);

  useEffect(() => {
    if (onVideoElement) {
      onVideoElement(videoRef.current);
    }

    // Sécurité: si pas de vidéo / pas d'élément video
    const videoElement = videoRef.current;
    if (!videoElement || !video?.CheminAcces) return;

    // -------------------------
    // 1) HLS setup
    // -------------------------
    if (Hls.isSupported()) {
      const hls = new Hls({
        // debug: true,
      });

      hls.loadSource(`${process.env.REACT_APP_URL_LOCAL}/${video.CheminAcces}`);
      hls.attachMedia(videoElement);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setAvailableLevels(
          hls.levels.map((level, index) => ({
            level: index,
            resolution: `${level.height}p`,
          }))
        );
      });

      hlsRef.current = hls;
    }

    // -------------------------
    // 2) Sous-titres
    // -------------------------
    if (video.subtitles && video.subtitles.length > 0) {
      video.subtitles.forEach((subtitle) => {
        const track = document.createElement("track");
        track.kind = "subtitles";
        track.label = subtitle.label;
        track.src = subtitle.url;
        track.default = true;
        videoElement.appendChild(track);
      });
    }

    // -------------------------
    // 3) Events player
    // -------------------------
    const startBackgroundUpdate = () => {
      blurIntervalRef.current = setInterval(updateBackgroundColor, 500);
    };

    const stopBackgroundUpdate = () => {
      if (blurIntervalRef.current) {
        clearInterval(blurIntervalRef.current);
        blurIntervalRef.current = null;
      }
    };

    const handleLoadedMetadata = () => {
      if (!videoElement.videoWidth || !videoElement.videoHeight) return;
      setAspectRatio(videoElement.videoWidth / videoElement.videoHeight);
    };

    const handlePlay = async () => {
      // 1) Log du 1er play (1 fois par chargement de page)
      try {
        if (video?.VideoID && !hasLoggedFirstPlayRef.current) {
          hasLoggedFirstPlayRef.current = true;

          // ⚠️ api est déjà configuré avec /api en baseURL,
          // donc on évite de préfixer à nouveau par /api ici.
          await api.post("/logs/video-first-play", { VideoID: video.VideoID });
        }
      } catch (e) {
        // Ne casse jamais la lecture si le log échoue
        console.warn("Log first play failed:", e?.message || e);
      }

      // 2) Fond dynamique
      startBackgroundUpdate();
    };

    videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoElement.addEventListener("play", handlePlay);
    videoElement.addEventListener("pause", stopBackgroundUpdate);
    videoElement.addEventListener("ended", stopBackgroundUpdate);

    // -------------------------
    // Cleanup
    // -------------------------
    return () => {
      try {
        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }
      } catch (e) {
        // ignore
      }

      videoElement.removeEventListener("loadedmetadata", handleLoadedMetadata);
      videoElement.removeEventListener("play", handlePlay);
      videoElement.removeEventListener("pause", stopBackgroundUpdate);
      videoElement.removeEventListener("ended", stopBackgroundUpdate);

      stopBackgroundUpdate();

      // Nettoyage des tracks ajoutés dynamiquement
      try {
        const tracks = Array.from(videoElement.querySelectorAll("track"));
        tracks.forEach((t) => t.remove());
      } catch (e) {
        // ignore
      }

      // Reset des levels au prochain mount
      setAvailableLevels([]);
      setSelectedLevel(-1);

      if (onVideoElement) {
        onVideoElement(null);
      }
    };

    // ⚠️ on dépend de video?.VideoID et video?.CheminAcces pour ne pas rebrancher en boucle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video?.VideoID, video?.CheminAcces, onVideoElement]);

  useEffect(() => {
    const container = fitContainerRef.current;
    if (!container) return;

    const computeFit = () => {
      const availableWidth = container.clientWidth;
      const availableHeight = container.clientHeight;
      if (!availableWidth || !availableHeight) return;

      const containerRatio = availableWidth / availableHeight;
      let width;
      let height;

      if (containerRatio > aspectRatio) {
        height = availableHeight;
        width = Math.floor(availableHeight * aspectRatio);
      } else {
        width = availableWidth;
        height = Math.floor(availableWidth / aspectRatio);
      }

      setPlayerSize({ width, height });
    };

    computeFit();
    const observer = new ResizeObserver(computeFit);
    observer.observe(container);

    return () => observer.disconnect();
  }, [aspectRatio]);

  // -------------------------
  // Fond dynamique (moyenne couleur)
  // -------------------------
  const updateBackgroundColor = () => {
    const videoElement = videoRef.current;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (!videoElement || !backgroundBlur?.current || !videoElement.videoWidth) return;

    canvas.width = videoElement.videoWidth / 10;
    canvas.height = videoElement.videoHeight / 10;

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    const frame = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let r = 0,
      g = 0,
      b = 0,
      count = 0;

    for (let i = 0; i < frame.length; i += 4) {
      r += frame[i];
      g += frame[i + 1];
      b += frame[i + 2];
      count++;
    }

    r = Math.floor(r / count);
    g = Math.floor(g / count);
    b = Math.floor(b / count);

    backgroundBlur.current.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
  };

  // -------------------------
  // Résolution
  // -------------------------
  const changeResolution = (level) => {
    setSelectedLevel(level);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = level;
    }
  };

  return (
    <div ref={fitContainerRef} className="relative w-full h-full flex items-center justify-center">
      <div
        className="relative group bg-neutral-900/50 rounded-xl lg:rounded-2xl xl:rounded-3xl shadow-xl overflow-hidden"
        style={{
          width: playerSize.width ? `${playerSize.width}px` : "100%",
          height: playerSize.height ? `${playerSize.height}px` : "100%",
        }}
      >
        <video
          ref={videoRef}
          className="relative z-10 w-full h-full object-contain block"
          controls
          preload="auto"
        ></video>

        {availableLevels.length > 0 && (
          <div className="resolution-selector absolute top-0 left-0 z-50">
            <select
              value={selectedLevel}
              onChange={(e) => changeResolution(parseInt(e.target.value))}
              className="p-2 opacity-0 duration-700 group-hover:opacity-100 rounded-br-lg shadow-md backdrop-blur bg-black/40 text-neutral-200 font-semibold border-b border-r border-neutral-500"
            >
              <option value="-1">Auto</option>
              {availableLevels.map((level) => (
                <option key={level.level} value={level.level} className="border-none">
                  {level.resolution}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoPlayer;
