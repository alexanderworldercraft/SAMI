import React, { useState } from "react";
import FormNewAdmin from "./FormNewAdmin";
import AdminList from "./AdminList";
import UserManagerCard from "./UserManagerCard";
import api from "../services/api";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import AdminMessageSettings from "./AdminMessageSettings";

const AdministrationPage = () => {
    const [, setReload] = useState(false);
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
            <FormNewAdmin />

            <AdminList />

            <UserManagerCard onStateChange={handleStateChange} />
            {/* Ajoutez d'autres composants ou fonctionnalités ici */}
        </div>
    );
};

export default AdministrationPage;
