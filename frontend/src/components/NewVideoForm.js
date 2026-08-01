import React, { useEffect, useRef, useState } from "react";
import GenreList from "./GenreList";
import ImageUploader from "./ImageUploader";
import SeriesAndSeasonSelector from "./SeriesAndSeasonSelector";
import Notification from "./Notification";
import AccessibleTooltip from "./AccessibleTooltip";
import api from '../services/api';
import {
    countAvailableEncodingClones,
    DISTRIBUTED_ENCODING_TOOLTIP,
    isPrimaryVideoEncodingConfig,
    isVideoEncodingEnabled,
    NO_ENCODING_WORKER_MESSAGE,
    unwrapVideoEncodingJob,
} from "../utils/videoEncoding";

// import NotificationTester from './NotificationTester';

const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "block text-sm/6 font-bold text-slate-700 dark:text-slate-200";
const submitClass = "inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 dark:text-white";

const videoEncodingSpecs = [
    { resolution: "240p", minWidth: "426", bitrate: "500" },
    { resolution: "360p", minWidth: "640", bitrate: "1000" },
    { resolution: "480p", minWidth: "854", bitrate: "1500" },
    { resolution: "720p", minWidth: "1280", bitrate: "4500" },
    { resolution: "1080p", minWidth: "1920", bitrate: "12000" },
    { resolution: "4K", minWidth: "3840", bitrate: "25000" },
];

const NewVideoForm = ({
    user: providedUser,
    videoEncodingConfig = null,
    videoEncodingWorkers = [],
    onDistributedJobCreated,
}) => {
    const [title, setTitle] = useState("");
    const [summary, setSummary] = useState("");
    const [videoFile, setVideoFile] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [genres, setGenres] = useState([]);
    const [selectedGenres, setSelectedGenres] = useState([]);
    const [selectedSeries, setSelectedSeries] = useState(null);
    const [selectedSeason, setSelectedSeason] = useState(null);
    const [notification, setNotification] = useState(null);
    const user = providedUser || null;
    const [showVideoSpecs, setShowVideoSpecs] = useState(false);
    const [distributedSubmitting, setDistributedSubmitting] = useState(false);
    const formRef = useRef(null);

    const showNotification = (
        message,
        type = "success",
        icon = "ℹ️",
        options = { autoClose: true, duration: 5000 }
    ) => {
        const { autoClose = true, duration = 5000 } = options || {};
        const finalDuration = autoClose ? duration : 0;
        setNotification({ message, type, icon, duration: finalDuration });
        if (autoClose && duration > 0) {
            setTimeout(() => setNotification(null), duration);
        }
    };

    useEffect(() => {
        let isMounted = true;

        const fetchGenres = async () => {
            try {
                const response = await api.get("/genres");
                if (isMounted) setGenres(Array.isArray(response.data) ? response.data : []);
            } catch (error) {
                if (!isMounted) return;
                setGenres([]);
                setNotification({
                    message: "Erreur lors de la récupération des genres.",
                    type: "error",
                    icon: "⚠️",
                    duration: 5000,
                });
            }
        };

        fetchGenres();

        return () => {
            isMounted = false;
        };
    }, []);

    const buildVideoFormData = async () => {
        const formData = new FormData();
        const defaultImagePath = "./imageDefault.png";
        const fetchDefaultImage = async () => {
            const response = await fetch(defaultImagePath);
            const blob = await response.blob();
            return new File([blob], "./imageDefault.png", { type: "image/png" });
        };

        formData.append("utilisateurID", user?.UtilisateurID || "");
        formData.append("titre", title.trim() || "");
        formData.append("resumer", summary.trim() || "");
        formData.append("file", videoFile || "");
        formData.append("genres", selectedGenres.length ? JSON.stringify(selectedGenres) : "[]");
        formData.append("SaisonID", selectedSeason ? selectedSeason : "");
        if (imageFile) {
            formData.append("image", imageFile);
        } else {
            const defaultImage = await fetchDefaultImage();
            formData.append("image", defaultImage);
        }

        return formData;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // 🔔 Avertir l'utilisateur avant de lancer l'upload/conversion
        showNotification(
            "Téléversement en cours : ne quitte pas cette page avant la fin du téléchargement et le début de la conversion. cela peux prendre du temps avant de voir le téléchargement démarré car il se charge.",
            "warning",
            "⏳",
            { autoClose: false }
        );

        const formData = await buildVideoFormData();

        console.log("Données envoyées au backend :");
        formData.forEach((value, key) => {
            console.log(`${key}:`, value);
        });

        try {
            await api.post("/videos/add", formData, {
                headers: {
                    // ne pas mettre Content-Type manuellement : axios le gère avec FormData
                    // Authorization est normalement injecté par ton interceptor `api`
                },
            });

            showNotification("Vidéo ajoutée avec succès.", "success", "✅");
        } catch (error) {
            console.error("Erreur lors de l'envoi des données :", error);
            const msg = error.response?.data?.error || "Erreur lors de l'ajout de la vidéo.";
            showNotification(msg, "error", "⚠️");
        }
    };

    const activeWorkersFromRegistry = countAvailableEncodingClones(videoEncodingWorkers);
    const hasWorkerRegistry = Array.isArray(videoEncodingWorkers)
        && videoEncodingWorkers.length > 0;
    const configuredActiveWorkers = Number(videoEncodingConfig?.activeCloneCount);
    const activeCloneCount = hasWorkerRegistry
        ? activeWorkersFromRegistry
        : Number.isFinite(configuredActiveWorkers) && configuredActiveWorkers > 0
            ? configuredActiveWorkers
            : 0;
    const isSuperAdmin = user?.GradeID === 1;
    const showDistributedEncoding = isSuperAdmin
        && isPrimaryVideoEncodingConfig(videoEncodingConfig)
        && isVideoEncodingEnabled(videoEncodingConfig);
    const noActiveClone = activeCloneCount === 0;
    const distributedUnavailableReason = noActiveClone
        ? NO_ENCODING_WORKER_MESSAGE
        : videoEncodingConfig?.canStart === false
            ? videoEncodingConfig?.reason || "L'encodage multi-server n'est pas disponible."
            : null;

    const handleDistributedSubmit = async () => {
        if (!formRef.current?.reportValidity()) return;
        if (distributedUnavailableReason) {
            showNotification(distributedUnavailableReason, "warning", "⚠️");
            return;
        }

        setDistributedSubmitting(true);
        showNotification(
            "Téléversement vers le serveur principal en cours. Le suivi persistant apparaîtra dès la création du job.",
            "warning",
            "⏳",
            { autoClose: false }
        );

        try {
            const formData = await buildVideoFormData();
            const response = await api.post("/video-encoding/jobs", formData, {
                headers: {},
                onUploadProgress: ({ loaded, total }) => {
                    const percent = Number(total) > 0
                        ? Math.min(100, Math.round((Number(loaded) / Number(total)) * 100))
                        : null;
                    showNotification(
                        percent === null
                            ? "Téléversement vers le serveur principal en cours."
                            : `Téléversement vers le serveur principal : ${percent} %`,
                        "warning",
                        "⏳",
                        { autoClose: false }
                    );
                },
            });
            const job = unwrapVideoEncodingJob(response.data);
            if (job) onDistributedJobCreated?.(job);
            showNotification("Encodage multi-server lancé.", "success", "✅");
        } catch (error) {
            console.error("Erreur lors du lancement de l'encodage multi-server :", error);
            const errorCode = error.response?.data?.code;
            const noWorkerError = [
                "NO_ENCODING_WORKER_AVAILABLE",
                "NO_ENCODING_WORKERS_AVAILABLE",
                "NO_COMPATIBLE_ENCODING_WORKER",
                "NO_ACTIVE_CLONE",
                "NO_ACTIVE_ENCODING_CLONE",
                "NO_ACTIVE_ENCODING_CLONES",
                "NO_ACTIVE_WORKER",
            ].includes(errorCode)
                || Number(error.response?.data?.activeCloneCount) === 0;
            const message = noWorkerError
                ? NO_ENCODING_WORKER_MESSAGE
                : error.response?.data?.error || "Impossible de lancer l'encodage multi-server.";
            showNotification(message, "error", "⚠️");
        } finally {
            setDistributedSubmitting(false);
        }
    };

    return (
        <section className="relative overflow-visible rounded-2xl border border-sky-500/10 bg-white/70 p-6 shadow-sm dark:bg-slate-950/40 dark:text-neutral-100">
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.08),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.06),transparent_22%)]" />
            <div className="relative z-10">
            {notification && (
                <Notification
                    message={notification.message}
                    type={notification.type}
                    icon={notification.icon}
                    duration={notification.duration ?? 10000}
                    onClose={() => console.log('Notification fermée')}
                />
            )}

            {/* <NotificationTester/> */}

            <form ref={formRef} onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className='grid gap-4'>
                        {/* Titre de la vidéo */}
                        <div>
                            <div className="flex justify-between">
                                <label className={labelClass}>
                                    Titre de la vidéo
                                </label>
                                <span className="text-sm/6 text-red-500">
                                    Obligatoire
                                </span>
                            </div>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className={fieldClass}
                                required
                            />
                        </div>
                        {/* Résumé */}
                        <div>
                            <div className="flex justify-between">
                                <label className={labelClass}>Résumé</label>
                                <span className="text-sm/6 text-green-500">
                                    Optionnel
                                </span>
                            </div>
                            <textarea
                                rows={8}
                                value={summary}
                                onChange={(e) => setSummary(e.target.value)}
                                className={fieldClass}
                            />
                        </div>
                    </div>

                    {/* Image */}
                    <div>
                        <div className="flex justify-between">
                            <label className={labelClass}>Image</label>
                            <span className="text-sm/6 text-green-500">
                                Optionnel
                            </span>
                        </div>
                        <ImageUploader setImage={setImageFile} />
                    </div>

                    <div className='relative z-30 grid gap-4'>
                        {/* Séries */}
                        <SeriesAndSeasonSelector
                            selectedSeries={selectedSeries}
                            setSelectedSeries={setSelectedSeries}
                            selectedSeason={selectedSeason}
                            setSelectedSeason={setSelectedSeason}
                        />

                        {/* Genres */}
                        <GenreList genres={genres} selectedGenres={selectedGenres} setSelectedGenres={setSelectedGenres} />
                    </div>


                    {/* Fichier vidéo */}
                    <div className="relative grid min-h-24 gap-4">
                        <div className="rounded-xl border border-sky-500/20 bg-white/85 p-4 shadow-sm transition duration-200 hover:border-sky-400/60 dark:bg-slate-950/65">
                            <div className="flex justify-between">
                                <label className={labelClass}>
                                    Fichier Vidéo
                                </label>
                                <span className="text-sm/6 text-red-500">
                                    Obligatoire
                                </span>
                            </div>
                            <input type="file" onChange={(e) => setVideoFile(e.target.files[0])} required className="mt-3 w-full text-sm font-semibold text-slate-600 file:mr-4 file:rounded-lg file:border-0 file:bg-sky-500/15 file:px-4 file:py-2 file:text-sm file:font-bold file:text-slate-900 hover:file:bg-sky-500/25 dark:text-slate-300 dark:file:text-white" />
                            <div className="mt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowVideoSpecs((current) => !current)}
                                    aria-expanded={showVideoSpecs}
                                    className="inline-flex w-full items-center justify-between rounded-lg border border-sky-300/30 bg-sky-500/10 px-4 py-2.5 text-sm font-bold text-slate-800 transition duration-200 hover:border-sky-300/70 hover:bg-sky-500/20 dark:text-slate-100"
                                >
                                    <span>Voir les paramètres d'encodage</span>
                                    <span
                                        aria-hidden="true"
                                        className={`text-sky-500 transition duration-200 dark:text-sky-300 ${showVideoSpecs ? "rotate-180" : ""}`}
                                    >
                                        ▼
                                    </span>
                                </button>

                                {showVideoSpecs && (
                                    <div className="mt-3 overflow-hidden rounded-xl border border-sky-500/10 bg-white/80 shadow-sm dark:bg-slate-950/50">
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full text-left text-sm">
                                                <thead className="bg-sky-500/10 text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
                                                    <tr>
                                                        <th className="px-4 py-3 font-bold">Résolution</th>
                                                        <th className="px-4 py-3 font-bold">Largeur min.</th>
                                                        <th className="px-4 py-3 font-bold">Bitrate CPU</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-sky-500/10 text-slate-700 dark:text-slate-200">
                                                    {videoEncodingSpecs.map((spec) => (
                                                        <tr key={spec.resolution} className="transition duration-200 hover:bg-sky-500/10">
                                                            <td className="px-4 py-3 font-bold text-sky-700 dark:text-sky-300">{spec.resolution}</td>
                                                            <td className="px-4 py-3 font-semibold">{spec.minWidth}</td>
                                                            <td className="px-4 py-3 font-semibold">{spec.bitrate}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                </div>

                <button
                    type="submit"
                    className={submitClass}
                >
                    Ajouter la vidéo
                </button>

                {showDistributedEncoding && (
                    <div className="mt-5 rounded-xl border border-violet-400/25 bg-violet-500/10 p-4">
                        <div className="mb-4">
                            <h3 className="text-base font-black text-slate-950 dark:text-white">
                                Encodage multi-server expérimental
                            </h3>
                            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                                Le fichier source sera temporairement partagé avec les clones d'encodage
                                configurés. Chaque résolution terminée sera vérifiée puis regroupée sur
                                le serveur principal.
                            </p>
                        </div>

                        {noActiveClone && (
                            <p
                                id="video-encoding-no-worker-feedback"
                                className="mb-3 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-200"
                            >
                                {NO_ENCODING_WORKER_MESSAGE}
                            </p>
                        )}

                        <AccessibleTooltip
                            label="Informations sur l'encodage multi-server"
                            content={DISTRIBUTED_ENCODING_TOOLTIP}
                        >
                            {distributedUnavailableReason ? (
                                <button
                                    type="button"
                                    disabled
                                    className={`${submitClass} cursor-not-allowed opacity-50`}
                                >
                                    Ajouter la vidéo via le multi server
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleDistributedSubmit}
                                    disabled={distributedSubmitting}
                                    aria-busy={distributedSubmitting}
                                    className={`${submitClass} border-violet-300/50 bg-violet-500/15 hover:border-violet-300/80 hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-60`}
                                >
                                    Ajouter la vidéo via le multi server
                                </button>
                            )}
                        </AccessibleTooltip>
                    </div>
                )}
            </form>
            </div>
        </section>
    );
};

export default NewVideoForm;
