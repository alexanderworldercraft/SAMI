import React, { useEffect, useRef, useState } from "react";
import TaskHistory from "./TaskHistory";
import NewVideoForm from "./NewVideoForm";
import SeasonsManager from "./SeasonsManager";
import SeriesManager from "./SeriesManager";
import SagaManager from "./SagaManager";
import SagaContentManager from "./SagaContentManager";
import UniverseManager from "./UniverseManager";
import UniverseSagaManager from "./UniverseSagaManager";
import AddGenre from "./AddGenre";
import PeopleQuickAdd from "./PeopleQuickAdd";
import PeopleCreditImportManager from "./PeopleCreditImportManager";
import { io } from "socket.io-client";
import api from "../services/api";
import {
  getVideoEncodingJobs,
  getVideoEncodingWorkers,
  isDismissibleVideoEncodingJob,
  isPrimaryVideoEncodingConfig,
  mergeVideoEncodingJobs,
  unwrapVideoEncodingConfig,
  unwrapVideoEncodingJob,
  VIDEO_ENCODING_POLL_INTERVAL_MS,
} from "../utils/videoEncoding";

import { ChevronDownIcon } from "@heroicons/react/16/solid";
import {
  BuildingOfficeIcon,
  CreditCardIcon,
  UserPlusIcon,
  UserIcon,
  UsersIcon,
} from "@heroicons/react/20/solid";

const apiUrl = process.env.REACT_APP_URL_LOCAL || "https://192.168.0.17:1234";

// Helper pour les classes conditionnelles
function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

const normalizeProgress = (progress) => {
  const numericProgress = Number(progress);
  if (!Number.isFinite(numericProgress)) return 0;
  return Math.min(Math.max(Math.round(numericProgress), 0), 100);
};

const getProgressTaskId = (data) =>
  data.processingId ||
  data.video?.processingId ||
  data.video?.videoId ||
  `${data.video?.titre || "video"}-${data.stage || "task"}`;

const getProgressStepId = (data) =>
  data.stage === "conversion" && data.resolution
    ? `conversion-${data.resolution}`
    : data.stage || "traitement";

const getProgressStepLabel = (data) => {
  if (data.stage === "conversion") return `Conversion ${data.resolution || ""}`.trim();
  if (data.stage === "analysis") return "Informations vidéo";
  if (data.stage === "upload") return "Téléchargement";
  if (data.stage === "completed") return "Validation finale";
  if (data.stage === "initial-encoding") return "Réencodage initial";
  return data.stage || "Traitement";
};

const getProgressStatusLabel = (data) => {
  if (data.status === "conversion-completed") return "Conversion validée";
  if (data.status === "conversion-error") return "Conversion en erreur";
  if (data.status === "completed") return "Vidéo enregistrée";
  if (data.status === "metadata") return "Audio et sous-titres détectés";
  if (data.stage === "upload") return "Réception du fichier";
  return "Traitement en cours";
};

const mergeVideoInfo = (currentVideo = {}, nextVideo = {}) => ({
  ...currentVideo,
  ...Object.fromEntries(
    Object.entries(nextVideo || {}).filter(([, value]) => value !== undefined && value !== null && value !== "")
  ),
});

const getEtaMs = (step, progress, now) => {
  if (!step || progress <= 0 || progress >= 100) return null;
  const startedAt = step.startedAt || now;
  const elapsedMs = now - startedAt;
  if (elapsedMs <= 0) return null;
  return Math.round((elapsedMs / progress) * (100 - progress));
};

// Définition des tabs
const tabs = [
  { id: "video", name: "Vidéo", icon: UserIcon },
  { id: "seasons", name: "Saisons", icon: BuildingOfficeIcon },
  { id: "genres", name: "Genres", icon: UsersIcon },
  { id: "people", name: "Acteurs / Réalisateurs", icon: CreditCardIcon },
  { id: "people-import", name: "Import personnes", icon: UserPlusIcon },
  { id: "series", name: "Séries", icon: UsersIcon }, // tu pourras changer l'icône si tu veux
  { id: "sagas", name: "Sagas", icon: UsersIcon },
  { id: "saga-content", name: "Contenus saga", icon: BuildingOfficeIcon },
  { id: "universes", name: "Univers", icon: UsersIcon },
  { id: "universe-sagas", name: "Contenus univers", icon: BuildingOfficeIcon },
];

const FormNewVideoPage = () => {
  const [tasksHistory, setTasksHistory] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [videoEncodingConfig, setVideoEncodingConfig] = useState(null);
  const [videoEncodingWorkers, setVideoEncodingWorkers] = useState([]);
  const [distributedJobs, setDistributedJobs] = useState([]);
  const [distributedActionPending, setDistributedActionPending] = useState({});
  const distributedJobsRef = useRef([]);
  const dismissedClassicTaskIdsRef = useRef(new Set());
  const dismissedDistributedJobIdsRef = useRef(new Set());

  // Onglet actif
  const [currentTabId, setCurrentTabId] = useState(tabs[0].id);

  useEffect(() => {
    distributedJobsRef.current = distributedJobs;
  }, [distributedJobs]);

  useEffect(() => {
    let cancelled = false;

    const loadVideoEncodingAccess = async () => {
      try {
        const userResponse = await api.get("/users/me");
        if (cancelled) return;
        const user = userResponse.data;
        setCurrentUser(user);
        if (user?.GradeID !== 1) return;

        const configResponse = await api.get("/video-encoding/config");
        if (cancelled) return;
        setVideoEncodingConfig(unwrapVideoEncodingConfig(configResponse.data));
      } catch (error) {
        if (!cancelled) {
          console.warn("Impossible de charger l'accès à l'encodage multi-server :", error);
        }
      }
    };

    loadVideoEncodingAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  const canReadVideoEncoding = currentUser?.GradeID === 1
    && isPrimaryVideoEncodingConfig(videoEncodingConfig);

  useEffect(() => {
    if (!canReadVideoEncoding) return undefined;

    let cancelled = false;
    let refreshInProgress = false;

    const refreshVideoEncoding = async () => {
      if (refreshInProgress) return;
      refreshInProgress = true;

      try {
        const [configResult, workersResult, jobsResult] = await Promise.allSettled([
          api.get("/video-encoding/config"),
          api.get("/video-encoding/workers"),
          api.get("/video-encoding/jobs?limit=6"),
        ]);
        if (cancelled) return;

        let nextConfig = null;
        if (configResult.status === "fulfilled") {
          nextConfig = unwrapVideoEncodingConfig(configResult.value.data);
          setVideoEncodingConfig(nextConfig);
        }

        if (workersResult.status === "fulfilled") {
          const registeredWorkers = getVideoEncodingWorkers(workersResult.value.data);
          setVideoEncodingWorkers(
            registeredWorkers.length > 0
              ? registeredWorkers
              : getVideoEncodingWorkers(nextConfig?.workers)
          );
        } else if (nextConfig?.workers) {
          setVideoEncodingWorkers(getVideoEncodingWorkers(nextConfig.workers));
        }

        const recentJobs = jobsResult.status === "fulfilled"
          ? getVideoEncodingJobs(jobsResult.value.data)
          : [];
        const currentJobIds = new Set(
          distributedJobsRef.current.map((job) => String(job.id))
        );
        const refreshedJobs = mergeVideoEncodingJobs(
          distributedJobsRef.current,
          recentJobs
        ).filter((job) => {
          const jobId = String(job.id);
          if (dismissedDistributedJobIdsRef.current.has(jobId)) return false;

          return !isDismissibleVideoEncodingJob(job) || currentJobIds.has(jobId);
        });

        if (!cancelled) {
          setDistributedJobs(refreshedJobs);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Impossible d'actualiser les jobs multi-server :", error);
        }
      } finally {
        refreshInProgress = false;
      }
    };

    refreshVideoEncoding();
    const interval = window.setInterval(
      refreshVideoEncoding,
      VIDEO_ENCODING_POLL_INTERVAL_MS
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [canReadVideoEncoding]);

  const handleDistributedJobCreated = async (job) => {
    const normalizedJob = unwrapVideoEncodingJob(job);
    if (!normalizedJob) return;
    setDistributedJobs((current) =>
      isDismissibleVideoEncodingJob(normalizedJob)
        ? current.filter((item) => item.id !== normalizedJob.id)
        : mergeVideoEncodingJobs(current, [normalizedJob])
    );
    if (!normalizedJob.id) return;
    try {
      const response = await api.get(
        `/video-encoding/jobs/${encodeURIComponent(normalizedJob.id)}`
      );
      const detailedJob = unwrapVideoEncodingJob(response.data);
      if (detailedJob) {
        setDistributedJobs((current) =>
          isDismissibleVideoEncodingJob(detailedJob)
            ? current.filter((item) => item.id !== detailedJob.id)
            : mergeVideoEncodingJobs(current, [detailedJob])
        );
      }
    } catch {
      // Le polling persistant reprendra automatiquement si le détail n'est pas encore prêt.
    }
  };

  const handleDistributedJobAction = async (jobId, action) => {
    const normalizedJobId = String(jobId || "");
    if (!normalizedJobId || !["cancel", "resume"].includes(action)) return;
    if (
      action === "cancel"
      && !window.confirm("Annuler cet encodage multi-server et nettoyer ses fichiers temporaires ?")
    ) return;

    setDistributedActionPending((current) => ({
      ...current,
      [normalizedJobId]: action,
    }));
    try {
      const response = await api.post(
        `/video-encoding/jobs/${encodeURIComponent(normalizedJobId)}/${action}`
      );
      const updated = unwrapVideoEncodingJob(response.data);
      if (updated) {
        setDistributedJobs((current) => mergeVideoEncodingJobs(current, [{
          ...updated,
          actionError: null,
        }]));
      }
    } catch (error) {
      const message = error.response?.data?.error
        || `Impossible de ${action === "cancel" ? "annuler" : "reprendre"} ce job.`;
      setDistributedJobs((current) => current.map((job) =>
        String(job.id) === normalizedJobId
          ? { ...job, actionError: message }
          : job
      ));
    } finally {
      setDistributedActionPending((current) => {
        const next = { ...current };
        delete next[normalizedJobId];
        return next;
      });
    }
  };

  useEffect(() => {
    const socket = io(apiUrl);

    socket.on("progress", (data) => {
      setTasksHistory((prev) => {
        const now = Date.now();
        const taskId = String(getProgressTaskId(data));
        if (dismissedClassicTaskIdsRef.current.has(taskId)) return prev;
        const stepId = getProgressStepId(data);
        const progress = normalizeProgress(data.progress);
        const index = prev.findIndex((t) => t.id === taskId);
        const existingTask = index !== -1 ? prev[index] : null;
        if (existingTask?.completed && !data.error) return prev;
        const existingSteps = existingTask?.steps || [];
        const stepIndex = existingSteps.findIndex((step) => step.id === stepId);
        const existingStep = stepIndex !== -1 ? existingSteps[stepIndex] : null;
        const backendElapsedMs = data.processingElapsedMs === null
          || data.processingElapsedMs === undefined
          || data.processingElapsedMs === ""
          ? null
          : Number(data.processingElapsedMs);
        const hasBackendElapsed = Number.isFinite(backendElapsedMs);

        const updatedStep = {
          ...(existingStep || {}),
          id: stepId,
          label: getProgressStepLabel(data),
          statusLabel: getProgressStatusLabel(data),
          progress,
          error: data.error || existingStep?.error || null,
          startedAt: existingStep?.startedAt || now,
          updatedAt: now,
          completed:
            data.stage === "completed" ||
            data.status === "completed" ||
            data.status === "conversion-completed" ||
            progress >= 100,
        };

        updatedStep.etaMs = getEtaMs(updatedStep, progress, now);

        const nextSteps =
          stepIndex !== -1
            ? [
                ...existingSteps.slice(0, stepIndex),
                updatedStep,
                ...existingSteps.slice(stepIndex + 1),
              ]
            : [...existingSteps, updatedStep];

        const updatedTask = {
          ...(existingTask || {}),
          id: taskId,
          label: data.video?.titre || existingTask?.label || getProgressStepLabel(data),
          video: mergeVideoInfo(existingTask?.video, data.video),
          steps: nextSteps,
          completed: data.stage === "completed" || data.status === "completed",
          error: data.error || existingTask?.error || null,
          startedAt:
            existingTask?.startedAt
            || data.processingStartedAt
            || now,
          processingElapsedMs: hasBackendElapsed
            ? backendElapsedMs
            : existingTask?.processingElapsedMs ?? null,
          processingElapsedReceivedAt: hasBackendElapsed
            ? now
            : existingTask?.processingElapsedReceivedAt ?? null,
          completedAt:
            data.stage === "completed" || data.status === "completed"
              ? data.processingCompletedAt || existingTask?.completedAt || now
              : existingTask?.completedAt || null,
          updatedAt: now,
        };

        if (index !== -1) {
          return [...prev.slice(0, index), updatedTask, ...prev.slice(index + 1)];
        }

        return [...prev, updatedTask];
      });
    });

    socket.on("completed", () => {
      setTasksHistory((prev) => {
        const now = Date.now();
        return prev.map((task) => ({
          ...task,
          completed: true,
          completedAt: task.completedAt || now,
          updatedAt: now,
          steps: task.steps.map((step) => ({
            ...step,
            completed: true,
            progress: 100,
            etaMs: null,
          })),
        }));
      });
    });

    return () => socket.disconnect();
  }, []);

  // Rendu du contenu en fonction de l'onglet actif
  const renderTabContent = () => {
    switch (currentTabId) {
      case "video":
        return (
          <NewVideoForm
            user={currentUser}
            videoEncodingConfig={videoEncodingConfig}
            videoEncodingWorkers={videoEncodingWorkers}
            onDistributedJobCreated={handleDistributedJobCreated}
          />
        );
      case "seasons":
        return <SeasonsManager />;
      case "genres":
        return <AddGenre />;
      case "people":
        return <PeopleQuickAdd />;
      case "people-import":
        return <PeopleCreditImportManager />;
      case "series":
        return <SeriesManager />;
      case "sagas":
        return <SagaManager />;
      case "saga-content":
        return <SagaContentManager />;
      case "universes":
        return <UniverseManager />;
      case "universe-sagas":
        return <UniverseSagaManager />;
      default:
        return null;
    }
  };

  const visibleTasksHistory = tasksHistory;
  const visibleDistributedJobs = distributedJobs;
  const hasVisibleTaskHistory = visibleTasksHistory.length > 0
    || visibleDistributedJobs.length > 0;

  const handleCloseTaskHistory = () => {
    visibleTasksHistory.forEach((task) => {
      dismissedClassicTaskIdsRef.current.add(String(task.id));
    });
    visibleDistributedJobs.forEach((job) => {
      dismissedDistributedJobIdsRef.current.add(String(job.id));
    });
    setTasksHistory([]);
    setDistributedJobs([]);
  };

  return (
    <main className="container mx-auto flex grow flex-col px-4 py-10 sm:px-6 lg:px-8">
      {hasVisibleTaskHistory && (
        <TaskHistory
          tasks={visibleTasksHistory}
          distributedJobs={visibleDistributedJobs}
          videoEncodingWorkers={videoEncodingWorkers}
          distributedActionPending={distributedActionPending}
          onCancelDistributedJob={(jobId) =>
            handleDistributedJobAction(jobId, "cancel")}
          onResumeDistributedJob={(jobId) =>
            handleDistributedJobAction(jobId, "resume")}
          onClose={handleCloseTaskHistory}
        />
      )}

      <div className="relative overflow-visible rounded-2xl border border-sky-500/10 bg-white/80 p-6 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.12),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.10),transparent_22%)]" />
        <div className="relative">
        {/* Tabs mobile : select */}
        <div className="grid grid-cols-1 sm:hidden">
          <select
            value={currentTabId}
            onChange={(e) => setCurrentTabId(e.target.value)}
            aria-label="Sélectionner une section"
            className="col-start-1 row-start-1 w-full appearance-none rounded-xl border border-sky-500/20 bg-white/85 py-3 pl-4 pr-10 text-base font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-gray-100 dark:*:bg-slate-900"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.name}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            aria-hidden="true"
            className="pointer-events-none col-start-1 row-start-1 mr-3 size-5 self-center justify-self-end fill-sky-500 dark:fill-sky-300"
          />
        </div>

        <div className="hidden sm:block">
          <div className="rounded-xl border border-sky-500/10 bg-slate-950/5 p-1 dark:bg-slate-950/40">
            <nav aria-label="Tabs" className="flex gap-2 overflow-x-auto">
              {tabs.map((tab) => {
                const isCurrent = tab.id === currentTabId;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCurrentTabId(tab.id)}
                    aria-current={isCurrent ? "page" : undefined}
                    className={classNames(
                      isCurrent
                        ? "border-sky-300/60 bg-gradient-to-r from-sky-500/25 via-blue-500/15 to-transparent text-sky-800 shadow-[0_0_22px_rgba(56,189,248,0.22)] dark:text-white"
                        : "border-transparent text-slate-600 hover:border-sky-400/40 hover:bg-sky-500/10 hover:text-sky-700 dark:text-slate-300 dark:hover:text-white",
                      "group inline-flex shrink-0 items-center rounded-xl border px-4 py-2.5 text-sm font-bold transition duration-200"
                    )}
                  >
                    <tab.icon
                      aria-hidden="true"
                      className={classNames(
                        isCurrent
                          ? "text-sky-500 dark:text-sky-300"
                          : "text-slate-400 group-hover:text-sky-500 dark:group-hover:text-sky-300",
                        "mr-2 size-5"
                      )}
                    />
                    <span>{tab.name}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Contenu de l’onglet */}
        <div className="relative z-10 mt-6">
          {renderTabContent()}
        </div>
        </div>
      </div>
    </main>
  );
};

export default FormNewVideoPage;
