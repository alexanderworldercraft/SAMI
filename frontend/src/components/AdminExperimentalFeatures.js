import React, { useEffect, useState } from "react";
import api from "../services/api";

const AdminExperimentalFeatures = () => {
  const [contentPreviewActive, setContentPreviewActive] = useState(false);
  const [previewLiveActive, setPreviewLiveActive] = useState(false);
  const [multiAudioActive, setMultiAudioActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const [contentPreviewResponse, previewLiveResponse, multiAudioResponse] = await Promise.all([
          api.get("/app-settings/content-preview"),
          api.get("/app-settings/preview-live"),
          api.get("/app-settings/multi-audio"),
        ]);
        setContentPreviewActive(Boolean(contentPreviewResponse.data?.active));
        setPreviewLiveActive(Boolean(previewLiveResponse.data?.active));
        setMultiAudioActive(Boolean(multiAudioResponse.data?.active));
      } catch (error) {
        console.error("Erreur lors du chargement des fonctionnalités expérimentales :", error);
        setErrorMessage(error.response?.data?.error || "Impossible de charger les fonctionnalités expérimentales.");
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

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
        </div>
      </div>
    </section>
  );
};

export default AdminExperimentalFeatures;
