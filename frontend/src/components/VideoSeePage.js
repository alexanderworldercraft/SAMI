import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import api from '../services/api';
import { useParams } from "react-router-dom";
import VideoPlayer from "./VideoPlayer";
import VideoDetails from "./VideoDetails";
import SerieDetails from "./SerieDetails";
import SeasonList from "./SeasonList";
import EpisodeList from "./EpisodeList";
import Notification from "./Notification";
import VideoList from "./VideoList";
import SeriesAndSeasonSelector from "./SeriesAndSeasonSelector"
import { buildCookieValue } from "../utils/cookieValue";
import PaginationPage from "./PaginationPage";


const apiUrl = process.env.REACT_APP_URL_LOCAL;

const PREMIUM_MESSAGE = `Ce contenu est réservé aux membres Premium.
Il fait partie des vidéos et séries exclusives disponibles uniquement avec un abonnement actif.

Pour passer en Premium :
ouvrez Paramètres → Abonnement,
puis choisissez la formule qui vous convient (mensuelle ou annuelle).
L’activation est immédiate et ne nécessite aucun paiement réel : il s’agit d’une simulation pour tester les fonctionnalités.`;

const VideoSeePage = () => {

  const { id } = useParams();
  const [type, setType] = useState(null);
  const [video, setVideo] = useState(null);
  const [series, setSeries] = useState(null);
  const [seriesId, setSeriesId] = useState(null);
  const [currentSeason, setCurrentSeason] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [currentEpisode, setCurrentEpisode] = useState(null);
  const [notification, setNotification] = useState(null);
  const backgroundBlur = useRef(null);
  const [recommendations, setRecommendations] = useState([]);
  const [similarRecommendations, setSimilarRecommendations] = useState([]);
  const [discoveryRecommendations, setDiscoveryRecommendations] = useState([]);
  const [similarPanel, setSimilarPanel] = useState([]);
  const [discoveryPanel, setDiscoveryPanel] = useState([]);
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accessMessage, setAccessMessage] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [resumeTime, setResumeTime] = useState(null);
  const [videoElement, setVideoElement] = useState(null);
  const [isResettingSeries, setIsResettingSeries] = useState(false);
  const [skipFirstPlayLogKey, setSkipFirstPlayLogKey] = useState(0);
  const [multiAudioEnabled, setMultiAudioEnabled] = useState(false);
  const [resumeChoicePulse, setResumeChoicePulse] = useState(false);
  const [contentSagas, setContentSagas] = useState([]);
  const [sagaPage, setSagaPage] = useState(1);
  const [sagaTotalPages, setSagaTotalPages] = useState(1);
  const [sagaTotalItems, setSagaTotalItems] = useState(0);
  const [selectedSaga, setSelectedSaga] = useState(null);
  const [selectedSagaDetails, setSelectedSagaDetails] = useState(null);
  const [selectedSagaLoading, setSelectedSagaLoading] = useState(false);
  const progressDeletedRef = useRef(false);
  const resumeProgressRef = useRef(null);
  const activeProgressLogActionRef = useRef("video_first_play");


  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await api.get('/users/me');
        //console.log('User profile data:', response.data); // Log des données utilisateur
        setUser(response.data);
      } catch (error) {
        console.error("Erreur lors de la récupération de l'utilisateur :", error);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    let cancelled = false;

    api.get("/app-settings/multi-audio")
      .then((response) => {
        if (!cancelled) {
          setMultiAudioEnabled(Boolean(response.data?.active));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setMultiAudioEnabled(false);
          console.warn(
            "Réglage multi-audio indisponible :",
            error.response?.data?.error || error.message
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);


  const handleConvertToEpisode = async () => {
    if (!video?.VideoID) return;

    try {
      const response = await api.put("/videos/move-to-season", {
        videoId: video.VideoID,
        SaisonID: selectedSeason || null,
      });

      showNotification({
        message: response.data?.message || "Vidéo déplacée avec succès.",
        icon: "✅",
        type: "success",

      });

      setTimeout(() => {
        window.location.reload();
      }, 100);
    } catch (error) {
      const msg =
        error.response?.data?.error ||
        error.message ||
        "Erreur lors du déplacement de la vidéo.";
      showNotification({ message: msg, icon: "❌", type: "error" });
    }
  };

  const handleResetSeriesWatchStatus = async () => {
    if (!seriesId || isResettingSeries) return;

    const confirmed = window.confirm(
      "Recommencer cette série ? Les épisodes repasseront en non vus, sans supprimer votre historique de lecture."
    );
    if (!confirmed) return;

    try {
      setIsResettingSeries(true);
      const response = await api.put(`/series/${seriesId}/watch-reset`);
      showNotification(
        response.data?.message || "La série a été remise à zéro.",
        "✅",
        "success"
      );
      await fetchVideo();
    } catch (error) {
      const msg =
        error.response?.data?.error ||
        error.message ||
        "Erreur lors de la remise à zéro de la série.";
      showNotification(msg, "❌", "error");
    } finally {
      setIsResettingSeries(false);
    }
  };

  useEffect(() => {
    // Appel à l'API pour obtenir les recommandations par genres (original)
    fetch(`${apiUrl}/api/videos/recommandation/${id}`, { credentials: "include" })
      .then(response => response.json())
      .then(data => setRecommendations(data))
      .catch(error => console.error('Error fetching recommendations:', error));
  }, [id]);

  useEffect(() => {
    const fetchPersonalizedRecommendations = async () => {
      try {
        const response = await api.get(`/videos/recommandation-personalisee/${id}`);
        setSimilarRecommendations(response.data?.similar || []);
        setDiscoveryRecommendations(response.data?.discovery || []);
      } catch (error) {
        console.error("Erreur lors de la récupération des recommandations personnalisées :", error);
        setSimilarRecommendations([]);
        setDiscoveryRecommendations([]);
      }
    };

    fetchPersonalizedRecommendations();
  }, [id]);

  const buildRotationPanels = (items, panelSize = 8, panelCount = 3) => {
    const source = Array.isArray(items) ? items.filter(Boolean) : [];
    const shuffled = [...source].sort(() => Math.random() - 0.5);
    const panels = [];
    const getKey = (item) => `${item?.type || "item"}:${item?.id ?? item?.FirstVideoID ?? ""}`;
    const pool = [...shuffled];

    for (let i = 0; i < panelCount; i += 1) {
      const chunk = pool.splice(0, panelSize);

      if (chunk.length < panelSize && shuffled.length > 0) {
        const used = new Set(chunk.map(getKey));
        for (const item of shuffled) {
          if (chunk.length >= panelSize) break;
          const key = getKey(item);
          if (used.has(key)) continue;
          used.add(key);
          chunk.push(item);
        }
      }

      panels.push(chunk);
    }

    return panels;
  };

  useEffect(() => {
    const panels = buildRotationPanels(similarRecommendations);
    const index = Math.floor(Math.random() * panels.length);
    setSimilarPanel(panels[index] || []);
  }, [similarRecommendations]);

  useEffect(() => {
    const panels = buildRotationPanels(discoveryRecommendations);
    const index = Math.floor(Math.random() * panels.length);
    setDiscoveryPanel(panels[index] || []);
  }, [discoveryRecommendations]);

  const fetchVideo = async () => {
    try {
      setIsLoading(true);
      setAccessMessage(null); // reset éventuel

      const response = await api.get(`/videos/${id}`);
      const data = response.data;

      setType(data.type);
      setVideo({
        ...data.video,
        subtitles:
          data.video.VideoSubtitles?.map((sub) => ({
            label: sub.Label,
            url: `${apiUrl}/${sub.CheminSubtitle}`,
          })) || [],
        audioTracks:
          data.video.VideoAudioTracks?.map((track) => ({
            id: track.VideoAudioTrackID,
            label: track.Label,
            language: track.Language,
            playlist: track.CheminPlaylist,
            isDefault: Boolean(track.IsDefault),
            order: track.Ordre,
          })) || [],
      });
      setCurrentEpisode(data.video);

      if (data.type === "series") {
        setSeries(data.series);
        setSeriesId(data.series.SeriesID);

        const currentSeason = data.series.Saisons.find((saison) =>
          saison.Episodes.some(
            (episode) => episode.VideoID === parseInt(id, 10)
          )
        );

        if (currentSeason) {
          setCurrentSeason(currentSeason);
          setEpisodes(currentSeason.Episodes);
        }
      }
    } catch (error) {
      if (error.response) {
        const { status, data } = error.response;

        if (status === 401) {
          showNotification(
            "Session expirée ou non connectée. Merci de vous reconnecter.",
            "🔒",
            "error",
          );
          setAccessMessage("Vous devez être connecté pour accéder à cette vidéo.");
        } else if (status === 403 && data?.code === "PREMIUM_REQUIRED") {
          // contenu premium bloqué -> on affiche ton message
          showNotification(
            "Ce contenu est réservé aux membres premium.",
            "⭐",
            "warning",
          );
          setAccessMessage(PREMIUM_MESSAGE);
        } else {
          showNotification(
            data?.error || "Erreur lors du chargement de la vidéo.",
            "⚠️",
            "error",
          );
          setAccessMessage("Impossible de charger cette vidéo pour le moment.");
        }
      } else {
        showNotification(
          error.message || "Erreur lors du chargement de la vidéo.",
          "⚠️",
          "error",
        );
        setAccessMessage("Impossible de charger cette vidéo pour le moment.");
      }

      // On nettoie l'état vidéo
      setVideo(null);
      setSeries(null);
      setEpisodes([]);
    } finally {
      setIsLoading(false);
    }
  };

  const showNotification = (message, icon, type, duration = 7000) => {
    setNotification({ message, icon, type, duration });
  };

  useEffect(() => {
    fetchVideo();
  }, [id]); // Ajout de `id` comme dépendance pour recharger la page lorsque l'ID change

  useEffect(() => {
    setShowDetails(false); // on replie les détails quand on change de vidéo
  }, [id]);

  const handleSeasonChange = (season) => {
    setCurrentSeason(season);
    setEpisodes(season.Episodes);
  };

  const handleTitleUpdate = (newTitle) => {
    setVideo((prevVideo) => ({ ...prevVideo, Titre: newTitle }));
  };

  const handleResumerUpdate = (newResumer) => {
    setVideo((prevVideo) => ({ ...prevVideo, Resumer: newResumer }));
  };

  // ⬇️ nouveau: mise à jour de l'image après upload
  const handleImageUpdate = (newCheminImage) => {
    setVideo((prev) => ({ ...prev, CheminImage: newCheminImage }));
  };

  const handleSeriesTitleUpdate = (newTitle) => {
    setSeries((prevSeries) => ({ ...prevSeries, Titre: newTitle }));
  };

  const handleSeriesResumerUpdate = (newResumer) => {
    setSeries((prevSeries) => ({ ...prevSeries, Resumer: newResumer }));
  };

  // ⬇️ nouveau : mise à jour de l'image de la série après upload
  const handleSeriesImageUpdate = (newCheminImage) => {
    setSeries((prev) => ({ ...prev, CheminImage: newCheminImage }));
  };

  const isAdmin = user?.GradeID === 1 || user?.GradeID === 2;
  const isEpisode = Boolean(video?.SaisonID);
  const isPremiumUser = isAdmin || !!(user?.PremiumEndDate && new Date(user.PremiumEndDate) > new Date());

  const NameApp = process.env.REACT_APP_NAME;
  const currentVideoId = video?.VideoID || null;
  const sagaItemsPerPage = 8;

  const fetchContentSagas = async (page = 1) => {
    if (!currentVideoId) return;

    try {
      const response = await api.get(`/sagas/content/video/${currentVideoId}`, {
        params: { page, limit: sagaItemsPerPage },
      });
      setContentSagas(response.data?.items || []);
      setSagaTotalItems(response.data?.totalItems || 0);
      setSagaTotalPages(response.data?.totalPages || 1);
      setSagaPage(page);
    } catch (error) {
      console.error("Erreur lors de la récupération des sagas du contenu :", error);
      setContentSagas([]);
      setSagaTotalItems(0);
      setSagaTotalPages(1);
      setSagaPage(1);
    }
  };

  useEffect(() => {
    fetchContentSagas(1);
  }, [currentVideoId]);

  const formatTimecode = (seconds) => {
    if (!Number.isFinite(seconds)) return "0:00";
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    const paddedMins = hrs > 0 ? String(mins).padStart(2, "0") : String(mins);
    const paddedSecs = String(secs).padStart(2, "0");
    return hrs > 0 ? `${hrs}:${paddedMins}:${paddedSecs}` : `${paddedMins}:${paddedSecs}`;
  };

  // Mise à jour dynamique de l'onglet
  useEffect(() => {
    const metaDescription = document.querySelector('meta[name="description"]');

    if (video?.Titre && series?.Titre && currentSeason) {
      document.title = `${video.Titre} (Saison ${currentSeason.Numero} - ${series.Titre}) - ${NameApp}`;
      metaDescription?.setAttribute("content", `Regardez ${video.Titre} de la saison ${currentSeason.Numero} de la série ${series.Titre} sur ${NameApp}.`);
    } else if (video?.Titre && series?.Titre) {
      document.title = `${video.Titre} (${series.Titre}) - ${NameApp}`;
      metaDescription?.setAttribute("content", `Regardez ${video.Titre} de la série ${series.Titre} sur ${NameApp}.`);
    } else if (video?.Titre) {
      document.title = `${video.Titre} - ${NameApp}`;
      metaDescription?.setAttribute("content", `Regardez ${video.Titre} en streaming sur ${NameApp}.`);
    } else {
      document.title = `Lecture de vidéo - ${NameApp}`;
      metaDescription?.setAttribute("content", `Regardez des vidéos en streaming sur ${NameApp}.`);
    }
  }, [video?.Titre, series?.Titre, currentSeason]);

  useEffect(() => {
    // 1. Mettre à jour le cookie
    const expiresAt = new Date(Date.now() + 31536000 * 1000).toISOString();
    const cookieValue = buildCookieValue("dark", expiresAt);
    document.cookie = `theme=${cookieValue}; path=/; max-age=31536000`; // 1 an

    // 2. Forcer Tailwind à activer le theme dark
    document.documentElement.classList.add("dark");
  }, []);

  useEffect(() => {
    setResumeOpen(false);
    setResumeTime(null);
    setSkipFirstPlayLogKey(0);
    setResumeChoicePulse(false);
    resumeProgressRef.current = null;
    activeProgressLogActionRef.current = "video_first_play";
    progressDeletedRef.current = false;
    if (!currentVideoId) return;

    let cancelled = false;

    const fetchProgress = async () => {
      try {
        const response = await api.get(`/videos/${currentVideoId}/progress`);
        if (cancelled) return;

        const progress = response.data?.progress || null;
        const savedTime = Number(progress?.Timecode);
        if (!Number.isFinite(savedTime) || savedTime <= 0) return;

        resumeProgressRef.current = progress;
        setResumeTime(savedTime);
        setResumeOpen(true);
      } catch (error) {
        console.warn("Récupération de la progression échouée:", error?.message || error);
      }
    };

    fetchProgress();

    return () => {
      cancelled = true;
    };
  }, [currentVideoId]);

  useEffect(() => {
    if (!videoElement || !currentVideoId) return;

    const saveProgress = async () => {
      if (!videoElement) return;
      if (progressDeletedRef.current) return;

      const currentTime = Math.floor(videoElement.currentTime);
      const duration = Math.floor(videoElement.duration);
      if (!Number.isFinite(currentTime) || currentTime <= 0) return;
      if (!Number.isFinite(duration) || duration <= 0) return;

      try {
        const response = await api.put(`/videos/${currentVideoId}/progress`, {
          Timecode: currentTime,
          Duration: duration,
          ProgressLogAction: activeProgressLogActionRef.current,
        });

        if (response.data?.deleted) {
          progressDeletedRef.current = true;
          setResumeOpen(false);
          setResumeTime(null);
        }
      } catch (error) {
        console.warn("Sauvegarde de la progression échouée:", error?.message || error);
      }
    };

    const intervalId = setInterval(saveProgress, 60000);
    videoElement.addEventListener("pause", saveProgress);
    videoElement.addEventListener("ended", saveProgress);

    return () => {
      clearInterval(intervalId);
      videoElement.removeEventListener("pause", saveProgress);
      videoElement.removeEventListener("ended", saveProgress);
    };
  }, [videoElement, currentVideoId]);

  const handleResume = () => {
    if (!videoElement || !Number.isFinite(resumeTime)) {
      setResumeOpen(false);
      return;
    }

    const seekTo = () => {
      try {
        videoElement.currentTime = resumeTime;
      } catch (error) {
        // ignore
      }
    };

    if (videoElement.readyState >= 1) {
      seekTo();
    } else {
      const onLoadedMetadata = () => {
        seekTo();
        videoElement.removeEventListener("loadedmetadata", onLoadedMetadata);
      };
      videoElement.addEventListener("loadedmetadata", onLoadedMetadata);
    }

    api.post("/logs/video-resume-play", {
      VideoID: currentVideoId,
      StartTimecode: resumeTime,
      Duration: resumeProgressRef.current?.Duration || Math.floor(videoElement.duration) || null,
    }).catch((error) => {
      console.warn("Log reprise vidéo échoué:", error?.message || error);
    });
    activeProgressLogActionRef.current = "video_resume_play";
    setSkipFirstPlayLogKey((prev) => prev + 1);

    setResumeOpen(false);
    setResumeChoicePulse(false);
  };

  const handleDismissResume = () => {
    if (currentVideoId) {
      api.delete(`/videos/${currentVideoId}/progress`, {
        data: { Source: "resume_modal" },
      }).catch((error) => {
        console.warn("Suppression de la progression échouée:", error?.message || error);
      });
    }
    setResumeOpen(false);
    setResumeChoicePulse(false);
    activeProgressLogActionRef.current = "video_first_play";
    resumeProgressRef.current = null;
  };

  const handleResumeModalOutsideClick = () => {
    setResumeChoicePulse(true);
    window.setTimeout(() => setResumeChoicePulse(false), 900);
  };

  const renderRecommendationSection = (title, videos, label = "Propositions") => (
    <section className="container mx-auto overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">{label}</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
          {title}
        </h2>
      </div>
      <div className="relative p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative">
          <VideoList videos={videos} />
        </div>
      </div>
    </section>
  );

  const openSaga = async (saga) => {
    setSelectedSaga(saga);
    setSelectedSagaDetails(null);
    setSelectedSagaLoading(true);

    try {
      const response = await api.get(`/sagas/${saga.SagaID}`);
      setSelectedSagaDetails(response.data);
    } catch (error) {
      console.error("Erreur lors du chargement de la saga :", error);
      showNotification("Impossible de charger cette saga.", "⚠️", "error");
      setSelectedSaga(null);
    } finally {
      setSelectedSagaLoading(false);
    }
  };

  const renderSagaSection = () => {
    if (!contentSagas.length) return null;

    return (
      <section className="container mx-auto overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
        <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
          <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Sagas</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
            Ce contenu fait partie de
          </h2>
        </div>
        <div className="relative p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
          <div className="relative">
            <div className="container mx-auto grid grid-cols-2 gap-4 sm:grid-cols-4 xl:grid-cols-8">
              {contentSagas.map((saga) => (
                <button
                  key={saga.SagaID}
                  type="button"
                  onClick={() => openSaga(saga)}
                  className="group text-left transition duration-300 hover:-translate-y-2"
                >
                  <div className="min-h-full h-max max-h-max">
                    <div className="rounded-xl overflow-hidden border border-neutral-400 bg-gradient-to-br from-slate-950 to-slate-900 mb-2 relative transition duration-300 ease-in-out group-hover:border-blue-500">
                      <img
                        src={saga.CheminImage ? `${apiUrl}/${saga.CheminImage}` : "/imageDefault.png"}
                        alt={saga.Titre}
                        className="aspect-2/3 h-full w-full object-cover duration-300 group-hover:scale-110"
                      />
                      {saga.Premium && (
                        <span className="absolute left-2 top-2 z-10 inline-flex rounded-full border border-amber-200/40 bg-gradient-to-br from-amber-300/95 via-yellow-400/95 to-orange-400/95 px-2.5 py-1 text-[10px] font-black uppercase text-slate-950">
                          Premium
                        </span>
                      )}
                    </div>
                    <p className="px-2 py-1 text-center text-sm font-bold capitalize text-slate-900 line-clamp-2 dark:text-neutral-300">
                      {saga.Titre}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {sagaTotalItems > sagaItemsPerPage && (
              <PaginationPage
                currentPage={sagaPage}
                totalPages={sagaTotalPages}
                totalItems={sagaTotalItems}
                itemsPerPage={sagaItemsPerPage}
                onPageChange={fetchContentSagas}
              />
            )}
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="relative">
      <div ref={backgroundBlur} className="fixed w-full h-full inset-0 -z-10 blur-3xl opacity-70"></div>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          icon={notification.icon}
          duration={notification.duration ?? 10000} // durée contrôlée ici
          onClose={() => setNotification(null)}     // on nettoie le state côté parent
        />
      )}
      {video && (
        <main className="flex flex-col grow gap-12">
          <section className="h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] box-border py-16 flex items-center px-16">
            <div className="w-full h-full">
              <VideoPlayer
                video={video}
                backgroundBlur={backgroundBlur}
                onVideoElement={setVideoElement}
                skipFirstPlayLogKey={skipFirstPlayLogKey}
                multiAudioEnabled={multiAudioEnabled}
              />
            </div>
          </section>

          <div className="container px-4 mx-auto grid gap-12">
            <div className="flex flex-col gap-12">
              {isEpisode && (
                <button
                  onClick={() => setShowDetails((prev) => !prev)}
                  className="self-start rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-2.5 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 dark:text-white"
                >
                  {showDetails ? "Masquer les détails" : "Afficher les détails"}
                </button>
              )}

              {(!isEpisode || showDetails) && (
                <VideoDetails
                  video={video}
                  isAdmin={isAdmin}
                  onTitleUpdate={handleTitleUpdate}
                  onResumerUpdate={handleResumerUpdate}
                  onImageUpdate={handleImageUpdate}
                  onPremiumUpdate={(newPremium) =>
                    setVideo((prev) => ({ ...prev, Premium: newPremium }))
                  }
                  isFavorite={!!video.IsFavorite}
                  onFavoriteChange={(nextValue) =>
                    setVideo((prev) => ({ ...prev, IsFavorite: nextValue }))
                  }
                />
              )}
            </div>

            {type === "series" && series && (
              <>
                <div className="grid gap-12">
                  <section className="container mx-auto overflow-visible rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
                    <div className="rounded-t-2xl border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Épisodes</p>
                          <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                            Saisons et épisodes
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={handleResetSeriesWatchStatus}
                          disabled={isResettingSeries}
                          className="inline-flex items-center justify-center rounded-lg border border-rose-300/40 bg-rose-500/15 px-5 py-2.5 text-sm font-bold text-rose-700 transition duration-200 hover:border-rose-300/80 hover:bg-rose-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-rose-200"
                        >
                          {isResettingSeries ? "Remise à zéro..." : "Recommencer la série"}
                        </button>
                      </div>
                    </div>
                    <div className="relative p-6">
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
                      <div className="relative">
                        <SeasonList
                          seasons={series.Saisons}
                          currentSeason={currentSeason}
                          onSeasonChange={handleSeasonChange}
                        />
                        <EpisodeList
                          episodes={episodes}
                          currentEpisode={currentEpisode}
                          canAccessPremium={isPremiumUser}
                        />
                      </div>
                    </div>
                  </section>
                  <div>
                    <SerieDetails
                      series={series}
                      isAdmin={isAdmin}
                      onTitleUpdate={handleSeriesTitleUpdate}
                      onResumerUpdate={handleSeriesResumerUpdate}
                      onImageUpdate={handleSeriesImageUpdate}
                      onPremiumUpdate={(newPremium) =>
                        setSeries((prev) => ({ ...prev, Premium: newPremium }))
                      }
                      isFavorite={!!series.IsFavorite}
                      onFavoriteChange={(nextValue) =>
                        setSeries((prev) => ({ ...prev, IsFavorite: nextValue }))
                      }
                    />
                  </div>
                </div>
              </>
            )}

            {(user?.GradeID === 1 || user?.GradeID === 2) && (
              <section className="container mx-auto overflow-visible rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
                <div className="rounded-t-2xl border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
                  <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Gestion de l'épisode</h2>
                </div>
                <div className="relative p-6">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
                  <div className="relative z-[80] grid grid-cols-1 md:grid-cols-2">
                    <div>
                      <SeriesAndSeasonSelector
                        selectedSeries={selectedSeries}
                        setSelectedSeries={setSelectedSeries}
                        selectedSeason={selectedSeason}
                        setSelectedSeason={setSelectedSeason}
                      />
                      <button
                        onClick={handleConvertToEpisode}
                        className="mt-4 inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-2.5 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 dark:text-white"
                      >
                        {selectedSeason ? "Convertir en épisode" : "Retirer de la série"}
                      </button>

                    </div>
                  </div>
                </div>
              </section>
            )}

            {renderSagaSection()}

            {/* recommandations personnalisées */}
            {renderRecommendationSection("Recommandations proches de vos goûts", similarPanel)}

            {renderRecommendationSection("Suggestions pour sortir de vos habitudes", discoveryPanel)}

            {/* recommandations par genres (original) */}
            {renderRecommendationSection("Recommandations proche du contenu que vous regardez", recommendations)}

          </div>

        </main>
      )}

      {video && (
        <Dialog open={resumeOpen} onClose={handleResumeModalOutsideClick} className="relative z-10">
          <DialogBackdrop
            transition
            className="fixed inset-0 bg-gray-900/50 backdrop-blur-md transition-opacity data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in"
          />

          <div className="fixed inset-0 z-10 w-screen overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <DialogPanel
                transition
                className="relative transform overflow-hidden rounded-lg dark:bg-slate-950 dark:text-blue-400 bg-blue-200 px-4 pb-4 pt-5 text-left shadow-xl outline outline-1 -outline-offset-1 outline-white/10 transition-all data-[closed]:translate-y-4 data-[closed]:opacity-0 data-[enter]:duration-300 data-[leave]:duration-200 data-[enter]:ease-out data-[leave]:ease-in sm:my-8 sm:w-full sm:max-w-lg sm:p-6 data-[closed]:sm:translate-y-0 data-[closed]:sm:scale-95"
              >
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto flex size-12 shrink-0 items-center justify-center rounded-full dark:bg-blue-950 bg-blue-200 sm:mx-0 sm:size-10">
                    <ExclamationTriangleIcon aria-hidden="true" className="size-6 dark:text-blue-400 text-blue-900" />
                  </div>
                  <div className="mt-3 text-center sm:ml-4 sm:mt-0 sm:text-left">
                    <DialogTitle as="h3" className="text-base font-semibold dark:text-blue-50 text-blue-950">
                      Reprendre la lecture ?
                    </DialogTitle>
                    <div className="mt-2">
                      <p className="text-sm dark:text-blue-300 text-blue-900">
                        On a trouvé une progression enregistrée à <span className="text-red-500">{formatTimecode(resumeTime)}</span>.
                        Souhaitez-vous reprendre la vidéo à cet endroit ?
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-5 sm:ml-10 sm:mt-4 sm:flex sm:pl-4">
                  <button
                    type="button"
                    onClick={handleResume}
                    className={`inline-flex w-full justify-center rounded-md bg-blue-500 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-400 sm:w-auto ${resumeChoicePulse ? "animate-pulse ring-2 ring-blue-200" : ""}`}
                  >
                    Reprendre
                  </button>
                  <button
                    type="button"
                    data-autofocus
                    onClick={handleDismissResume}
                    className={`mt-3 inline-flex w-full justify-center rounded-md bg-white/10 px-3 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-inset ring-white/5 hover:bg-white/20 sm:ml-3 sm:mt-0 sm:w-auto ${resumeChoicePulse ? "animate-pulse ring-2 ring-blue-200" : ""}`}
                  >
                    Repartir du début
                  </button>
                </div>
              </DialogPanel>
            </div>
          </div>
        </Dialog>
      )}

      {selectedSaga && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 py-8 backdrop-blur">
          <div className="max-h-full w-full max-w-6xl overflow-y-auto rounded-2xl border border-sky-500/10 bg-white shadow-2xl dark:bg-slate-950 dark:text-white">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-sky-500/10 bg-white/95 px-6 py-5 backdrop-blur dark:bg-slate-950/95">
              <div>
                <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Saga</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{selectedSaga.Titre}</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSaga(null)}
                className="rounded-lg border border-slate-300/60 p-2 text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
              >
                <XMarkIcon className="size-5" />
              </button>
            </div>
            <div className="p-6">
              {selectedSagaLoading ? (
                <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">Chargement...</p>
              ) : selectedSagaDetails?.Contents?.length ? (
                <VideoList videos={selectedSagaDetails.Contents} />
              ) : (
                <p className="rounded-xl border border-sky-500/10 bg-slate-50 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                  Aucun contenu dans cette saga.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Si pas de vidéo mais un message d'accès (premium ou autre) */}
      {!video && accessMessage && !isLoading && (
        <div className="max-w-2xl mx-auto mt-32 px-4 py-6 rounded-xl bg-slate-900/80 border border-slate-700 text-slate-100 shadow-lg">
          <h2 className="text-xl font-semibold mb-3">
            Accès au contenu restreint
          </h2>
          {PREMIUM_MESSAGE === accessMessage ? (
            <>
              <p className="mb-2">
                Ce contenu est réservé aux membres Premium. Il fait partie des vidéos et séries
                exclusives disponibles uniquement avec un abonnement actif.
              </p>
              <p className="mb-2">
                Pour passer en Premium, ouvrez <span className="font-semibold">Paramètres → Abonnement</span>,
                puis choisissez la formule qui vous convient (mensuelle ou annuelle).
              </p>
              <p className="text-sm text-slate-400">
                L’activation est immédiate et ne nécessite aucun paiement réel : il s’agit d’une
                simulation pour tester les fonctionnalités.
              </p>
            </>
          ) : (
            <p>{accessMessage}</p>
          )}
        </div>
      )}

      {/* État de chargement simple, uniquement si on charge encore */}
      {isLoading && !video && !accessMessage && (
        <div className="text-slate-400 font-medium text-center mt-32">
          Chargement en cours...
        </div>
      )}
    </div>
  );
};

export default VideoSeePage;
