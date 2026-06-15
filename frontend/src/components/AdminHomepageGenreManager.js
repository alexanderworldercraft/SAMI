import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../services/api";
import GenreSelect from "./GenreSelect";

const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";

const AdminHomepageGenreManager = () => {
  const [genres, setGenres] = useState([]);
  const [selectedGenreIds, setSelectedGenreIds] = useState(["", "", "", "", ""]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const selectedIds = useMemo(
    () => selectedGenreIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0),
    [selectedGenreIds]
  );

  const loadData = useCallback(async () => {
    setMessage("");
    setErrorMessage("");

    try {
      const [genresResponse, defaultsResponse] = await Promise.all([
        api.get("/genres"),
        api.get("/genres/homepage-defaults"),
      ]);

      setGenres(Array.isArray(genresResponse.data) ? genresResponse.data : []);

      const defaults = Array.isArray(defaultsResponse.data) ? defaultsResponse.data : [];
      setSelectedGenreIds(
        Array.from({ length: 5 }, (_, index) => String(defaults[index]?.GenreID || ""))
      );
    } catch (error) {
      console.error("Erreur lors de la récupération des genres homepage :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de charger les genres homepage.");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelect = (index, value) => {
    setSelectedGenreIds((current) =>
      current.map((genreId, currentIndex) => (currentIndex === index ? value : genreId))
    );
  };

  const handleSave = async (event) => {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (selectedIds.length !== 5 || new Set(selectedIds).size !== 5) {
      setErrorMessage("Choisis exactement 5 genres différents.");
      return;
    }

    setSaving(true);
    try {
      await api.put("/genres/homepage-defaults", { GenreIDs: selectedIds });
      await loadData();
      setMessage("Genres par défaut de la homepage mis à jour.");
    } catch (error) {
      console.error("Erreur lors de la mise à jour des genres homepage :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de mettre à jour les genres homepage.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="relative mx-auto mb-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 p-6 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:text-white dark:shadow-sky-950/20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.12),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
      <div className="relative">
        <div className="mb-5">
          <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Homepage</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Genres par défaut</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Ces genres sont utilisés si aucun utilisateur n'est connecté ou si l'utilisateur n'a pas choisi ses propres genres.
          </p>
        </div>

        {message && (
          <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">
            {message}
          </div>
        )}
        {errorMessage && (
          <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {selectedGenreIds.map((genreId, index) => (
              <GenreSelect
                key={index}
                label={`Genre ${index + 1}`}
                genres={genres}
                value={genreId}
                onChange={(value) => handleSelect(index, value)}
                disabledGenreIds={selectedGenreIds.filter((id) => id && id !== genreId)}
                placeholder="Choisir un genre"
                required
              />
            ))}
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className={buttonClass}>
              {saving ? "Enregistrement..." : "Enregistrer les genres"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
};

export default AdminHomepageGenreManager;
