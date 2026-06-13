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
  SaisonID: null,
  SaisonNumero: null,
  SeriesTitre: "",
};

const sameGenres = (left, right) => {
  const a = [...left].sort((x, y) => x - y);
  const b = [...right].sort((x, y) => x - y);
  return a.length === b.length && a.every((value, index) => value === b[index]);
};

const videoLabel = (video) => {
  if (!video) return "";
  if (video.type === "episode") {
    return `${video.Titre} - ${video.SeriesTitre || "Série inconnue"} S${video.SaisonNumero || "?"}`;
  }
  return video.Titre;
};

const AdminVideoManager = () => {
  const [videos, setVideos] = useState([]);
  const [genres, setGenres] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
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

  const filteredVideos = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return videos.filter((video) =>
      [video.Titre, video.SeriesTitre, String(video.VideoID)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [searchTerm, videos]);

  const imageSrc = imagePreview || (form.CheminImage ? `${apiUrl}/${form.CheminImage}` : "");

  const resetFeedback = () => {
    setMessage("");
    setErrorMessage("");
  };

  const resetForm = () => {
    setForm(emptyForm);
    setInitialForm(emptyForm);
    setSelectedGenres([]);
    setInitialGenres([]);
    setImageFile(null);
    setImagePreview("");
  };

  const loadVideos = useCallback(async () => {
    try {
      const response = await api.get("/videos/admin");
      setVideos(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Erreur lors de la récupération des vidéos :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de récupérer les vidéos.");
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
    loadVideos();
    loadGenres();
  }, [loadGenres, loadVideos]);

  const loadVideoDetails = useCallback(async (video) => {
    if (!video?.VideoID) {
      resetForm();
      return;
    }

    setLoading(true);
    resetFeedback();

    try {
      const [detailsResponse, genresResponse] = await Promise.all([
        api.get(`/videos/${video.VideoID}`),
        api.get(`/videos/${video.VideoID}/genres`),
      ]);
      const data = detailsResponse.data;
      const item = data.video || {};
      const series = data.series || null;
      const nextForm = {
        Titre: item.Titre || "",
        Resumer: item.Resumer || "",
        Premium: Boolean(item.Premium),
        CheminImage: item.CheminImage || "",
        SaisonID: item.SaisonID || null,
        SaisonNumero: video.SaisonNumero || null,
        SeriesTitre: series?.Titre || video.SeriesTitre || "",
      };
      const genreIds = Array.isArray(genresResponse.data)
        ? genresResponse.data.map((genre) => genre.GenreID)
        : [];

      setForm(nextForm);
      setInitialForm(nextForm);
      setSelectedGenres(genreIds);
      setInitialGenres(genreIds);
      setImageFile(null);
      setImagePreview("");
    } catch (error) {
      console.error("Erreur lors de la récupération de la vidéo :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de charger cette vidéo.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVideoDetails(selectedVideo);
  }, [loadVideoDetails, selectedVideo]);

  const handleFieldChange = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedVideo?.VideoID) return;

    const title = form.Titre.trim();
    if (!title) {
      setErrorMessage("Le titre est obligatoire.");
      return;
    }

    setSaving(true);
    resetFeedback();

    try {
      const videoId = selectedVideo.VideoID;
      const requests = [];

      if (title !== initialForm.Titre) {
        requests.push(api.put(`/videos/${videoId}/title`, { Titre: title }));
      }

      if (form.Resumer !== initialForm.Resumer) {
        requests.push(api.put(`/videos/${videoId}/resumer`, { Resumer: form.Resumer }));
      }

      if (form.Premium !== initialForm.Premium) {
        requests.push(api.put(`/videos/${videoId}/premium`, { Premium: form.Premium }));
      }

      if (!sameGenres(selectedGenres, initialGenres)) {
        requests.push(api.put(`/videos/${videoId}/genres`, { GenreIDs: selectedGenres }));
      }

      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);
        requests.push(api.put(`/videos/${videoId}/image`, formData));
      }

      if (requests.length === 0) {
        setMessage("Aucune modification à enregistrer.");
        return;
      }

      await Promise.all(requests);
      await loadVideos();
      await loadVideoDetails({ VideoID: videoId });
      setSelectedVideo((current) => ({ ...current, Titre: title }));
      setMessage("Vidéo mise à jour.");
    } catch (error) {
      console.error("Erreur lors de la mise à jour de la vidéo :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de mettre à jour cette vidéo.");
    } finally {
      setSaving(false);
    }
  };

  const requestDeleteVideo = () => {
    if (!selectedVideo) return;
    resetFeedback();
    setPendingDelete(selectedVideo);
  };

  const handleDelete = async () => {
    if (!pendingDelete?.VideoID) return;

    setSaving(true);
    resetFeedback();

    try {
      await api.delete(`/videos/${pendingDelete.VideoID}`);
      setSelectedVideo(null);
      resetForm();
      await loadVideos();
      setPendingDelete(null);
      setMessage("Vidéo placée dans la corbeille.");
    } catch (error) {
      console.error("Erreur lors de la suppression de la vidéo :", error);
      setErrorMessage(error.response?.data?.error || "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto my-8 max-w-4xl overflow-visible rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Vidéos</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Modifie les films et épisodes existants, ou place une vidéo dans la corbeille.
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
            <label className={labelClass}>Vidéo à gérer</label>
            <Listbox value={selectedVideo} onChange={setSelectedVideo}>
              <div className="relative z-[55]">
                <ListboxButton className={`${fieldClass} text-left`}>
                  <span className="block truncate">
                    {selectedVideo ? videoLabel(selectedVideo) : "Rechercher une vidéo..."}
                  </span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                    <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
                  </span>
                </ListboxButton>
                <ListboxOptions anchor={{ to: "bottom start", gap: 8 }} className={listboxOptionsClass}>
                  <div className="sticky top-0 z-10 bg-white px-3 pb-2 dark:bg-slate-950">
                    <input
                      type="text"
                      placeholder="Filtrer par titre, série ou ID..."
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="w-full rounded-lg border border-sky-500/20 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 dark:bg-slate-900 dark:text-slate-100"
                    />
                  </div>
                  {filteredVideos.length > 0 ? (
                    filteredVideos.map((video) => (
                      <ListboxOption
                        key={video.VideoID}
                        value={video}
                        className={({ active }) =>
                          `relative cursor-default select-none py-2.5 pl-10 pr-4 ${
                            active ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"
                          }`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>
                              {videoLabel(video)}
                            </span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                              #{video.VideoID} - {video.type === "episode" ? "Épisode" : "Film"}
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
                    <div className="px-4 py-3 text-center text-slate-500">Aucune vidéo trouvée</div>
                  )}
                </ListboxOptions>
              </div>
            </Listbox>
          </div>

          {selectedVideo && (
            <form onSubmit={handleSave} className="space-y-6">
              {loading ? (
                <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
                  Chargement de la vidéo...
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
                      {form.SaisonID && (
                        <div className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
                          Épisode de {form.SeriesTitre || "série inconnue"}
                          {form.SaisonNumero ? ` - saison ${form.SaisonNumero}` : ""}
                        </div>
                      )}
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
                        Vidéo premium
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
                          <img src={imageSrc} alt="Affiche de la vidéo" className="h-full w-full object-cover" />
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
                    </div>
                  </div>

                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <button
                      type="button"
                      onClick={requestDeleteVideo}
                      disabled={saving}
                      className={dangerButtonClass}
                    >
                      <TrashIcon className="size-5" />
                      Placer dans la corbeille
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
              Placer la vidéo "{pendingDelete.Titre}" dans la corbeille ? Elle ne sera plus visible dans les listes publiques, mais un super administrateur pourra encore la restaurer ou la supprimer définitivement.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                disabled={saving}
                className="inline-flex items-center justify-center rounded-lg border border-slate-300/60 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button type="button" onClick={handleDelete} disabled={saving} className={dangerButtonClass}>
                <TrashIcon className="size-5" />
                {saving ? "Mise en corbeille..." : "Placer dans la corbeille"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default AdminVideoManager;
