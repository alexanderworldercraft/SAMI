import React, { useState, useEffect } from "react";
import ImageUploader from "./ImageUploader"; // Import du composant ImageUploader
import Notification from "./Notification";
import GenreList from "./GenreList";
import api from '../services/api';

const apiUrl = process.env.REACT_APP_URL_LOCAL || "https://192.168.0.17:1234";

const SeriesAndSeasonsManager = () => {
    const [series, setSeries] = useState([]);
    const [newSeriesTitle, setNewSeriesTitle] = useState("");
    const [newSeriesSummary, setNewSeriesSummary] = useState("");
    const [newSeriesImage, setNewSeriesImage] = useState(null);
    const [selectedSeries, setSelectedSeries] = useState("");
    const [newSeasonNumber, setNewSeasonNumber] = useState("");
    const [notification, setNotification] = useState(null);
    const [genres, setGenres] = useState([]);
    const [selectedGenres, setSelectedGenres] = useState([]);
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

    // Récupérer toutes les séries
    const fetchSeries = async () => {
        try {
            const response = await fetch(`${apiUrl}/api/series`);
            const data = await response.json();
            setSeries(data);
        } catch (error) {
            console.error("Erreur lors de la récupération des séries :", error);
        }
    };


    useEffect(() => {
        fetchSeries();
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
        formData.append("Titre", newSeriesTitle);
        formData.append("Resumer", newSeriesSummary);
        formData.append("GenreIDs", JSON.stringify(selectedGenres));
        if (newSeriesImage) formData.append("CheminImage", newSeriesImage);
        formData.append("EtatID", 1); // Exemple d'état par défaut

        try {
            const response = await api.post("/series", formData);

            if (response.status >= 200 && response.status < 300) {
                showNotification("Série ajoutée avec succès !", "✅", "success");
                setNewSeriesTitle("");
                setNewSeriesSummary("");
                setNewSeriesImage(null);
                fetchSeries(); // Actualiser la liste des séries
            } else {
                console.error("Erreur :", response.data);
                showNotification("Erreur lors de l'ajout de la série.", "⚠️", "error");
            }
        } catch (error) {
            console.error("Erreur lors de l'ajout de la série :", error.response?.data || error);
            showNotification("Erreur lors de l'ajout de la série.", "⚠️", "error");
        }
    };

    // Ajouter une nouvelle saison
    const handleAddSeason = async (e) => {
        e.preventDefault();

        if (!selectedSeries) {
            showNotification("Veuillez sélectionner une série.", "⚠️", "error");
            return;
        }

        try {
            const response = await api.post(`/series/${selectedSeries}/saisons`, {
                Numero: parseInt(newSeasonNumber, 10),
            });

            if (response.status >= 200 && response.status < 300) {
                showNotification("Saison ajoutée avec succès !", "✅", "success");
                setNewSeasonNumber("");
            } else {
                console.error("Erreur :", response.data);
                showNotification("Erreur lors de l'ajout de la saison.", "⚠️", "error");
            }
        } catch (error) {
            console.error("Erreur lors de l'ajout de la saison :", error.response?.data || error);
            showNotification("Erreur lors de l'ajout de la saison.", "⚠️", "error");
        }
    };

    return (
        <div className="grid grid-cols-1 gap-8 p-6 bg-gradient-to-bl from-slate-950 to-slate-900 text-neutral-100 rounded-xl shadow-xl border border-blue-500">

            {/* Notification */}
            {notification && (
                <Notification
                    message={notification.message}
                    icon={notification.icon}
                    type={notification.type}
                />
            )}

            {/* Ajouter une nouvelle série */}
            <form onSubmit={handleAddSeries} className="border-b border-blue-500 pb-8">
                <h3 className="text-4xl text-center italic font-black underline mb-4">Nouvelle série</h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block font-bold text-xl text-neutral-200 italic">Titre de la série</label>
                            <input
                                type="text"
                                value={newSeriesTitle}
                                onChange={(e) => setNewSeriesTitle(e.target.value)}
                                className="block w-full rounded-md border-0 px-3 py-1.5 text-neutral-200 bg-neutral-900/50 shadow-sm ring-1 ring-inset ring-neutral-200/50 focus:ring-2 focus:ring-inset focus:ring-sky-600 outline-none placeholder:text-neutral-700 sm:text-sm/6"
                                required
                            />
                        </div>
                        <div>
                            <label className="block font-bold text-xl text-neutral-200 italic">Résumé</label>
                            <textarea
                                value={newSeriesSummary}
                                onChange={(e) => setNewSeriesSummary(e.target.value)}
                                className="block w-full rounded-md border-0 px-3 py-1.5 text-neutral-200 bg-neutral-900/50 shadow-sm ring-1 ring-inset ring-neutral-200/50 focus:ring-2 focus:ring-inset focus:ring-sky-600 outline-none placeholder:text-neutral-700 sm:text-sm/6"
                            />
                        </div>
                        <div>
                            <GenreList
                                genres={genres}
                                selectedGenres={selectedGenres}
                                setSelectedGenres={setSelectedGenres}
                            />
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="block font-bold text-xl text-neutral-200 text-center italic">Image</label>
                        <ImageUploader setImage={setNewSeriesImage} /> {/* Utilisation de ImageUploader */}
                    </div>
                </div>
                <button type="submit" className="bg-gradient-to-r from-sky-800 to-sky-700 text-white px-4 py-2 shadow-lg rounded hover:from-sky-900 hover:to-sky-950">
                    Ajouter la série
                </button>
            </form>

            {/* Ajouter une nouvelle saison */}
            <form onSubmit={handleAddSeason}>
                <h3 className="text-4xl text-center italic font-black underline mb-4">Nouvelle saison</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                    <div>
                        <label className="block font-bold text-xl text-neutral-200 italic">Série</label>
                        <select
                            value={selectedSeries}
                            onChange={(e) => setSelectedSeries(e.target.value)}
                            className="block w-full rounded-md border-0 px-3 py-1.5 text-neutral-200 bg-neutral-900/50 shadow-sm ring-1 ring-inset ring-neutral-200/50 focus:ring-2 focus:ring-inset focus:ring-sky-600 outline-none placeholder:text-neutral-700 sm:text-sm/6 min-h-9"
                        >
                            <option value="">-- Sélectionner une série --</option>
                            {series.map((serie) => (
                                <option key={serie.SeriesID} value={serie.SeriesID}>
                                    {serie.Titre}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block font-bold text-xl text-neutral-200 italic">Saison</label>
                        <input
                            type="number"
                            value={newSeasonNumber}
                            onChange={(e) => setNewSeasonNumber(e.target.value)}
                            className="block w-full rounded-md border-0 px-3 py-1.5 text-neutral-200 bg-neutral-900/50 shadow-sm ring-1 ring-inset ring-neutral-200/50 focus:ring-2 focus:ring-inset focus:ring-sky-600 outline-none placeholder:text-neutral-700 sm:text-sm/6"
                            required
                        />
                    </div>
                </div>
                <button type="submit" className="bg-gradient-to-r from-sky-800 to-sky-700 text-white px-4 py-2 shadow-lg rounded hover:from-sky-900 hover:to-sky-950">
                    Ajouter la saison
                </button>
            </form>
        </div>
    );
};

export default SeriesAndSeasonsManager;
