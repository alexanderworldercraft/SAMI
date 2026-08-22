import React, { useEffect, useState } from "react";
import api from "../services/api";
import {
  countAvailableEncodingClones,
  getVideoEncodingWorkers,
  isPrimaryVideoEncodingConfig,
  isVideoEncodingEnabled,
  NO_ENCODING_WORKER_MESSAGE,
  normalizeVideoEncodingWorker,
  unwrapVideoEncodingConfig,
  VIDEO_ENCODING_POLL_INTERVAL_MS,
} from "../utils/videoEncoding";

const AdminExperimentalFeatures = () => {
  const [contentPreviewActive, setContentPreviewActive] = useState(false);
  const [previewLiveActive, setPreviewLiveActive] = useState(false);
  const [multiAudioActive, setMultiAudioActive] = useState(false);
  const [aiSubtitlesConfig, setAiSubtitlesConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [videoEncodingConfig, setVideoEncodingConfig] = useState(null);
  const [videoEncodingWorkers, setVideoEncodingWorkers] = useState([]);
  const [videoEncodingLoading, setVideoEncodingLoading] = useState(true);
  const [videoEncodingSaving, setVideoEncodingSaving] = useState(false);
  const [workerRegistrySaving, setWorkerRegistrySaving] = useState(false);
  const [workerDraft, setWorkerDraft] = useState({
    instanceId: "",
    displayName: "",
    performanceScore: "1",
    maxNominalHeight: "2160",
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [contentPreviewResponse, previewLiveResponse, multiAudioResponse, aiSubtitlesResponse] = await Promise.all([
          api.get("/app-settings/content-preview"),
          api.get("/app-settings/preview-live"),
          api.get("/app-settings/multi-audio"),
          api.get("/ai-subtitles/config"),
        ]);
        setContentPreviewActive(Boolean(contentPreviewResponse.data?.active));
        setPreviewLiveActive(Boolean(previewLiveResponse.data?.active));
        setMultiAudioActive(Boolean(multiAudioResponse.data?.active));
        setAiSubtitlesConfig(aiSubtitlesResponse.data || null);
      } catch (error) {
        console.error("Erreur lors du chargement des fonctionnalités expérimentales :", error);
        setErrorMessage(error.response?.data?.error || "Impossible de charger les fonctionnalités expérimentales.");
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const fetchVideoEncodingSettings = async () => {
      try {
        const userResponse = await api.get("/users/me");
        if (cancelled) return;
        const superAdmin = userResponse.data?.GradeID === 1;
        setIsSuperAdmin(superAdmin);
        if (!superAdmin) return;

        const configResponse = await api.get("/video-encoding/config");
        if (cancelled) return;
        const config = unwrapVideoEncodingConfig(configResponse.data);
        if (!isPrimaryVideoEncodingConfig(config)) return;
        setVideoEncodingConfig(config);

        try {
          const workersResponse = await api.get("/video-encoding/workers");
          if (!cancelled) {
            const registeredWorkers = getVideoEncodingWorkers(workersResponse.data);
            setVideoEncodingWorkers(
              registeredWorkers.length > 0
                ? registeredWorkers
                : getVideoEncodingWorkers(config?.workers)
            );
          }
        } catch (error) {
          if (!cancelled) {
            setVideoEncodingWorkers(getVideoEncodingWorkers(config?.workers));
            console.warn("Impossible de charger le registre des clones d'encodage :", error);
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Impossible de charger la configuration multi-server :", error);
        }
      } finally {
        if (!cancelled) setVideoEncodingLoading(false);
      }
    };

    fetchVideoEncodingSettings();
    return () => {
      cancelled = true;
    };
  }, []);

  const canRefreshVideoEncodingRegistry = isSuperAdmin
    && isPrimaryVideoEncodingConfig(videoEncodingConfig);

  useEffect(() => {
    if (!canRefreshVideoEncodingRegistry) return undefined;

    let cancelled = false;
    let refreshInProgress = false;
    const refreshRegistry = async () => {
      if (refreshInProgress) return;
      refreshInProgress = true;
      try {
        const [configResult, workersResult] = await Promise.allSettled([
          api.get("/video-encoding/config"),
          api.get("/video-encoding/workers"),
        ]);
        if (cancelled) return;
        if (configResult.status === "fulfilled") {
          setVideoEncodingConfig(unwrapVideoEncodingConfig(configResult.value.data));
        }
        if (workersResult.status === "fulfilled") {
          setVideoEncodingWorkers(getVideoEncodingWorkers(workersResult.value.data));
        }
      } finally {
        refreshInProgress = false;
      }
    };
    const interval = window.setInterval(
      refreshRegistry,
      VIDEO_ENCODING_POLL_INTERVAL_MS
    );
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [canRefreshVideoEncodingRegistry]);

  const handleToggleContentPreview = async () => {
    const nextActive = !contentPreviewActive;
    setContentPreviewActive(nextActive);
    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.put("/app-settings/content-preview", {
        active: nextActive,
      });
      setContentPreviewActive(Boolean(response.data?.active));
      setMessage(response.data?.active ? "Prévisualisation activée." : "Prévisualisation désactivée.");
    } catch (error) {
      console.error("Erreur lors de la mise à jour de la prévisualisation :", error);
      setContentPreviewActive(!nextActive);
      setErrorMessage(error.response?.data?.error || "Impossible de mettre à jour la prévisualisation.");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePreviewLive = async () => {
    const nextActive = !previewLiveActive;
    setPreviewLiveActive(nextActive);
    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.put("/app-settings/preview-live", {
        active: nextActive,
      });
      setPreviewLiveActive(Boolean(response.data?.active));
      setMessage(response.data?.active ? "Preview Live activée." : "Preview Live désactivée.");
    } catch (error) {
      console.error("Erreur lors de la mise à jour de Preview Live :", error);
      setPreviewLiveActive(!nextActive);
      setErrorMessage(error.response?.data?.error || "Impossible de mettre à jour Preview Live.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleMultiAudio = async () => {
    const nextActive = !multiAudioActive;
    setMultiAudioActive(nextActive);
    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.put("/app-settings/multi-audio", {
        active: nextActive,
      });
      setMultiAudioActive(Boolean(response.data?.active));
      setMessage(
        response.data?.active
          ? "Pistes audio multiples activées pour les prochains imports."
          : "Pistes audio multiples désactivées pour les prochains imports."
      );
    } catch (error) {
      console.error("Erreur lors de la mise à jour du multi-audio :", error);
      setMultiAudioActive(!nextActive);
      setErrorMessage(
        error.response?.data?.error || "Impossible de mettre à jour le multi-audio."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAiSubtitles = async () => {
    const nextActive = !aiSubtitlesConfig?.active;
    setSaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await api.put("/ai-subtitles/config", { active: nextActive });
      setAiSubtitlesConfig(response.data);
      setMessage(
        response.data?.active
          ? "Génération locale des sous-titres IA activée."
          : "Génération locale des sous-titres IA désactivée."
      );
    } catch (error) {
      setErrorMessage(
        error.response?.data?.error || "Impossible de modifier les sous-titres IA."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVideoEncoding = async () => {
    const nextEnabled = !isVideoEncodingEnabled(videoEncodingConfig);
    setVideoEncodingSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const response = await api.put("/video-encoding/config", {
        enabled: nextEnabled,
      });
      const updatedConfig = unwrapVideoEncodingConfig(response.data);
      setVideoEncodingConfig((current) => ({
        ...current,
        ...updatedConfig,
        enabled: Boolean(updatedConfig?.enabled ?? nextEnabled),
      }));
      setMessage(
        Boolean(updatedConfig?.enabled ?? nextEnabled)
          ? "Encodage multi-server activé."
          : "Encodage multi-server désactivé."
      );
    } catch (error) {
      console.error("Erreur lors de la mise à jour de l'encodage multi-server :", error);
      setErrorMessage(
        error.response?.data?.error
        || "Impossible de mettre à jour l'encodage multi-server."
      );
    } finally {
      setVideoEncodingSaving(false);
    }
  };

  const handleRegisterEncodingWorker = async (event) => {
    event.preventDefault();
    const instanceId = workerDraft.instanceId.trim();
    if (!instanceId) return;
    setWorkerRegistrySaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await api.post("/video-encoding/workers", {
        instanceId,
        displayName: workerDraft.displayName.trim() || instanceId,
        performanceScore: Number(workerDraft.performanceScore),
        maxNominalHeight: Number(workerDraft.maxNominalHeight),
        enabled: true,
      });
      const worker = normalizeVideoEncodingWorker(response.data?.worker);
      setVideoEncodingWorkers((current) => [
        ...current.filter((item) => normalizeVideoEncodingWorker(item).id !== worker.id),
        worker,
      ]);
      setWorkerDraft({
        instanceId: "",
        displayName: "",
        performanceScore: "1",
        maxNominalHeight: "2160",
      });
      setMessage(`Clone ${worker.displayName} enregistré.`);
    } catch (error) {
      setErrorMessage(
        error.response?.data?.error || "Impossible d'enregistrer ce clone."
      );
    } finally {
      setWorkerRegistrySaving(false);
    }
  };

  const handleWorkerAvailability = async (worker) => {
    setWorkerRegistrySaving(true);
    setMessage("");
    setErrorMessage("");
    try {
      const response = await api.patch(
        `/video-encoding/workers/${encodeURIComponent(worker.id)}`,
        { enabled: !worker.enabled, draining: worker.enabled }
      );
      const updated = normalizeVideoEncodingWorker(response.data?.worker);
      setVideoEncodingWorkers((current) => current.map((item) =>
        normalizeVideoEncodingWorker(item).id === updated.id ? updated : item
      ));
      setMessage(
        updated.enabled
          ? `Clone ${updated.displayName} activé.`
          : `Clone ${updated.displayName} désactivé.`
      );
    } catch (error) {
      setErrorMessage(
        error.response?.data?.error || "Impossible de modifier ce clone."
      );
    } finally {
      setWorkerRegistrySaving(false);
    }
  };

  const normalizedEncodingWorkers = videoEncodingWorkers
    .map(normalizeVideoEncodingWorker)
    .filter((worker) => worker.role !== "primary");
  const activeEncodingWorkerCount = countAvailableEncodingClones(
    normalizedEncodingWorkers
  );
  const showVideoEncodingSettings = isSuperAdmin
    && isPrimaryVideoEncodingConfig(videoEncodingConfig);

  return (
    <section className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Fonctionnalités expérimentales</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Active les options en test pour toute l'application.
        </p>
      </div>

      <div className="relative px-6 py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative">
          {message && (
            <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">
              {message}
            </div>
          )}
          {errorMessage && (
            <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">
              {errorMessage}
            </div>
          )}

          <div className="flex flex-col gap-4 rounded-xl border border-sky-500/10 bg-white/70 p-5 dark:bg-slate-950/45 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-black text-slate-950 dark:text-white">Tooltip de prévisualisation des affiches</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Affiche un diaporama au survol des affiches et des cards de contenu.
              </p>
            </div>

            <button
              type="button"
              onClick={handleToggleContentPreview}
              disabled={loading || saving}
              className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition duration-200 ${
                contentPreviewActive
                  ? "border-emerald-300/70 bg-emerald-500/80"
                  : "border-slate-300/70 bg-slate-300/70 dark:border-slate-700 dark:bg-slate-800"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span className="sr-only">Activer la prévisualisation vidéo</span>
              <span
                className={`inline-block size-6 rounded-full bg-white shadow transition duration-200 ${
                  contentPreviewActive ? "translate-x-9" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4 rounded-xl border border-sky-500/10 bg-white/70 p-5 dark:bg-slate-950/45 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-black text-slate-950 dark:text-white">Preview Live du lecteur vidéo</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Affiche une vignette de la vidéo au survol de la barre de progression personnalisée.
                Les spritesheets sont générées toutes les 4 secondes, à raison de 50 images maximum par planche.
              </p>
            </div>

            <button
              type="button"
              onClick={handleTogglePreviewLive}
              disabled={loading || saving}
              className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition duration-200 ${
                previewLiveActive
                  ? "border-emerald-300/70 bg-emerald-500/80"
                  : "border-slate-300/70 bg-slate-300/70 dark:border-slate-700 dark:bg-slate-800"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span className="sr-only">Activer Preview Live</span>
              <span
                className={`inline-block size-6 rounded-full bg-white shadow transition duration-200 ${
                  previewLiveActive ? "translate-x-9" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {showVideoEncodingSettings && (
            <div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-500/5 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black text-slate-950 dark:text-white">
                      Encodage multi-server
                    </h3>
                    <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs font-black text-violet-700 dark:text-violet-200">
                      Expérimental
                    </span>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                    Répartit les résolutions entre le serveur principal et les clones actifs.
                    La fonctionnalité reste réservée au super administrateur du serveur principal.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleToggleVideoEncoding}
                  disabled={videoEncodingLoading || videoEncodingSaving}
                  className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition duration-200 ${
                    isVideoEncodingEnabled(videoEncodingConfig)
                      ? "border-emerald-300/70 bg-emerald-500/80"
                      : "border-slate-300/70 bg-slate-300/70 dark:border-slate-700 dark:bg-slate-800"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  <span className="sr-only">
                    {isVideoEncodingEnabled(videoEncodingConfig)
                      ? "Désactiver l'encodage multi-server"
                      : "Activer l'encodage multi-server"}
                  </span>
                  <span
                    className={`inline-block size-6 rounded-full bg-white shadow transition duration-200 ${
                      isVideoEncodingEnabled(videoEncodingConfig) ? "translate-x-9" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="mt-5 border-t border-violet-400/15 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-sm font-black uppercase tracking-wide text-slate-700 dark:text-slate-200">
                    Registre des clones
                  </h4>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${
                    activeEncodingWorkerCount > 0
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                      : "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                  }`}>
                    {activeEncodingWorkerCount} actif{activeEncodingWorkerCount > 1 ? "s" : ""}
                  </span>
                </div>

                {activeEncodingWorkerCount === 0 && (
                  <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
                    {NO_ENCODING_WORKER_MESSAGE}
                  </p>
                )}

                <form
                  onSubmit={handleRegisterEncodingWorker}
                  className="mt-4 grid gap-3 rounded-lg border border-violet-400/15 bg-white/60 p-4 dark:bg-slate-950/35 sm:grid-cols-2"
                >
                  <label className="grid gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
                    SAMI_INSTANCE_ID exact
                    <input
                      value={workerDraft.instanceId}
                      onChange={(event) => setWorkerDraft((current) => ({
                        ...current,
                        instanceId: event.target.value,
                      }))}
                      required
                      placeholder="Sami-clone-aero15XC"
                      className="rounded-lg border border-violet-400/25 bg-white px-3 py-2 text-slate-900 dark:bg-slate-950 dark:text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
                    Nom affiché
                    <input
                      value={workerDraft.displayName}
                      onChange={(event) => setWorkerDraft((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }))}
                      placeholder="Aero 15 XC"
                      className="rounded-lg border border-violet-400/25 bg-white px-3 py-2 text-slate-900 dark:bg-slate-950 dark:text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
                    Priorité de performance
                    <input
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={workerDraft.performanceScore}
                      onChange={(event) => setWorkerDraft((current) => ({
                        ...current,
                        performanceScore: event.target.value,
                      }))}
                      required
                      className="rounded-lg border border-violet-400/25 bg-white px-3 py-2 text-slate-900 dark:bg-slate-950 dark:text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-slate-700 dark:text-slate-200">
                    Résolution maximale
                    <select
                      value={workerDraft.maxNominalHeight}
                      onChange={(event) => setWorkerDraft((current) => ({
                        ...current,
                        maxNominalHeight: event.target.value,
                      }))}
                      className="rounded-lg border border-violet-400/25 bg-white px-3 py-2 text-slate-900 dark:bg-slate-950 dark:text-white"
                    >
                      <option value="360">360p</option>
                      <option value="720">720p</option>
                      <option value="1080">1080p</option>
                      <option value="2160">4K</option>
                      <option value="4320">8K</option>
                    </select>
                  </label>
                  <p className="text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400 sm:col-span-2">
                    L'identifiant est sensible à la casse. Une valeur de priorité plus élevée reçoit les résolutions les plus lourdes en premier.
                  </p>
                  <button
                    type="submit"
                    disabled={workerRegistrySaving}
                    className="rounded-lg border border-violet-300/50 bg-violet-500/15 px-4 py-2 text-sm font-black text-slate-900 transition hover:bg-violet-500/25 disabled:opacity-60 dark:text-white sm:col-span-2"
                  >
                    Enregistrer le clone
                  </button>
                </form>

                <ul className="mt-3 grid gap-2" aria-label="Clones d'encodage enregistrés">
                  {normalizedEncodingWorkers.map((worker) => {
                    const online = ["online", "available", "active", "busy"].includes(worker.status)
                      && worker.enabled
                      && !worker.draining;
                    return (
                      <li key={worker.id} className="flex flex-col gap-2 rounded-lg border border-violet-400/15 bg-white/70 px-3 py-3 text-sm dark:bg-slate-950/45 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-black text-slate-900 dark:text-white">{worker.displayName}</p>
                          <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {worker.ffmpegVersion ? `FFmpeg ${worker.ffmpegVersion}` : "Version FFmpeg non communiquée"}
                            {worker.maxNominalHeight ? ` · jusqu'à ${worker.maxNominalHeight}p` : ""}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {worker.maxSlots > 0 && (
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                              {worker.activeLeaseCount}/{worker.maxSlots} slot{worker.maxSlots > 1 ? "s" : ""}
                            </span>
                          )}
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                            Priorité {worker.performanceScore || 1}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-black ${
                            online
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-slate-500/15 text-slate-700 dark:text-slate-300"
                          }`}>
                            {worker.draining
                              ? "Drainage"
                              : !worker.enabled
                                ? "Désactivé"
                                : online
                                  ? "En ligne"
                                  : "Hors ligne"}
                          </span>
                          <button
                            type="button"
                            disabled={workerRegistrySaving}
                            onClick={() => handleWorkerAvailability(worker)}
                            className="rounded-full border border-violet-400/25 px-2.5 py-1 text-xs font-black text-violet-700 transition hover:bg-violet-500/10 disabled:opacity-60 dark:text-violet-200"
                          >
                            {worker.enabled ? "Désactiver" : "Activer"}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                  {normalizedEncodingWorkers.length === 0 && (
                    <li className="rounded-lg border border-dashed border-violet-400/20 px-3 py-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
                      Aucun clone n'est encore enregistré.
                    </li>
                  )}
                </ul>
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-col gap-4 rounded-xl border border-sky-500/10 bg-white/70 p-5 dark:bg-slate-950/45 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-black text-slate-950 dark:text-white">
                Pistes audio multiples
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Conserve toutes les pistes audio des prochaines vidéos importées et permet de les
                choisir dans le lecteur. Les vidéos déjà présentes ne sont pas retraitées.
              </p>
            </div>

            <button
              type="button"
              onClick={handleToggleMultiAudio}
              disabled={loading || saving}
              className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition duration-200 ${
                multiAudioActive
                  ? "border-emerald-300/70 bg-emerald-500/80"
                  : "border-slate-300/70 bg-slate-300/70 dark:border-slate-700 dark:bg-slate-800"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span className="sr-only">Activer les pistes audio multiples</span>
              <span
                className={`inline-block size-6 rounded-full bg-white shadow transition duration-200 ${
                  multiAudioActive ? "translate-x-9" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-black text-slate-950 dark:text-white">
                  Sous-titres générés par IA
                </h3>
                <span className="rounded-full bg-fuchsia-500/15 px-2.5 py-1 text-xs font-black text-fuchsia-700 dark:text-fuchsia-200">
                  Usage privé
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                Génère automatiquement le français manquant sur les nouveaux imports et permet
                aux utilisateurs connectés de demander d'autres langues. Les modèles restent
                stockés et exécutés localement.
              </p>
              {aiSubtitlesConfig && !aiSubtitlesConfig.environmentEnabled && (
                <p className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                  Le runtime doit d'abord être installé avec npm run setup:ai puis activé dans l'environnement.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={handleToggleAiSubtitles}
              disabled={loading || saving || !aiSubtitlesConfig?.environmentEnabled}
              className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition duration-200 ${
                aiSubtitlesConfig?.active
                  ? "border-emerald-300/70 bg-emerald-500/80"
                  : "border-slate-300/70 bg-slate-300/70 dark:border-slate-700 dark:bg-slate-800"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <span className="sr-only">Activer les sous-titres générés par IA</span>
              <span
                className={`inline-block size-6 rounded-full bg-white shadow transition duration-200 ${
                  aiSubtitlesConfig?.active ? "translate-x-9" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AdminExperimentalFeatures;
