import React, { useEffect, useState } from "react";
import UploadProgressBar from "./UploadProgressBar";
import {
    normalizeVideoEncodingJob,
    normalizeVideoEncodingWorker,
} from "../utils/videoEncoding";

const formatEta = (etaMs) => {
    if (!Number.isFinite(etaMs) || etaMs <= 0) return null;

    const totalSeconds = Math.ceil(etaMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    if (minutes <= 0) return `${seconds}s restantes`;
    if (minutes < 60) return `${minutes}min ${seconds.toString().padStart(2, "0")}s restantes`;

    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes.toString().padStart(2, "0")}min restantes`;
};

const toTimestamp = (value) => {
    if (value === null || value === undefined || value === "") return null;

    const timestamp = value instanceof Date
        ? value.getTime()
        : typeof value === "number"
            ? value
            : Date.parse(value);

    return Number.isFinite(timestamp) ? timestamp : null;
};

export const formatElapsedDuration = (durationMs) => {
    const totalSeconds = Math.max(0, Math.floor((Number(durationMs) || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [hours, minutes, seconds]
        .map((part) => String(part).padStart(2, "0"))
        .join(":");
};

const getElapsedDuration = ({
    startedAt,
    completedAt,
    fallbackCompletedAt,
    elapsedMs,
    elapsedReceivedAt,
    running,
    nowMs,
}) => {
    const backendElapsedMs = elapsedMs === null || elapsedMs === undefined || elapsedMs === ""
        ? Number.NaN
        : Number(elapsedMs);
    if (Number.isFinite(backendElapsedMs)) {
        const receivedAt = toTimestamp(elapsedReceivedAt);
        const sinceLastBackendMeasure = running && receivedAt !== null
            ? Math.max(0, nowMs - receivedAt)
            : 0;

        return Math.max(0, backendElapsedMs + sinceLastBackendMeasure);
    }

    const startTimestamp = toTimestamp(startedAt);
    if (startTimestamp === null) return null;

    const endTimestamp = toTimestamp(completedAt)
        ?? toTimestamp(fallbackCompletedAt)
        ?? nowMs;

    return Math.max(0, endTimestamp - startTimestamp);
};

const DurationCounter = ({
    label,
    startedAt,
    completedAt,
    fallbackCompletedAt,
    elapsedMs,
    elapsedReceivedAt,
    running,
    nowMs,
}) => {
    const durationMs = getElapsedDuration({
        startedAt,
        completedAt,
        fallbackCompletedAt,
        elapsedMs,
        elapsedReceivedAt,
        running,
        nowMs,
    });

    if (durationMs === null) return null;

    const duration = formatElapsedDuration(durationMs);

    return (
        <p
            role="timer"
            aria-label={`${label} : ${duration}`}
            className="mt-2 inline-flex items-center gap-2 rounded-md bg-slate-500/10 px-2 py-1 text-xs font-bold text-slate-600 dark:text-slate-300"
        >
            <span>Durée totale</span>
            <span className="font-mono tabular-nums">{duration}</span>
        </p>
    );
};

const renderListValue = (items) => {
    if (!items || items.length === 0) return "Aucun";
    return Array.isArray(items) ? items.join(", ") : items;
};

const VideoInformationGrid = ({ video }) => (
    <dl className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div>
            <dt className="font-bold text-slate-500 dark:text-slate-400">Audio</dt>
            <dd className="break-words font-semibold">
                {video?.audioTracks?.length > 0
                    ? renderListValue(video.audioTracks)
                    : video?.audio || "Analyse en cours"}
            </dd>
        </div>
        <div>
            <dt className="font-bold text-slate-500 dark:text-slate-400">Sous-titres</dt>
            <dd className="break-words font-semibold">{renderListValue(video?.subtitles)}</dd>
        </div>
        {video?.saisonNumero !== null && video?.saisonNumero !== undefined && (
            <div>
                <dt className="font-bold text-slate-500 dark:text-slate-400">Saison n°</dt>
                <dd className="font-semibold">{video.saisonNumero}</dd>
            </div>
        )}
        {video?.seriesTitre && (
            <div>
                <dt className="font-bold text-slate-500 dark:text-slate-400">Série</dt>
                <dd className="break-words font-semibold">{video.seriesTitre}</dd>
            </div>
        )}
    </dl>
);

const isFinishedStep = (step) => step.completed && !step.error;

const encodingStatusLabels = {
    analyzing: "Analyse de la source",
    assembling: "Assemblage du master HLS",
    canceled: "Annulé",
    cancel_requested: "Annulation demandée",
    cancelled: "Annulé",
    completed: "Terminé",
    downloading: "Téléchargement de la source",
    encoding: "Encodage",
    error: "En erreur",
    failed: "En erreur",
    incomplete_cleanup_pending: "Nettoyage de l'ingestion incomplète",
    incomplete_expired: "Ingestion incomplète expirée",
    ingesting: "Réception de la source",
    leased: "Attribué à un worker",
    pending: "En attente",
    planning: "Planification des résolutions",
    preparing: "Préparation",
    publishing: "Publication",
    queued: "En attente",
    ready: "Prêt",
    retrying: "Nouvelle tentative planifiée",
    retry_wait: "Nouvelle tentative planifiée",
    running: "En cours",
    succeeded: "Terminé",
    transferring: "Retour vers le principal",
    uploading: "Retour vers le principal",
    verified: "Vérifié",
    verifying: "Vérification",
};

const formatEncodingStatus = (value, fallback = "Traitement en cours") => {
    const status = String(value || "").toLowerCase();
    return encodingStatusLabels[status]
        || (status
            ? status.replaceAll("_", " ").replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase())
            : fallback);
};

const isCompletedEncodingStatus = (status) =>
    ["completed", "succeeded", "verified"].includes(String(status || "").toLowerCase());

const isFailedEncodingStatus = (status) =>
    ["error", "failed"].includes(String(status || "").toLowerCase());

const EncodingJobCard = ({
    rawJob,
    workersById,
    nowMs,
    pendingAction,
    onCancel,
    onResume,
}) => {
    const job = normalizeVideoEncodingJob(rawJob);
    const completed = isCompletedEncodingStatus(job.status);
    const failed = isFailedEncodingStatus(job.status);
    const cancelled = ["cancelled", "canceled"].includes(job.status);
    const cancellable = [
        "ingesting",
        "planning",
        "queued",
        "running",
        "assembling",
        "verifying",
    ].includes(job.status);
    const terminal = completed || failed || cancelled;

    return (
        <div className="max-w-128 rounded-lg border border-violet-400/20 bg-white/90 p-4 shadow-sm dark:bg-slate-900/75">
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-base font-bold">{job.title}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-violet-600 dark:text-violet-300">
                        Encodage multi-server
                    </p>
                    <DurationCounter
                        label="Durée totale du multi encodage"
                        startedAt={job.startedAt || job.createdAt}
                        completedAt={job.completedAt}
                        fallbackCompletedAt={terminal ? job.updatedAt : null}
                        elapsedMs={job.elapsedMs}
                        elapsedReceivedAt={job.elapsedReceivedAt}
                        running={!terminal}
                        nowMs={nowMs}
                    />
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                    completed
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : failed
                            ? "bg-red-500/15 text-red-700 dark:text-red-300"
                            : cancelled
                                ? "bg-slate-500/15 text-slate-700 dark:text-slate-300"
                                : "bg-violet-500/15 text-violet-700 dark:text-violet-200"
                }`}>
                    {formatEncodingStatus(job.status)}
                </span>
            </div>

            <VideoInformationGrid video={job.video} />

            <UploadProgressBar
                progress={job.progress}
                label={formatEncodingStatus(job.currentStep, "Progression globale")}
                color={failed ? "bg-gradient-to-l from-red-600 to-amber-500" : "bg-gradient-to-l from-violet-600 to-sky-500"}
            />

            <div className="mt-4 grid gap-3">
                {job.tasks.map((task) => {
                    const workerId = task.assignedWorkerId === null || task.assignedWorkerId === undefined
                        ? ""
                        : String(task.assignedWorkerId);
                    const worker = workersById.get(workerId);
                    const workerName = task.workerName
                        || worker?.displayName
                        || workerId
                        || "En attente d'un worker";
                    const taskStatus = task.phase || task.status;
                    const taskCompleted = isCompletedEncodingStatus(task.status);
                    const taskFailed = isFailedEncodingStatus(task.status) || Boolean(task.error);
                    const attemptLabel = task.attemptCount > 1
                        ? `Tentative ${task.attemptCount}${task.maxAttempts ? `/${task.maxAttempts}` : ""}`
                        : null;

                    return (
                        <div key={task.id || task.key} className="rounded-lg border border-violet-400/15 bg-violet-500/5 p-3">
                            <UploadProgressBar
                                progress={task.progress}
                                label={`${task.profileLabel} · ${workerName}`}
                                color={taskFailed ? "bg-gradient-to-l from-red-600 to-amber-500" : "bg-gradient-to-l from-violet-500 to-cyan-500"}
                            />
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                                <span>{formatEncodingStatus(taskStatus)}</span>
                                {attemptLabel && <span>{attemptLabel}</span>}
                                {taskCompleted && <span className="text-emerald-600 dark:text-emerald-300">Validé</span>}
                            </div>
                            {task.error && (
                                <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">
                                    Erreur : {task.error}
                                </p>
                            )}
                        </div>
                    );
                })}
                {job.tasks.length === 0 && (
                    <p className="rounded-lg border border-violet-400/15 bg-violet-500/5 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                        Préparation de la file d'encodage.
                    </p>
                )}
            </div>

            {job.error && (
                <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">
                    Erreur : {job.error}
                </p>
            )}
            {job.warnings.map((warning, index) => (
                <p key={`${job.id}-warning-${index}`} className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-200">
                    {typeof warning === "string" ? warning : warning?.message || "Avertissement d'encodage."}
                </p>
            ))}
            {job.actionError && (
                <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">
                    {job.actionError}
                </p>
            )}
            {(cancellable || failed) && (
                <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-violet-400/15 pt-3">
                    {failed && (
                        <button
                            type="button"
                            onClick={() => onResume?.(job.id)}
                            disabled={Boolean(pendingAction)}
                            className="rounded-lg border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-xs font-black text-violet-700 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-violet-200"
                        >
                            {pendingAction === "resume" ? "Reprise…" : "Reprendre le job"}
                        </button>
                    )}
                    {cancellable && (
                        <button
                            type="button"
                            onClick={() => onCancel?.(job.id)}
                            disabled={Boolean(pendingAction)}
                            className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-black text-red-700 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-300"
                        >
                            {pendingAction === "cancel" ? "Annulation…" : "Annuler le job"}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

const TaskHistory = ({
    tasks = [],
    distributedJobs = [],
    videoEncodingWorkers = [],
    distributedActionPending = {},
    onCancelDistributedJob,
    onResumeDistributedJob,
    onClose,
}) => {
    const [openFinishedByTaskId, setOpenFinishedByTaskId] = useState({});
    const [nowMs, setNowMs] = useState(() => Date.now());
    const visibleTasks = tasks.slice(-6).reverse();
    const visibleDistributedJobs = distributedJobs.slice(0, 6);
    const workersById = new Map(
        videoEncodingWorkers
            .map(normalizeVideoEncodingWorker)
            .filter((worker) => worker.id)
            .map((worker) => [worker.id, worker])
    );
    const visibleCount = visibleTasks.length + visibleDistributedJobs.length;
    const hasActiveTimer = visibleTasks.some((task) => !task.completed && !task.error)
        || visibleDistributedJobs.some((rawJob) => {
            const job = normalizeVideoEncodingJob(rawJob);
            return ![
                "cancelled",
                "canceled",
                "completed",
                "error",
                "failed",
                "succeeded",
                "verified",
            ].includes(job.status);
        });
    const allTreatmentsFinished = tasks.length + distributedJobs.length > 0
        && tasks.every((task) =>
            task.completed
            || Boolean(task.error)
            || task.steps.some((step) => Boolean(step.error)))
        && distributedJobs.every((rawJob) => {
            const job = normalizeVideoEncodingJob(rawJob);
            return [
                "cancelled",
                "canceled",
                "completed",
                "error",
                "failed",
                "succeeded",
                "verified",
            ].includes(job.status);
        });

    useEffect(() => {
        if (!hasActiveTimer) return undefined;

        setNowMs(Date.now());
        const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(intervalId);
    }, [hasActiveTimer]);

    return (
        <div className="fixed bottom-4 right-4 z-10 max-h-[80vh] w-[min(92vw,34rem)] overflow-y-auto rounded-xl border border-slate-800 bg-blue-50 p-4 text-slate-900 shadow-lg dark:bg-slate-950 dark:text-neutral-100">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-bold">Traitements vidéo</h2>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="rounded-full bg-sky-500/15 px-3 py-1 text-xs font-bold text-sky-800 dark:text-sky-200">
                        {visibleCount}
                    </span>
                    {allTreatmentsFinished && (
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg border border-slate-400/30 bg-slate-500/10 px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-500/20 dark:text-slate-200"
                        >
                            Fermer les traitements terminés
                        </button>
                    )}
                </div>
            </div>

            <div className="grid gap-3">
                {visibleDistributedJobs.map((job) => (
                    <EncodingJobCard
                        key={job.id}
                        rawJob={job}
                        workersById={workersById}
                        nowMs={nowMs}
                        pendingAction={distributedActionPending[job.id]}
                        onCancel={onCancelDistributedJob}
                        onResume={onResumeDistributedJob}
                    />
                ))}
                {visibleTasks.map((task) => {
                    const isFinishedOpen = Boolean(openFinishedByTaskId[task.id]);
                    const finishedStepsCount = task.steps.filter(isFinishedStep).length;
                    const displayedSteps = task.steps.filter((step) => isFinishedOpen || !isFinishedStep(step));
                    const taskFailed = Boolean(task.error) || task.steps.some((step) => Boolean(step.error));
                    const firstStepStartedAt = task.steps
                        .map((step) => toTimestamp(step.startedAt))
                        .filter((timestamp) => timestamp !== null)
                        .sort((left, right) => left - right)[0];

                    return (
                        <div key={task.id} className="max-w-128 rounded-lg border border-sky-500/15 bg-white/90 p-4 shadow-sm dark:bg-slate-900/75">
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-base font-bold">{task.video?.titre || task.label || "Vidéo"}</p>
                                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-sky-700 dark:text-sky-300">
                                        Traitement classique
                                    </p>
                                    <DurationCounter
                                        label="Durée totale du traitement classique"
                                        startedAt={task.startedAt || firstStepStartedAt}
                                        completedAt={task.completedAt}
                                        fallbackCompletedAt={task.completed || taskFailed ? task.updatedAt : null}
                                        elapsedMs={task.processingElapsedMs}
                                        elapsedReceivedAt={task.processingElapsedReceivedAt}
                                        running={!task.completed && !taskFailed}
                                        nowMs={nowMs}
                                    />
                                    {task.completed && (
                                        <p className="mt-1 text-sm font-semibold text-emerald-600 dark:text-emerald-300">
                                            Validation terminée
                                        </p>
                                    )}
                                </div>
                                <div className="flex shrink-0 flex-col items-end gap-2">
                                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${task.completed ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/15 text-amber-700 dark:text-amber-200"}`}>
                                        {task.completed ? "Terminé" : "En cours"}
                                    </span>
                                    {finishedStepsCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setOpenFinishedByTaskId((current) => ({
                                                    ...current,
                                                    [task.id]: !current[task.id],
                                                }))
                                            }
                                            aria-expanded={isFinishedOpen}
                                            className="inline-flex items-center gap-2 rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-800 transition duration-200 hover:bg-sky-500/20 dark:text-sky-200"
                                        >
                                            <span>{isFinishedOpen ? "Masquer finis" : `Afficher finis (${finishedStepsCount})`}</span>
                                            <span className={`transition duration-200 ${isFinishedOpen ? "rotate-180" : ""}`} aria-hidden="true">v</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                        <VideoInformationGrid video={task.video} />

                            <div className="grid gap-3">
                            {displayedSteps.map((step) => (
                                <div key={step.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/70">
                                    <UploadProgressBar
                                        progress={step.progress}
                                        label={step.label}
                                        color={step.error ? "bg-gradient-to-l from-red-600 to-amber-500" : "bg-gradient-to-l from-blue-500 to-cyan-500"}
                                    />
                                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                                        <span>{step.statusLabel}</span>
                                        {!step.completed && step.etaMs ? <span>{formatEta(step.etaMs)}</span> : null}
                                        {step.completed && !step.error ? <span className="text-emerald-600 dark:text-emerald-300">Validé</span> : null}
                                    </div>
                                    {step.error && (
                                        <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">
                                            Erreur : {step.error}
                                        </p>
                                    )}
                                </div>
                            ))}
                            {displayedSteps.length === 0 && (
                                <p className="rounded-lg border border-emerald-500/15 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                                    Tous les événements sont terminés.
                                </p>
                            )}
                            </div>
                            {task.error && (
                                <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-700 dark:text-red-300">
                                    Erreur : {task.error}
                                </p>
                            )}
                        </div>
                    );
                })}
                {visibleCount === 0 && (
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Aucun traitement en cours.</p>
                )}
            </div>
        </div>
    );
};

export default TaskHistory;
