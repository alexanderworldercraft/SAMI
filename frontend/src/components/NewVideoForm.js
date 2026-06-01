import React, { useState, useEffect } from "react";
import GenreList from "./GenreList";
import ImageUploader from "./ImageUploader";
import SeriesAndSeasonSelector from "./SeriesAndSeasonSelector";
import Notification from "./Notification";
import api from '../services/api';

// import NotificationTester from './NotificationTester';

const apiUrl = process.env.REACT_APP_URL_LOCAL || "https://192.168.0.17:1234";

const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "block text-sm/6 font-bold text-slate-700 dark:text-slate-200";
const submitClass = "inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 dark:text-white";

const NewVideoForm = () => {
    const [title, setTitle] = useState("");
    const [summary, setSummary] = useState("");
    const [videoFile, setVideoFile] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [genres, setGenres] = useState([]);
    const [selectedGenres, setSelectedGenres] = useState([]);
    const [selectedSeries, setSelectedSeries] = useState(null);
    const [selectedSeason, setSelectedSeason] = useState(null);
    const [notification, setNotification] = useState(null);
    const [user, setUser] = useState(null);

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

    // Récupérer les genres depuis l'API
    const fetchGenres = async () => {
        try {
            const response = await fetch(`${apiUrl}/api/genres`);
            const data = await response.json();
            setGenres(data);
        } catch (error) {
            showNotification("Erreur lors de la récupération des genres.", "⚠️", "error");
        }
    };

    useEffect(() => {
        fetchGenres();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();

        // 🔔 Avertir l'utilisateur avant de lancer l'upload/conversion
        showNotification(
            "Téléversement en cours : ne quitte pas cette page avant la fin du téléchargement et le début de la conversion. cela peux prendre du temps avant de voir le téléchargement démarré car il se charge.",
            "warning",
            "⏳",
            { autoClose: false }
        );

        const formData = new FormData();

        // Chemin de l'image par défaut (accessible depuis le frontend)
        const defaultImagePath = "./imageDefault.webp";

        // Fonction pour charger une image par défaut
        const fetchDefaultImage = async () => {
            const response = await fetch(defaultImagePath);
            const blob = await response.blob();
            return new File([blob], "imageDefault.webp", { type: "image/png" });
        };

        // Champs obligatoires
        formData.append("utilisateurID", user?.UtilisateurID || "");
        formData.append("titre", title.trim() || "");
        formData.append("resumer", summary.trim() || "");
        formData.append("file", videoFile || "");

        // Champs optionnels
        formData.append("genres", selectedGenres.length ? JSON.stringify(selectedGenres) : "[]");
        formData.append("SaisonID", selectedSeason ? selectedSeason : "");
        // Ajouter l'image par défaut si aucune image n'est sélectionnée
        if (imageFile) {
            formData.append("image", imageFile);
        } else {
            const defaultImage = await fetchDefaultImage();
            formData.append("image", defaultImage);
        }

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

            <form onSubmit={handleSubmit}>
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
                    <div className="group relative grid min-h-24 gap-4">
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
                        </div>
                        <div className='fixed bottom-4 right-4 -z-10 w-fit overflow-auto rounded-xl border border-sky-500/10 bg-white/95 text-slate-700 opacity-0 shadow-2xl shadow-sky-950/20 backdrop-blur transition duration-300 ease-in-out group-hover:z-[80] group-hover:opacity-100 dark:bg-slate-950/95 dark:text-neutral-100'>
                            <table className='table-auto'>
                                <thead>
                                    <tr>
                                        <th className='border border-slate-600 px-4 py-2 bg-slate-200 dark:bg-slate-900'>Résolution</th>
                                        <th className='border border-slate-600 px-4 py-2 bg-slate-200 dark:bg-slate-900'>Largeur minimum</th>
                                        <th className='border border-slate-600 px-4 py-2 bg-slate-200 dark:bg-slate-900'>Bitrate (CPU)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>240p</td>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>426</td>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>500</td>
                                    </tr>
                                    <tr>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>360p</td>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>640</td>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>1000</td>
                                    </tr>
                                    <tr>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>480p</td>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>854</td>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>1500</td>
                                    </tr>
                                    <tr>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>720p</td>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>1280</td>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>4500</td>
                                    </tr>
                                    <tr>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>1080p</td>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>1920</td>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>12000</td>
                                    </tr>
                                    <tr>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>4K</td>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>3840</td>
                                        <td className='border border-slate-600 px-4 py-2 bg-blue-50 dark:bg-slate-950'>25000</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>

                <button
                    type="submit"
                    className={submitClass}
                >
                    Ajouter la vidéo
                </button>
            </form>
            </div>
        </section>
    );
};

export default NewVideoForm;
