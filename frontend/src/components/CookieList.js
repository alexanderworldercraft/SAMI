import React, { useEffect, useMemo, useState } from "react";
import { parseCookieValue } from "../utils/cookieValue";
import PaginationPage from "./PaginationPage";

const COOKIE_DEFINITIONS = {
    theme: {
        description: "Permet de mémoriser le thème (clair ou sombre)",
        expiration: "1 an",
    },
    navVisibility: {
        description: "Mémorise l'état de la barre de navigation (fixe ou hover)",
        expiration: "30 jours",
    },
    // Ajoute ici d'autres définitions de cookies si nécessaire
};

const formatExpirationDateTime = (expiresAtRaw) => {
    if (!expiresAtRaw) return "Inconnue";
    const parsed = new Date(expiresAtRaw);
    if (Number.isNaN(parsed.getTime())) return "Inconnue";
    return parsed.toLocaleString("fr-FR");
};

const parseCookies = () => {
    if (!document.cookie) return [];
    return document.cookie.split('; ').map(cookieStr => {
        const [name, rawValue] = cookieStr.split('=');
        const definition = COOKIE_DEFINITIONS[name];
        const expirationLabel = definition?.expiration || "Inconnue";
        const { value, expiresAt } = parseCookieValue(rawValue);
        return {
            name,
            value,
            description: definition?.description || "Inconnu",
            expiration: formatExpirationDateTime(expiresAt),
            duration: expirationLabel,
        };
    });
};

export default function CookieList() {
    const cookies = parseCookies();
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;
    const totalPages = Math.max(1, Math.ceil(cookies.length / itemsPerPage));

    useEffect(() => {
        if (currentPage > totalPages) {
            setCurrentPage(totalPages);
        }
    }, [currentPage, totalPages]);

    const pagedCookies = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return cookies.slice(startIndex, startIndex + itemsPerPage);
    }, [cookies, currentPage]);

    return (
        <div className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
            <div className="relative max-w-full overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 p-6 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.12),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.10),transparent_22%)]" />
            <div className="relative px-0 py-2 sm:p-2">
                <div>
                    <div className="sm:flex sm:items-center">
                        <div className="sm:flex-auto">
                            <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">SAMI</p>
                            <h1 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Cookies</h1>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                                Liste des cookies utilisés par SAMI de votre usage (Il est possible que vous ne voyiez pas tous les cookies disponibles, car ils ne sont pas utilisés dans votre configuration).
                            </p>
                        </div>
                    </div>
                    <div className="mt-8 flow-root">
                        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                            <div className="block w-full py-2 align-middle sm:px-6 lg:px-8">
                                <table className="w-full table-auto divide-y divide-sky-500/10">
                                    <thead>
                                        <tr>
                                            <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-black text-slate-900 dark:text-gray-100 sm:pl-0">
                                                Nom
                                            </th>
                                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-black text-slate-900 dark:text-gray-100">
                                                Valeur
                                            </th>
                                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-black text-slate-900 dark:text-gray-100">
                                                Usage
                                            </th>
                                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-black text-slate-900 dark:text-gray-100">
                                                Expiration
                                            </th>
                                            <th scope="col" className="px-3 py-3.5 text-left text-sm font-black text-slate-900 dark:text-gray-100">
                                                Durée de vie
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-sky-500/10">
                                        {pagedCookies.length > 0 ? (
                                            pagedCookies.map((cookie) => (
                                                <tr key={cookie.name} className="transition duration-150 hover:bg-sky-500/5">
                                                    <td className="py-4 pl-4 pr-3 text-sm font-bold text-slate-900 dark:text-gray-100 sm:pl-0">
                                                        {cookie.name}
                                                    </td>
                                                    <td className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">{cookie.value}</td>
                                                    <td className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">{cookie.description}</td>
                                                    <td className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">{cookie.expiration}</td>
                                                    <td className="px-3 py-4 text-sm text-slate-500 dark:text-slate-400">{cookie.duration}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="5" className="px-3 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                                                    Aucun cookie détecté.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                {cookies.length > itemsPerPage && (
                                    <PaginationPage
                                        currentPage={currentPage}
                                        totalPages={totalPages}
                                        totalItems={cookies.length}
                                        onPageChange={setCurrentPage}
                                        itemsPerPage={itemsPerPage}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        </div>
    );
}
