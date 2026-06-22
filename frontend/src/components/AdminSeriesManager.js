import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import GenreList from "./GenreList";

const apiUrl = process.env.REACT_APP_URL_LOCAL;

const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";
const dangerButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-red-300/50 bg-red-500/15 px-5 py-3 text-sm font-bold text-red-700 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200";
const listboxOptionsClass = "z-[9999] max-h-72 w-[var(--button-width)] overflow-auto rounded-xl border border-sky-500/20 bg-white py-2 text-sm shadow-2xl shadow-sky-950/20 focus:outline-none dark:bg-slate-950 dark:text-slate-100";

const emptyForm = {
  Titre: "",
  Resumer: "",
  Premium: false,
  CheminImage: "",
  Saisons: [],
};

const AdminSeriesManager = () => {
  const [series, setSeries] = useState([]);
  const [genres, setGenres] = useState([]);
  const [selectedSeries, setSelectedSeries] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [initialGenres, setInitialGenres] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const fileInputRef = useRef(null);

  const filteredSeries = useMemo(
    () =>
      series.filter((serie) =>
        serie.Titre.toLowerCase().includes(searchTerm.toLowerCase())
      ),
    [series, searchTerm]
  );

  const imageSrc = imagePreview || (form.CheminImage ? `${apiUrl}/${form.CheminImage}` : "");

  const resetFeedback = () => {
    setMessage("");
    setErrorMessage("");
  };

  const loadSeries = useCallback(async () => {
    try {
      const response = await api.get("/series");
      setSeries(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Erreur lors de la récupération des séries :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de récupérer les séries.");
    }
  }, []);

  const loadGenres = useCallback(async () => {
    try {
      const response = await api.get("/genres");
      setGenres(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Erreur lors de la récupération des genres :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de récupérer les genres.");
    }
  }, []);

  useEffect(() => {
    loadSeries();
    loadGenres();
  }, [loadGenres, loadSeries]);

  const loadSeriesDetails = useCallback(async (serie) => {
    if (!serie?.SeriesID) {
      setForm(emptyForm);
      setInitialForm(emptyForm);
      setSelectedGenres([]);
      setInitialGenres([]);
      setImageFile(null);
      setImagePreview("");
      return;
    }

    setLoading(true);
    resetFeedback();

    try {
      const response = await api.get(`/series/${serie.SeriesID}`);
      const data = response.data;
      const nextForm = {
        Titre: data.Titre || "",
        Resumer: data.Resumer || "",
        Premium: Boolean(data.Premium),
        CheminImage: data.CheminImage || "",
        Saisons: Array.isArray(data.Saisons) ? data.Saisons : [],
      };
      const genreIds = Array.isArray(data.Genres) ? data.Genres.map((genre) => genre.GenreID) : [];

      setForm(nextForm);
      setInitialForm(nextForm);
      setSelectedGenres(genreIds);
      setInitialGenres(genreIds);
      setImageFile(null);
      setImagePreview("");
    } catch (error) {
      console.error("Erreur lors de la récupération de la série :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de charger cette série.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSeriesDetails(selectedSeries);
  }, [loadSeriesDetails, selectedSeries]);

  const handleFieldChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSeasonChange = (saisonId, value) => {
    setForm((current) => ({
      ...current,
      Saisons: current.Saisons.map((saison) =>
        saison.SaisonID === saisonId ? { ...saison, Numero: value } : saison
      ),
    }));
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleRemoveImage = async () => {
    if (!selectedSeries?.SeriesID) return;

    if (imageFile && !initialForm.CheminImage) {
      setImageFile(null);
      setImagePreview("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    if (!initialForm.CheminImage) {
      setMessage("Aucune image à retirer.");
      return;
    }

    if (!window.confirm("Retirer définitivement l'image de cette série ?")) return;

    setSaving(true);
    resetFeedback();

    try {
      const seriesId = selectedSeries.SeriesID;
      await api.delete(`/series/${seriesId}/image`);
      setImageFile(null);
      setImagePreview("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadSeries();
      await loadSeriesDetails({ SeriesID: seriesId });
      setMessage("Image de la série retirée.");
    } catch (error) {
      console.error("Erreur lors de la suppression de l'image de la série :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de retirer l'image de cette série.");
    } finally {
      setSaving(false);
    }
  };

  const sameGenres = () => {
    const a = [...selectedGenres].sort((left, right) => left - right);
    const b = [...initialGenres].sort((left, right) => left - right);
    return a.length === b.length && a.every((value, index) => value === b[index]);
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedSeries?.SeriesID) return;

    const title = form.Titre.trim();
    if (!title) {
      setErrorMessage("Le titre est obligatoire.");
      return;
    }

    setSaving(true);
    resetFeedback();

    try {
      const seriesId = selectedSeries.SeriesID;
      const requests = [];

      if (title !== initialForm.Titre) {
        requests.push(api.put(`/series/${seriesId}/title`, { Titre: title }));
      }

      if (form.Resumer !== initialForm.Resumer) {
        requests.push(api.put(`/series/${seriesId}/resumer`, { Resumer: form.Resumer }));
      }

      if (form.Premium !== initialForm.Premium) {
        requests.push(api.put(`/series/${seriesId}/premium`, { Premium: form.Premium }));
      }

      if (!sameGenres()) {
        requests.push(api.put(`/series/${seriesId}/genres`, { GenreIDs: selectedGenres }));
      }

      const changedSeasons = form.Saisons.filter((saison) => {
        const before = initialForm.Saisons.find((item) => item.SaisonID === saison.SaisonID);
        return before && Number(before.Numero) !== Number(saison.Numero);
      });

      changedSeasons.forEach((saison) => {
        requests.push(api.put(`/series/saisons/${saison.SaisonID}`, { Numero: Number(saison.Numero) }));
      });

      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);
        requests.push(api.put(`/series/${seriesId}/image`, formData));
      }

      if (requests.length === 0) {
        setMessage("Aucune modification à enregistrer.");
        return;
      }

      await Promise.all(requests);
      await loadSeries();
      await loadSeriesDetails({ SeriesID: seriesId });
      setSelectedSeries((current) => ({ ...current, Titre: title }));
      setMessage("Série mise à jour.");
    } catch (error) {
      console.error("Erreur lors de la mise à jour de la série :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de mettre à jour cette série.");
    } finally {
      setSaving(false);
    }
  };

  const requestDeleteSeason = (saison) => {
    resetFeedback();
    setPendingDelete({ type: "season", saison });
  };

  const requestDeleteSeries = () => {
    if (!selectedSeries) return;
    resetFeedback();
    setPendingDelete({ type: "series", serie: selectedSeries });
  };

  const cancelDelete = () => {
    setPendingDelete(null);
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;

    setSaving(true);
    resetFeedback();

    try {
      if (pendingDelete.type === "season") {
        await api.delete(`/series/saisons/${pendingDelete.saison.SaisonID}`);
        await loadSeriesDetails(selectedSeries);
        setMessage(`Saison ${pendingDelete.saison.Numero} supprimée.`);
      } else {
        const response = await api.delete(`/series/${pendingDelete.serie.SeriesID}`);
        const deletedSeasons = Number(response.data?.deletedSeasons || 0);
        setSelectedSeries(null);
        setForm(emptyForm);
        setInitialForm(emptyForm);
        await loadSeries();
        setMessage(
          deletedSeasons > 0
            ? `Série supprimée avec ${deletedSeasons} saison(s).`
            : "Série supprimée."
        );
      }
      setPendingDelete(null);
    } catch (error) {
      console.error("Erreur lors de la suppression :", error);
      const links = error.response?.data?.links;
      if (links?.saisons?.length) {
        const details = links.saisons
          .map((saison) => `saison ${saison.Numero} (${saison.videos} vidéo(s))`)
          .join(", ");
        setErrorMessage(`${error.response?.data?.error || "Suppression impossible"} ${details}.`);
      } else if (Number(links?.videos) > 0) {
        setErrorMessage(`${error.response?.data?.error || "Suppression impossible"} ${links.videos} vidéo(s) liée(s).`);
      } else {
        setErrorMessage(error.response?.data?.error || "Suppression impossible.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Séries</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Modifie ou supprime les séries existantes et leurs saisons.
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
            </div>
          )}

          <div className="mb-6">
            <label className={labelClass}>Série à gérer</label>
            <Listbox value={selectedSeries} onChange={setSelectedSeries}>
              <div className="relative z-[60]">
                <ListboxButton className={`${fieldClass} text-left`}>
                  <span className="block truncate">
                    {selectedSeries ? selectedSeries.Titre : "Rechercher une série..."}
                  </span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
                  </span>
                </ListboxButton>
                <ListboxOptions anchor={{ to: "bottom start", gap: 8 }} className={listboxOptionsClass}>
                  <div className="sticky top-0 z-10 bg-white px-3 pb-2 dark:bg-slate-950">
                    <input
                      type="text"
                      placeholder="Filtrer par titre..."
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="w-full rounded-lg border border-sky-500/20 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  {filteredSeries.length > 0 ? (
                    filteredSeries.map((serie) => (
                      <ListboxOption
                        key={serie.SeriesID}
                        value={serie}
                        className={({ active }) =>
                          `relative cursor-default select-none py-2.5 pl-10 pr-4 ${
                            active ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"
                          }`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>
                              {serie.Titre}
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400">
                                <CheckIcon className="size-5" />
                              </span>
                            )}
                          </>
                        )}
                      </ListboxOption>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-center text-slate-500">Aucune série trouvée</div>
                  )}
                </ListboxOptions>
              </div>
            </Listbox>
          </div>

          {selectedSeries && (
            <form onSubmit={handleSave} className="space-y-6">
              {loading ? (
                <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
                  Chargement de la série...
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_240px]">
                    <div className="space-y-4">
                      <div>
                        <label className={labelClass}>Titre</label>
                        <input
                          type="text"
                          value={form.Titre}
                          onChange={(event) => handleFieldChange("Titre", event.target.value)}
                          className={fieldClass}
                          maxLength={100}
                          required
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Résumé</label>
                        <textarea
                          rows={8}
                          value={form.Resumer}
                          onChange={(event) => handleFieldChange("Resumer", event.target.value)}
                          className={fieldClass}
                        />
                      </div>
                      <GenreList
                        genres={genres}
                        selectedGenres={selectedGenres}
                        setSelectedGenres={setSelectedGenres}
                      />
                      <label className="flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-slate-200">
                        <input
                          type="checkbox"
                          checked={form.Premium}
                          onChange={(event) => handleFieldChange("Premium", event.target.checked)}
                          className="size-4 rounded border-slate-300 accent-sky-500"
                        />
                        Série premium
                      </label>
                    </div>

                    <div>
                      <label className={labelClass}>Affiche</label>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex h-[320px] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-sky-500/30 bg-white/70 text-sm font-semibold text-slate-500 transition hover:border-sky-400/70 dark:bg-slate-950/40 dark:text-slate-300"
                      >
                        {imageSrc ? (
                          <img src={imageSrc} alt="Affiche de la série" className="h-full w-full object-cover" />
                        ) : (
                          "Choisir une image"
                        )}
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageChange}
                      />
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        disabled={saving || (!imageSrc && !imageFile)}
                        className="mt-3 w-full rounded-lg border border-red-300/50 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200"
                      >
                        Retirer l'image
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-lg font-black text-slate-950 dark:text-white">Saisons</h3>
                      <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">
                        La suppression est bloquée si une saison contient des vidéos.
                      </p>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-sky-500/10 bg-white/70 dark:bg-slate-950/40">
                      {form.Saisons.length === 0 ? (
                        <p className="px-4 py-5 text-sm font-semibold text-slate-600 dark:text-slate-300">
                          Aucune saison pour cette série.
                        </p>
                      ) : (
                        <ul className="divide-y divide-sky-500/10">
                          {form.Saisons.map((saison) => (
                            <li key={saison.SaisonID} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                              <div className="flex-1">
                                <label className="mb-1 block text-xs font-bold uppercase text-slate-500 dark:text-slate-400">
                                  Saison
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={saison.Numero}
                                  onChange={(event) => handleSeasonChange(saison.SaisonID, event.target.value)}
                                  className={fieldClass}
                                  required
                                />
                              </div>
                              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 sm:w-36">
                                {Number(saison.episodeCount || 0)} vidéo(s)
                              </p>
                              <button
                                type="button"
                                onClick={() => requestDeleteSeason(saison)}
                                disabled={saving}
                                className="inline-flex size-10 items-center justify-center rounded-lg border border-red-300/40 bg-red-500/15 text-red-700 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200"
                                title="Supprimer la saison"
                              >
                                <TrashIcon className="size-5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <button
                      type="button"
                      onClick={requestDeleteSeries}
                      disabled={saving}
                      className={dangerButtonClass}
                    >
                      <TrashIcon className="size-5" />
                      Supprimer la série
                    </button>
                    <button type="submit" disabled={saving} className={buttonClass}>
                      <PencilIcon className="size-5" />
                      {saving ? "Enregistrement..." : "Enregistrer les modifications"}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-red-300/20 bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-white">
            <h3 className="text-xl font-black text-slate-950 dark:text-white">Confirmer la suppression</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {pendingDelete.type === "season"
                ? `Supprimer la saison ${pendingDelete.saison.Numero} ? Cette action sera refusée si elle contient des vidéos.`
                : `Supprimer la série "${pendingDelete.serie.Titre}" ? Les saisons seront aussi supprimées uniquement si elles ne contiennent aucune vidéo.`}
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
              <button type="button" onClick={handleDelete} disabled={saving} className={dangerButtonClass}>
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

export default AdminSeriesManager;
