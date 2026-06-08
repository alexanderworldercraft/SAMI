import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api";
import {
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const PAGE_SIZE = 10;

const AdminGenreManager = () => {
  const [genres, setGenres] = useState([]);
  const [newGenreName, setNewGenreName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteFeedback, setDeleteFeedback] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState(null);

  const sortedGenres = useMemo(
    () => [...genres].sort((a, b) => a.Nom.localeCompare(b.Nom, "fr")),
    [genres]
  );

  const totalPages = Math.max(1, Math.ceil(sortedGenres.length / PAGE_SIZE));
  const paginatedGenres = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedGenres.slice(start, start + PAGE_SIZE);
  }, [currentPage, sortedGenres]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const fetchGenres = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const response = await api.get("/genres");
      setGenres(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Erreur lors de la récupération des genres :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de récupérer les genres.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGenres();
  }, [fetchGenres]);

  const resetFeedback = () => {
    setMessage("");
    setErrorMessage("");
    setDeleteFeedback(null);
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const Nom = newGenreName.trim();
    if (!Nom) return;

    setSaving(true);
    resetFeedback();

    try {
      const response = await api.post("/genres/admin", { Nom });
      setGenres((current) => [...current, response.data]);
      setCurrentPage(1);
      setNewGenreName("");
      setMessage("Genre ajouté.");
    } catch (error) {
      console.error("Erreur lors de l'ajout du genre :", error);
      setErrorMessage(error.response?.data?.error || "Impossible d'ajouter ce genre.");
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (genre) => {
    resetFeedback();
    setEditingId(genre.GenreID);
    setEditingName(genre.Nom);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleUpdate = async (genreId) => {
    const Nom = editingName.trim();
    if (!Nom) return;

    setSaving(true);
    resetFeedback();

    try {
      const response = await api.put(`/genres/admin/${genreId}`, { Nom });
      setGenres((current) =>
        current.map((genre) => (genre.GenreID === genreId ? response.data : genre))
      );
      cancelEditing();
      setMessage("Genre mis à jour.");
    } catch (error) {
      console.error("Erreur lors de la mise à jour du genre :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de mettre à jour ce genre.");
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (genre) => {
    resetFeedback();
    setPendingDelete(genre);
  };

  const cancelDelete = () => {
    setPendingDelete(null);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;

    const genre = pendingDelete;
    setSaving(true);
    resetFeedback();

    try {
      const response = await api.delete(`/genres/admin/${genre.GenreID}`);
      const deletedFeaturedContent = Number(response.data?.deletedFeaturedContent || 0);
      setGenres((current) => current.filter((item) => item.GenreID !== genre.GenreID));
      setPendingDelete(null);
      setMessage(
        deletedFeaturedContent > 0
          ? `Genre "${genre.Nom}" supprimé avec son contenu à la une.`
          : `Genre "${genre.Nom}" supprimé.`
      );
    } catch (error) {
      console.error("Erreur lors de la suppression du genre :", error);
      const links = error.response?.data?.links;
      setErrorMessage(error.response?.data?.error || "Impossible de supprimer ce genre.");
      if (links) {
        setDeleteFeedback({ genre: genre.Nom, links });
      }
    } finally {
      setSaving(false);
    }
  };

  const formatLinks = (links) => {
    const parts = [
      ["vidéo(s)", links.videos],
      ["série(s)", links.series],
      ["préférence(s) utilisateur", links.utilisateurs],
      ["contenu(s) à la une", links.contenusALaUne],
    ].filter(([, count]) => Number(count) > 0);

    return parts.map(([label, count]) => `${count} ${label}`).join(", ");
  };

  return (
    <section className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Genres</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Ajoute, renomme ou supprime les genres disponibles dans l'application.
        </p>
      </div>

      <div className="relative px-6 py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative">
          {message && (
            <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">
              {message}
            </div>
          )}
          {errorMessage && (
            <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">
              {errorMessage}
              {deleteFeedback?.links && (
                <span className="mt-2 block font-normal">
                  {deleteFeedback.genre} est relié à {formatLinks(deleteFeedback.links)}.
                </span>
              )}
            </div>
          )}

          <form onSubmit={handleCreate} className="mb-6 flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
                Nouveau genre
              </label>
              <input
                type="text"
                value={newGenreName}
                onChange={(event) => setNewGenreName(event.target.value)}
                className="w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white"
                maxLength={50}
                required
              />
            </div>
            <button
              type="submit"
              disabled={saving || !newGenreName.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white sm:mt-8"
            >
              <PlusIcon className="size-5" />
              Ajouter
            </button>
          </form>

          <div className="overflow-hidden rounded-xl border border-sky-500/10 bg-white/70 dark:bg-slate-950/40">
            {loading ? (
              <p className="px-4 py-5 text-sm font-semibold text-slate-600 dark:text-slate-300">
                Chargement des genres...
              </p>
            ) : sortedGenres.length === 0 ? (
              <p className="px-4 py-5 text-sm font-semibold text-slate-600 dark:text-slate-300">
                Aucun genre disponible.
              </p>
            ) : (
              <ul className="divide-y divide-sky-500/10">
                {paginatedGenres.map((genre) => (
                  <li
                    key={genre.GenreID}
                    className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    {editingId === genre.GenreID ? (
                      <input
                        type="text"
                        value={editingName}
                        onChange={(event) => setEditingName(event.target.value)}
                        className="min-w-0 flex-1 rounded-xl border border-sky-500/20 bg-white/85 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white"
                        maxLength={50}
                        autoFocus
                      />
                    ) : (
                      <span className="min-w-0 flex-1 text-sm font-bold text-slate-800 dark:text-slate-100">
                        {genre.Nom}
                      </span>
                    )}

                    <div className="flex shrink-0 items-center gap-2">
                      {editingId === genre.GenreID ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleUpdate(genre.GenreID)}
                            disabled={saving || !editingName.trim()}
                            className="inline-flex size-10 items-center justify-center rounded-lg border border-emerald-300/40 bg-emerald-500/15 text-emerald-700 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-emerald-200"
                            title="Valider"
                          >
                            <CheckIcon className="size-5" />
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditing}
                            disabled={saving}
                            className="inline-flex size-10 items-center justify-center rounded-lg border border-slate-300/40 bg-slate-500/10 text-slate-700 transition hover:bg-slate-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-slate-200"
                            title="Annuler"
                          >
                            <XMarkIcon className="size-5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEditing(genre)}
                            disabled={saving}
                            className="inline-flex size-10 items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 text-sky-700 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-sky-200"
                            title="Renommer"
                          >
                            <PencilIcon className="size-5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDelete(genre)}
                            disabled={saving}
                            className="inline-flex size-10 items-center justify-center rounded-lg border border-red-300/40 bg-red-500/15 text-red-700 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200"
                            title="Supprimer"
                          >
                            <TrashIcon className="size-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {sortedGenres.length > PAGE_SIZE && (
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                Page {currentPage} sur {totalPages} · {sortedGenres.length} genres
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={currentPage === 1 || saving}
                  className="inline-flex size-10 items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 text-sky-700 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-sky-200"
                  title="Page précédente"
                >
                  <ChevronLeftIcon className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={currentPage === totalPages || saving}
                  className="inline-flex size-10 items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 text-sky-700 transition hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-sky-200"
                  title="Page suivante"
                >
                  <ChevronRightIcon className="size-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-red-300/20 bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-white">
            <h3 className="text-xl font-black text-slate-950 dark:text-white">Confirmer la suppression</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Supprimer le genre "{pendingDelete.Nom}" ? Si ce genre est uniquement relié à un contenu à la une, ce lien sera supprimé avec lui.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={cancelDelete}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300/60 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-300/50 bg-red-500/15 px-5 py-3 text-sm font-bold text-red-700 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200"
              >
                <TrashIcon className="size-5" />
                {saving ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default AdminGenreManager;
