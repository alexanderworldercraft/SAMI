import React, { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { ArrowLeftIcon, GlobeAltIcon } from "@heroicons/react/24/outline";
import { CheckIcon, Cog6ToothIcon } from "@heroicons/react/24/solid";
import api from "../services/api";
import {
  parsePreviewLiveVtt,
  toAbsoluteAssetUrl,
} from "../utils/previewLive";
import { resolvePlayerLanguageFlag } from "../utils/playerLanguageFlags";
import {
  AMBIENT_LIGHT_DEFAULT_COLOR,
  AMBIENT_LIGHT_REFRESH_RATES,
  AMBIENT_LIGHT_STORAGE_KEY,
  DEFAULT_AMBIENT_LIGHT_PREFERENCES,
  buildAmbientDomeColors,
  extractWeightedFrameColor,
  extractWeightedPerimeterColors,
  normalizeAmbientLightPreferences,
  readLegacyAmbientLightEnabled,
} from "../utils/ambientLight";

const PLAYER_SEEK_SECONDS = 15;
const PLAYER_VOLUME_STEP = 0.05;
const PLAYER_SINGLE_CLICK_DELAY_MS = 300;
const PLAYER_CONTROLS_HIDE_DELAY_MS = 3000;
const PLAYER_KEYBOARD_SHORTCUTS = [
  { key: "←", label: "Reculer de 15 secondes" },
  { key: "→", label: "Avancer de 15 secondes" },
  { key: "↑", label: "Augmenter le volume" },
  { key: "↓", label: "Réduire le volume" },
  { key: "Espace", label: "Lecture / pause" },
];
const PLAYER_CLICK_COMMANDS = [
  { key: "1 clic", label: "Afficher / masquer les contrôles" },
  { key: "Centre", label: "Lecture / pause" },
  { key: "2× gauche", label: "Reculer de 15 secondes" },
  { key: "2× centre", label: "Basculer en plein écran" },
  { key: "2× droite", label: "Avancer de 15 secondes" },
];
const PLAYER_CENTER_TARGET = {
  widthRatio: 0.24,
  minWidth: 120,
  maxWidth: 320,
  heightRatio: 0.34,
  minHeight: 96,
  maxHeight: 220,
};

const SETTINGS_PANEL = {
  MAIN: "main",
  SUBTITLES: "subtitles",
  AUDIO: "audio",
  QUALITY: "quality",
  AMBIENT: "ambient",
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

const isInteractiveShortcutTarget = (target) => Boolean(target?.closest?.(
  'input, textarea, select, button, a[href], [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="menuitem"], [role="menuitemradio"], [role="slider"], [role="textbox"], [role="combobox"], [role="spinbutton"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"]'
));

const PlayerLanguageFlag = ({ flag }) => (
  flag ? (
    <img
      src={flag.src}
      alt=""
      aria-hidden="true"
      title={`Langue : ${flag.name}`}
      className="h-4 w-6 shrink-0 rounded-sm border border-white/20 object-cover shadow-sm"
    />
  ) : (
    <span
      title="Langue non identifiée"
      aria-label="Langue non identifiée"
      className="flex h-4 w-6 shrink-0 items-center justify-center rounded-sm border border-white/15 bg-white/5"
    >
      <GlobeAltIcon className="h-3.5 w-3.5 text-white/55" aria-hidden="true" />
    </span>
  )
);

const SettingsTile = ({
  title,
  value,
  disabled = false,
  onClick,
  flag = undefined,
  children = null,
  role = "menuitem",
  ariaChecked = undefined,
}) => (
  <button
    type="button"
    role={role}
    aria-checked={ariaChecked}
    disabled={disabled}
    onClick={onClick}
    className={`flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl border px-3 py-4 text-center transition ${
      disabled
        ? "cursor-not-allowed border-white/5 bg-white/[0.025] text-white/30"
        : "border-white/5 bg-white/[0.055] text-white/85 hover:border-sky-400/30 hover:bg-white/10 focus:border-sky-400/50 focus:bg-white/10"
    }`}
  >
    <span className="text-sm font-bold sm:text-base">{title}</span>
    {children || (
      <span className="flex min-w-0 max-w-full items-center gap-2 text-xs text-white/55 sm:text-sm">
        {flag !== undefined && <PlayerLanguageFlag flag={flag} />}
        <span className="truncate">{value}</span>
      </span>
    )}
  </button>
);

const VideoPlayer = ({
  video,
  backgroundBlur,
  onVideoElement,
  skipFirstPlayLogKey = 0,
  multiAudioEnabled = false,
}) => {
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
  const [availableAudioTracks, setAvailableAudioTracks] = useState([]);
  const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] = useState(-1);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState(SETTINGS_PANEL.MAIN);
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
  const [previewCues, setPreviewCues] = useState([]);
  const [hoverPreview, setHoverPreview] = useState(null);
  const [ambientLightPreferences, setAmbientLightPreferences] = useState(
    DEFAULT_AMBIENT_LIGHT_PREFERENCES
  );
  const [ambientPreferencesError, setAmbientPreferencesError] = useState("");

  // Réfs internes
  const hlsRef = useRef(null);
  const blurIntervalRef = useRef(null);
  const ambientVideoFrameRequestRef = useRef(null);
  const ambientVideoFrameOwnerRef = useRef(null);
  const ambientLastUpdateAtRef = useRef(0);
  const ambientSampleCanvasRef = useRef(null);
  const ambientLightPreferencesRef = useRef(ambientLightPreferences);
  const ambientPreferencesErrorRef = useRef(ambientPreferencesError);
  const ambientPreferencesTouchedRef = useRef(false);
  const ambientPreferenceSaveQueueRef = useRef(Promise.resolve());
  const componentMountedRef = useRef(true);
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
    setAvailableAudioTracks([]);
    setSelectedAudioTrackIndex(-1);
    setSettingsMenuOpen(false);
    setSettingsPanel(SETTINGS_PANEL.MAIN);
    setKeyboardHelpOpen(false);
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

  useEffect(() => {
    componentMountedRef.current = true;
    return () => {
      componentMountedRef.current = false;
      if (pendingCenterClickRef.current) {
        clearTimeout(pendingCenterClickRef.current);
      }
      if (controlsHideTimeoutRef.current) {
        clearTimeout(controlsHideTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadAmbientPreferences = async () => {
      const legacyEnabled = readLegacyAmbientLightEnabled();

      try {
        const response = await api.get("/users/player-preferences");
        if (cancelled || ambientPreferencesTouchedRef.current) return;
        let preferences = normalizeAmbientLightPreferences(response.data?.preferences);

        if (!response.data?.initialized) {
          preferences = {
            ...preferences,
            ambientLightEnabled: legacyEnabled ?? preferences.ambientLightEnabled,
          };
          const migrationResponse = await api.put("/users/player-preferences", preferences);
          preferences = normalizeAmbientLightPreferences(
            migrationResponse.data?.preferences || preferences
          );
          if (cancelled || ambientPreferencesTouchedRef.current) return;
        }

        if (cancelled) return;
        ambientLightPreferencesRef.current = preferences;
        setAmbientLightPreferences(preferences);
        if (ambientPreferencesErrorRef.current) {
          ambientPreferencesErrorRef.current = "";
          setAmbientPreferencesError("");
        }
        try {
          localStorage.removeItem(AMBIENT_LIGHT_STORAGE_KEY);
        } catch (error) {
          // La préférence est déjà persistée sur le compte.
        }
      } catch (error) {
        if (cancelled || ambientPreferencesTouchedRef.current) return;
        const fallbackPreferences = {
          ...DEFAULT_AMBIENT_LIGHT_PREFERENCES,
          ambientLightEnabled: legacyEnabled
            ?? DEFAULT_AMBIENT_LIGHT_PREFERENCES.ambientLightEnabled,
        };
        ambientLightPreferencesRef.current = fallbackPreferences;
        setAmbientLightPreferences(fallbackPreferences);
        if (![401, 403].includes(error?.response?.status)) {
          const message = "Les préférences du compte sont momentanément indisponibles.";
          ambientPreferencesErrorRef.current = message;
          setAmbientPreferencesError(message);
        }
      }
    };

    loadAmbientPreferences();
    return () => {
      cancelled = true;
    };
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
    ambientLightPreferencesRef.current = ambientLightPreferences;
    const videoElement = videoRef.current;
    stopBackgroundUpdate();
    if (!ambientLightPreferences.ambientLightEnabled) {
      resetBackgroundColor();
      return;
    }

    if (videoElement && !videoElement.paused && !isFullscreenRef.current && !isPictureInPictureRef.current) {
      startBackgroundUpdate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ambientLightPreferences]);

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

      hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_event, data) => {
        const tracks = (data.audioTracks || []).map((track, index) => ({
          index,
          label:
            track.name
            || video.audioTracks?.[index]?.label
            || track.lang
            || `Audio ${index + 1}`,
          language: track.lang || video.audioTracks?.[index]?.language || null,
        }));
        setAvailableAudioTracks(tracks);

        const defaultIndex = tracks.findIndex(
          (_track, index) => data.audioTracks?.[index]?.default
        );
        setSelectedAudioTrackIndex(
          hls.audioTrack >= 0 ? hls.audioTrack : defaultIndex
        );
      });

      hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_event, data) => {
        setSelectedAudioTrackIndex(data.id);
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

      if (!hlsRef.current && videoElement.audioTracks?.length > 0) {
        const nativeTracks = Array.from(
          { length: videoElement.audioTracks.length },
          (_unused, index) => videoElement.audioTracks[index]
        );
        setAvailableAudioTracks(
          nativeTracks.map((track, index) => ({
            index,
            label:
              track.label
              || video.audioTracks?.[index]?.label
              || track.language
              || `Audio ${index + 1}`,
            language: track.language || video.audioTracks?.[index]?.language || null,
          }))
        );
        const enabledIndex = nativeTracks.findIndex((track) => track.enabled);
        setSelectedAudioTrackIndex(enabledIndex >= 0 ? enabledIndex : 0);
      }

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
      setAvailableAudioTracks([]);
      setSelectedAudioTrackIndex(-1);
      setSettingsMenuOpen(false);
      setSettingsPanel(SETTINGS_PANEL.MAIN);

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
  // Fond dynamique (couleur globale ou pourtour multi-zones)
  // -------------------------
  const resetBackgroundColor = () => {
    const ambientCanvas = backgroundBlur?.current;
    if (!ambientCanvas) return;
    if (ambientCanvas.tagName === "CANVAS") {
      ambientCanvas.width = 1;
      ambientCanvas.height = 1;
    }
    ambientCanvas.style.backgroundColor = AMBIENT_LIGHT_DEFAULT_COLOR;
  };

  const stopBackgroundUpdate = () => {
    if (blurIntervalRef.current) {
      clearInterval(blurIntervalRef.current);
      blurIntervalRef.current = null;
    }
    const frameOwner = ambientVideoFrameOwnerRef.current;
    if (
      ambientVideoFrameRequestRef.current !== null
      && typeof frameOwner?.cancelVideoFrameCallback === "function"
    ) {
      frameOwner.cancelVideoFrameCallback(ambientVideoFrameRequestRef.current);
    }
    ambientVideoFrameRequestRef.current = null;
    ambientVideoFrameOwnerRef.current = null;
    ambientLastUpdateAtRef.current = 0;
  };

  const startBackgroundUpdate = () => {
    const videoElement = videoRef.current;
    const preferences = ambientLightPreferencesRef.current;
    if (
      !preferences.ambientLightEnabled ||
      isFullscreenRef.current ||
      isPictureInPictureRef.current ||
      !videoElement ||
      videoElement.paused ||
      videoElement.ended
    ) {
      return;
    }

    updateBackgroundColor();
    const refreshInterval = 1000 / preferences.ambientLightRefreshRate;

    if (typeof videoElement.requestVideoFrameCallback === "function") {
      if (ambientVideoFrameRequestRef.current !== null) return;
      ambientLastUpdateAtRef.current = performance.now();
      ambientVideoFrameOwnerRef.current = videoElement;

      const handleVideoFrame = (timestamp) => {
        const currentPreferences = ambientLightPreferencesRef.current;
        if (
          !currentPreferences.ambientLightEnabled
          || videoElement.paused
          || videoElement.ended
          || isFullscreenRef.current
          || isPictureInPictureRef.current
        ) {
          ambientVideoFrameRequestRef.current = null;
          return;
        }

        const currentRefreshInterval = 1000 / currentPreferences.ambientLightRefreshRate;
        if (timestamp - ambientLastUpdateAtRef.current >= currentRefreshInterval) {
          updateBackgroundColor();
          ambientLastUpdateAtRef.current = timestamp;
        }
        ambientVideoFrameRequestRef.current = videoElement.requestVideoFrameCallback(handleVideoFrame);
      };

      ambientVideoFrameRequestRef.current = videoElement.requestVideoFrameCallback(handleVideoFrame);
      return;
    }

    if (!blurIntervalRef.current) {
      blurIntervalRef.current = setInterval(updateBackgroundColor, refreshInterval);
    }
  };

  const updateBackgroundColor = () => {
    const videoElement = videoRef.current;
    const preferences = ambientLightPreferencesRef.current;

    if (
      !preferences.ambientLightEnabled ||
      isFullscreenRef.current ||
      isPictureInPictureRef.current ||
      !videoElement ||
      !backgroundBlur?.current ||
      !videoElement.videoWidth
    ) {
      return;
    }

    if (!ambientSampleCanvasRef.current) {
      ambientSampleCanvasRef.current = document.createElement("canvas");
    }
    const sampleCanvas = ambientSampleCanvasRef.current;

    try {
      const sampleContext = sampleCanvas.getContext("2d", { willReadFrequently: true });
      if (!sampleContext) return;

      if (preferences.ambientLightMode === "advanced") {
        const gridSize = preferences.ambientLightGridSize;
        const samplesPerSector = 8;
        sampleCanvas.width = gridSize * samplesPerSector;
        sampleCanvas.height = gridSize * samplesPerSector;
        sampleContext.drawImage(videoElement, 0, 0, sampleCanvas.width, sampleCanvas.height);
        const imageData = sampleContext.getImageData(
          0,
          0,
          sampleCanvas.width,
          sampleCanvas.height
        );
        const perimeterColors = extractWeightedPerimeterColors(imageData, gridSize);
        const domeColors = buildAmbientDomeColors(perimeterColors, gridSize);
        const ambientCanvas = backgroundBlur.current;
        ambientCanvas.width = gridSize;
        ambientCanvas.height = gridSize;
        ambientCanvas.style.backgroundColor = AMBIENT_LIGHT_DEFAULT_COLOR;
        const ambientContext = ambientCanvas.getContext("2d");
        if (!ambientContext) return;
        ambientContext.clearRect(0, 0, gridSize, gridSize);
        domeColors.forEach(({ row, column, color }) => {
          ambientContext.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
          ambientContext.fillRect(column, row, 1, 1);
        });
        return;
      }

      const sampleWidth = 64;
      const sampleHeight = Math.max(
        1,
        Math.round(sampleWidth * (videoElement.videoHeight / videoElement.videoWidth))
      );
      sampleCanvas.width = sampleWidth;
      sampleCanvas.height = sampleHeight;
      sampleContext.drawImage(videoElement, 0, 0, sampleWidth, sampleHeight);
      const color = extractWeightedFrameColor(
        sampleContext.getImageData(0, 0, sampleWidth, sampleHeight)
      );
      const ambientCanvas = backgroundBlur.current;
      ambientCanvas.width = 1;
      ambientCanvas.height = 1;
      ambientCanvas.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
    } catch (error) {
      stopBackgroundUpdate();
      console.warn("Analyse de la lumière d'ambiance impossible :", error?.message || error);
    }
  };

  const queueAmbientPreferenceSave = (preferences) => {
    ambientPreferenceSaveQueueRef.current = ambientPreferenceSaveQueueRef.current
      .catch(() => undefined)
      .then(() => api.put("/users/player-preferences", preferences))
      .then(() => {
        if (componentMountedRef.current && ambientPreferencesErrorRef.current) {
          ambientPreferencesErrorRef.current = "";
          setAmbientPreferencesError("");
        }
        try {
          localStorage.removeItem(AMBIENT_LIGHT_STORAGE_KEY);
        } catch (error) {
          // La préférence serveur reste la source de vérité.
        }
      })
      .catch((error) => {
        if (componentMountedRef.current) {
          const message = error?.response?.data?.error
            || "Impossible d'enregistrer les préférences.";
          ambientPreferencesErrorRef.current = message;
          setAmbientPreferencesError(message);
        }
      });
  };

  const updateAmbientPreferences = (changes) => {
    ambientPreferencesTouchedRef.current = true;
    const nextPreferences = normalizeAmbientLightPreferences({
      ...ambientLightPreferencesRef.current,
      ...changes,
    });
    ambientLightPreferencesRef.current = nextPreferences;
    setAmbientLightPreferences(nextPreferences);
    queueAmbientPreferenceSave(nextPreferences);
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
    if (!videoElement || !Number.isFinite(nextVolume)) return;

    const normalizedVolume = Math.max(0, Math.min(1, nextVolume));
    videoElement.volume = normalizedVolume;
    videoElement.muted = normalizedVolume === 0;
    setVolume(normalizedVolume);
    setMuted(videoElement.muted);
  };

  const toggleMute = () => {
    const videoElement = videoRef.current;
    if (!videoElement) return;
    videoElement.muted = !videoElement.muted;
  };

  const selectAudioTrack = (audioTrackIndex) => {
    if (!Number.isInteger(audioTrackIndex) || audioTrackIndex < 0) return;

    if (hlsRef.current) {
      hlsRef.current.audioTrack = audioTrackIndex;
    } else {
      const nativeTracks = videoRef.current?.audioTracks;
      if (nativeTracks?.length) {
        for (let index = 0; index < nativeTracks.length; index += 1) {
          nativeTracks[index].enabled = index === audioTrackIndex;
        }
      }
    }

    setSelectedAudioTrackIndex(audioTrackIndex);
  };

  const applySubtitleSelection = (subtitleIndex, enabled) => {
    const tracks = Array.from(videoRef.current?.textTracks || []);
    tracks.forEach((track, index) => {
      track.mode = enabled && index === subtitleIndex ? "showing" : "hidden";
    });
  };

  const disableCaptions = () => {
    applySubtitleSelection(selectedSubtitleIndex, false);
    setCaptionsEnabled(false);
  };

  const selectSubtitle = (subtitleIndex) => {
    applySubtitleSelection(subtitleIndex, true);
    setSelectedSubtitleIndex(subtitleIndex);
    setCaptionsEnabled(true);
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

  const openKeyboardHelp = () => {
    setSettingsMenuOpen(false);
    setSettingsPanel(SETTINGS_PANEL.MAIN);
    setKeyboardHelpOpen(true);
    setControlsVisible(true);
    setControlsDismissed(false);
    if (controlsHideTimeoutRef.current) {
      clearTimeout(controlsHideTimeoutRef.current);
      controlsHideTimeoutRef.current = null;
    }
  };

  const closeKeyboardHelp = () => {
    setKeyboardHelpOpen(false);
    showControls();
  };

  const openSettingsMenu = () => {
    setKeyboardHelpOpen(false);
    setSettingsMenuOpen(true);
    setSettingsPanel(SETTINGS_PANEL.MAIN);
    setControlsVisible(true);
    setControlsDismissed(false);
    if (controlsHideTimeoutRef.current) {
      clearTimeout(controlsHideTimeoutRef.current);
      controlsHideTimeoutRef.current = null;
    }
  };

  const closeSettingsMenu = () => {
    setSettingsMenuOpen(false);
    setSettingsPanel(SETTINGS_PANEL.MAIN);
    showControls();
  };

  const toggleSettingsMenu = () => {
    if (settingsMenuOpen) {
      closeSettingsMenu();
    } else {
      openSettingsMenu();
    }
  };

  useEffect(() => {
    if (!keyboardHelpOpen) return undefined;

    const handleOutsidePointerDown = (event) => {
      if (!event.target?.closest?.('[data-player-keyboard-help="true"]')) {
        closeKeyboardHelp();
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", handleOutsidePointerDown);
    // closeKeyboardHelp utilise toujours les setters React et la réf courante du minuteur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyboardHelpOpen]);

  useEffect(() => {
    if (!settingsMenuOpen) return undefined;

    const handleOutsidePointerDown = (event) => {
      if (!event.target?.closest?.('[data-player-settings="true"]')) {
        closeSettingsMenu();
      }
    };
    const handleSettingsKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSettingsMenu();
      }
    };

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleSettingsKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleSettingsKeyDown);
    };
    // Les fermetures réutilisent uniquement les setters et la réf courante du minuteur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsMenuOpen]);

  useEffect(() => {
    if (!video?.CheminAcces) return undefined;

    const handlePlayerKeyDown = (event) => {
      if (
        event.defaultPrevented
        || event.isComposing
        || event.altKey
        || event.ctrlKey
        || event.metaKey
        || isInteractiveShortcutTarget(event.target)
      ) {
        return;
      }

      const isSpaceKey = event.code === "Space"
        || event.key === " "
        || event.key === "Space"
        || event.key === "Spacebar";
      if (isSpaceKey && event.repeat) return;

      let action = null;
      switch (event.key) {
        case "ArrowLeft":
          action = () => seekBy(-PLAYER_SEEK_SECONDS);
          break;
        case "ArrowRight":
          action = () => seekBy(PLAYER_SEEK_SECONDS);
          break;
        case "ArrowUp":
          action = () => updateVolume((videoRef.current?.volume || 0) + PLAYER_VOLUME_STEP);
          break;
        case "ArrowDown":
          action = () => updateVolume((videoRef.current?.volume || 0) - PLAYER_VOLUME_STEP);
          break;
        default:
          if (isSpaceKey) action = togglePlayback;
      }

      if (!action) return;
      event.preventDefault();
      showControls();
      action();
    };

    window.addEventListener("keydown", handlePlayerKeyDown);
    return () => window.removeEventListener("keydown", handlePlayerKeyDown);
    // Les actions lisent directement l'élément vidéo courant ; seule la durée de repli
    // peut rendre nécessaire de recréer le gestionnaire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, video?.CheminAcces, video?.VideoID]);

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
  const subtitleTracks = video?.subtitles || [];
  const selectedSubtitle = subtitleTracks[selectedSubtitleIndex] || null;
  const selectedSubtitleFlag = captionsEnabled && selectedSubtitle
    ? resolvePlayerLanguageFlag({
        language: selectedSubtitle.language,
        label: selectedSubtitle.label,
        source: selectedSubtitle.url,
      })
    : null;
  const hasAudioOptions = Boolean(
    multiAudioEnabled
    && video?.audioTracks?.length > 1
    && availableAudioTracks.length > 1
  );
  const selectedAudioTrack = availableAudioTracks.find(
    (track) => track.index === selectedAudioTrackIndex
  ) || null;
  const selectedAudioFlag = selectedAudioTrack
    ? resolvePlayerLanguageFlag(selectedAudioTrack)
    : null;
  const selectedQuality = selectedLevel === -1
    ? "Automatique"
    : availableLevels.find((level) => level.level === selectedLevel)?.resolution
      || "Automatique";
  const playerChromeVisibilityClass = keyboardHelpOpen || settingsMenuOpen
    ? "opacity-100"
    : controlsDismissed
      ? "opacity-0"
      : playing && !controlsVisible
        ? "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        : "opacity-100";

  return (
    <div ref={fitContainerRef} className="relative w-full h-full flex items-center justify-center">
      <div
        ref={playerContainerRef}
        className="relative border-0 ring-0 group rounded-xl xl:rounded-2xl shadow-xl/30 overflow-visible"
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

        <div
          data-testid="player-controls"
          className={`absolute inset-x-0 bottom-0 z-40 rounded-b-xl bg-gradient-to-t from-black/95 via-black/65 to-transparent px-3 pb-3 pt-10 text-white transition-opacity duration-200 xl:rounded-b-2xl ${playerChromeVisibilityClass}`}
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

            <div data-player-settings="true" className="relative">
              {settingsMenuOpen && (
                <div
                  id="player-settings-menu"
                  role="menu"
                  aria-label="Réglages du lecteur"
                  className="absolute bottom-full right-0 z-50 mb-3 max-h-[65vh] w-[min(24rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl border border-white/15 bg-neutral-950/95 p-3 text-left shadow-2xl shadow-black/60 backdrop-blur-xl sm:p-4"
                  style={playerSize.width > 0 && playerSize.width < 480 ? {
                    right: "-5.5rem",
                    width: `${Math.max(0, playerSize.width - 8)}px`,
                  } : undefined}
                >
                  {settingsPanel === SETTINGS_PANEL.MAIN && (
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                      <SettingsTile
                        title="Sous-titres"
                        value={captionsEnabled && selectedSubtitle
                          ? selectedSubtitle.label || `Sous-titre ${selectedSubtitleIndex + 1}`
                          : subtitleTracks.length > 0 ? "Désactivés" : "Indisponible"}
                        disabled={subtitleTracks.length === 0}
                        flag={captionsEnabled && selectedSubtitle ? selectedSubtitleFlag : undefined}
                        onClick={() => setSettingsPanel(SETTINGS_PANEL.SUBTITLES)}
                      />
                      <SettingsTile
                        title="Audio"
                        value={hasAudioOptions ? selectedAudioTrack?.label || "Par défaut" : "Par défaut"}
                        disabled={!hasAudioOptions}
                        flag={hasAudioOptions && selectedAudioTrack ? selectedAudioFlag : undefined}
                        onClick={() => setSettingsPanel(SETTINGS_PANEL.AUDIO)}
                      />
                      <SettingsTile
                        title="Ambiance"
                        value={ambientLightPreferences.ambientLightEnabled
                          ? `${ambientLightPreferences.ambientLightMode === "advanced" ? "Avancé" : "Classique"} · ${ambientLightPreferences.ambientLightRefreshRate}/s`
                          : "Désactivée"}
                        onClick={() => setSettingsPanel(SETTINGS_PANEL.AMBIENT)}
                      />
                      <SettingsTile
                        title="Qualité"
                        value={availableLevels.length > 0 ? selectedQuality : "Indisponible"}
                        disabled={availableLevels.length === 0}
                        onClick={() => setSettingsPanel(SETTINGS_PANEL.QUALITY)}
                      />
                    </div>
                  )}

                  {settingsPanel !== SETTINGS_PANEL.MAIN && (
                    <>
                      <div className="flex items-center gap-3 px-1 py-1">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => setSettingsPanel(SETTINGS_PANEL.MAIN)}
                          aria-label="Retour aux réglages"
                          className="rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
                        >
                          <ArrowLeftIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                        <p className="text-base font-bold text-white/90 sm:text-lg">
                          {settingsPanel === SETTINGS_PANEL.SUBTITLES && "Sous-titres"}
                          {settingsPanel === SETTINGS_PANEL.AUDIO && "Audio"}
                          {settingsPanel === SETTINGS_PANEL.QUALITY && "Qualité"}
                          {settingsPanel === SETTINGS_PANEL.AMBIENT && "Ambiance"}
                        </p>
                      </div>
                      <div className="my-3 border-t border-white/10" />
                    </>
                  )}

                  {settingsPanel === SETTINGS_PANEL.AMBIENT && (
                    <div className="space-y-4 px-1 pb-1">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={ambientLightPreferences.ambientLightEnabled}
                        aria-label="Lumière d'ambiance"
                        onClick={() => updateAmbientPreferences({
                          ambientLightEnabled: !ambientLightPreferences.ambientLightEnabled,
                        })}
                        className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/85 transition hover:bg-white/10"
                      >
                        <span className="font-bold">Lumière d'ambiance</span>
                        <span className="flex items-center gap-2 text-white/60">
                          <span>{ambientLightPreferences.ambientLightEnabled ? "Activée" : "Désactivée"}</span>
                          <span
                            className={`relative inline-flex h-5 w-10 shrink-0 items-center rounded-full transition-colors duration-200 ${
                              ambientLightPreferences.ambientLightEnabled
                                ? "bg-sky-500"
                                : "bg-neutral-700"
                            }`}
                            aria-hidden="true"
                          >
                            <span
                              className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                              style={{
                                transform: ambientLightPreferences.ambientLightEnabled
                                  ? "translateX(1.25rem)"
                                  : "translateX(0.25rem)",
                              }}
                            />
                          </span>
                        </span>
                      </button>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={ambientLightPreferences.ambientLightMode === "advanced"}
                        aria-label="Mode d'ambiance avancé"
                        onClick={() => updateAmbientPreferences({
                          ambientLightMode: ambientLightPreferences.ambientLightMode === "advanced"
                            ? "classic"
                            : "advanced",
                        })}
                        className="flex w-full items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white/85 transition hover:bg-white/10"
                      >
                        <span className="font-bold">Mode</span>
                        <span className="flex items-center gap-2 text-white/60">
                          <span>
                            {ambientLightPreferences.ambientLightMode === "advanced"
                              ? "Avancé"
                              : "Classique"}
                          </span>
                          <span
                            className={`relative inline-flex h-5 w-10 shrink-0 items-center rounded-full transition-colors duration-200 ${
                              ambientLightPreferences.ambientLightMode === "advanced"
                                ? "bg-violet-500"
                                : "bg-sky-500"
                            }`}
                            aria-hidden="true"
                          >
                            <span
                              className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200"
                              style={{
                                transform: ambientLightPreferences.ambientLightMode === "advanced"
                                  ? "translateX(1.25rem)"
                                  : "translateX(0.25rem)",
                              }}
                            />
                          </span>
                        </span>
                      </button>

                      <label className="block rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                        <span className="flex items-center justify-between gap-3 text-sm">
                          <span className="font-bold text-white/85">Fréquence</span>
                          <span className="tabular-nums text-white/60">
                            {ambientLightPreferences.ambientLightRefreshRate} fois/s
                          </span>
                        </span>
                        <input
                          type="range"
                          min="0"
                          max={AMBIENT_LIGHT_REFRESH_RATES.length - 1}
                          step="1"
                          list="ambient-frequency-steps"
                          value={AMBIENT_LIGHT_REFRESH_RATES.indexOf(
                            ambientLightPreferences.ambientLightRefreshRate
                          )}
                          onChange={(event) => updateAmbientPreferences({
                            ambientLightRefreshRate: AMBIENT_LIGHT_REFRESH_RATES[
                              Number(event.target.value)
                            ],
                          })}
                          aria-label="Fréquence de la lumière d'ambiance"
                          aria-valuetext={`${ambientLightPreferences.ambientLightRefreshRate} fois par seconde`}
                          className="mt-3 h-1.5 w-full cursor-pointer accent-sky-500"
                        />
                        <datalist id="ambient-frequency-steps">
                          {AMBIENT_LIGHT_REFRESH_RATES.map((rate) => (
                            <option value={AMBIENT_LIGHT_REFRESH_RATES.indexOf(rate)} key={rate} />
                          ))}
                        </datalist>
                        <span className="mt-2 grid grid-cols-6 text-center text-[10px] tabular-nums text-white/40">
                          {AMBIENT_LIGHT_REFRESH_RATES.map((rate) => <span key={rate}>{rate}</span>)}
                        </span>
                      </label>

                      {ambientLightPreferences.ambientLightMode === "advanced" && (
                        <label className="block rounded-xl border border-white/10 bg-white/5 px-3 py-3">
                          <span className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-bold text-white/85">Découpage du pourtour</span>
                            <span className="tabular-nums text-white/60">
                              {ambientLightPreferences.ambientLightGridSize}×{ambientLightPreferences.ambientLightGridSize}
                            </span>
                          </span>
                          <input
                            type="range"
                            min="3"
                            max="9"
                            step="1"
                            list="ambient-grid-steps"
                            value={ambientLightPreferences.ambientLightGridSize}
                            onChange={(event) => updateAmbientPreferences({
                              ambientLightGridSize: Number(event.target.value),
                            })}
                            aria-label="Découpage de la lumière d'ambiance"
                            aria-valuetext={`${ambientLightPreferences.ambientLightGridSize} par ${ambientLightPreferences.ambientLightGridSize}`}
                            className="mt-3 h-1.5 w-full cursor-pointer accent-violet-500"
                          />
                          <datalist id="ambient-grid-steps">
                            {[3, 4, 5, 6, 7, 8, 9].map((size) => (
                              <option value={size} key={size} />
                            ))}
                          </datalist>
                          <span className="mt-2 grid grid-cols-7 text-center text-[10px] tabular-nums text-white/40">
                            {[3, 4, 5, 6, 7, 8, 9].map((size) => <span key={size}>{size}</span>)}
                          </span>
                        </label>
                      )}

                      {ambientPreferencesError && (
                        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200">
                          {ambientPreferencesError}
                        </p>
                      )}
                    </div>
                  )}

                  {settingsPanel === SETTINGS_PANEL.SUBTITLES && (
                    <div className="max-h-[48vh] space-y-1 overflow-y-auto pr-1">
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={!captionsEnabled}
                        onClick={disableCaptions}
                        className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                          !captionsEnabled
                            ? "bg-white/10 font-bold text-white"
                            : "text-white/70 hover:bg-white/5 hover:text-white"
                        }`}
                      >
                        <span>Désactivés</span>
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full ${
                          !captionsEnabled ? "bg-sky-500 text-neutral-950" : "text-transparent"
                        }`} aria-hidden="true">
                          {!captionsEnabled && <CheckIcon className="h-3.5 w-3.5" />}
                        </span>
                      </button>
                      {subtitleTracks.map((subtitle, index) => {
                        const isSelected = captionsEnabled && selectedSubtitleIndex === index;
                        const flag = resolvePlayerLanguageFlag({
                          language: subtitle.language,
                          label: subtitle.label,
                          source: subtitle.url,
                        });
                        return (
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={isSelected}
                            key={`${subtitle.label || "Sous-titre"}-${index}`}
                            onClick={() => selectSubtitle(index)}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                              isSelected
                                ? "bg-white/10 font-bold text-white"
                                : "text-white/70 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <PlayerLanguageFlag flag={flag} />
                              <span className="truncate">
                                {subtitle.label || `Sous-titre ${index + 1}`}
                              </span>
                            </span>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                              isSelected ? "bg-sky-500 text-neutral-950" : "text-transparent"
                            }`} aria-hidden="true">
                              {isSelected && <CheckIcon className="h-3.5 w-3.5" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {settingsPanel === SETTINGS_PANEL.AUDIO && (
                    <div className="max-h-[48vh] space-y-1 overflow-y-auto pr-1">
                      {availableAudioTracks.map((track) => {
                        const isSelected = selectedAudioTrackIndex === track.index;
                        const flag = resolvePlayerLanguageFlag(track);
                        return (
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={isSelected}
                            key={`${track.label}-${track.index}`}
                            onClick={() => selectAudioTrack(track.index)}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                              isSelected
                                ? "bg-white/10 font-bold text-white"
                                : "text-white/70 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-3">
                              <PlayerLanguageFlag flag={flag} />
                              <span className="truncate">{track.label}</span>
                            </span>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                              isSelected ? "bg-sky-500 text-neutral-950" : "text-transparent"
                            }`} aria-hidden="true">
                              {isSelected && <CheckIcon className="h-3.5 w-3.5" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {settingsPanel === SETTINGS_PANEL.QUALITY && (
                    <div className="max-h-[48vh] space-y-1 overflow-y-auto pr-1">
                      {[{ level: -1, resolution: "Automatique" }, ...availableLevels].map((level) => {
                        const isSelected = selectedLevel === level.level;
                        return (
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={isSelected}
                            key={level.level}
                            onClick={() => changeResolution(level.level)}
                            className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-sm transition ${
                              isSelected
                                ? "bg-white/10 font-bold text-white"
                                : "text-white/70 hover:bg-white/5 hover:text-white"
                            }`}
                          >
                            <span>{level.resolution}</span>
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full ${
                              isSelected ? "bg-sky-500 text-neutral-950" : "text-transparent"
                            }`} aria-hidden="true">
                              {isSelected && <CheckIcon className="h-3.5 w-3.5" />}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={toggleSettingsMenu}
                aria-haspopup="menu"
                aria-expanded={settingsMenuOpen}
                aria-controls="player-settings-menu"
                aria-label={settingsMenuOpen ? "Fermer les réglages du lecteur" : "Ouvrir les réglages du lecteur"}
                className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                  settingsMenuOpen ? "bg-white text-neutral-950" : "text-white/90 hover:bg-white/15"
                }`}
              >
                <Cog6ToothIcon className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>

            <div
              data-player-keyboard-help="true"
              className="relative"
              onMouseEnter={openKeyboardHelp}
              onMouseLeave={(event) => {
                if (!event.currentTarget.contains(document.activeElement)) {
                  closeKeyboardHelp();
                }
              }}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  closeKeyboardHelp();
                }
              }}
            >
              {keyboardHelpOpen && (
                <div
                  id="player-keyboard-shortcuts"
                  role="tooltip"
                  className="absolute bottom-full right-0 z-50 mb-2 max-h-72 w-72 overflow-y-auto rounded-lg border border-white/20 bg-black/95 p-3 text-left shadow-2xl backdrop-blur"
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-white/60">
                    Commandes du lecteur
                  </p>
                  <p className="mb-2 mt-3 text-[11px] font-bold uppercase tracking-wide text-white/60">
                    Clavier
                  </p>
                  <ul className="space-y-1.5">
                    {PLAYER_KEYBOARD_SHORTCUTS.map((shortcut) => (
                      <li
                        key={shortcut.key}
                        className="flex items-center justify-between gap-3 text-xs text-white/85"
                      >
                        <span>{shortcut.label}</span>
                        <kbd className="min-w-8 rounded border border-white/25 bg-white/10 px-1.5 py-0.5 text-center font-mono font-bold text-white">
                          {shortcut.key}
                        </kbd>
                      </li>
                    ))}
                  </ul>
                  <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-white/60">
                    Clics sur la vidéo
                  </p>
                  <ul className="space-y-1.5">
                    {PLAYER_CLICK_COMMANDS.map((command) => (
                      <li
                        key={command.key}
                        className="flex items-center justify-between gap-3 text-xs text-white/85"
                      >
                        <span>{command.label}</span>
                        <kbd className="shrink-0 rounded border border-white/25 bg-white/10 px-1.5 py-0.5 text-center font-mono font-bold text-white">
                          {command.key}
                        </kbd>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={openKeyboardHelp}
                onFocus={openKeyboardHelp}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeKeyboardHelp();
                    event.currentTarget.blur();
                  }
                }}
                aria-label="Afficher les commandes du lecteur"
                aria-controls="player-keyboard-shortcuts"
                aria-describedby={keyboardHelpOpen ? "player-keyboard-shortcuts" : undefined}
                aria-expanded={keyboardHelpOpen}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/35 bg-white/10 text-sm font-black text-white/90 transition hover:bg-white/20"
              >
                ?
              </button>
            </div>

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
