import React, { useState } from "react";
import UploadProgressBar from "./UploadProgressBar";

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

const renderListValue = (items) => {
    if (!items || items.length === 0) return "Aucun";
    return Array.isArray(items) ? items.join(", ") : items;
};

const isFinishedStep = (step) => step.completed && !step.error;

const TaskHistory = ({ tasks }) => {
    const [openFinishedByTaskId, setOpenFinishedByTaskId] = useState({});
    const visibleTasks = tasks.slice(-6).reverse();

    return (
        <div className="fixed bottom-4 right-4 z-10 max-h-[80vh] w-[min(92vw,34rem)] overflow-y-auto rounded-xl border border-slate-800 bg-blue-50 p-4 text-slate-900 shadow-lg dark:bg-slate-950 dark:text-neutral-100">
            <div className="mb-4 flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold">Traitements vidéo</h2>
                <span className="rounded-full bg-sky-500/15 px-3 py-1 text-xs font-bold text-sky-800 dark:text-sky-200">
                    {visibleTasks.length}
                </span>
            </div>

            <div className="grid gap-3">
                {visibleTasks.map((task) => {
                    const isFinishedOpen = Boolean(openFinishedByTaskId[task.id]);
                    const finishedStepsCount = task.steps.filter(isFinishedStep).length;
                    const displayedSteps = task.steps.filter((step) => isFinishedOpen || !isFinishedStep(step));

                    return (
                        <div key={task.id} className="rounded-lg border border-sky-500/15 bg-white/90 p-4 shadow-sm dark:bg-slate-900/75">
                            <div className="mb-3 flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-base font-bold">{task.video?.titre || task.label || "Vidéo"}</p>
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

                        <dl className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                            <div>
                                <dt className="font-bold text-slate-500 dark:text-slate-400">Audio</dt>
                                <dd className="break-words font-semibold">
                                    {task.video?.audioTracks?.length > 0
                                        ? renderListValue(task.video.audioTracks)
                                        : task.video?.audio || "Analyse en cours"}
                                </dd>
                            </div>
                            <div>
                                <dt className="font-bold text-slate-500 dark:text-slate-400">Sous-titres</dt>
                                <dd className="break-words font-semibold">{renderListValue(task.video?.subtitles)}</dd>
                            </div>
                            {task.video?.saisonNumero !== null && task.video?.saisonNumero !== undefined && (
                                <div>
                                    <dt className="font-bold text-slate-500 dark:text-slate-400">Saison n°</dt>
                                    <dd className="font-semibold">{task.video.saisonNumero}</dd>
                                </div>
                            )}
                            {task.video?.seriesTitre && (
                                <div>
                                    <dt className="font-bold text-slate-500 dark:text-slate-400">Series</dt>
                                    <dd className="break-words font-semibold">{task.video.seriesTitre}</dd>
                                </div>
                            )}
                        </dl>

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
                {visibleTasks.length === 0 && (
                    <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Aucun traitement en cours.</p>
                )}
            </div>
        </div>
    );
};

export default TaskHistory;
