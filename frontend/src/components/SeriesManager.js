import React, { useState, useEffect } from "react";
import ImageUploader from "./ImageUploader"; // Import du composant ImageUploader
import Notification from "./Notification";
import GenreList from "./GenreList";
import api from '../services/api';

const apiUrl = process.env.REACT_APP_URL_LOCAL || "https://192.168.0.17:1234";
const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "block text-sm/6 font-bold text-slate-700 dark:text-slate-200";
const submitClass = "inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 dark:text-white";

const SeriesManager = () => {
    const [newSeriesTitle, setNewSeriesTitle] = useState("");
    const [newSeriesSummary, setNewSeriesSummary] = useState("");
    const [newSeriesImage, setNewSeriesImage] = useState(null);
    const [notification, setNotification] = useState(null);
    const [genres, setGenres] = useState([]);
    const [selectedGenres, setSelectedGenres] = useState([]);
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

    useEffect(() => {
        const fetchGenres = async () => {
            try {
                const response = await fetch(`${apiUrl}/api/genres`);
                const data = await response.json();
                setGenres(data);
            } catch (error) {
                console.error("Erreur lors de la récupération des genres :", error);
            }
        };
        fetchGenres();
    }, []);

    // Afficher une notification
    const showNotification = (message, icon = "ℹ️", type = "success") => {
        setNotification({ message, icon, type });
        setTimeout(() => setNotification(null), 5000); // Cache la notification après 5 secondes
    };

    // Ajouter une nouvelle série
    const handleAddSeries = async (e) => {
        e.preventDefault();

        const formData = new FormData();
        formData.append("UtilisateurID", user.UtilisateurID || "");
        formData.append("Titre", newSeriesTitle);
        formData.append("Resumer", newSeriesSummary);
        formData.append("GenreIDs", JSON.stringify(selectedGenres));
        if (newSeriesImage) formData.append("CheminImage", newSeriesImage);
        formData.append("EtatID", 1); // Exemple d'état par défaut

        try {
            const response = await fetch(`${apiUrl}/api/series`, {
                method: "POST",
                body: formData,
            });

            if (response.ok) {
                showNotification("Série ajoutée avec succès !", "✅", "success");
                setNewSeriesTitle("");
                setNewSeriesSummary("");
                setNewSeriesImage(null);
            } else {
                const error = await response.json();
                console.error("Erreur :", error);
                showNotification("Erreur lors de l'ajout de la série.", "⚠️", "error");
            }
        } catch (error) {
            console.error("Erreur lors de l'ajout de la série :", error);
            showNotification("Erreur lors de l'ajout de la série.", "⚠️", "error");
        }
    };

    return (
        <section className="relative overflow-visible rounded-2xl border border-sky-500/10 bg-white/70 p-6 shadow-sm dark:bg-slate-950/40 dark:text-neutral-100">
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.08),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.06),transparent_22%)]" />
            <div className="relative z-10">

            {/* Notification */}
            {notification && (
                <Notification
                    message={notification.message}
                    type={notification.type}
                    icon={notification.icon}
                    duration={4000}
                    onClose={() => console.log('Notification fermée')}
                />
            )}

            {/* Ajouter une nouvelle série */}
            <form onSubmit={handleAddSeries}>
                <div className="mb-5">
                    <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Séries</p>
                    <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Ajouter une série</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="grid gap-4">
                        <div>
                        <div className="flex justify-between">
                            <label className={labelClass}>
                                Titre de la série
                            </label>
                            <span className="text-sm/6 text-red-500">
                                Obligatoire
                            </span>
                        </div>
                        <input
                            type="text"
                            value={newSeriesTitle}
                            onChange={(e) => setNewSeriesTitle(e.target.value)}
                            className={fieldClass}
                            required
                        />
                    </div>
                    <div>
                        <div className="flex justify-between">
                            <label className={labelClass}>Résumé</label>
                            <span className="text-sm/6 text-green-500">
                                Optionnel
                            </span>
                        </div>
                        <textarea
                            rows={8}
                            value={newSeriesSummary}
                            onChange={(e) => setNewSeriesSummary(e.target.value)}
                            className={fieldClass}
                        />
                    </div>
                    <div className="relative z-30">
                        <GenreList
                            genres={genres}
                            selectedGenres={selectedGenres}
                            setSelectedGenres={setSelectedGenres}
                        />
                    </div>
                    </div>

                    <div>
                        <div className="flex justify-between">
                            <label className={labelClass}>Image</label>
                            <span className="text-sm/6 text-green-500">
                                Optionnel
                            </span>
                        </div>
                        <ImageUploader setImage={setNewSeriesImage} />
                    </div>
                </div>
                <button type="submit" className={submitClass}>
                    Ajouter la série
                </button>
            </form>
            </div>
        </section>
    );
};

export default SeriesManager;
