import React, { useState } from "react";
import FormNewAdmin from "./FormNewAdmin";
import AdminList from "./AdminList";
import UserManagerCard from "./UserManagerCard";
import api from "../services/api";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import AdminMessageSettings from "./AdminMessageSettings";
import AdminGenreManager from "./AdminGenreManager";
import AdminHomepageGenreManager from "./AdminHomepageGenreManager";
import AdminFavoriteContentManager from "./AdminFavoriteContentManager";
import AdminSeriesManager from "./AdminSeriesManager";
import AdminSagaManager from "./AdminSagaManager";
import AdminUniverseManager from "./AdminUniverseManager";
import AdminVideoManager from "./AdminVideoManager";
import AdminMusicContentManager from "./AdminMusicContentManager";
import AdminPersonManager from "./AdminPersonManager";
import SuperAdminVideoTrashManager from "./SuperAdminVideoTrashManager";
import SuperAdminSagaTrashManager from "./SuperAdminSagaTrashManager";
import SuperAdminUniverseTrashManager from "./SuperAdminUniverseTrashManager";
import SuperAdminMusicTrashManager from "./SuperAdminMusicTrashManager";
import SuperAdminPersonTrashManager from "./SuperAdminPersonTrashManager";
import AdminBackupManager from "./AdminBackupManager";
import AdminExperimentalFeatures from "./AdminExperimentalFeatures";
import AdminDistributedEncodingDiagnostics from "./AdminDistributedEncodingDiagnostics";
import AdminAiSubtitleManager from "./AdminAiSubtitleManager";

const tabButtonClass = (active) =>
    `rounded-lg px-4 py-2 text-sm font-bold transition duration-200 ${
        active
            ? "bg-sky-500/20 text-sky-700 ring-1 ring-sky-300/40 dark:text-sky-200"
            : "text-slate-600 hover:bg-sky-500/10 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
    }`;

const TabbedAdminSection = ({ title, description, tabs, activeTab, onTabChange }) => {
    const activeItem = tabs.find((tab) => tab.id === activeTab) || tabs[0];

    return (
        <section className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
            <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
                <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
                <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{title}</h2>
                {description && (
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                        {description}
                    </p>
                )}
                <div className="mt-5 flex flex-wrap gap-2">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onTabChange(tab.id)}
                            className={tabButtonClass(activeItem.id === tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="bg-slate-50/40 px-4 py-5 dark:bg-slate-950/20 sm:px-6">
                <div className="[&>section]:my-0 [&>section]:max-w-none">
                    {activeItem.content}
                </div>
            </div>
        </section>
    );
};

const AdministrationPage = () => {
    const [, setReload] = useState(false);
    const [activeContentTab, setActiveContentTab] = useState("genres");
    const [activeMusicContentTab, setActiveMusicContentTab] = useState("musiques");
    const [activeTrashTab, setActiveTrashTab] = useState("sagas");
    const [featuredLoading, setFeaturedLoading] = useState(false);
    const [featuredMessage, setFeaturedMessage] = useState("");
    const [featuredError, setFeaturedError] = useState("");

    const handleStateChange = () => {
        setReload((prev) => !prev); // Change la clé pour forcer les listes à se recharger
    };

    const handleRefreshFeatured = async () => {
        setFeaturedLoading(true);
        setFeaturedMessage("");
        setFeaturedError("");

        try {
            const response = await api.post("/genres/featured/refresh");
            const count = response.data?.genres?.length || 0;
            setFeaturedMessage(`Actualisation terminée pour ${count} genres.`);
        } catch (error) {
            console.error("Erreur lors de l'actualisation des contenus à la une :", error);
            setFeaturedError(error.response?.data?.error || "Impossible d'actualiser les contenus à la une.");
        } finally {
            setFeaturedLoading(false);
        }
    };

    const contentTabs = [
        { id: "genres", label: "Genres", content: <AdminGenreManager /> },
        { id: "series", label: "Séries", content: <AdminSeriesManager /> },
        { id: "videos", label: "Vidéos", content: <AdminVideoManager /> },
        { id: "sagas", label: "Sagas", content: <AdminSagaManager /> },
        { id: "universes", label: "Univers", content: <AdminUniverseManager /> },
        { id: "people", label: "Personnes", content: <AdminPersonManager /> },
    ];

    const trashTabs = [
        { id: "sagas", label: "Sagas", content: <SuperAdminSagaTrashManager /> },
        { id: "universes", label: "Univers", content: <SuperAdminUniverseTrashManager /> },
        { id: "videos", label: "Vidéos", content: <SuperAdminVideoTrashManager /> },
        { id: "people", label: "Personnes", content: <SuperAdminPersonTrashManager /> },
    ];

    const musicContentTabs = [
        { id: "musiques", label: "Musiques", content: <AdminMusicContentManager activeTab="musiques" /> },
        { id: "albums", label: "Albums", content: <AdminMusicContentManager activeTab="albums" /> },
        { id: "music-genres", label: "Genres", content: <AdminMusicContentManager activeTab="genres" /> },
    ];

    return (
        <div className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
            <header className="mb-8 text-center">
                <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">SAMI</p>
                <h1 className="mt-3 text-3xl font-black text-slate-950 dark:text-white">Gestion des administrateurs</h1>
            </header>
            <section className="relative mx-auto mb-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 p-6 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:text-white dark:shadow-sky-950/20">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.14),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.10),transparent_22%)]" />
                <div className="relative">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-xl font-black text-slate-950 dark:text-white">Contenus à la une</h2>
                        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                            Force la rotation des contenus vedettes par genre.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleRefreshFeatured}
                        disabled={featuredLoading}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white"
                    >
                        <ArrowPathIcon className={`size-5 ${featuredLoading ? "animate-spin" : ""}`} />
                        {featuredLoading ? "Actualisation..." : "Actualiser"}
                    </button>
                </div>
                {featuredMessage && <p className="mt-4 text-sm font-semibold text-emerald-600 dark:text-emerald-300">{featuredMessage}</p>}
                {featuredError && <p className="mt-4 text-sm font-semibold text-red-600 dark:text-red-300">{featuredError}</p>}
                </div>
            </section>
            <AdminMessageSettings />
            <AdminExperimentalFeatures />
            <AdminAiSubtitleManager />
            <AdminDistributedEncodingDiagnostics />
            <AdminHomepageGenreManager />
            <AdminFavoriteContentManager />
            <TabbedAdminSection
                title="Gestion des contenus"
                description="Modifie les genres, séries, vidéos, sagas, univers et personnes depuis une seule zone."
                tabs={contentTabs}
                activeTab={activeContentTab}
                onTabChange={setActiveContentTab}
            />
            <TabbedAdminSection
                title="Gestion des contenus musicaux"
                description="Modifie les musiques, albums et genres dédiés à la musique."
                tabs={musicContentTabs}
                activeTab={activeMusicContentTab}
                onTabChange={setActiveMusicContentTab}
            />
            <TabbedAdminSection
                title="Corbeilles"
                description="Restaure ou supprime définitivement les contenus supprimés."
                tabs={[
                    ...trashTabs,
                    { id: "musiques", label: "Musiques", content: <SuperAdminMusicTrashManager type="musiques" /> },
                    { id: "albums", label: "Albums", content: <SuperAdminMusicTrashManager type="albums" /> },
                ]}
                activeTab={activeTrashTab}
                onTabChange={setActiveTrashTab}
            />
            <AdminBackupManager />
            <FormNewAdmin />

            <AdminList />

            <UserManagerCard onStateChange={handleStateChange} />
            {/* Ajoutez d'autres composants ou fonctionnalités ici */}
        </div>
    );
};

export default AdministrationPage;
