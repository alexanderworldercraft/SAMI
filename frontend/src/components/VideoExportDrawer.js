import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import {
  ArrowPathIcon,
  CheckCircleIcon,
  CloudArrowUpIcon,
  ExclamationTriangleIcon,
  FilmIcon,
  KeyIcon,
  RectangleStackIcon,
  ServerStackIcon,
  StopCircleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

import api from "../services/api";
import UploadProgressBar from "./UploadProgressBar";

const POLL_INTERVAL_MS = 1800;
const TERMINAL_STATUSES = new Set([
  "cancelled",
  "canceled",
  "completed",
  "error",
  "failed",
  "success",
  "succeeded",
]);
const RESUMABLE_STATUSES = new Set([
  "error",
  "failed",
  "interrupted",
  "paused",
  "stalled",
]);

const fieldClass =
  "w-full rounded-xl border border-sky-500/20 bg-white/90 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-sky-400/60 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-950/75 dark:text-white";
const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-sky-300/50 bg-sky-500/20 px-5 py-3 text-sm font-black text-sky-950 transition hover:border-sky-300 hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-50 dark:text-white";
const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300/70 bg-white/75 px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-sky-300/70 hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-200";

const asArray = (value) => {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.data)) return value.data;
  return [];
};

const getApiError = (error, fallback) =>
  error?.response?.data?.error ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;

const getItemId = (item, keys) => {
  for (const key of keys) {
    const value = item?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
};

const getGenreId = (genre) =>
  getItemId(genre, ["GenreID", "genreId", "id"]);
const getGenreName = (genre) =>
  genre?.Nom || genre?.name || genre?.label || `Genre ${getGenreId(genre) || ""}`.trim();
const getSeriesId = (series) =>
  getItemId(series, ["SeriesID", "seriesId", "id"]);
const getSeriesTitle = (series) =>
  series?.Titre || series?.title || series?.name || `Série ${getSeriesId(series) || ""}`.trim();
const getSeasonId = (season) =>
  getItemId(season, ["SaisonID", "seasonId", "id"]);
const getSeasonNumber = (season) =>
  season?.Numero ?? season?.number ?? season?.seasonNumber ?? "?";

const toComparableId = (value) =>
  value === undefined || value === null ? "" : String(value);

const toApiId = (value) => {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isInteger(parsed) && String(parsed) === String(value).trim()
    ? parsed
    : value;
};

const getJobId = (job) =>
  getItemId(job, [
    "jobId",
    "VideoExportJobID",
    "VideoTransferID",
    "exportJobId",
    "id",
  ]);

const getJobStatus = (job) =>
  String(job?.status || job?.Status || job?.state || "queued").toLowerCase();

const getNumericProgress = (value) => {
  const candidate =
    typeof value === "object" && value !== null
      ? value.percent ?? value.percentage ?? value.value
      : value;
  const numeric = Number(candidate);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(Math.max(Math.round(numeric), 0), 100);
};

const getJobProgress = (job) =>
  getNumericProgress(
    job?.progressPercent ??
      job?.ProgressPercent ??
      job?.progress ??
      job?.Progress
  );

const getJobSteps = (job) => {
  const rawSteps =
    job?.steps ||
    job?.Steps ||
    job?.progress?.steps ||
    job?.Progress?.steps ||
    [];
  if (Array.isArray(rawSteps)) return rawSteps;
  if (rawSteps && typeof rawSteps === "object") return Object.values(rawSteps);
  return [];
};

const formatDateTime = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
};

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return null;
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Ko", "Mo", "Go", "To"];
  let amount = bytes / 1024;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount >= 10 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unitIndex]}`;
};

const statusLabels = {
  canceled: "Annulé",
  cancelled: "Annulé",
  cancel_requested: "Annulation demandée",
  completed: "Terminé",
  creating_remote: "Création sur le principal",
  error: "En erreur",
  failed: "En erreur",
  finalizing: "Publication",
  interrupted: "Interrompu",
  paused: "En pause",
  pending: "En attente",
  preparing: "Préparation",
  queued: "En attente",
  ready: "Prêt à transférer",
  running: "En cours",
  stalled: "Interrompu",
  success: "Terminé",
  succeeded: "Terminé",
  transferring: "Transfert en cours",
  verified: "Réception vérifiée",
  verifying: "Vérification",
  warning: "Avertissement",
};

const getStatusLabel = (status) =>
  statusLabels[status] ||
  status
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/^./, (character) => character.toUpperCase());

const statusPillClass = (status) => {
  if (["completed", "success", "succeeded"].includes(status)) {
    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  }
  if (["cancelled", "canceled"].includes(status)) {
    return "bg-slate-500/15 text-slate-700 dark:text-slate-300";
  }
  if (["error", "failed", "interrupted", "stalled"].includes(status)) {
    return "bg-red-500/15 text-red-700 dark:text-red-300";
  }
  if (status === "warning" || status === "cancel_requested") {
    return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
  }
  return "bg-sky-500/15 text-sky-800 dark:text-sky-200";
};

const normalizeStep = (step, index) => {
  const status = String(step?.status || step?.Status || step?.state || "pending").toLowerCase();
  const completed = ["completed", "success", "succeeded"].includes(status);
  const warning =
    step?.warningMessage ||
    (typeof step?.warning === "string" ? step.warning : null) ||
    (status === "warning" ? step?.message || "Étape terminée avec un avertissement." : null);
  const error =
    step?.errorMessage ||
    (typeof step?.error === "string" ? step.error : null) ||
    (["error", "failed"].includes(status) ? step?.message || "Cette étape a échoué." : null);
  const progress = getNumericProgress(
    step?.progressPercent ?? step?.ProgressPercent ?? step?.progress ?? (completed ? 100 : 0)
  );
  const id =
    step?.id ||
    step?.VideoTransferStepID ||
    step?.key ||
    step?.StepKey ||
    step?.stage ||
    `step-${index}`;

  return {
    id: String(id),
    label:
      step?.label ||
      step?.Label ||
      step?.name ||
      step?.StepKey ||
      step?.stage ||
      `Étape ${index + 1}`,
    status,
    statusLabel:
      step?.statusLabel ||
      step?.StatusLabel ||
      step?.message ||
      getStatusLabel(status),
    progress,
    warning,
    error: step?.ErrorMessage || error,
    transferredBytes:
      step?.transferredBytes ?? step?.bytesTransferred ?? step?.currentBytes,
    totalBytes: step?.totalBytes ?? step?.bytesTotal,
  };
};

const getPrincipalLabel = (principal) => {
  if (!principal) return "Serveur principal";
  if (typeof principal === "string") return principal;
  return (
    principal.name ||
    principal.label ||
    principal.host ||
    principal.hostname ||
    principal.origin ||
    principal.url ||
    "Serveur principal"
  );
};

const getImageUrl = (path) => {
  if (!path) return "/imageDefault.png";
  if (/^https?:\/\//i.test(path)) return path;
  const baseUrl = String(process.env.REACT_APP_URL_LOCAL || "").replace(/\/$/, "");
  return `${baseUrl}/${String(path).replace(/^\//, "")}`;
};

const isChallengeExpired = (expiresAt) => {
  if (!expiresAt) return false;
  const timestamp = new Date(expiresAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
};

function VideoRecap({ video, seriesTitle, seasonNumber }) {
  const subtitleCount =
    video?.VideoSubtitles?.length ?? video?.subtitles?.length ?? 0;
  const audioCount =
    video?.VideoAudioTracks?.length ?? video?.audioTracks?.length ?? 0;
  const genres = asArray(video?.Genres)
    .map((genre) => (typeof genre === "string" ? genre : getGenreName(genre)))
    .filter(Boolean);

  return (
    <div className="overflow-hidden rounded-2xl border border-sky-500/15 bg-slate-50/90 dark:bg-slate-950/65">
      <div className="grid gap-4 p-4 sm:grid-cols-[6rem_1fr]">
        <img
          src={getImageUrl(video?.CheminImage)}
          alt=""
          className="aspect-2/3 w-24 rounded-xl border border-sky-500/15 object-cover shadow-sm"
        />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-sky-600 dark:text-sky-300">
            Vidéo source #{video?.VideoID}
          </p>
          <h3 className="mt-1 break-words text-xl font-black text-slate-950 dark:text-white">
            {video?.Titre || "Vidéo sans titre"}
          </h3>
          {seriesTitle && (
            <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
              {seriesTitle}
              {seasonNumber !== null && seasonNumber !== undefined
                ? ` · Saison ${seasonNumber}`
                : ""}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-sky-500/10 px-3 py-1 text-sky-800 dark:text-sky-200">
              {audioCount} piste{audioCount > 1 ? "s" : ""} audio
            </span>
            <span className="rounded-full bg-violet-500/10 px-3 py-1 text-violet-800 dark:text-violet-200">
              {subtitleCount} sous-titre{subtitleCount > 1 ? "s" : ""}
            </span>
            {video?.Premium && (
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-800 dark:text-amber-200">
                Premium
              </span>
            )}
          </div>
          {genres.length > 0 && (
            <p className="mt-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Genres source : {genres.join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ExportProgress({
  job,
  busyAction,
  externalError,
  onRefresh,
  onResume,
  onCancel,
}) {
  const [resumePassword, setResumePassword] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [actionError, setActionError] = useState("");
  const status = getJobStatus(job);
  const jobId = getJobId(job);
  const progress = getJobProgress(job);
  const steps = getJobSteps(job).map(normalizeStep);
  const transferredFiles = Number(
    job?.transferredFiles ?? job?.TransferredFiles
  );
  const totalFiles = Number(job?.totalFiles ?? job?.TotalFiles);
  const transferredBytes = formatBytes(
    job?.transferredBytes ?? job?.TransferredBytes
  );
  const totalBytes = formatBytes(job?.totalBytes ?? job?.TotalBytes);
  const destinationVideoId =
    job?.destinationVideoId ?? job?.DestinationVideoID ?? null;
  const receipt = job?.receipt || job?.Receipt || null;
  const terminal = TERMINAL_STATUSES.has(status);
  const explicitCanResume = job?.canResume ?? job?.CanResume;
  const canResume =
    explicitCanResume !== undefined
      ? Boolean(explicitCanResume)
      : RESUMABLE_STATUSES.has(status);
  const explicitCanCancel = job?.canCancel ?? job?.CanCancel;
  const canCancel =
    explicitCanCancel !== undefined
      ? Boolean(explicitCanCancel)
      : !terminal &&
        !RESUMABLE_STATUSES.has(status) &&
        status !== "cancel_requested";
  const jobError =
    job?.errorMessage ||
    job?.ErrorMessage ||
    (typeof job?.error === "string" ? job.error : null) ||
    (["error", "failed"].includes(status) ? job?.message : null);
  const jobWarnings = [
    ...asArray(job?.warnings),
    ...asArray(job?.Warnings),
    ...(job?.warningMessage ? [job.warningMessage] : []),
    ...(typeof job?.warning === "string" ? [job.warning] : []),
  ]
    .map((warning) =>
      typeof warning === "string"
        ? warning
        : warning?.message || warning?.warning || null
    )
    .filter(Boolean);

  const handleResume = async (event) => {
    event.preventDefault();
    setActionError("");
    if (!resumePassword) {
      setActionError("Le mot de passe est requis pour reprendre l’export.");
      return;
    }
    try {
      await onResume(resumePassword);
      setResumePassword("");
    } catch (error) {
      setActionError(getApiError(error, "Impossible de reprendre l’export."));
    }
  };

  const handleCancel = async () => {
    setActionError("");
    try {
      await onCancel();
      setConfirmCancel(false);
    } catch (error) {
      setActionError(getApiError(error, "Impossible d’annuler l’export."));
    }
  };

  return (
    <div className="rounded-2xl border border-sky-500/15 bg-white/90 p-4 shadow-lg shadow-sky-950/5 dark:bg-slate-950/75 dark:text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-sky-600 dark:text-sky-300">
            Suivi de l’export
          </p>
          <h3 className="mt-1 text-lg font-black">
            {job?.videoTitle || job?.Titre || job?.label || "Export vidéo"}
          </h3>
          {jobId && (
            <p className="mt-1 break-all text-xs font-semibold text-slate-500 dark:text-slate-400">
              Référence : {jobId}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-black ${statusPillClass(status)}`}>
            {getStatusLabel(status)}
          </span>
          {jobId && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={busyAction}
              className="rounded-lg border border-sky-500/20 p-2 text-sky-700 transition hover:bg-sky-500/10 disabled:opacity-50 dark:text-sky-200"
              aria-label="Actualiser le suivi de l’export"
              title="Actualiser"
            >
              <ArrowPathIcon className={`size-4 ${busyAction === "refresh" ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-4">
        <UploadProgressBar
          progress={progress}
          label="Progression globale"
          color={
            ["error", "failed"].includes(status)
              ? "bg-gradient-to-r from-red-600 to-amber-500"
              : ["cancelled", "canceled"].includes(status)
                ? "bg-gradient-to-r from-slate-500 to-slate-400"
                : "bg-gradient-to-r from-sky-500 to-cyan-400"
          }
        />
      </div>
      {(Number.isFinite(totalFiles) || transferredBytes || totalBytes) && (
        <div className="mt-3 flex flex-wrap justify-between gap-2 rounded-xl bg-slate-500/5 px-3 py-2 text-xs font-bold text-slate-500 dark:text-slate-400">
          {Number.isFinite(totalFiles) && (
            <span>
              Fichiers : {Number.isFinite(transferredFiles) ? transferredFiles : 0} / {totalFiles}
            </span>
          )}
          {(transferredBytes || totalBytes) && (
            <span>
              Données : {transferredBytes || "0 o"}
              {totalBytes ? ` / ${totalBytes}` : ""}
            </span>
          )}
        </div>
      )}

      {steps.length > 0 && (
        <div className="mt-4 grid gap-3">
          {steps.map((step) => {
            const transferred = formatBytes(step.transferredBytes);
            const total = formatBytes(step.totalBytes);
            const neutralStep = ["cancelled", "canceled", "skipped"].includes(
              step.status
            );
            return (
              <div
                key={step.id}
                className={`rounded-xl border p-3 ${
                  step.error
                    ? "border-red-400/30 bg-red-500/5"
                    : step.warning
                      ? "border-amber-400/30 bg-amber-500/5"
                      : "border-slate-200 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/65"
                }`}
              >
                <UploadProgressBar
                  progress={step.progress}
                  label={step.label}
                  color={
                    step.error
                      ? "bg-gradient-to-r from-red-600 to-amber-500"
                      : step.warning
                        ? "bg-gradient-to-r from-amber-500 to-yellow-300"
                        : neutralStep
                          ? "bg-gradient-to-r from-slate-500 to-slate-400"
                        : "bg-gradient-to-r from-blue-500 to-cyan-400"
                  }
                />
                <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  <span>{step.statusLabel}</span>
                  {(transferred || total) && (
                    <span>
                      {transferred || "0 o"}
                      {total ? ` / ${total}` : ""}
                    </span>
                  )}
                </div>
                {step.warning && (
                  <p className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
                    Avertissement : {step.warning}
                  </p>
                )}
                {step.error && (
                  <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">
                    Erreur : {step.error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {jobWarnings.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-200">
          <p className="font-black">Avertissements</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {jobWarnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      {receipt && (
        <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
          <p className="font-black">
            {receipt.verified === false
              ? "Réception à vérifier"
              : "Réception confirmée par le serveur principal"}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {(receipt.receivedFiles ?? receipt.totalFiles) !== undefined && (
              <span>
                {receipt.receivedFiles ?? receipt.totalFiles} fichier(s) reçu(s)
              </span>
            )}
            {(receipt.receivedBytes ?? receipt.totalBytes) !== undefined && (
              <span>
                {formatBytes(receipt.receivedBytes ?? receipt.totalBytes)}
              </span>
            )}
            {(receipt.checksum || receipt.manifestHash) && (
              <span className="break-all">
                Empreinte : {receipt.checksum || receipt.manifestHash}
              </span>
            )}
          </div>
        </div>
      )}
      {jobError && (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
          Erreur : {jobError}
        </p>
      )}
      {destinationVideoId && ["completed", "success", "succeeded"].includes(status) && (
        <p className="mt-4 text-sm font-bold text-emerald-700 dark:text-emerald-300">
          Vidéo créée sur le serveur principal : #{destinationVideoId}
        </p>
      )}
      {(actionError || externalError) && (
        <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
          {actionError || externalError}
        </p>
      )}

      {canResume && jobId && (
        <form onSubmit={handleResume} className="mt-4 rounded-xl border border-sky-500/15 bg-sky-500/5 p-4">
          <label htmlFor={`resume-export-password-${jobId}`} className="block text-sm font-black text-slate-800 dark:text-slate-100">
            Mot de passe pour reprendre l’export
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id={`resume-export-password-${jobId}`}
              type="password"
              autoComplete="current-password"
              value={resumePassword}
              onChange={(event) => setResumePassword(event.target.value)}
              disabled={Boolean(busyAction)}
              className={fieldClass}
              placeholder="Confirmer avec votre mot de passe"
            />
            <button
              type="submit"
              disabled={Boolean(busyAction) || !resumePassword}
              className={primaryButtonClass}
            >
              <ArrowPathIcon className={`size-5 ${busyAction === "resume" ? "animate-spin" : ""}`} />
              Reprendre
            </button>
          </div>
        </form>
      )}

      {canCancel && jobId && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {confirmCancel ? (
            <>
              <span className="mr-auto text-sm font-bold text-red-700 dark:text-red-300">
                Confirmer l’annulation de cet export ?
              </span>
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                disabled={Boolean(busyAction)}
                className={secondaryButtonClass}
              >
                Non
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={Boolean(busyAction)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/40 bg-red-500/15 px-5 py-3 text-sm font-black text-red-700 transition hover:bg-red-500/25 disabled:opacity-50 dark:text-red-200"
              >
                <StopCircleIcon className="size-5" />
                Oui, annuler
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              disabled={Boolean(busyAction)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-black text-red-700 transition hover:bg-red-500/20 disabled:opacity-50 dark:text-red-200"
            >
              <StopCircleIcon className="size-5" />
              Annuler l’export
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function VideoExportDrawer({
  video,
  seriesTitle = null,
  seasonNumber = null,
}) {
  const videoId = video?.VideoID;
  const [open, setOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState("password");
  const [config, setConfig] = useState(null);
  const [configError, setConfigError] = useState("");
  const [loadingInitialState, setLoadingInitialState] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [authorizing, setAuthorizing] = useState(false);
  const [authorizedData, setAuthorizedData] = useState(null);
  const [challenge, setChallenge] = useState("");
  const [challengeExpiresAt, setChallengeExpiresAt] = useState(null);
  const [principal, setPrincipal] = useState(null);
  const [genres, setGenres] = useState([]);
  const [sourceGenreIds, setSourceGenreIds] = useState([]);
  const [selectedGenreIds, setSelectedGenreIds] = useState([]);
  const [missingGenreNames, setMissingGenreNames] = useState([]);
  const [genreSearch, setGenreSearch] = useState("");
  const [series, setSeries] = useState([]);
  const [seriesSearch, setSeriesSearch] = useState("");
  const [destinationMode, setDestinationMode] = useState(
    video?.SaisonID ? "episode" : "film"
  );
  const [selectedSeriesId, setSelectedSeriesId] = useState("");
  const [seasons, setSeasons] = useState([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState("");
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [seasonError, setSeasonError] = useState("");
  const [wizardError, setWizardError] = useState("");
  const [starting, setStarting] = useState(false);
  const [job, setJob] = useState(null);
  const [jobError, setJobError] = useState("");
  const [busyJobAction, setBusyJobAction] = useState("");
  const seasonRequestRef = useRef(0);

  const genreOptions = useMemo(
    () =>
      asArray(genres)
        .filter((genre) => getGenreId(genre) !== null)
        .sort((left, right) =>
          getGenreName(left).localeCompare(getGenreName(right), "fr")
        ),
    [genres]
  );
  const seriesOptions = useMemo(
    () =>
      asArray(series)
        .filter((item) => getSeriesId(item) !== null)
        .sort((left, right) =>
          getSeriesTitle(left).localeCompare(getSeriesTitle(right), "fr")
        ),
    [series]
  );
  const filteredGenres = genreOptions.filter((genre) =>
    getGenreName(genre).toLowerCase().includes(genreSearch.trim().toLowerCase())
  );
  const filteredSeries = seriesOptions.filter((item) =>
    getSeriesTitle(item).toLowerCase().includes(seriesSearch.trim().toLowerCase())
  );
  const selectedSeries = seriesOptions.find(
    (item) => toComparableId(getSeriesId(item)) === selectedSeriesId
  );
  const selectedSeason = asArray(seasons).find(
    (item) => toComparableId(getSeasonId(item)) === selectedSeasonId
  );
  const selectedGenreNames = genreOptions
    .filter((genre) =>
      selectedGenreIds.includes(toComparableId(getGenreId(genre)))
    )
    .map(getGenreName);
  const configured =
    config?.enabled === true &&
    config?.configured !== false &&
    config?.primaryConfigured !== false;
  const configuredPrincipal =
    config?.principal || config?.primaryOrigin || null;
  const configurationMessage =
    config?.instanceRole && config.instanceRole !== "clone"
      ? "L’export est disponible uniquement sur une instance configurée comme clone."
      : "L’export est désactivé tant que l’adresse du serveur principal n’est pas configurée.";
  const destinationReady =
    destinationMode === "film" ||
    (Boolean(selectedSeriesId) && Boolean(selectedSeasonId));
  const jobId = getJobId(job);
  const jobStatus = getJobStatus(job);
  const jobCanResume = Boolean(
    job?.canResume ??
      job?.CanResume ??
      RESUMABLE_STATUSES.has(jobStatus)
  );
  const shouldPoll =
    Boolean(jobId) &&
    !TERMINAL_STATUSES.has(jobStatus) &&
    !jobCanResume;

  const resetAuthorization = () => {
    seasonRequestRef.current += 1;
    setAuthorizedData(null);
    setChallenge("");
    setChallengeExpiresAt(null);
    setPrincipal(null);
    setGenres([]);
    setSourceGenreIds([]);
    setSelectedGenreIds([]);
    setMissingGenreNames([]);
    setGenreSearch("");
    setSeries([]);
    setSeriesSearch("");
    setSelectedSeriesId("");
    setSeasons([]);
    setSelectedSeasonId("");
    setLoadingSeasons(false);
    setSeasonError("");
    setCurrentPassword("");
    setWizardError("");
    setWizardStep("password");
  };

  useEffect(() => {
    let cancelled = false;
    setLoadingInitialState(true);
    setConfigError("");
    setJobError("");
    setJob(null);
    setConfig(null);
    resetAuthorization();
    setDestinationMode(video?.SaisonID ? "episode" : "film");

    const loadInitialState = async () => {
      let resolvedConfig;
      try {
        const configResponse = await api.get("/video-exports/config");
        if (cancelled) return;
        resolvedConfig = configResponse.data || {};
        setConfig(resolvedConfig);
      } catch (error) {
        if (cancelled) return;
        setConfig(null);
        setConfigError(
          getApiError(
            error,
            "La configuration du serveur principal est indisponible."
          )
        );
        setLoadingInitialState(false);
        return;
      }

      const canLoadExistingJob =
        resolvedConfig?.enabled === true &&
        resolvedConfig?.configured !== false &&
        resolvedConfig?.primaryConfigured !== false;
      if (!canLoadExistingJob || !videoId) {
        setLoadingInitialState(false);
        return;
      }

      try {
        const jobResponse = await api.get(`/video-exports/video/${videoId}`);
        if (cancelled) return;
        const existingJob = jobResponse.data?.job ?? null;
        setJob(existingJob);
        if (existingJob) setWizardStep("tracking");
      } catch (error) {
        if (cancelled) return;
        setJobError(
          getApiError(
            error,
            "Impossible de récupérer le dernier export de cette vidéo."
          )
        );
      }

      setLoadingInitialState(false);
    };

    loadInitialState();
    return () => {
      cancelled = true;
    };
  }, [videoId, video?.SaisonID]);

  const refreshJob = async () => {
    if (!jobId) return null;
    setBusyJobAction("refresh");
    setJobError("");
    try {
      const response = await api.get(`/video-exports/${jobId}`);
      const nextJob = response.data?.job ?? response.data;
      setJob(nextJob);
      return nextJob;
    } catch (error) {
      setJobError(getApiError(error, "Impossible d’actualiser le suivi de l’export."));
      return null;
    } finally {
      setBusyJobAction("");
    }
  };

  useEffect(() => {
    if (!shouldPoll) return undefined;

    let cancelled = false;
    let requestInFlight = false;
    const poll = async () => {
      if (cancelled || requestInFlight) return;
      requestInFlight = true;
      try {
        const response = await api.get(`/video-exports/${jobId}`);
        if (!cancelled) {
          setJob(response.data?.job ?? response.data);
          setJobError("");
        }
      } catch (error) {
        if (!cancelled) {
          setJobError(
            getApiError(error, "Le suivi automatique de l’export est temporairement indisponible.")
          );
        }
      } finally {
        requestInFlight = false;
      }
    };

    const interval = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [jobId, shouldPoll]);

  const openDrawer = () => {
    setWizardError("");
    setOpen(true);
    if (job) setWizardStep("tracking");
  };

  const closeDrawer = () => {
    setOpen(false);
    setCurrentPassword("");
  };

  const authorizeExport = async (event) => {
    event.preventDefault();
    setWizardError("");
    if (!currentPassword) {
      setWizardError("Le mot de passe est requis.");
      return;
    }

    setAuthorizing(true);
    try {
      const response = await api.post(
        `/video-exports/${videoId}/authorize`,
        { currentPassword }
      );
      const data = response.data || {};
      const initialGenreIds = asArray(data.selectedGenreIds).map(toComparableId);
      setAuthorizedData(data);
      setChallenge(data.challenge || "");
      setChallengeExpiresAt(data.expiresAt || null);
      setPrincipal(data.principal || configuredPrincipal);
      setGenres(asArray(data.genres));
      setSourceGenreIds(initialGenreIds);
      setSelectedGenreIds(initialGenreIds);
      setMissingGenreNames(
        asArray(data.missingGenreNames).map((name) =>
          typeof name === "string" ? name : getGenreName(name)
        )
      );
      setSeries(asArray(data.series));
      setCurrentPassword("");
      setSelectedSeriesId("");
      setSelectedSeasonId("");
      setSeasons([]);
      setWizardStep("destination");
    } catch (error) {
      setWizardError(
        getApiError(
          error,
          "La vérification du compte ou du serveur principal a échoué."
        )
      );
    } finally {
      setAuthorizing(false);
    }
  };

  const selectSeries = async (event) => {
    const nextSeriesId = event.target.value;
    const requestId = seasonRequestRef.current + 1;
    seasonRequestRef.current = requestId;
    setSelectedSeriesId(nextSeriesId);
    setSelectedSeasonId("");
    setSeasons([]);
    setSeasonError("");

    if (!nextSeriesId) return;

    setLoadingSeasons(true);
    try {
      const response = await api.get(
        `/video-exports/catalog/series/${encodeURIComponent(nextSeriesId)}/seasons`
      );
      if (seasonRequestRef.current !== requestId) return;
      const nextSeasons = asArray(response.data?.seasons ?? response.data);
      setSeasons(nextSeasons);
      if (nextSeasons.length === 0) {
        setSeasonError("Cette série ne contient aucune saison exportable.");
      }
    } catch (error) {
      if (seasonRequestRef.current !== requestId) return;
      setSeasonError(
        getApiError(error, "Impossible de récupérer les saisons de cette série.")
      );
    } finally {
      if (seasonRequestRef.current === requestId) setLoadingSeasons(false);
    }
  };

  const toggleGenre = (genreId) => {
    const comparableId = toComparableId(genreId);
    setSelectedGenreIds((current) =>
      current.includes(comparableId)
        ? current.filter((id) => id !== comparableId)
        : [...current, comparableId]
    );
  };

  const goToConfirmation = () => {
    setWizardError("");
    if (!destinationReady) {
      setWizardError("Sélectionnez une série et une saison existantes.");
      return;
    }
    setWizardStep("confirmation");
  };

  const startExport = async () => {
    setWizardError("");
    if (!challenge || isChallengeExpired(challengeExpiresAt)) {
      resetAuthorization();
      setWizardError(
        "L’autorisation a expiré. Confirmez de nouveau l’action avec votre mot de passe."
      );
      return;
    }

    setStarting(true);
    try {
      const response = await api.post(`/video-exports/${videoId}`, {
        challenge,
        destinationSeasonId:
          destinationMode === "episode" ? toApiId(selectedSeasonId) : null,
        genreIds: selectedGenreIds.map(toApiId),
      });
      const createdJob = response.data?.job ?? response.data;
      setJob(createdJob);
      setJobError("");
      setChallenge("");
      setWizardStep("tracking");
    } catch (error) {
      const status = error?.response?.status;
      const message = getApiError(
        error,
        "Impossible de démarrer l’export de cette vidéo."
      );
      if (status === 401 || status === 410) {
        resetAuthorization();
      }
      setWizardError(message);
    } finally {
      setStarting(false);
    }
  };

  const resumeExport = async (password) => {
    if (!jobId) return;
    setBusyJobAction("resume");
    setJobError("");
    try {
      const response = await api.post(`/video-exports/${jobId}/resume`, {
        currentPassword: password,
      });
      setJob(response.data?.job ?? response.data);
    } catch (error) {
      setJobError(getApiError(error, "Impossible de reprendre l’export."));
      throw error;
    } finally {
      setBusyJobAction("");
    }
  };

  const cancelExport = async () => {
    if (!jobId) return;
    setBusyJobAction("cancel");
    setJobError("");
    try {
      const response = await api.post(`/video-exports/${jobId}/cancel`);
      setJob(response.data?.job ?? response.data);
    } catch (error) {
      setJobError(getApiError(error, "Impossible d’annuler l’export."));
      throw error;
    } finally {
      setBusyJobAction("");
    }
  };

  const restartPreparation = () => {
    setJob(null);
    setJobError("");
    resetAuthorization();
    setDestinationMode(video?.SaisonID ? "episode" : "film");
    setOpen(true);
  };

  const wizardSteps = [
    { id: "password", label: "Sécurité" },
    { id: "destination", label: "Destination" },
    { id: "confirmation", label: "Confirmation" },
    { id: "tracking", label: "Suivi" },
  ];
  const currentWizardIndex = Math.max(
    wizardSteps.findIndex((item) => item.id === wizardStep),
    0
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={openDrawer}
          disabled={!videoId || loadingInitialState || !configured}
          className={primaryButtonClass}
        >
          <CloudArrowUpIcon className="size-5" />
          {job ? "Afficher le suivi de l’export" : "Exporter vers le serveur principal"}
        </button>
        {loadingInitialState && (
          <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">
            Vérification de la configuration…
          </span>
        )}
        {!loadingInitialState && configuredPrincipal && (
          <span className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 px-3 py-1.5 text-xs font-black text-sky-800 dark:text-sky-200">
            <ServerStackIcon className="size-4" />
            {getPrincipalLabel(configuredPrincipal)}
          </span>
        )}
      </div>

      {!configured && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-200">
          {configurationMessage}
          {config?.configurationError ? ` ${config.configurationError}` : ""}
        </p>
      )}
      {configError && (
        <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-200">
          {configError}
        </p>
      )}
      {jobError && !job && (
        <p className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
          {jobError}
        </p>
      )}

      {job && !open && (
        <>
          <ExportProgress
            job={job}
            busyAction={busyJobAction}
            externalError={jobError}
            onRefresh={refreshJob}
            onResume={resumeExport}
            onCancel={cancelExport}
          />
          {["cancelled", "canceled"].includes(jobStatus) && (
            <div>
              <button type="button" onClick={restartPreparation} className={secondaryButtonClass}>
                Préparer un nouvel export
              </button>
            </div>
          )}
        </>
      )}

      <Dialog open={open} onClose={closeDrawer} className="relative z-[100]">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm transition-opacity data-[closed]:opacity-0"
        />
        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-4 sm:pl-10">
              <DialogPanel
                transition
                className="pointer-events-auto w-screen max-w-2xl transform border-l border-sky-500/15 bg-white shadow-2xl transition duration-300 data-[closed]:translate-x-full dark:bg-slate-900 dark:text-white"
              >
                <div className="flex h-full flex-col">
                  <div className="border-b border-sky-500/15 bg-gradient-to-r from-sky-500/20 via-blue-500/10 to-transparent px-5 py-5 sm:px-6">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-sky-700 dark:text-sky-300">
                          Super administration
                        </p>
                        <DialogTitle className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                          Exporter cette vidéo
                        </DialogTitle>
                        <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                          Transfert contrôlé du clone vers le serveur principal.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closeDrawer}
                        className="rounded-xl border border-slate-300/60 p-2 text-slate-600 transition hover:bg-white/70 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <span className="sr-only">Fermer</span>
                        <XMarkIcon className="size-6" />
                      </button>
                    </div>

                    <ol className="mt-5 grid grid-cols-4 gap-2" aria-label="Étapes de l’export">
                      {wizardSteps.map((item, index) => (
                        <li key={item.id} className="min-w-0">
                          <div
                            className={`h-1.5 rounded-full ${
                              index <= currentWizardIndex
                                ? "bg-sky-500"
                                : "bg-slate-300 dark:bg-slate-700"
                            }`}
                          />
                          <span
                            className={`mt-1 block truncate text-[10px] font-black uppercase tracking-wide ${
                              index <= currentWizardIndex
                                ? "text-sky-700 dark:text-sky-300"
                                : "text-slate-400"
                            }`}
                          >
                            {item.label}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>

                  <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
                    <VideoRecap
                      video={video}
                      seriesTitle={seriesTitle}
                      seasonNumber={seasonNumber}
                    />

                    {wizardError && (
                      <p className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-300">
                        {wizardError}
                      </p>
                    )}

                    {wizardStep === "password" && (
                      <form onSubmit={authorizeExport} className="mt-6 grid gap-5">
                        <div className="rounded-2xl border border-sky-500/15 bg-sky-500/5 p-5">
                          <div className="flex items-start gap-3">
                            <KeyIcon className="mt-0.5 size-6 shrink-0 text-sky-600 dark:text-sky-300" />
                            <div>
                              <h3 className="font-black text-slate-950 dark:text-white">
                                Confirmer l’action sensible
                              </h3>
                              <p className="mt-1 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
                                Le serveur vérifiera de nouveau votre rôle, votre mot de passe et la disponibilité du serveur principal.
                              </p>
                            </div>
                          </div>
                          <label htmlFor="video-export-password" className="mt-5 block text-sm font-black text-slate-800 dark:text-slate-100">
                            Mot de passe du compte
                          </label>
                          <input
                            id="video-export-password"
                            type="password"
                            autoComplete="current-password"
                            value={currentPassword}
                            onChange={(event) => setCurrentPassword(event.target.value)}
                            disabled={authorizing}
                            className={`${fieldClass} mt-2`}
                            placeholder="Confirmer avec votre mot de passe"
                          />
                        </div>
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={authorizing || !currentPassword || !configured}
                            className={primaryButtonClass}
                          >
                            {authorizing ? (
                              <ArrowPathIcon className="size-5 animate-spin" />
                            ) : (
                              <ServerStackIcon className="size-5" />
                            )}
                            {authorizing
                              ? "Vérification en cours…"
                              : "Vérifier et continuer"}
                          </button>
                        </div>
                      </form>
                    )}

                    {wizardStep === "destination" && authorizedData && (
                      <div className="mt-6 grid gap-6">
                        <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-200">
                          <div className="flex items-start gap-3">
                            <CheckCircleIcon className="mt-0.5 size-6 shrink-0" />
                            <div>
                              <p className="font-black">Serveur principal disponible</p>
                              <p className="mt-1 text-sm font-semibold">
                                {getPrincipalLabel(principal)}
                                {challengeExpiresAt && (
                                  <> · Autorisation valable jusqu’au {formatDateTime(challengeExpiresAt)}</>
                                )}
                              </p>
                            </div>
                          </div>
                        </div>

                        <fieldset>
                          <legend className="text-base font-black text-slate-950 dark:text-white">
                            Destination du contenu
                          </legend>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <label
                              className={`cursor-pointer rounded-2xl border p-4 transition ${
                                destinationMode === "film"
                                  ? "border-sky-400 bg-sky-500/10 ring-2 ring-sky-400/20"
                                  : "border-slate-200 hover:border-sky-300 dark:border-slate-700"
                              }`}
                            >
                              <input
                                type="radio"
                                name="video-export-destination"
                                value="film"
                                checked={destinationMode === "film"}
                                onChange={() => setDestinationMode("film")}
                                className="sr-only"
                              />
                              <FilmIcon className="size-6 text-sky-600 dark:text-sky-300" />
                              <span className="mt-2 block font-black">Film indépendant</span>
                              <span className="mt-1 block text-sm font-semibold text-slate-500 dark:text-slate-400">
                                Aucune saison ne sera associée.
                              </span>
                            </label>
                            <label
                              className={`cursor-pointer rounded-2xl border p-4 transition ${
                                destinationMode === "episode"
                                  ? "border-sky-400 bg-sky-500/10 ring-2 ring-sky-400/20"
                                  : "border-slate-200 hover:border-sky-300 dark:border-slate-700"
                              }`}
                            >
                              <input
                                type="radio"
                                name="video-export-destination"
                                value="episode"
                                checked={destinationMode === "episode"}
                                onChange={() => setDestinationMode("episode")}
                                className="sr-only"
                              />
                              <RectangleStackIcon className="size-6 text-violet-600 dark:text-violet-300" />
                              <span className="mt-2 block font-black">Épisode d’une série</span>
                              <span className="mt-1 block text-sm font-semibold text-slate-500 dark:text-slate-400">
                                Une saison existante du serveur principal est obligatoire.
                              </span>
                            </label>
                          </div>
                        </fieldset>

                        {destinationMode === "episode" && (
                          <div className="grid gap-4 rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4">
                            <div>
                              <label htmlFor="video-export-series-search" className="block text-sm font-black">
                                Rechercher une série principale
                              </label>
                              <input
                                id="video-export-series-search"
                                type="search"
                                value={seriesSearch}
                                onChange={(event) => setSeriesSearch(event.target.value)}
                                className={`${fieldClass} mt-2`}
                                placeholder="Filtrer par titre…"
                              />
                            </div>
                            <div>
                              <label htmlFor="video-export-series" className="block text-sm font-black">
                                Série
                              </label>
                              <select
                                id="video-export-series"
                                value={selectedSeriesId}
                                onChange={selectSeries}
                                className={`${fieldClass} mt-2`}
                              >
                                <option value="">Sélectionner une série</option>
                                {filteredSeries.map((item) => (
                                  <option
                                    key={toComparableId(getSeriesId(item))}
                                    value={toComparableId(getSeriesId(item))}
                                    disabled={item?.hasSeasons === false}
                                  >
                                    {getSeriesTitle(item)}
                                    {item?.hasSeasons === false ? " (aucune saison)" : ""}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label htmlFor="video-export-season" className="block text-sm font-black">
                                Saison
                              </label>
                              <select
                                id="video-export-season"
                                value={selectedSeasonId}
                                onChange={(event) => setSelectedSeasonId(event.target.value)}
                                disabled={!selectedSeriesId || loadingSeasons}
                                className={`${fieldClass} mt-2`}
                              >
                                <option value="">
                                  {loadingSeasons
                                    ? "Chargement des saisons…"
                                    : "Sélectionner une saison"}
                                </option>
                                {asArray(seasons).map((season) => (
                                  <option
                                    key={toComparableId(getSeasonId(season))}
                                    value={toComparableId(getSeasonId(season))}
                                  >
                                    Saison {getSeasonNumber(season)}
                                  </option>
                                ))}
                              </select>
                              {seasonError && (
                                <p className="mt-2 text-sm font-semibold text-red-700 dark:text-red-300">
                                  {seasonError}
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        <fieldset>
                          <legend className="text-base font-black text-slate-950 dark:text-white">
                            Genres sur le serveur principal
                          </legend>
                          <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-slate-400">
                            Les correspondances trouvées depuis la vidéo source sont déjà cochées. Vous pouvez compléter la sélection.
                          </p>
                          {missingGenreNames.length > 0 && (
                            <div className="mt-3 flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-amber-800 dark:text-amber-200">
                              <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0" />
                              <p className="text-sm font-semibold">
                                Genres source absents du serveur principal :{" "}
                                <span className="font-black">{missingGenreNames.join(", ")}</span>.
                                L’export peut tout de même continuer.
                              </p>
                            </div>
                          )}
                          <label htmlFor="video-export-genre-search" className="sr-only">
                            Rechercher un genre principal
                          </label>
                          <input
                            id="video-export-genre-search"
                            type="search"
                            value={genreSearch}
                            onChange={(event) => setGenreSearch(event.target.value)}
                            className={`${fieldClass} mt-3`}
                            placeholder="Filtrer les genres…"
                          />
                          <div className="mt-3 grid max-h-64 gap-2 overflow-y-auto rounded-xl border border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-700">
                            {filteredGenres.map((genre) => {
                              const comparableId = toComparableId(getGenreId(genre));
                              const selected = selectedGenreIds.includes(comparableId);
                              const fromSource = sourceGenreIds.includes(comparableId);
                              return (
                                <label
                                  key={comparableId}
                                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                                    selected
                                      ? "border-sky-400/60 bg-sky-500/10"
                                      : "border-transparent bg-slate-50 hover:border-sky-300/50 dark:bg-slate-950/60"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => toggleGenre(comparableId)}
                                    className="size-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                                  />
                                  <span className="min-w-0 flex-1 truncate">{getGenreName(genre)}</span>
                                  {fromSource && (
                                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-300">
                                      Source
                                    </span>
                                  )}
                                </label>
                              );
                            })}
                            {filteredGenres.length === 0 && (
                              <p className="col-span-full px-3 py-5 text-center text-sm font-semibold text-slate-500">
                                Aucun genre principal trouvé.
                              </p>
                            )}
                          </div>
                        </fieldset>

                        <div className="flex flex-wrap justify-between gap-3">
                          <button
                            type="button"
                            onClick={resetAuthorization}
                            className={secondaryButtonClass}
                          >
                            Recommencer la vérification
                          </button>
                          <button
                            type="button"
                            onClick={goToConfirmation}
                            disabled={!destinationReady}
                            className={primaryButtonClass}
                          >
                            Continuer vers le récapitulatif
                          </button>
                        </div>
                      </div>
                    )}

                    {wizardStep === "confirmation" && authorizedData && (
                      <div className="mt-6 grid gap-5">
                        <div className="rounded-2xl border border-sky-500/15 bg-sky-500/5 p-5">
                          <h3 className="text-lg font-black text-slate-950 dark:text-white">
                            Vérifier la destination
                          </h3>
                          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
                            <div>
                              <dt className="font-black text-slate-500 dark:text-slate-400">Serveur</dt>
                              <dd className="mt-1 font-bold">{getPrincipalLabel(principal)}</dd>
                            </div>
                            <div>
                              <dt className="font-black text-slate-500 dark:text-slate-400">Type</dt>
                              <dd className="mt-1 font-bold">
                                {destinationMode === "film" ? "Film indépendant" : "Épisode"}
                              </dd>
                            </div>
                            {destinationMode === "episode" && (
                              <>
                                <div>
                                  <dt className="font-black text-slate-500 dark:text-slate-400">Série</dt>
                                  <dd className="mt-1 font-bold">{getSeriesTitle(selectedSeries)}</dd>
                                </div>
                                <div>
                                  <dt className="font-black text-slate-500 dark:text-slate-400">Saison</dt>
                                  <dd className="mt-1 font-bold">
                                    Saison {getSeasonNumber(selectedSeason)}
                                  </dd>
                                </div>
                              </>
                            )}
                            <div className="sm:col-span-2">
                              <dt className="font-black text-slate-500 dark:text-slate-400">
                                Genres ({selectedGenreNames.length})
                              </dt>
                              <dd className="mt-1 font-bold">
                                {selectedGenreNames.length > 0
                                  ? selectedGenreNames.join(", ")
                                  : "Aucun genre"}
                              </dd>
                            </div>
                          </dl>
                        </div>
                        <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4">
                          <div className="flex items-start gap-3 text-amber-900 dark:text-amber-100">
                            <ExclamationTriangleIcon className="mt-0.5 size-6 shrink-0" />
                            <p className="text-sm font-semibold leading-6">
                              Après le lancement, le serveur créera un travail persistant, adaptera les identifiants, transférera les fichiers puis vérifiera leur réception. Vous pourrez fermer ce panneau sans interrompre le traitement.
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setWizardStep("destination")}
                            disabled={starting}
                            className={secondaryButtonClass}
                          >
                            Modifier la destination
                          </button>
                          <button
                            type="button"
                            onClick={startExport}
                            disabled={starting}
                            className={primaryButtonClass}
                          >
                            {starting ? (
                              <ArrowPathIcon className="size-5 animate-spin" />
                            ) : (
                              <CloudArrowUpIcon className="size-5" />
                            )}
                            {starting ? "Démarrage de l’export…" : "Lancer l’export"}
                          </button>
                        </div>
                      </div>
                    )}

                    {wizardStep === "tracking" && job && (
                      <div className="mt-6">
                        <ExportProgress
                          job={job}
                          busyAction={busyJobAction}
                          externalError={jobError}
                          onRefresh={refreshJob}
                          onResume={resumeExport}
                          onCancel={cancelExport}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </DialogPanel>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
