import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon as SolidCheckIcon, ChevronUpDownIcon } from "@heroicons/react/16/solid";
import api from "../services/api";
import {
  CheckIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";

const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";
const dangerButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-red-300/50 bg-red-500/15 px-5 py-3 text-sm font-bold text-red-700 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200";
const listboxOptionsClass = "z-[9999] max-h-72 w-[var(--button-width)] overflow-auto rounded-xl border border-sky-500/20 bg-white py-2 text-sm shadow-2xl shadow-sky-950/20 focus:outline-none dark:bg-slate-950 dark:text-slate-100";

const AdminGenreManager = () => {
  const [genres, setGenres] = useState([]);
  const [newGenreName, setNewGenreName] = useState("");
  const [selectedGenre, setSelectedGenre] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingName, setEditingName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [deleteFeedback, setDeleteFeedback] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const sortedGenres = useMemo(
    () => [...genres].sort((a, b) => a.Nom.localeCompare(b.Nom, "fr")),
    [genres]
  );

  const filteredGenres = useMemo(
    () =>
      sortedGenres.filter((genre) =>
        genre.Nom.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [searchTerm, sortedGenres]
  );

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

  const selectGenre = (genre) => {
    setSelectedGenre(genre);
    setEditingName(genre?.Nom || "");
    resetFeedback();
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
      setSelectedGenre(response.data);
      setEditingName(response.data.Nom || "");
      setNewGenreName("");
      setMessage("Genre ajouté.");
    } catch (error) {
      console.error("Erreur lors de l'ajout du genre :", error);
      setErrorMessage(error.response?.data?.error || "Impossible d'ajouter ce genre.");
    } finally {
      setSaving(false);
    }
  };

  const cancelEditing = () => {
    setEditingName(selectedGenre?.Nom || "");
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!selectedGenre?.GenreID) return;

    const Nom = editingName.trim();
    if (!Nom) return;
    if (Nom === selectedGenre.Nom) {
      setMessage("Aucune modification à enregistrer.");
      return;
    }

    setSaving(true);
    resetFeedback();

    try {
      const genreId = selectedGenre.GenreID;
      const response = await api.put(`/genres/admin/${genreId}`, { Nom });
      setGenres((current) =>
        current.map((genre) => (genre.GenreID === genreId ? response.data : genre))
      );
      setSelectedGenre(response.data);
      setEditingName(response.data.Nom || "");
      setMessage("Genre mis à jour.");
    } catch (error) {
      console.error("Erreur lors de la mise à jour du genre :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de mettre à jour ce genre.");
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = () => {
    if (!selectedGenre) return;
    resetFeedback();
    setPendingDelete(selectedGenre);
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
      setSelectedGenre(null);
      setEditingName("");
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
              <label className={labelClass}>Nouveau genre</label>
              <input
                type="text"
                value={newGenreName}
                onChange={(event) => setNewGenreName(event.target.value)}
                className={fieldClass}
                maxLength={50}
                required
              />
            </div>
            <button
              type="submit"
              disabled={saving || !newGenreName.trim()}
              className={`${buttonClass} sm:mt-8`}
            >
              <PlusIcon className="size-5" />
              Ajouter
            </button>
          </form>

          <div className="mb-6">
            <label className={labelClass}>Genre à gérer</label>
            <Listbox value={selectedGenre} onChange={selectGenre}>
              <div className="relative z-[60]">
                <ListboxButton className={`${fieldClass} text-left`} disabled={loading}>
                  <span className="block truncate">
                    {loading
                      ? "Chargement des genres..."
                      : selectedGenre
                        ? selectedGenre.Nom
                        : "Rechercher un genre..."}
                  </span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
                  </span>
                </ListboxButton>
                <ListboxOptions anchor={{ to: "bottom start", gap: 8 }} className={listboxOptionsClass}>
                  <div className="sticky top-0 z-10 bg-white px-3 pb-2 dark:bg-slate-950">
                    <input
                      type="text"
                      placeholder="Filtrer par nom..."
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="w-full rounded-lg border border-sky-500/20 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  {filteredGenres.length > 0 ? (
                    filteredGenres.map((genre) => (
                      <ListboxOption
                        key={genre.GenreID}
                        value={genre}
                        className={({ active }) =>
                          `relative cursor-default select-none py-2.5 pl-10 pr-4 ${
                            active ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"
                          }`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>
                              {genre.Nom}
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400">
                                <SolidCheckIcon className="size-5" />
                              </span>
                            )}
                          </>
                        )}
                      </ListboxOption>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-center text-slate-500">Aucun genre trouvé</div>
                  )}
                </ListboxOptions>
              </div>
            </Listbox>
          </div>

          {selectedGenre && (
            <form onSubmit={handleUpdate} className="rounded-xl border border-sky-500/10 bg-white/70 p-4 dark:bg-slate-950/40">
              <label className={labelClass}>Nom du genre</label>
              <input
                type="text"
                value={editingName}
                onChange={(event) => setEditingName(event.target.value)}
                className={fieldClass}
                maxLength={50}
                required
              />
              <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={saving || editingName === selectedGenre.Nom}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300/60 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <XMarkIcon className="size-5" />
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving || !editingName.trim() || editingName === selectedGenre.Nom}
                  className={buttonClass}
                >
                  <CheckIcon className="size-5" />
                  Enregistrer
                </button>
                <button
                  type="button"
                  onClick={requestDelete}
                  disabled={saving}
                  className={dangerButtonClass}
                >
                  <TrashIcon className="size-5" />
                  Supprimer
                </button>
              </div>
            </form>
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
