import React, { useCallback, useEffect, useRef, useState } from "react";
import { CpuChipIcon, SpeakerWaveIcon, TrashIcon } from "@heroicons/react/24/outline";

import api from "../services/api";
import DubbingVideoSelect from "./DubbingVideoSelect";
import GuidedVoiceReferenceEditor from "./GuidedVoiceReferenceEditor";

const apiUrl = String(process.env.REACT_APP_URL_LOCAL || "").replace(/\/+$/, "");
const BUSY_STATUSES = new Set([
  "QUEUED_PREVIEW",
  "PROCESSING_PREVIEW",
  "QUEUED_FULL",
  "PROCESSING_FULL",
]);
const DELETABLE_STATUSES = new Set([
  "PREVIEW_REVIEW", "FINAL_REVIEW", "PUBLISHED", "REJECTED", "FAILED",
]);

const statusLabels = {
  QUEUED_PREVIEW: "Extrait en attente",
  PROCESSING_PREVIEW: "Génération de l'extrait",
  PREVIEW_REVIEW: "Extrait à valider",
  QUEUED_FULL: "Piste complète en attente",
  PROCESSING_FULL: "Génération de la piste complète",
  FINAL_REVIEW: "Piste complète à valider",
  PUBLISHED: "Publiée",
  REJECTED: "Refusée",
  FAILED: "Échec",
};

const phaseLabels = {
  PREPARING_INPUT: "Préparation sécurisée des entrées",
  QUEUED: "En attente d'un clone compatible",
  DOWNLOADING: "Transfert protégé vers le clone",
  EXTRACTING: "Extraction de l'audio",
  SEPARATING: "Séparation voix et ambiance",
  DIARIZING: "Détection et attribution des intervenants",
  VOICE_REFERENCE: "Préparation de la voix de référence",
  LOADING_VOICE_PROFILE: "Chargement des profils vocaux validés",
  LOADING_VOICE_MODEL: "Chargement du modèle vocal",
  SYNTHESIZING_VOICE_SAMPLES: "Création des échantillons de chaque intervenant",
  SYNTHESIZING: "Synthèse de la voix",
  ASSEMBLING: "Assemblage des répliques",
  MIXING: "Mixage audio",
  WATERMARKING: "Application du filigrane IA",
  FINALIZING: "Finalisation sécurisée",
  UPLOADING: "Retour protégé vers le primary",
  VOICE_TIMEOUT: "Délai vocal dépassé : arrêt du calcul en cours, diagnostic en préparation",
};
const phaseLabel = (phase) => {
  const match = /^(VS|VC|VF)_(\d{2})_(SYN|WM|QC|FIT|ASM|MIX)_(\d{1,5})(?:_(\d{1,5})_(\d{1,5})_([1-3]))?$/.exec(phase || "");
  if (!match) return phaseLabels[phase];
  const [, kind, speaker, step, elapsed, index, count, attempt] = match;
  const steps = { SYN: "synthèse", WM: "filigrane IA", QC: "contrôle vocal", FIT: "ajustement audio", ASM: "assemblage", MIX: "mixage" };
  const subject = kind === "VF" ? "Piste complète" : `${kind === "VS" ? "Échantillon" : "Réplique"}${index ? ` ${index}/${count}` : ""} · SPEAKER_${speaker}`;
  return `${subject} · ${steps[step]}${attempt ? ` · tentative ${attempt}/3` : ""} · ${elapsed} s écoulées (temps d'attente, pas progression du GPU)`;
};
const scriptFlagLabels = {
  missing_source_evidence: "aucune preuve transcript alignée",
  low_source_confidence: "confiance faible dans la transcription source",
  very_short_voice_window: "fenêtre vocale très courte",
};

const formatClock = (totalSeconds) => {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const PublishedGroup = ({ group, renderJob }) => {
  const [open, setOpen] = useState(false);
  return <section className="overflow-hidden rounded-2xl border border-sky-500/20 bg-white/80 dark:bg-slate-950/60">
    <h3><button type="button" aria-expanded={open} aria-controls={`dubbing-video-${group.video.id}`}
      onClick={() => setOpen(value => !value)} className="flex w-full items-center justify-between gap-4 p-5 text-left focus-visible:ring-2 focus-visible:ring-sky-500">
      <span><span className="block text-2xl font-black">{group.video.title || `Vidéo ${group.video.id}`}</span>
        <span className="mt-1 block text-sm font-normal text-slate-500">Vidéo #{group.video.id} · {group.jobs.length} doublage(s) validé(s)</span></span>
      <span aria-hidden="true">{open ? "−" : "+"}</span>
    </button></h3>
    {open && <div id={`dubbing-video-${group.video.id}`} className="grid gap-3 border-t border-sky-500/20 p-4">{group.jobs.map(renderJob)}</div>}
  </section>;
};

export default function AdminAiDubbingManager() {
  const [config, setConfig] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [activeTab, setActiveTab] = useState("ongoing");
  const [ongoingPage, setOngoingPage] = useState(1);
  const [publishedPage, setPublishedPage] = useState(1);
  const [groups, setGroups] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 });
  const [listLoading, setListLoading] = useState(false);
  const requestNumber = useRef(0);
  const [videoId, setVideoId] = useState("");
  const [language, setLanguage] = useState("fr");
  const [expectedSpeakerCount, setExpectedSpeakerCount] = useState("");
  const [previewMinutes, setPreviewMinutes] = useState("0");
  const [previewSeconds, setPreviewSeconds] = useState("0");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [guidedPreparation, setGuidedPreparation] = useState(false);

  useEffect(() => { setGuidedPreparation(false); }, [videoId, language, expectedSpeakerCount]);

  const load = useCallback(async () => {
    const requestId = ++requestNumber.current;
    setListLoading(true);
    try {
      const [configResponse, jobsResponse] = await Promise.all([
        api.get("/ai-dubbing/config"),
        api.get(`/ai-dubbing/jobs?view=${activeTab}&page=${activeTab === "ongoing" ? ongoingPage : publishedPage}`),
      ]);
      if (requestId !== requestNumber.current) return;
      setConfig(configResponse.data);
      if (activeTab === "ongoing") setJobs(jobsResponse.data?.jobs || []);
      else setGroups(jobsResponse.data?.groups || []);
      setPagination(jobsResponse.data?.pagination || { page: 1, totalPages: 1 });
      if (jobsResponse.data?.pagination?.page) {
        (activeTab === "ongoing" ? setOngoingPage : setPublishedPage)(jobsResponse.data.pagination.page);
      }
      setError("");
    } catch (requestError) {
      if (requestId !== requestNumber.current) return;
      setError(requestError.response?.data?.error || "Le doublage IA est indisponible.");
    } finally {
      if (requestId === requestNumber.current) { setLoading(false); setListLoading(false); }
    }
  }, [activeTab, ongoingPage, publishedPage]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!jobs.some((job) => BUSY_STATUSES.has(job.status))) return undefined;
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, [jobs, load]);

  const startPreview = async (manualVoiceReferences = null) => {
    setActionLoading("request");
    setError("");
    setMessage("");
    try {
      const previewStartSeconds = (Number(previewMinutes) * 60) + Number(previewSeconds);
      const response = await api.post(`/ai-dubbing/videos/${videoId}/requests`, {
        language,
        previewStartSeconds,
        expectedSpeakerCount: expectedSpeakerCount === "" ? null : Number(expectedSpeakerCount),
        ...(manualVoiceReferences ? { manualVoiceReferences } : {}),
      });
      setGuidedPreparation(false);
      setMessage(response.data?.alreadyQueued
        ? "Une tâche active existe déjà pour cette vidéo et cette langue."
        : `La génération locale de l'extrait ${formatClock(previewStartSeconds)}–${formatClock(previewStartSeconds + 45)} a été lancée.`);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Impossible de demander cet extrait.");
    } finally {
      setActionLoading("");
    }
  };

  const requestPreview = (event) => {
    event.preventDefault();
    if (!videoId) { setError("Sélectionnez une vidéo."); return; }
    if (expectedSpeakerCount !== "") {
      if (!Number.isInteger(Number(expectedSpeakerCount)) || Number(expectedSpeakerCount) < 1 || Number(expectedSpeakerCount) > 30) {
        setError("Choisissez entre 1 et 30 intervenants."); return;
      }
      if (!config?.manualReferencesSupported) {
        setError("Les références guidées nécessitent un profil compatible, par exemple sami-dubbing-v5-translated-clauses-r5, sur le primary et le clone."); return;
      }
      setError(""); setMessage(""); setGuidedPreparation(true);
      return;
    }
    startPreview();
  };

  const perform = async (job, action, successMessage) => {
    setActionLoading(`${job.id}:${action}`);
    setError("");
    setMessage("");
    try {
      await api.post(`/ai-dubbing/jobs/${job.id}/${action}`);
      setMessage(successMessage);
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Cette action a échoué.");
    } finally {
      setActionLoading("");
    }
  };

  const reviewProfile = async (job, sample, accepted) => {
    const action = accepted ? "accept-profile" : "reject-profile";
    setActionLoading(`${job.id}:${sample.speaker}:${action}`);
    setError("");
    setMessage("");
    try {
      await api.post(
        `/ai-dubbing/jobs/${job.id}/voice-profiles/${encodeURIComponent(sample.speaker)}/review`,
        { accepted }
      );
      setMessage(accepted
        ? "Profil vocal explicitement accepté."
        : "Profil vocal explicitement refusé : la validation générale reste bloquée.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "Le contrôle de ce profil vocal a échoué.");
    } finally {
      setActionLoading("");
    }
  };

  const regenerateProfile = async (job, sample) => {
    setActionLoading(`${job.id}:${sample.speaker}:regenerate`);
    setError("");
    setMessage("");
    try {
      await api.post(
        `/ai-dubbing/jobs/${job.id}/voice-profiles/${encodeURIComponent(sample.speaker)}/regenerate`
      );
      setMessage("La référence rejetée est exclue et une nouvelle analyse complète a été lancée.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "La régénération de ce profil vocal a échoué.");
    } finally {
      setActionLoading("");
    }
  };

  const addSpeaker = async (job) => {
    setActionLoading(`${job.id}:add-speaker`);
    setError("");
    setMessage("");
    try {
      await api.post(`/ai-dubbing/jobs/${job.id}/speakers`);
      setMessage("Un intervenant attendu a été ajouté et une nouvelle analyse complète a été lancée.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "L'ajout de l'intervenant a échoué.");
    } finally {
      setActionLoading("");
    }
  };

  const deleteJob = async (job) => {
    setActionLoading(`${job.id}:delete`);
    setError("");
    setMessage("");
    try {
      const response = await api.delete(`/ai-dubbing/jobs/${job.id}`);
      setDeleteConfirmation("");
      setMessage(response.data?.cleanupCompleted === false
        ? "La version et sa piste ont été supprimées, mais un nettoyage de fichiers privés reste à vérifier dans les logs du serveur."
        : "Le doublage IA, sa piste publiée et ses fichiers privés ont été supprimés.");
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.error || "La suppression du doublage IA a échoué.");
    } finally {
      setActionLoading("");
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Chargement du doublage IA…</p>;

  const availableWorkers = (config?.workers || []).filter((worker) => (
    worker.ready && worker.online && worker.enabled && !worker.draining
  ));

  const renderJob = (job) => (
          <article key={job.id} className="rounded-2xl border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-950/60">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="font-black">{job.video?.title || `Vidéo ${job.video?.id}`} — {job.targetLanguageLabel}</h4>
                <p className="mt-1 text-xs font-bold uppercase tracking-wide text-sky-600 dark:text-sky-300">
                  {statusLabels[job.status] || job.status} · contenu généré par IA
                </p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  Extrait de validation : {formatClock(job.previewStartSeconds)}–{formatClock(job.previewEndSeconds)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Version : {job.id}
                  {job.models?.pipeline ? ` · Profil : ${job.models.pipeline}` : ""}
                  {job.publishedTrackLabel
                    ? ` · Piste ${job.publishedTrackId} : ${job.publishedTrackLabel}`
                    : ""}
                </p>
                {job.expectedSpeakerCount && (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Analyse guidée : {job.expectedSpeakerCount} {job.expectedSpeakerCount > 1
                      ? "intervenants attendus"
                      : "intervenant attendu"}
                  </p>
                )}
                {job.voiceProfilesLocked && (
                  <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    {job.speakerCount} {job.speakerCount > 1
                      ? "profils vocaux verrouillés"
                      : "profil vocal verrouillé"}
                  </p>
                )}
                {job.manualVoiceReferences?.length > 0 && (
                  <details className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                    <summary>Passages de référence choisis manuellement</summary>
                    {job.manualVoiceReferences.map((group, index) => <p key={group.speaker}>
                      Intervenant {index + 1} : {group.ranges.map(range => `${range.start.toFixed(3)}–${range.end.toFixed(3)} s`).join(" · ")}
                    </p>)}
                    <p>Régénérer reste dans ces passages. Pour en ajouter ou ajouter une voix, créez une nouvelle préparation guidée.</p>
                  </details>
                )}
                {["PREVIEW_REVIEW", "FINAL_REVIEW"].includes(job.status) && !job.voiceProfilesLocked && (
                  <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">
                    Ancienne génération instable : validation interdite, veuillez la refuser puis la recréer.
                  </p>
                )}
                {BUSY_STATUSES.has(job.status) && phaseLabel(job.phase) && (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300" aria-live="polite">
                    {phaseLabel(job.phase)}
                  </p>
                )}
              </div>
              <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white dark:bg-white dark:text-slate-950">
                {job.progress}%
              </span>
            </div>

            {BUSY_STATUSES.has(job.status) && (
              <div
                className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
                role="progressbar"
                aria-label={`Progression du doublage de ${job.video?.title || `la vidéo ${job.video?.id}`}`}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={job.progress}
              >
                <div
                  className="h-full rounded-full bg-sky-500 transition-[width] duration-500"
                  style={{ width: `${Math.max(0, Math.min(100, Number(job.progress) || 0))}%` }}
                />
              </div>
            )}

            {job.error && <p className="mt-3 text-sm text-red-700 dark:text-red-300">{job.error}</p>}
            {job.qualityReport && (
              <div className="mt-3 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-slate-700 dark:text-slate-200">
                <p className="font-bold">Contrôle qualité local</p>
                <p className="mt-1">
                  {job.qualityReport.utteranceCount} répliques · {job.qualityReport.retriedCount} nouvelle(s) tentative(s)
                  {` · ${job.qualityReport.warnings?.length || 0} avertissement(s)`}
                </p>
                {job.qualityReport.script && (
                  <p className="mt-1">
                    Script vocal distinct : {job.qualityReport.script.cueCount} répliques
                    {` · ${job.qualityReport.script.warningCount || 0} contrôle(s) à vérifier`}
                    {job.qualityReport.speakerStems?.length
                      ? ` · ${job.qualityReport.speakerStems.length} piste(s) intervenant + ambiance séparée avant mixage`
                      : ""}
                  </p>
                )}
                {(job.qualityReport.script?.warnings || []).map((warning, index) => (
                  <p key={`script-${warning.sourceStart}-${index}`} className="mt-1 text-amber-700 dark:text-amber-300">
                    {formatClock(warning.sourceStart)} · script vocal : {warning.flags
                      .map((flag) => scriptFlagLabels[flag] || flag)
                      .join(", ")}
                    {warning.sourceConfidence == null
                      ? ""
                      : ` · confiance source ${Math.round(warning.sourceConfidence * 100)} %`}
                  </p>
                ))}
                {(job.qualityReport.warnings || []).map((warning, index) => (
                  <p key={`${warning.sourceStart}-${index}`} className="mt-1 text-amber-700 dark:text-amber-300">
                    {formatClock(warning.sourceStart)} · {warning.speaker} · {warning.translationBoundaryReview
                      ? (warning.translationBoundaryReview === "unsplit_translation_dominant_speaker"
                        ? "traduction conservée entière, attribution à la voix dominante à vérifier"
                        : "traduction découpée à la ponctuation, attribution des voix à vérifier")
                      : warning.shortCerMismatchAccepted
                      ? `réplique courte conservée avec la meilleure des ${warning.candidateAttempts || 3} tentatives (CER ${warning.cer})`
                      : warning.timingExtensionSeconds > 0
                      ? `fenêtre prolongée de ${warning.timingExtensionSeconds.toFixed(2)} s, accélération limitée à ${warning.durationRatio.toFixed(2)}×`
                      : warning.timingBoundaryTrimSeconds > 0
                        ? `fin rognée de ${warning.timingBoundaryTrimSeconds.toFixed(3)} s au bord de l'extrait`
                        : `écart vocal contrôlé après ${warning.attempts} tentative(s)`}
                    {warning.timingOverlapSeconds > 0
                      ? ` · chevauchement possible de ${warning.timingOverlapSeconds.toFixed(2)} s avec la réplique suivante (départs inchangés)`
                      : ""}
                  </p>
                ))}
              </div>
            )}
            {job.previewUrl && (
              <div className="mt-4 flex items-center gap-3">
                <SpeakerWaveIcon className="size-5 text-sky-500" aria-hidden="true" />
                <audio controls crossOrigin="use-credentials" preload="none" src={`${apiUrl}${job.previewUrl}`} className="w-full" />
              </div>
            )}
            {Array.isArray(job.voiceSamples) && job.voiceSamples.length > 0 && (
              <div className="mt-4 grid gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-sm font-black">Contrôle de chaque profil vocal</p>
                <p className="text-xs leading-5 text-slate-600 dark:text-slate-300">
                  Ces échantillons utilisent exactement les références qui seront imposées à la piste complète.
                  Chaque intervenant doit être accepté explicitement avant l'acceptation générale.
                </p>
                {job.voiceSamples.map((sample, index) => (
                  <div
                    key={sample.speaker}
                    className={`grid gap-2 rounded-lg border p-3 ${sample.reviewStatus === "ACCEPTED"
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : sample.reviewStatus === "REJECTED"
                        ? "border-red-500/40 bg-red-500/10"
                        : "border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-950/60"}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold">Intervenant {index + 1}</span>
                      <span className={`font-bold ${sample.reviewStatus === "ACCEPTED"
                        ? "text-emerald-700 dark:text-emerald-300"
                        : sample.reviewStatus === "REJECTED"
                          ? "text-red-700 dark:text-red-300"
                          : "text-amber-700 dark:text-amber-300"}`}
                      >
                        {sample.reviewStatus === "ACCEPTED"
                          ? "Accepté"
                          : sample.reviewStatus === "REJECTED" ? "Refusé" : "En attente"}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500">Repère source {formatClock(sample.sourceStart)}</span>
                    {sample.text && <p className="text-xs text-slate-600 dark:text-slate-300">« {sample.text} »</p>}
                    <audio
                      controls
                      crossOrigin="use-credentials"
                      preload="none"
                      src={`${apiUrl}${sample.url}`}
                      aria-label={`Échantillon IA de l'intervenant ${index + 1}`}
                      className="w-full"
                    />
                    {job.status === "PREVIEW_REVIEW" && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => reviewProfile(job, sample, true)}
                          disabled={Boolean(actionLoading)}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                        >
                          Accepter ce profil
                        </button>
                        <button
                          type="button"
                          onClick={() => reviewProfile(job, sample, false)}
                          disabled={Boolean(actionLoading)}
                          className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50 dark:text-red-300"
                        >
                          Refuser ce profil
                        </button>
                        <button
                          type="button"
                          onClick={() => regenerateProfile(job, sample)}
                          disabled={Boolean(actionLoading)}
                          className="rounded-lg border border-sky-500/40 px-3 py-2 text-xs font-bold text-sky-700 disabled:opacity-50 dark:text-sky-300"
                        >
                          Régénérer ce profil
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {job.status === "PREVIEW_REVIEW" && (
                  <button
                    type="button"
                    onClick={() => addSpeaker(job)}
                    disabled={Boolean(actionLoading) || Boolean(job.manualVoiceReferences) || Number(job.expectedSpeakerCount || job.speakerCount) >= 30}
                    className="justify-self-start rounded-lg border border-violet-500/40 px-3 py-2 text-xs font-bold text-violet-700 disabled:opacity-50 dark:text-violet-300"
                  >
                    Ajouter un intervenant (+1) et relancer l'analyse
                  </button>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {job.status === "PREVIEW_REVIEW" && (
                <button type="button" onClick={() => perform(job, "approve-preview", "Extrait et profils vocaux acceptés ; la piste complète est lancée avec les mêmes voix.")} disabled={Boolean(actionLoading) || !job.voiceProfilesLocked || !job.voiceProfilesAccepted} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                  Accepter et générer la piste complète
                </button>
              )}
              {job.status === "FINAL_REVIEW" && (
                <button type="button" onClick={() => perform(job, "approve-final", "Piste IA publiée avec son étiquetage.")} disabled={Boolean(actionLoading) || !job.voiceProfilesLocked} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
                  Valider et publier la piste complète
                </button>
              )}
              {job.status === "FAILED" && (
                <button
                  type="button"
                  onClick={() => perform(
                    job,
                    "retry",
                    "La nouvelle analyse complète a été placée en attente. Les profils vocaux devront être validés à nouveau."
                  )}
                  disabled={Boolean(actionLoading) || !config?.ready}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Relancer l'analyse
                </button>
              )}
              {["PREVIEW_REVIEW", "FINAL_REVIEW"].includes(job.status) && (
                <button type="button" onClick={() => perform(job, "reject", "Doublage refusé et non publié.")} disabled={Boolean(actionLoading)} className="rounded-lg border border-red-500/40 px-4 py-2 text-sm font-bold text-red-700 dark:text-red-300">
                  Refuser
                </button>
              )}
              {DELETABLE_STATUSES.has(job.status) && deleteConfirmation !== job.id && (
                <button
                  type="button"
                  onClick={() => setDeleteConfirmation(job.id)}
                  disabled={Boolean(actionLoading)}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 px-4 py-2 text-sm font-bold text-red-700 dark:text-red-300"
                >
                  <TrashIcon className="size-4" aria-hidden="true" />
                  Supprimer le doublage IA
                </button>
              )}
              {DELETABLE_STATUSES.has(job.status) && deleteConfirmation === job.id && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/5 p-2">
                  <span className="text-xs font-semibold text-red-700 dark:text-red-300">
                    La version {job.id}
                    {job.publishedTrackLabel ? ` (« ${job.publishedTrackLabel} »)` : ""}, sa piste publiée
                    et tous ses fichiers seront supprimés.
                  </span>
                  <button type="button" onClick={() => deleteJob(job)} disabled={Boolean(actionLoading)} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                    Confirmer la suppression
                  </button>
                  <button type="button" onClick={() => setDeleteConfirmation("")} disabled={Boolean(actionLoading)} className="rounded-lg px-3 py-2 text-xs font-bold">
                    Annuler
                  </button>
                </div>
              )}
            </div>
          </article>

  );

  return (
    <section className="grid gap-6 text-slate-900 dark:text-white">
      <div role="tablist" aria-label="État des doublages" className="flex flex-wrap gap-2">
        {[["ongoing", "En cours"], ["published", "Terminés et validés"]].map(([id, label]) => <button key={id} type="button" role="tab" id={`dubbing-tab-${id}`} aria-controls={`dubbing-panel-${id}`} aria-selected={activeTab === id}
          tabIndex={activeTab === id ? 0 : -1}
          onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? "ongoing" : event.key === "End" ? "published" : activeTab === "ongoing" ? "published" : "ongoing";
            setActiveTab(next); setDeleteConfirmation(""); setPagination({ page: 1, totalPages: 1 });
            document.getElementById(`dubbing-tab-${next}`)?.focus();
          }}
          onClick={() => { setActiveTab(id); setDeleteConfirmation(""); setPagination({ page: 1, totalPages: 1 }); }}
          className={`rounded-xl px-4 py-3 text-sm font-bold focus-visible:ring-2 focus-visible:ring-sky-400 ${activeTab === id ? "bg-sky-500/20 text-sky-700 dark:text-sky-200" : "text-slate-500 hover:bg-sky-500/10"}`}>{label}</button>)}
      </div>
      <div hidden={activeTab !== "ongoing"} className={activeTab === "ongoing" ? "grid gap-6" : "hidden"}>
      <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 p-5">
        <div className="flex items-start gap-3">
          <CpuChipIcon className="mt-0.5 size-6 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
          <div>
            <h3 className="font-black">Doublages synthétiques — génération locale</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
              Les voix cherchent à préserver les caractéristiques des intervenants, mais ne sont ni
              authentiques ni officielles. Chaque piste reste marquée « IA », watermarquée et invisible
              avant validation humaine de l'extrait puis de la piste complète.
            </p>
            <p className="mt-2 text-xs leading-5 text-slate-600 dark:text-slate-300">
              La première phase analyse désormais toute la vidéo afin de verrouiller les mêmes profils
              vocaux pour l'extrait et la piste complète. Elle peut donc être sensiblement plus longue.
              Indiquez le nombre réel d'intervenants lorsqu'il est connu pour éviter une séparation
              excessive des voix.
            </p>
            <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              Coordinateur : {(config?.coordinatorReady ?? config?.ready) ? "prêt" : config?.error || "indisponible"}
              {` · Clone vocal : ${availableWorkers.length > 0 ? `${availableWorkers.length} prêt` : "aucun disponible"}`}
            </p>
            {(config?.workers || []).length > 0 && availableWorkers.length === 0 && (
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                Les demandes peuvent être placées en attente, mais aucun clone compatible ne peut
                encore les calculer. Vérifiez le heartbeat, Qwen3-TTS, CUDA et pyannote sur le PC fixe.
              </p>
            )}
            {(config?.workers || []).map((worker) => (
              <p key={worker.id} className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                {worker.id} · {worker.model || "modèle inconnu"} · {worker.device || "périphérique inconnu"}
                {worker.ready && worker.online && worker.enabled && !worker.draining ? " · prêt" : " · hors du pool"}
              </p>
            ))}
          </div>
        </div>
      </div>

      <form onSubmit={requestPreview} className="grid gap-3 rounded-2xl border border-sky-500/20 bg-white/70 p-5 dark:bg-slate-950/50 sm:grid-cols-2 sm:items-end xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <DubbingVideoSelect value={videoId} onChange={setVideoId} />
        <label className="grid gap-2 text-sm font-bold">
          Langue cible
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            {(config?.languages || []).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-bold">
          Nombre d'intervenants
          <input
            min="1"
            max="30"
            type="number"
            inputMode="numeric"
            aria-label="Nombre d'intervenants"
            placeholder="Auto"
            value={expectedSpeakerCount}
            onChange={(event) => setExpectedSpeakerCount(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
          <span className="text-xs font-medium text-slate-500">
            Renseigné = choix des passages par voix · vide = mode automatique
          </span>
        </label>
        <fieldset className="grid gap-2 text-sm font-bold">
          <legend>Début de l'extrait</legend>
          <div className="flex items-center gap-2">
            <input
              required
              min="0"
              max="10079"
              type="number"
              aria-label="Minutes du début de l'extrait"
              value={previewMinutes}
              onChange={(event) => setPreviewMinutes(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <span aria-hidden="true">:</span>
            <input
              required
              min="0"
              max="59"
              type="number"
              aria-label="Secondes du début de l'extrait"
              value={previewSeconds}
              onChange={(event) => setPreviewSeconds(event.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-950 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <span className="text-xs font-medium text-slate-500">minutes : secondes · durée 45 s</span>
        </fieldset>
        <button
          type="submit"
          disabled={!config?.ready || Boolean(actionLoading) || guidedPreparation}
          className="rounded-xl bg-sky-600 px-5 py-3 text-sm font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Générer l'extrait
        </button>
      </form>

      {guidedPreparation && <GuidedVoiceReferenceEditor
        key={`${videoId}:${language}:${expectedSpeakerCount}`}
        videoId={videoId} count={Number(expectedSpeakerCount)} busy={Boolean(actionLoading)}
        onSubmit={startPreview} onCancel={() => setGuidedPreparation(false)}
      />}

      </div>
      {message && <p role="status" className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">{error}</p>}

      <div role="tabpanel" id={`dubbing-panel-${activeTab}`} aria-labelledby={`dubbing-tab-${activeTab}`} aria-busy={listLoading} className="grid gap-4">
        {activeTab === "ongoing" && jobs.length === 0 && <p className="text-sm text-slate-500">Aucune tâche de doublage IA.</p>}
        {activeTab === "ongoing" ? jobs.map(renderJob) : groups.map(group => <PublishedGroup key={group.video.id} group={group} renderJob={renderJob} />)}
        {!listLoading && activeTab === "published" && groups.length === 0 && <p>Aucun doublage terminé et validé.</p>}
        {pagination.totalPages > 1 && <nav aria-label="Pages des doublages" className="flex items-center justify-center gap-4">
          <button type="button" disabled={listLoading || pagination.page <= 1} onClick={() => (activeTab === "ongoing" ? setOngoingPage : setPublishedPage)(pagination.page - 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Précédent</button>
          <span>Page {pagination.page} sur {pagination.totalPages}</span>
          <button type="button" disabled={listLoading || pagination.page >= pagination.totalPages} onClick={() => (activeTab === "ongoing" ? setOngoingPage : setPublishedPage)(pagination.page + 1)} className="rounded-lg border px-3 py-2 disabled:opacity-40">Suivant</button>
        </nav>}
      </div>
    </section>
  );
}
