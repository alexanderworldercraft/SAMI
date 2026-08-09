import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

import api from "../services/api";
import { isPrimaryVideoEncodingConfig, unwrapVideoEncodingConfig } from "../utils/videoEncoding";

const JOBS_PER_PAGE = 25;
const INCIDENT_ATTEMPT_STATUSES = new Set(["cancelled", "canceled", "expired", "failed"]);
const COMPLETED_JOB_STATUSES = new Set(["completed", "succeeded"]);
const EMPTY_PAGINATION = Object.freeze({
  page: 1,
  limit: JOBS_PER_PAGE,
  total: 0,
  totalPages: 1,
  hasPreviousPage: false,
  hasNextPage: false,
});

const asArray = (value) => (Array.isArray(value) ? value : []);
const getJobId = (job) => String(job?.id || job?.VideoEncodingJobID || "");
const getJobTasks = (job) => asArray(job?.tasks || job?.Tasks);
const getTaskAttempts = (task) => asArray(task?.attempts || task?.Attempts);
const getStatus = (value) => String(value || "").toLowerCase();

export const countDistributedEncodingIncidents = (job) =>
  getJobTasks(job).reduce(
    (total, task) => total + getTaskAttempts(task).filter((attempt) => {
      const status = getStatus(attempt?.status || attempt?.Status);
      return Boolean(attempt?.error || attempt?.ErrorMessage)
        || INCIDENT_ATTEMPT_STATUSES.has(status);
    }).length,
    0
  );

const isCompletedJob = (job) => COMPLETED_JOB_STATUSES.has(
  getStatus(job?.status || job?.Status)
);

const formatDateTime = (value) => {
  if (!value) return "date inconnue";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date inconnue";
  return date.toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "taille inconnue";
  if (bytes < 1024) return `${bytes} o`;
  const units = ["Kio", "Mio", "Gio", "Tio"];
  let amount = bytes / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && amount >= 1024; index += 1) {
    amount /= 1024;
    unit = units[index];
  }
  return `${amount.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} ${unit}`;
};

const jobLabel = (job) => {
  const incidentCount = countDistributedEncodingIncidents(job);
  const title = job?.title || job?.sourceOriginalName || "Encodage sans titre";
  const status = String(job?.status || job?.Status || "inconnu").toUpperCase();
  const date = job?.createdAt || job?.CreatedAt;
  const prefix = incidentCount > 0
    ? `⚠ ${incidentCount} incident${incidentCount > 1 ? "s" : ""} · `
    : "";
  return `${prefix}${title} · ${status} · ${formatDateTime(date)}`;
};

const responseValue = (payload, key) => payload?.[key] ?? payload?.data?.[key] ?? payload;

const normalizePagination = (payload) => {
  const value = responseValue(payload, "pagination");
  return value && typeof value === "object"
    ? { ...EMPTY_PAGINATION, ...value }
    : EMPTY_PAGINATION;
};

const addSelectedOption = (jobs, selectedJob) => {
  if (!selectedJob || jobs.some((job) => getJobId(job) === getJobId(selectedJob))) {
    return jobs;
  }
  return [selectedJob, ...jobs];
};

export const buildDistributedEncodingDiagnostic = ({
  generatedAt,
  configuration,
  workers,
  retention,
  incidentJob,
  comparisonJob,
}) => ({
  schema: "sami.distributed-encoding-diagnostic",
  schemaVersion: 2,
  generatedAt,
  notice: "Un job terminé peut contenir des tentatives interrompues puis redistribuées.",
  collection: {
    origin: "SAMI Administration",
    selectedJobCount: comparisonJob ? 2 : 1,
    jobsPerAdministrationPage: JOBS_PER_PAGE,
    endpoints: [
      `/api/video-encoding/jobs?page=:page&limit=${JOBS_PER_PAGE}&includeRetention=true`,
      "/api/video-encoding/jobs/:jobId",
      "/api/video-encoding/workers",
      "/api/video-encoding/config",
    ],
  },
  summary: {
    incidentJobId: getJobId(incidentJob) || null,
    incidentAttemptCount: countDistributedEncodingIncidents(incidentJob),
    incidentJobCompleted: isCompletedJob(incidentJob),
    comparisonJobId: getJobId(comparisonJob) || null,
    comparisonAttemptCount: comparisonJob
      ? countDistributedEncodingIncidents(comparisonJob)
      : null,
  },
  distributedEncoding: {
    configuration,
    workers,
    retention: retention || null,
    incidentJob,
    comparisonJob: comparisonJob || null,
  },
});

const diagnosticFilename = (jobId, generatedAt) => {
  const timestamp = generatedAt.replace(/[:.]/g, "-");
  const shortJobId = String(jobId || "job-inconnu").slice(0, 8);
  return `sami-diagnostic-encodage-${shortJobId}-${timestamp}.json`;
};

const downloadJson = (data, filename) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const getApiError = (error, fallback) =>
  error?.response?.data?.error || error?.message || fallback;

const AdminDistributedEncodingDiagnostics = () => {
  const [access, setAccess] = useState("loading");
  const [jobs, setJobs] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [retention, setRetention] = useState(null);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [selectedComparison, setSelectedComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [collectionStep, setCollectionStep] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const loadJobPage = useCallback(async (targetPage, { chooseDefaults = false } = {}) => {
    setLoading(true);
    setMessage("");
    setErrorMessage("");
    try {
      const jobsResponse = await api.get(
        `/video-encoding/jobs?page=${targetPage}&limit=${JOBS_PER_PAGE}&includeRetention=true`
      );
      const loadedJobs = asArray(responseValue(jobsResponse.data, "jobs"));
      const loadedPagination = normalizePagination(jobsResponse.data);
      setJobs(loadedJobs);
      setPagination(loadedPagination);
      setRetention(responseValue(jobsResponse.data, "retention") || null);

      if (chooseDefaults) {
        const defaultIncident = loadedJobs.find(
          (job) => countDistributedEncodingIncidents(job) > 0
        ) || loadedJobs[0] || null;
        const defaultIncidentId = getJobId(defaultIncident);
        const defaultComparison = loadedJobs.find((job) =>
          getJobId(job) !== defaultIncidentId
          && isCompletedJob(job)
          && countDistributedEncodingIncidents(job) === 0
        ) || null;
        setSelectedIncident(defaultIncident);
        setSelectedComparison(defaultComparison);
      }
    } catch (error) {
      setErrorMessage(getApiError(
        error,
        "Impossible de charger les diagnostics d'encodage multi-server."
      ));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      setLoading(true);
      try {
        const userResponse = await api.get("/users/me");
        if (!active) return;
        if (userResponse.data?.GradeID !== 1) {
          setAccess("denied");
          return;
        }

        const configResponse = await api.get("/video-encoding/config");
        if (!active) return;
        const config = unwrapVideoEncodingConfig(configResponse.data);
        if (!isPrimaryVideoEncodingConfig(config)) {
          setAccess("clone");
          return;
        }

        setAccess("primary");
        await loadJobPage(1, { chooseDefaults: true });
      } catch (error) {
        if (!active) return;
        setAccess("error");
        setErrorMessage(getApiError(
          error,
          "Impossible de charger les diagnostics d'encodage multi-server."
        ));
      } finally {
        if (active) setLoading(false);
      }
    };
    initialize();
    return () => {
      active = false;
    };
  }, [loadJobPage]);

  const incidentOptions = useMemo(
    () => addSelectedOption(jobs, selectedIncident),
    [jobs, selectedIncident]
  );
  const comparisonOptions = useMemo(
    () => addSelectedOption(jobs, selectedComparison).filter(
      (job) => getJobId(job) !== getJobId(selectedIncident)
    ),
    [jobs, selectedComparison, selectedIncident]
  );
  const incidentJobId = getJobId(selectedIncident);
  const comparisonJobId = getJobId(selectedComparison);

  const handleIncidentChange = (event) => {
    const nextJob = incidentOptions.find(
      (job) => getJobId(job) === event.target.value
    ) || null;
    setSelectedIncident(nextJob);
    if (getJobId(selectedComparison) === getJobId(nextJob)) {
      setSelectedComparison(null);
    }
  };

  const handleComparisonChange = (event) => {
    const nextJob = comparisonOptions.find(
      (job) => getJobId(job) === event.target.value
    ) || null;
    setSelectedComparison(nextJob);
  };

  const handleDownload = async () => {
    if (!incidentJobId) {
      setErrorMessage("Sélectionne d'abord le job à diagnostiquer.");
      return;
    }

    setCollecting(true);
    setMessage("");
    setErrorMessage("");
    try {
      setCollectionStep("Récupération du job problématique…");
      const incidentResponse = await api.get(
        `/video-encoding/jobs/${encodeURIComponent(incidentJobId)}`
      );
      const incidentJob = responseValue(incidentResponse.data, "job");

      let comparisonJob = null;
      if (comparisonJobId) {
        setCollectionStep("Récupération du job de comparaison…");
        const comparisonResponse = await api.get(
          `/video-encoding/jobs/${encodeURIComponent(comparisonJobId)}`
        );
        comparisonJob = responseValue(comparisonResponse.data, "job");
      }

      setCollectionStep("Récupération des workers et de la configuration…");
      const [workersResponse, configResponse] = await Promise.all([
        api.get("/video-encoding/workers"),
        api.get("/video-encoding/config"),
      ]);
      const generatedAt = new Date().toISOString();
      const diagnostic = buildDistributedEncodingDiagnostic({
        generatedAt,
        configuration: responseValue(configResponse.data, "config"),
        workers: responseValue(workersResponse.data, "workers"),
        retention,
        incidentJob,
        comparisonJob,
      });

      setCollectionStep("Création du fichier JSON…");
      downloadJson(diagnostic, diagnosticFilename(incidentJobId, generatedAt));
      const incidentCount = countDistributedEncodingIncidents(incidentJob);
      setMessage(
        `Diagnostic téléchargé avec ${incidentCount} tentative${incidentCount > 1 ? "s" : ""} en incident.`
      );
    } catch (error) {
      setErrorMessage(getApiError(
        error,
        "Impossible de créer le diagnostic d'encodage."
      ));
    } finally {
      setCollectionStep("");
      setCollecting(false);
    }
  };

  if (["loading", "denied", "clone"].includes(access)) return null;

  return (
    <section className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Super administration</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
          Diagnostic encodage multi-server
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Parcours l'historique par pages, puis télécharge uniquement les détails des deux jobs sélectionnés, les workers, la configuration et l'état de rétention.
        </p>
      </div>

      <div className="relative px-6 py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative">
          {message && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200" role="status">
              <CheckCircleIcon className="mt-0.5 size-5 shrink-0" />
              <span>{message}</span>
            </div>
          )}
          {errorMessage && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200" role="alert">
              <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {retention && (
            <div className="mb-6 rounded-xl border border-violet-400/20 bg-violet-500/5 p-4">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-violet-600 dark:text-violet-300">Contrôle de rétention</p>
                  <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
                    Mesure effectuée le {formatDateTime(retention.checkedAt)} sur le primary.
                  </p>
                </div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Une valeur éligible peut attendre la prochaine purge horaire par lots.
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-sky-500/10 bg-white/70 p-3 dark:bg-slate-950/45">
                  <p className="text-xs font-black uppercase text-slate-500 dark:text-slate-400">Artefacts · {retention.artifactRetentionDays} jour{retention.artifactRetentionDays > 1 ? "s" : ""}</p>
                  <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                    {retention.artifacts?.total ?? 0} conservés · {retention.artifacts?.eligibleForPurge ?? 0} éligibles
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Plus ancien artefact terminal : {formatDateTime(retention.artifacts?.oldestTerminalCreatedAt)}
                  </p>
                </div>
                <div className="rounded-lg border border-sky-500/10 bg-white/70 p-3 dark:bg-slate-950/45">
                  <p className="text-xs font-black uppercase text-slate-500 dark:text-slate-400">Jobs · {retention.jobRetentionDays} jours</p>
                  <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                    {retention.jobs?.total ?? 0} conservés · {retention.jobs?.eligibleForPurge ?? 0} éligibles
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Plus ancien job terminal : {formatDateTime(retention.jobs?.oldestTerminalCompletedAt)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <label className="grid gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              Job problématique
              <select
                value={incidentJobId}
                onChange={handleIncidentChange}
                disabled={loading || collecting || incidentOptions.length === 0}
                className="min-w-0 rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-60 dark:bg-slate-950/65 dark:text-white"
              >
                {incidentOptions.length === 0 && <option value="">Aucun job disponible</option>}
                {incidentOptions.map((job) => (
                  <option key={getJobId(job)} value={getJobId(job)}>
                    {jobLabel(job)}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              Job de comparaison
              <select
                value={comparisonJobId}
                onChange={handleComparisonChange}
                disabled={loading || collecting || jobs.length === 0}
                className="min-w-0 rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-60 dark:bg-slate-950/65 dark:text-white"
              >
                <option value="">Aucun job de comparaison</option>
                {comparisonOptions.map((job) => (
                  <option key={getJobId(job)} value={getJobId(job)}>
                    {jobLabel(job)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/10 bg-white/60 px-4 py-3 dark:bg-slate-950/35">
            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
              Page {pagination.page} sur {pagination.totalPages} · {pagination.total} job{pagination.total > 1 ? "s" : ""} conservé{pagination.total > 1 ? "s" : ""}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                aria-label="Page précédente"
                onClick={() => loadJobPage(pagination.page - 1)}
                disabled={loading || collecting || !pagination.hasPreviousPage}
                className="inline-flex size-10 items-center justify-center rounded-lg border border-sky-300/40 bg-white/70 text-slate-900 transition hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-950/45 dark:text-white"
              >
                <ChevronLeftIcon className="size-5" />
              </button>
              <button
                type="button"
                aria-label="Page suivante"
                onClick={() => loadJobPage(pagination.page + 1)}
                disabled={loading || collecting || !pagination.hasNextPage}
                className="inline-flex size-10 items-center justify-center rounded-lg border border-sky-300/40 bg-white/70 text-slate-900 transition hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-slate-950/45 dark:text-white"
              >
                <ChevronRightIcon className="size-5" />
              </button>
            </div>
          </div>

          {selectedIncident && (
            <div className="mt-5 grid gap-3 rounded-xl border border-sky-500/10 bg-white/70 p-4 text-sm dark:bg-slate-950/45 sm:grid-cols-3">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Résultat final</p>
                <p className="mt-1 font-black text-slate-900 dark:text-white">
                  {String(selectedIncident.status || "inconnu").toUpperCase()}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Tentatives en incident</p>
                <p className="mt-1 font-black text-amber-700 dark:text-amber-300">
                  {countDistributedEncodingIncidents(selectedIncident)}
                </p>
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Taille source</p>
                <p className="mt-1 font-black text-slate-900 dark:text-white">
                  {formatBytes(selectedIncident.sourceSize)}
                </p>
              </div>
            </div>
          )}

          {selectedComparison && countDistributedEncodingIncidents(selectedComparison) > 0 && (
            <p className="mt-3 text-sm font-semibold text-amber-700 dark:text-amber-300">
              Le job de comparaison contient lui aussi des tentatives interrompues. Il restera inclus dans le fichier.
            </p>
          )}

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">
              Le JSON contient seulement les deux jobs sélectionnés et le résumé technique associé — jamais les autres pages, les cookies, le JWT ou le secret partagé.
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => loadJobPage(pagination.page)}
                disabled={loading || collecting}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-white/70 px-4 py-3 text-sm font-bold text-slate-900 transition hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-950/45 dark:text-white"
              >
                <ArrowPathIcon className={`size-5 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={loading || collecting || !incidentJobId}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/50 bg-sky-500/20 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white"
              >
                {collecting ? (
                  <ArrowPathIcon className="size-5 animate-spin" />
                ) : (
                  <ArrowDownTrayIcon className="size-5" />
                )}
                {collecting ? "Collecte…" : "Télécharger le diagnostic JSON"}
              </button>
            </div>
          </div>

          {collectionStep && (
            <p className="mt-4 rounded-lg border border-sky-400/20 bg-sky-500/10 px-4 py-3 text-sm font-semibold text-sky-800 dark:text-sky-200" aria-live="polite">
              {collectionStep}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};

export default AdminDistributedEncodingDiagnostics;
