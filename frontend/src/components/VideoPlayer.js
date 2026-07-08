import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import api from "../services/api";

const AMBIENT_LIGHT_STORAGE_KEY = "sami-ambient-light-enabled";
const AMBIENT_LIGHT_DEFAULT_COLOR = "rgb(3, 3, 3)";
const AMBIENT_LIGHT_REFRESH_MS = 200;

const VideoPlayer = ({ video, backgroundBlur, onVideoElement, skipFirstPlayLogKey = 0 }) => {
  const videoRef = useRef(null);
  const fitContainerRef = useRef(null);

  // Qualités HLS
  const [availableLevels, setAvailableLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [playerSize, setPlayerSize] = useState({ width: 0, height: 0 });
  const [ambientLightEnabled, setAmbientLightEnabled] = useState(() => {
    try {
      return localStorage.getItem(AMBIENT_LIGHT_STORAGE_KEY) !== "false";
    } catch (e) {
      return true;
    }
  });

  // Réfs internes
  const hlsRef = useRef(null);
  const blurIntervalRef = useRef(null);
  const ambientLightEnabledRef = useRef(ambientLightEnabled);
  const isFullscreenRef = useRef(false);
  const isPictureInPictureRef = useRef(false);

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
    ambientLightEnabledRef.current = ambientLightEnabled;
    try {
      localStorage.setItem(AMBIENT_LIGHT_STORAGE_KEY, ambientLightEnabled ? "true" : "false");
    } catch (e) {
      // ignore
    }

    const videoElement = videoRef.current;
    if (!ambientLightEnabled) {
      stopBackgroundUpdate();
      resetBackgroundColor();
      return;
    }

    if (videoElement && !videoElement.paused && !isFullscreenRef.current && !isPictureInPictureRef.current) {
      startBackgroundUpdate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambientLightEnabled]);

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
    const sourceUrl = `${process.env.REACT_APP_URL_LOCAL}/${video.CheminAcces}`;

    if (Hls.isSupported()) {
      const hls = new Hls({
        // debug: true,
      });

      hls.loadSource(sourceUrl);
      hls.attachMedia(videoElement);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setAvailableLevels(
          hls.levels.map((level, index) => ({
            level: index,
            resolution: `${level.height}p`,
          }))
        );
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.warn("Erreur HLS:", data);
      });

      hlsRef.current = hls;
    } else if (videoElement.canPlayType("application/vnd.apple.mpegurl")) {
      videoElement.src = sourceUrl;
    } else {
      console.warn("Lecteur HLS non supporté par ce navigateur.");
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

    const handleFullscreenChange = () => {
      isFullscreenRef.current = Boolean(document.fullscreenElement);
      if (isFullscreenRef.current) {
        stopBackgroundUpdate();
        resetBackgroundColor();
      } else {
        startBackgroundUpdate();
      }
    };

    const handleEnterPictureInPicture = () => {
      isPictureInPictureRef.current = true;
      stopBackgroundUpdate();
      resetBackgroundColor();
    };

    const handleLeavePictureInPicture = () => {
      isPictureInPictureRef.current = false;
      startBackgroundUpdate();
    };

    const handleWebkitBeginFullscreen = () => {
      isFullscreenRef.current = true;
      stopBackgroundUpdate();
      resetBackgroundColor();
    };

    const handleWebkitEndFullscreen = () => {
      isFullscreenRef.current = false;
      startBackgroundUpdate();
    };

    videoElement.addEventListener("loadedmetadata", handleLoadedMetadata);
    videoElement.addEventListener("play", handlePlay);
    videoElement.addEventListener("pause", stopBackgroundUpdate);
    videoElement.addEventListener("ended", stopBackgroundUpdate);
    videoElement.addEventListener("enterpictureinpicture", handleEnterPictureInPicture);
    videoElement.addEventListener("leavepictureinpicture", handleLeavePictureInPicture);
    videoElement.addEventListener("webkitbeginfullscreen", handleWebkitBeginFullscreen);
    videoElement.addEventListener("webkitendfullscreen", handleWebkitEndFullscreen);
    document.addEventListener("fullscreenchange", handleFullscreenChange);

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
      videoElement.removeEventListener("enterpictureinpicture", handleEnterPictureInPicture);
      videoElement.removeEventListener("leavepictureinpicture", handleLeavePictureInPicture);
      videoElement.removeEventListener("webkitbeginfullscreen", handleWebkitBeginFullscreen);
      videoElement.removeEventListener("webkitendfullscreen", handleWebkitEndFullscreen);
      document.removeEventListener("fullscreenchange", handleFullscreenChange);

      stopBackgroundUpdate();
      resetBackgroundColor();

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
  const resetBackgroundColor = () => {
    if (!backgroundBlur?.current) return;
    backgroundBlur.current.style.backgroundColor = AMBIENT_LIGHT_DEFAULT_COLOR;
  };

  const stopBackgroundUpdate = () => {
    if (blurIntervalRef.current) {
      clearInterval(blurIntervalRef.current);
      blurIntervalRef.current = null;
    }
  };

  const startBackgroundUpdate = () => {
    const videoElement = videoRef.current;
    if (
      !ambientLightEnabledRef.current ||
      isFullscreenRef.current ||
      isPictureInPictureRef.current ||
      !videoElement ||
      videoElement.paused ||
      videoElement.ended
    ) {
      return;
    }

    updateBackgroundColor();
    if (!blurIntervalRef.current) {
      blurIntervalRef.current = setInterval(updateBackgroundColor, AMBIENT_LIGHT_REFRESH_MS);
    }
  };

  const updateBackgroundColor = () => {
    const videoElement = videoRef.current;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    if (
      !ambientLightEnabledRef.current ||
      isFullscreenRef.current ||
      isPictureInPictureRef.current ||
      !videoElement ||
      !backgroundBlur?.current ||
      !videoElement.videoWidth
    ) {
      return;
    }

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

  const toggleAmbientLight = () => {
    setAmbientLightEnabled((enabled) => !enabled);
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
        className="relative border-0 ring-0 group rounded-xl xl:rounded-2xl shadow-xl/30 overflow-hidden"
        style={{
          width: playerSize.width ? `${playerSize.width}px` : "100%",
          height: playerSize.height ? `${playerSize.height}px` : "100%",
        }}
      >
        <video
          ref={videoRef}
          className="relative z-10 w-full h-full rounded-xl xl:rounded-2xl object-contain block"
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

        <div className="ambient-light-selector absolute top-0 right-0 z-50">
          <button
            type="button"
            onClick={toggleAmbientLight}
            aria-pressed={ambientLightEnabled}
            title={ambientLightEnabled ? "Désactiver les lumières d'ambiance" : "Activer les lumières d'ambiance"}
            className="flex items-center gap-2 p-2 opacity-0 duration-700 group-hover:opacity-100 shadow-md backdrop-blur bg-black/40 text-neutral-200 font-semibold border-b border-l border-neutral-500"
            style={{ borderBottomLeftRadius: "0.5rem" }}
          >
            <span
              className={`relative inline-flex h-5 w-10 shrink-0 items-center rounded-full transition-colors duration-200 ${
                ambientLightEnabled ? "bg-sky-500" : "bg-neutral-700"
              }`}
              aria-hidden="true"
            >
              <span
                className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                style={{ transform: ambientLightEnabled ? "translateX(1.25rem)" : "translateX(0.25rem)" }}
              ></span>
            </span>
            <span className="text-sm">Ambiance</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
