import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import api from "../services/api";
import {
  parsePreviewLiveVtt,
  toAbsoluteAssetUrl,
} from "../utils/previewLive";

const AMBIENT_LIGHT_STORAGE_KEY = "sami-ambient-light-enabled";
const AMBIENT_LIGHT_DEFAULT_COLOR = "rgb(3, 3, 3)";
const AMBIENT_LIGHT_REFRESH_MS = 200;
const PLAYER_SEEK_SECONDS = 15;
const PLAYER_SINGLE_CLICK_DELAY_MS = 300;
const PLAYER_CONTROLS_HIDE_DELAY_MS = 3000;
const PLAYER_CENTER_TARGET = {
  widthRatio: 0.24,
  minWidth: 120,
  maxWidth: 320,
  heightRatio: 0.34,
  minHeight: 96,
  maxHeight: 220,
};

const formatPlaybackTime = (seconds) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

const VideoPlayer = ({ video, backgroundBlur, onVideoElement, skipFirstPlayLogKey = 0 }) => {
  const videoRef = useRef(null);
  const fitContainerRef = useRef(null);
  const playerContainerRef = useRef(null);

  // Qualités HLS
  const [availableLevels, setAvailableLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [playerSize, setPlayerSize] = useState({ width: 0, height: 0 });
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [controlsDismissed, setControlsDismissed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState(0);
  const [subtitleMenuOpen, setSubtitleMenuOpen] = useState(false);
  const [previewCues, setPreviewCues] = useState([]);
  const [hoverPreview, setHoverPreview] = useState(null);
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
  const pendingCenterClickRef = useRef(null);
  const controlsHideTimeoutRef = useRef(null);

  // ✅ 1 seule fois par chargement de page (par vidéo affichée)
  const hasLoggedFirstPlayRef = useRef(false);

  // Reset du flag à chaque changement de vidéo (si le composant reste monté)
  useEffect(() => {
    hasLoggedFirstPlayRef.current = false;
    setDuration(0);
    setCurrentTime(0);
    setBufferedTime(0);
    setPlaying(false);
    setControlsVisible(false);
    setControlsDismissed(false);
    setCaptionsEnabled(true);
    setSelectedSubtitleIndex(0);
    setSubtitleMenuOpen(false);
    setPreviewCues([]);
    setHoverPreview(null);

    if (pendingCenterClickRef.current) {
      clearTimeout(pendingCenterClickRef.current);
      pendingCenterClickRef.current = null;
    }
    if (controlsHideTimeoutRef.current) {
      clearTimeout(controlsHideTimeoutRef.current);
      controlsHideTimeoutRef.current = null;
    }
  }, [video?.VideoID]);

  useEffect(() => () => {
    if (pendingCenterClickRef.current) {
      clearTimeout(pendingCenterClickRef.current);
    }
    if (controlsHideTimeoutRef.current) {
      clearTimeout(controlsHideTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!video?.VideoID) return undefined;

    let cancelled = false;
    const loadPreviewLive = async () => {
      try {
        const response = await api.get(`/videos/${video.VideoID}/preview-live`);
        const vttUrl = toAbsoluteAssetUrl(response?.data?.vttUrl);
        if (!vttUrl) return;

        const vttResponse = await fetch(vttUrl, { credentials: "include" });
        if (!vttResponse.ok) {
          throw new Error(`WebVTT indisponible (${vttResponse.status})`);
        }

        const vttContent = await vttResponse.text();
        if (!cancelled) {
          setPreviewCues(parsePreviewLiveVtt(vttContent, vttUrl));
        }
      } catch (error) {
        if (cancelled || error?.response?.status === 403) return;
        console.warn(
          "Preview Live indisponible :",
          error?.response?.data?.error || error?.message || "erreur inconnue"
        );
      }
    };

    loadPreviewLive();
    return () => {
      cancelled = true;
    };
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
      video.subtitles.forEach((subtitle, index) => {
        const track = document.createElement("track");
        track.kind = "subtitles";
        track.label = subtitle.label;
        track.src = subtitle.url;
        track.default = index === 0;
        track.addEventListener("load", () => {
          track.track.mode = index === 0 ? "showing" : "hidden";
        }, { once: true });
        videoElement.appendChild(track);
      });
    }

    // -------------------------
    // 3) Events player
    // -------------------------
    const handleLoadedMetadata = () => {
      setDuration(Number.isFinite(videoElement.duration) ? videoElement.duration : 0);
      setCurrentTime(videoElement.currentTime || 0);
      if (!videoElement.videoWidth || !videoElement.videoHeight) return;
      setAspectRatio(videoElement.videoWidth / videoElement.videoHeight);
    };

    const handlePlay = async () => {
      setPlaying(true);
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

    const handlePause = () => {
      setPlaying(false);
      stopBackgroundUpdate();
    };

    const handleEnded = () => {
      setPlaying(false);
      stopBackgroundUpdate();
    };

    const handleTimeUpdate = () => {
      setCurrentTime(videoElement.currentTime || 0);
    };

    const handleDurationChange = () => {
      setDuration(Number.isFinite(videoElement.duration) ? videoElement.duration : 0);
    };

    const handleProgress = () => {
      if (!videoElement.buffered.length) {
        setBufferedTime(0);
        return;
      }
      setBufferedTime(videoElement.buffered.end(videoElement.buffered.length - 1));
    };

    const handleVolumeChange = () => {
      setVolume(videoElement.volume);
      setMuted(videoElement.muted);
    };

    const handleFullscreenChange = () => {
      isFullscreenRef.current = Boolean(document.fullscreenElement);
      setIsFullscreen(isFullscreenRef.current);
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
    videoElement.addEventListener("pause", handlePause);
    videoElement.addEventListener("ended", handleEnded);
    videoElement.addEventListener("timeupdate", handleTimeUpdate);
    videoElement.addEventListener("durationchange", handleDurationChange);
    videoElement.addEventListener("progress", handleProgress);
    videoElement.addEventListener("volumechange", handleVolumeChange);
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
      videoElement.removeEventListener("pause", handlePause);
      videoElement.removeEventListener("ended", handleEnded);
      videoElement.removeEventListener("timeupdate", handleTimeUpdate);
      videoElement.removeEventListener("durationchange", handleDurationChange);
      videoElement.removeEventListener("progress", handleProgress);
      videoElement.removeEventListener("volumechange", handleVolumeChange);
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

  const togglePlayback = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    if (videoElement.paused) {
      videoElement.play().catch((error) => {
        console.warn("Lecture impossible :", error.message);
      });
    } else {
      videoElement.pause();
    }
  };

  const seekTo = (time) => {
    const videoElement = videoRef.current;
    if (!videoElement || !Number.isFinite(time)) return;
    videoElement.currentTime = Math.max(0, Math.min(time, duration || time));
    setCurrentTime(videoElement.currentTime);
  };

  const seekBy = (seconds) => {
    const videoElement = videoRef.current;
    if (!videoElement || !Number.isFinite(seconds)) return;

    const mediaDuration = Number.isFinite(videoElement.duration) && videoElement.duration > 0
      ? videoElement.duration
      : duration;
    const nextTime = (videoElement.currentTime || 0) + seconds;
    videoElement.currentTime = Math.max(
      0,
      mediaDuration > 0 ? Math.min(nextTime, mediaDuration) : nextTime
    );
    setCurrentTime(videoElement.currentTime);
  };

  const handleProgressHover = (event) => {
    if (!duration || previewCues.length === 0) {
      setHoverPreview(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const offset = Math.max(0, Math.min(event.clientX - rect.left, rect.width));
    const time = (offset / rect.width) * duration;
    const cue = previewCues.find((item) => time >= item.start && time < item.end)
      || previewCues[previewCues.length - 1];
    const previewHalfWidth = cue.width / 2;
    const clampedLeft = Math.max(
      previewHalfWidth,
      Math.min(offset, rect.width - previewHalfWidth)
    );

    setHoverPreview({ cue, time, left: clampedLeft });
  };

  const updateVolume = (nextVolume) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    videoElement.volume = nextVolume;
    videoElement.muted = nextVolume === 0;
  };

  const toggleMute = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    videoElement.muted = !videoElement.muted;
  };

  const applySubtitleSelection = (subtitleIndex, enabled) => {
    const tracks = Array.from(videoRef.current?.textTracks || []);
    tracks.forEach((track, index) => {
      track.mode = enabled && index === subtitleIndex ? "showing" : "hidden";
    });
  };

  const toggleCaptions = () => {
    const nextEnabled = !captionsEnabled;
    applySubtitleSelection(selectedSubtitleIndex, nextEnabled);
    setCaptionsEnabled(nextEnabled);
  };

  const selectSubtitle = (subtitleIndex) => {
    applySubtitleSelection(subtitleIndex, true);
    setSelectedSubtitleIndex(subtitleIndex);
    setCaptionsEnabled(true);
  };

  const handleSubtitleMenuBlur = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setSubtitleMenuOpen(false);
    }
  };

  const handleSubtitleMenuMouseLeave = (event) => {
    if (!event.currentTarget.contains(document.activeElement)) {
      setSubtitleMenuOpen(false);
    }
  };

  const toggleFullscreen = async () => {
    const container = playerContainerRef.current;
    if (!container) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await container.requestFullscreen();
      }
    } catch (error) {
      console.warn("Plein écran indisponible :", error.message);
    }
  };

  const showControls = () => {
    setControlsVisible(true);
    setControlsDismissed(false);
    if (controlsHideTimeoutRef.current) {
      clearTimeout(controlsHideTimeoutRef.current);
    }
    controlsHideTimeoutRef.current = setTimeout(() => {
      setControlsVisible(false);
      controlsHideTimeoutRef.current = null;
    }, PLAYER_CONTROLS_HIDE_DELAY_MS);
  };

  const hideControls = () => {
    setControlsVisible(false);
    setControlsDismissed(true);
    if (controlsHideTimeoutRef.current) {
      clearTimeout(controlsHideTimeoutRef.current);
      controlsHideTimeoutRef.current = null;
    }
  };

  const toggleControls = () => {
    if (controlsVisible) {
      hideControls();
    } else {
      showControls();
    }
  };

  const getInteractionPosition = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    return {
      x: Math.max(0, Math.min(event.clientX - rect.left, rect.width)),
      y: Math.max(0, Math.min(event.clientY - rect.top, rect.height)),
      width: rect.width,
      height: rect.height,
    };
  };

  const isCenterPlayTarget = ({ x, y, width, height }) => {
    const targetWidth = Math.min(
      width / 2,
      PLAYER_CENTER_TARGET.maxWidth,
      Math.max(PLAYER_CENTER_TARGET.minWidth, width * PLAYER_CENTER_TARGET.widthRatio)
    );
    const targetHeight = Math.min(
      PLAYER_CENTER_TARGET.maxHeight,
      Math.max(PLAYER_CENTER_TARGET.minHeight, height * PLAYER_CENTER_TARGET.heightRatio)
    );

    return (
      Math.abs(x - width / 2) <= targetWidth / 2
      && Math.abs(y - height / 2) <= targetHeight / 2
    );
  };

  const handlePlayerClick = (event) => {
    // Le second clic d'un double-clic ne doit ni basculer les contrôles,
    // ni programmer l'action centrale.
    if (event.detail > 1) return;

    toggleControls();

    const position = getInteractionPosition(event);
    if (!position || !isCenterPlayTarget(position)) return;

    if (pendingCenterClickRef.current) {
      clearTimeout(pendingCenterClickRef.current);
    }
    pendingCenterClickRef.current = setTimeout(() => {
      togglePlayback();
      pendingCenterClickRef.current = null;
    }, PLAYER_SINGLE_CLICK_DELAY_MS);
  };

  const handlePlayerDoubleClick = (event) => {
    event.preventDefault();
    showControls();

    if (pendingCenterClickRef.current) {
      clearTimeout(pendingCenterClickRef.current);
      pendingCenterClickRef.current = null;
    }

    const position = getInteractionPosition(event);
    if (!position) return;

    if (position.x < position.width / 4) {
      seekBy(-PLAYER_SEEK_SECONDS);
    } else if (position.x >= position.width * 3 / 4) {
      seekBy(PLAYER_SEEK_SECONDS);
    } else {
      toggleFullscreen();
    }
  };

  const playedPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const bufferedPercent = duration > 0 ? Math.min(100, (bufferedTime / duration) * 100) : 0;
  const playerChromeVisibilityClass = controlsDismissed
    ? "opacity-0"
    : playing && !controlsVisible
      ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
      : "opacity-100";
  const topControlsVisibilityClass = controlsDismissed
    ? `${playerChromeVisibilityClass} pointer-events-none`
    : playerChromeVisibilityClass;

  return (
    <div ref={fitContainerRef} className="relative w-full h-full flex items-center justify-center">
      <div
        ref={playerContainerRef}
        className="relative border-0 ring-0 group rounded-xl xl:rounded-2xl shadow-xl/30 overflow-hidden"
        style={{
          width: isFullscreen ? "100vw" : playerSize.width ? `${playerSize.width}px` : "100%",
          height: isFullscreen ? "100vh" : playerSize.height ? `${playerSize.height}px` : "100%",
        }}
      >
        <video
          ref={videoRef}
          className="relative z-10 w-full h-full rounded-xl xl:rounded-2xl object-contain block"
          preload="auto"
        />

        <div
          data-testid="player-interaction-layer"
          className="absolute inset-0 z-20 cursor-pointer select-none"
          style={{ touchAction: "manipulation" }}
          onClick={handlePlayerClick}
          onDoubleClick={handlePlayerDoubleClick}
          aria-hidden="true"
        />

        {availableLevels.length > 0 && (
          <div
            className={`resolution-selector absolute top-0 left-0 z-50 transition-opacity duration-200 ${topControlsVisibilityClass}`}
          >
            <select
              value={selectedLevel}
              onChange={(e) => changeResolution(parseInt(e.target.value))}
              className="p-2 rounded-br-lg shadow-md backdrop-blur bg-black/40 text-neutral-200 font-semibold border-b border-r border-neutral-500"
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

        <div
          data-testid="ambient-light-selector"
          className={`ambient-light-selector absolute top-0 right-0 z-50 transition-opacity duration-200 ${topControlsVisibilityClass}`}
        >
          <button
            type="button"
            onClick={toggleAmbientLight}
            aria-pressed={ambientLightEnabled}
            title={ambientLightEnabled ? "Désactiver les lumières d'ambiance" : "Activer les lumières d'ambiance"}
            className="flex items-center gap-2 p-2 shadow-md backdrop-blur bg-black/40 text-neutral-200 font-semibold border-b border-l border-neutral-500"
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

        <div
          data-testid="player-controls"
          className={`absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black/95 via-black/65 to-transparent px-3 pb-3 pt-10 text-white transition-opacity duration-200 ${playerChromeVisibilityClass}`}
        >
          <div
            className="relative mb-2 flex h-5 items-center"
            onMouseMove={handleProgressHover}
            onMouseLeave={() => setHoverPreview(null)}
          >
            {hoverPreview?.cue && (
              <div
                className="pointer-events-none absolute bottom-7 overflow-hidden rounded-lg border border-white/30 bg-black shadow-2xl"
                style={{
                  left: `${hoverPreview.left}px`,
                  width: `${hoverPreview.cue.width}px`,
                  transform: "translateX(-50%)",
                }}
              >
                <div
                  style={{
                    width: `${hoverPreview.cue.width}px`,
                    height: `${hoverPreview.cue.height}px`,
                    backgroundImage: `url("${hoverPreview.cue.imageUrl}")`,
                    backgroundPosition: `-${hoverPreview.cue.x}px -${hoverPreview.cue.y}px`,
                    backgroundRepeat: "no-repeat",
                  }}
                />
                <div className="bg-black/90 py-1 text-center text-xs font-semibold">
                  {formatPlaybackTime(hoverPreview.time)}
                </div>
              </div>
            )}

            <div
              className="pointer-events-none absolute inset-x-0 h-1.5 overflow-hidden rounded-full bg-white/25"
              aria-hidden="true"
            >
              <div
                className="absolute inset-y-0 left-0 bg-white/35"
                style={{ width: `${bufferedPercent}%` }}
              />
              <div
                className="absolute inset-y-0 left-0 bg-sky-500"
                style={{ width: `${playedPercent}%` }}
              />
            </div>
            <input
              type="range"
              min="0"
              max={duration || 0}
              step="0.05"
              value={Math.min(currentTime, duration || 0)}
              onChange={(event) => seekTo(Number(event.target.value))}
              aria-label="Position de lecture"
              className="relative z-10 h-5 w-full cursor-pointer opacity-0"
            />
          </div>

          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={togglePlayback}
              className="min-w-7 rounded p-1 text-lg leading-none hover:bg-white/15"
              aria-label={playing ? "Mettre en pause" : "Lire"}
            >
              {playing ? "❚❚" : "▶"}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              className="rounded p-1 hover:bg-white/15"
              aria-label={muted ? "Réactiver le son" : "Couper le son"}
            >
              {muted || volume === 0 ? "🔇" : "🔊"}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={muted ? 0 : volume}
              onChange={(event) => updateVolume(Number(event.target.value))}
              aria-label="Volume"
              className="hidden h-1 w-20 cursor-pointer accent-sky-500 sm:block"
            />

            <span className="tabular-nums text-xs font-semibold text-white/90">
              {formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}
            </span>

            <span className="flex-1" />

            {video?.subtitles?.length > 0 && (
              <div
                className="relative"
                onMouseEnter={() => setSubtitleMenuOpen(true)}
                onMouseLeave={handleSubtitleMenuMouseLeave}
                onFocusCapture={() => setSubtitleMenuOpen(true)}
                onBlurCapture={handleSubtitleMenuBlur}
              >
                {subtitleMenuOpen && (
                  <div
                    role="menu"
                    aria-label="Choisir les sous-titres"
                    className="absolute bottom-full right-0 z-50 min-w-48 overflow-hidden rounded-lg border border-white/20 bg-black/95 p-1.5 text-left shadow-2xl backdrop-blur"
                  >
                    <p className="px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-white/55">
                      Sous-titres
                    </p>
                    <div className="max-h-48 overflow-y-auto">
                      {video.subtitles.map((subtitle, index) => {
                        const isSelected = captionsEnabled && selectedSubtitleIndex === index;
                        return (
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={isSelected}
                            key={`${subtitle.label || "Sous-titre"}-${index}`}
                            onClick={() => selectSubtitle(index)}
                            className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-sm transition ${
                              isSelected
                                ? "bg-sky-500/25 font-bold text-sky-100"
                                : "text-white/80 hover:bg-white/10 hover:text-white focus:bg-white/10 focus:text-white"
                            }`}
                          >
                            <span>{subtitle.label || `Sous-titre ${index + 1}`}</span>
                            <span className="w-4 text-center text-sky-300" aria-hidden="true">
                              {isSelected ? "✓" : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={toggleCaptions}
                  aria-pressed={captionsEnabled}
                  aria-haspopup="menu"
                  aria-expanded={subtitleMenuOpen}
                  aria-label={captionsEnabled ? "Désactiver les sous-titres" : "Activer les sous-titres"}
                  className={`rounded px-2 py-1 text-xs font-black transition ${
                    captionsEnabled ? "bg-sky-500 text-white" : "bg-white/15 text-white/75"
                  }`}
                >
                  CC
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded p-1 text-lg leading-none hover:bg-white/15"
              aria-label="Basculer en plein écran"
            >
              ⛶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
