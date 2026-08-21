import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import api from "../services/api";

const apiUrl = process.env.REACT_APP_URL_LOCAL;
const TOOLTIP_OPEN_DELAY_MS = 200;
const TOOLTIP_FADE_MS = 300;
export const PREVIEW_FRAME_INTERVAL_MS = 1200;

let settingPromise = null;
const getPreviewSetting = () => {
  if (!settingPromise) {
    settingPromise = api
      .get("/app-settings/content-preview")
      .then((response) => Boolean(response.data?.active))
      .catch((error) => {
        console.warn("Prévisualisation indisponible :", error.message);
        return false;
      });
  }

  return settingPromise;
};

const getPreviewVideoId = (item) => {
  if (!item) return null;
  if (item.type === "series") return item.FirstVideoID || null;
  if (item.type === "video") return item.VideoID || item.id || null;
  return null;
};

const getFrameUrl = (frame) => {
  if (!frame) return "";
  if (/^https?:\/\//i.test(frame)) return frame;

  const baseUrl =
    apiUrl ||
    (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "");

  if (!baseUrl) return frame;
  return `${baseUrl.replace(/\/+$/, "")}/${String(frame).replace(/^\/+/, "")}`;
};

const ContentPreviewTooltip = ({ item, title, className = "", children }) => {
  const anchorRef = useRef(null);
  const mountedRef = useRef(false);
  const latestVideoIdRef = useRef(null);
  const videoId = useMemo(() => getPreviewVideoId(item), [item]);
  const [hovered, setHovered] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [frames, setFrames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [frameIndex, setFrameIndex] = useState(0);
  const [hasTried, setHasTried] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [shouldRenderTooltip, setShouldRenderTooltip] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0, placement: "top" });

  const updatePosition = useCallback(() => {
    if (!anchorRef.current || typeof window === "undefined") return;

    const rect = anchorRef.current.getBoundingClientRect();
    const tooltipWidth = 288;
    const tooltipHeight = 205;
    const gap = 12;
    const viewportPadding = 12;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const centeredLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
    const left = Math.max(
      viewportPadding,
      Math.min(centeredLeft, viewportWidth - tooltipWidth - viewportPadding)
    );
    const canOpenAbove = rect.top >= tooltipHeight + gap + viewportPadding;
    const top = canOpenAbove
      ? rect.top - tooltipHeight - gap
      : Math.min(rect.bottom + gap, viewportHeight - tooltipHeight - viewportPadding);

    setPosition({
      top: Math.max(viewportPadding, top),
      left,
      placement: canOpenAbove ? "top" : "bottom",
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    latestVideoIdRef.current = videoId;
  }, [videoId]);

  useEffect(() => {
    let cancelled = false;

    getPreviewSetting().then((active) => {
      if (!cancelled) setEnabled(active);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hovered || !enabled || !videoId || hasTried) return;

    const requestedVideoId = videoId;
    setLoading(true);
    setHasTried(true);

    api
      .get(`/videos/${requestedVideoId}/preview-frames`)
      .then((response) => {
        if (!mountedRef.current || latestVideoIdRef.current !== requestedVideoId) return;
        const nextFrames = Array.isArray(response.data?.frames) ? response.data.frames : [];
        if (nextFrames.length > 0) {
          setFrames(nextFrames);
          setFrameIndex(0);
        }
      })
      .catch((error) => {
        if (!mountedRef.current || latestVideoIdRef.current !== requestedVideoId) return;
        setHasTried(false);
        console.warn("Erreur de chargement de la prévisualisation :", error.response?.data?.error || error.message);
      })
      .finally(() => {
        if (mountedRef.current && latestVideoIdRef.current === requestedVideoId) {
          setLoading(false);
        }
      });
  }, [hovered, enabled, videoId, hasTried]);

  useEffect(() => {
    setFrames([]);
    setFrameIndex(0);
    setHasTried(false);
  }, [videoId]);

  useEffect(() => {
    if (!hovered || frames.length <= 1) return undefined;

    const interval = window.setInterval(() => {
      setFrameIndex((current) => (current + 1) % frames.length);
    }, PREVIEW_FRAME_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [hovered, frames.length]);

  useEffect(() => {
    if (!hovered) return undefined;

    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [hovered, updatePosition]);

  const canShowTooltip =
    hovered &&
    enabled &&
    videoId &&
    (loading || frames.length > 0) &&
    typeof document !== "undefined";

  useEffect(() => {
    let openTimer;
    let closeTimer;

    if (canShowTooltip) {
      setShouldRenderTooltip(true);
      openTimer = window.setTimeout(() => {
        setTooltipVisible(true);
      }, TOOLTIP_OPEN_DELAY_MS);
    } else {
      setTooltipVisible(false);
      closeTimer = window.setTimeout(() => {
        setShouldRenderTooltip(false);
      }, TOOLTIP_FADE_MS);
    }

    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
    };
  }, [canShowTooltip]);

  const activeFrame = frames[frameIndex] || frames[0];
  const handleFrameError = () => {
    setFrames((currentFrames) => currentFrames.filter((_, index) => index !== frameIndex));
    setFrameIndex(0);
  };
  const tooltip = shouldRenderTooltip ? (
    <div
      className="pointer-events-none w-72 rounded-xl border border-sky-200/25 bg-slate-950/95 p-2 text-white shadow-2xl shadow-sky-950/40 ring-1 ring-white/10 backdrop-blur-xl transition duration-300 ease-out"
      style={{
        position: "fixed",
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 99999,
        opacity: tooltipVisible ? 1 : 0,
        transform: `translateY(${tooltipVisible ? "0" : position.placement === "top" ? "6px" : "-6px"}) scale(${tooltipVisible ? 1 : 0.98})`,
      }}
    >
      <div className="overflow-hidden rounded-lg bg-slate-900">
        {activeFrame ? (
          <img
            src={getFrameUrl(activeFrame)}
            alt=""
            className="aspect-video w-full object-cover"
            onError={handleFrameError}
          />
        ) : (
          <div className="grid aspect-video w-full place-items-center text-xs font-bold text-slate-300">
            Prévisualisation...
          </div>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 px-1">
        <p className="line-clamp-1 text-xs font-bold text-slate-100">{title || item?.Titre || "Prévisualisation"}</p>
        {frames.length > 1 && (
          <span className="shrink-0 rounded-md border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-black text-sky-100">
            {frameIndex + 1}/{frames.length}
          </span>
        )}
      </div>
      <span
        className={`absolute left-1/2 size-3 -translate-x-1/2 rotate-45 border-sky-200/25 bg-slate-950/95 ${
          position.placement === "top"
            ? "-bottom-1.5 border-b border-r"
            : "-top-1.5 border-l border-t"
        }`}
      />
    </div>
  ) : null;

  return (
    <div
      ref={anchorRef}
      className={`relative ${className}`}
      onMouseEnter={() => {
        setHovered(true);
        window.requestAnimationFrame(updatePosition);
      }}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
      {tooltip ? createPortal(tooltip, document.body) : null}
    </div>
  );
};

export default ContentPreviewTooltip;
