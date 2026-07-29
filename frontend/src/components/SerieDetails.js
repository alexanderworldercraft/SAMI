import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  CheckIcon,
  PencilIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import api from '../services/api';
import ImageUploader from "./ImageUploader";
import VideoList from "./VideoList";
import GenreList from "./GenreList";
import FavoriteButton from "./FavoriteButton";
import {
  cancelButtonClass,
  detailFieldClass,
  detailLabelClass,
  editButtonClass,
  saveButtonClass,
} from "./contentDetailStyles";

const apiUrl = process.env.REACT_APP_URL_LOCAL;

const SerieDetails = ({
  series,
  isAdmin = false,
  onTitleUpdate,
  onResumerUpdate,
  onImageUpdate,
  onPremiumUpdate,
  onNotify,
  isFavorite = false,
  onFavoriteChange,
}) => {

  const [isPremium, setIsPremium] = useState(!!series.Premium);
  const [savingPremium, setSavingPremium] = useState(false);

  useEffect(() => {
    setIsPremium(!!series.Premium);
  }, [series.Premium]);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingResumer, setIsEditingResumer] = useState(false);
  const [newTitle, setNewTitle] = useState(series.Titre);
  const [newResumer, setNewResumer] = useState(series.Resumer);

  // --- image
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [newImageFile, setNewImageFile] = useState(null);
  const [isSavingImage, setIsSavingImage] = useState(false);

  // --- Genres
  const [isEditingGenres, setIsEditingGenres] = useState(false);
  const [allGenres, setAllGenres] = useState([]);           // liste complète (pour checkboxes)
  const [serieGenres, setSerieGenres] = useState([]);       // [{GenreID, Nom}] pour affichage
  const [selectedGenres, setSelectedGenres] = useState([]); // [GenreID] pour le form


  const [user, setUser] = useState(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const response = await api.get('/users/me');
        setUser(response.data);
      } catch (error) {
        console.error("Erreur lors de la récupération de l'utilisateur :", error);
      }
    };
    fetchUser();
  }, []);

  // charge tous les genres + genres de la série
  useEffect(() => {
    const load = async () => {
      try {
        const [allRes, serieRes] = await Promise.all([
          fetch(`${apiUrl}/api/genres`),
          fetch(`${apiUrl}/api/series/${series.SeriesID}/genres`)
        ]);
        const all = await allRes.json();
        const cur = await serieRes.json();
        setAllGenres(all);
        setSerieGenres(cur);
        setSelectedGenres(cur.map(g => g.GenreID));
      } catch (e) {
        console.error("Erreur chargement genres série:", e);
      }
    };
    if (series?.SeriesID) load();
  }, [series?.SeriesID]);


  const handleTitleChange = (e) => setNewTitle(e.target.value);
  const handleResumerChange = (e) => setNewResumer(e.target.value);

  const handleEditTitleClick = () => setIsEditingTitle(true);
  const handleEditResumerClick = () => setIsEditingResumer(true);

  const handleUpdateTitleClick = async () => {
    if (!newTitle.trim()) return;
    try {
      await api.put(`/series/${series.SeriesID}/title`, { Titre: newTitle });
      onTitleUpdate?.(newTitle);
      setIsEditingTitle(false);
    } catch (error) {
      console.error(error);
      alert("Une erreur est survenue lors de la mise à jour du titre.");
    }
  };

  const handleUpdateResumerClick = async () => {
    if (!newResumer.trim()) return;
    try {
      await api.put(`/series/${series.SeriesID}/resumer`, { Resumer: newResumer });
      onResumerUpdate?.(newResumer);
      setIsEditingResumer(false);
    } catch (error) {
      console.error(error);
      alert("Une erreur est survenue lors de la mise à jour du résumé.");
    }
  };

  // --- Edition de l'image
  const canEdit = user && (user.GradeID === 1 || user.GradeID === 2);
  const imageUrl = series?.CheminImage ? `${apiUrl}/${series.CheminImage}` : null;

  const handleSaveImageClick = async () => {
    if (!newImageFile) {
      onNotify?.({ message: "Aucun fichier sélectionné pour l'image.", type: "warning" });
      return;
    }
    try {
      setIsSavingImage(true);
      onNotify?.({ message: "Mise à jour de l'image en cours...", type: "info" });
      const formData = new FormData();
      formData.append("image", newImageFile);

      const resp = await api.put(`/series/${series.SeriesID}/image`, formData, {
        headers: {
          // ne pas définir Content-Type manuellement (axios gère le boundary)
        },
      });

      const data = resp.data; // { CheminImage: 'uploads/images/...' }
      if (data?.deduped) {
        if (data?.CheminImage) {
          onImageUpdate?.(data.CheminImage);
        }
        onNotify?.({
          message: "Une mise à jour d'image est deja en cours. Reessaie dans quelques secondes.",
          type: "info",
        });
        setIsEditingImage(false);
        setNewImageFile(null);
        return;
      }
      if (data?.CheminImage) {
        onImageUpdate?.(data.CheminImage);
        onNotify?.({ message: "Image mise a jour avec succes.", type: "success" });
        setIsEditingImage(false);
        setNewImageFile(null);
      } else {
        onNotify?.({
          message: "Aucune image retournee par le serveur.",
          type: "warning",
        });
      }
    } catch (e) {
      console.error(e);
      onNotify?.({ message: e.message || "Erreur lors de l'upload de l'image.", type: "error" });
    } finally {
      setIsSavingImage(false);
    }
  };

  const toPersonCards = (arr = []) =>
    arr
      .filter(p => p.CheminImage)
      .map(p => ({
        type: "person",
        id: p.PersonneID,
        Titre: [p.Prenom, p.Nom].filter(Boolean).join(" "),
        Surnom: p.Surnom,
        CheminImage: p.CheminImage,
        Genres: [],
      }));

  const realisateurCards = toPersonCards(series?.Realisateurs);
  const acteurCards = toPersonCards(series?.Acteurs);

      const handleTogglePremium = async () => {
    if (!isAdmin) return;

    try {
      setSavingPremium(true);
      const newValue = !isPremium;
      const resp = await api.put(`/series/${series.SeriesID}/premium`, {
        Premium: newValue,
      });

      setIsPremium(resp.data.Premium);
      onPremiumUpdate?.(resp.data.Premium);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la mise à jour du statut premium de la série.");
    } finally {
      setSavingPremium(false);
    }
  };

  return (
    <div className="grid gap-12">
      <section className="container mx-auto overflow-visible rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
        <div className="rounded-t-2xl border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
          <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Série</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{series.Titre}</h2>
        </div>
      <div className="relative grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        {/* --- Bloc visuel série (ratio 2/3 comme les cartes) --- */}
        <div className="relative md:col-span-2 xl:col-span-2">
          {!isEditingImage ? (
            <div className="group relative mb-4 overflow-hidden rounded-xl border border-sky-500/20 bg-gradient-to-br from-slate-950 to-slate-900 shadow-xl shadow-sky-950/20 transition duration-300 ease-in-out">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={series.Titre}
                  className="aspect-2/3 h-full w-full object-cover duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex aspect-2/3 w-full items-center justify-center text-neutral-400">
                  Aucun visuel
                </div>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setIsEditingImage(true)}
                  className="absolute right-2 top-2 inline-flex size-9 items-center justify-center rounded-lg border border-white/15 bg-slate-950/80 text-white backdrop-blur transition hover:border-sky-300/60 hover:bg-sky-500/20 focus:outline-none focus:ring-2 focus:ring-sky-300"
                  title="Modifier l'image"
                >
                  <PencilIcon className="size-4" />
                  <span className="sr-only">Modifier l'image</span>
                </button>
              )}
              <FavoriteButton
                type="series"
                id={series.SeriesID}
                isFavorite={isFavorite}
                onChange={onFavoriteChange}
                size="lg"
                className="absolute left-2 top-2 z-10"
              />
            </div>
          ) : (
            <div className="mb-4 rounded-xl border border-sky-500/15 bg-white/60 p-4 shadow-sm dark:bg-slate-950/40">
              <ImageUploader setImage={setNewImageFile} />
              <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handleSaveImageClick}
                  disabled={isSavingImage || !newImageFile}
                  className={saveButtonClass}
                >
                  <CheckIcon className="size-5" />
                  {isSavingImage ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button
                  type="button"
                  onClick={() => { setIsEditingImage(false); setNewImageFile(null); }}
                  className={cancelButtonClass}
                >
                  <XMarkIcon className="size-5" />
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="relative z-30 md:col-span-2 xl:col-span-6">
          {/* --- Titre --- */}
          {isEditingTitle ? (
            <div className="rounded-xl border border-sky-500/15 bg-white/60 p-4 shadow-sm dark:bg-slate-950/40">
              <label htmlFor={`series-title-${series.SeriesID}`} className={detailLabelClass}>
                Titre de la série
              </label>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <input
                  id={`series-title-${series.SeriesID}`}
                  type="text"
                  value={newTitle}
                  onChange={handleTitleChange}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleUpdateTitleClick();
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setIsEditingTitle(false);
                      setNewTitle(series.Titre);
                    }
                  }}
                  className={`${detailFieldClass} min-w-0 flex-1`}
                  maxLength={100}
                  autoFocus
                />
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingTitle(false);
                      setNewTitle(series.Titre);
                    }}
                    className={cancelButtonClass}
                  >
                    <XMarkIcon className="size-5" />
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleUpdateTitleClick}
                    disabled={!newTitle?.trim()}
                    className={saveButtonClass}
                  >
                    <CheckIcon className="size-5" />
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <h2 className="mb-3 min-w-0 flex-1 text-3xl font-black text-slate-950 dark:text-white">
                {series.Titre}
              </h2>
              {canEdit && (
                <button
                  type="button"
                  onClick={handleEditTitleClick}
                  className={editButtonClass}
                  title="Modifier le titre"
                >
                  <PencilIcon className="size-4" />
                  <span className="sr-only">Modifier le titre</span>
                </button>
              )}
            </div>
          )}

          {isPremium && (
    <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/60 px-2 py-0.5 text-xs font-semibold">
      Premium
    </span>
  )}

{/* Premium */}
  {isAdmin && (
    <button
      type="button"
      onClick={handleTogglePremium}
      disabled={savingPremium}
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition
        ${isPremium
          ? "bg-amber-500 text-black border-amber-400 hover:bg-amber-400"
          : "bg-slate-800 text-slate-200 border-slate-600 hover:bg-slate-700"
        }
        ${savingPremium ? "opacity-60 cursor-wait" : ""}
      `}
    >
      {savingPremium
        ? "Mise à jour..."
        : isPremium
        ? "Retirer du Premium"
        : "Passer en Premium"}
    </button>
  )}

          {/* --- Résumé --- */}
          {isEditingResumer ? (
            <div className="mt-5 rounded-xl border border-sky-500/15 bg-white/60 p-4 shadow-sm dark:bg-slate-950/40">
              <label htmlFor={`series-summary-${series.SeriesID}`} className={detailLabelClass}>
                Résumé
              </label>
              <textarea
                id={`series-summary-${series.SeriesID}`}
                value={newResumer}
                onChange={handleResumerChange}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setIsEditingResumer(false);
                    setNewResumer(series.Resumer);
                  }
                }}
                className={`${detailFieldClass} min-h-36 resize-y leading-6`}
                autoFocus
              />
              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingResumer(false);
                    setNewResumer(series.Resumer);
                  }}
                  className={cancelButtonClass}
                >
                  <XMarkIcon className="size-5" />
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleUpdateResumerClick}
                  disabled={!newResumer?.trim()}
                  className={saveButtonClass}
                >
                  <CheckIcon className="size-5" />
                  Enregistrer
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex items-start gap-3">
              <p className="min-w-0 flex-1 whitespace-pre-line text-base leading-7 text-slate-700 dark:text-slate-200 lg:text-lg">{series.Resumer}</p>
              {canEdit && (
                <button
                  type="button"
                  onClick={handleEditResumerClick}
                  className={editButtonClass}
                  title="Modifier le résumé"
                >
                  <PencilIcon className="size-4" />
                  <span className="sr-only">Modifier le résumé</span>
                </button>
              )}
            </div>
          )}
          <div>
            {/* --- Genres --- */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold dark:text-white">Genres</h3>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setIsEditingGenres(v => !v)}
                    className={isEditingGenres ? cancelButtonClass : saveButtonClass}
                  >
                    {isEditingGenres ? (
                      <XMarkIcon className="size-5" />
                    ) : (
                      <PencilIcon className="size-4" />
                    )}
                    {isEditingGenres ? "Annuler" : "Modifier"}
                  </button>
                )}
              </div>

              {!isEditingGenres ? (
                <div className="flex flex-wrap gap-2">
                  {serieGenres?.length ? (
                    serieGenres.map((g, index) => {
                      // 🎨 Couleurs cycliques (8 teintes)
                      const colorClasses = [
                        "bg-red-400/10 text-red-400 ring-red-600/10 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20",
                        "bg-yellow-400/10 text-yellow-900 ring-yellow-600/20 dark:bg-yellow-400/10 dark:text-yellow-300 dark:ring-yellow-400/20",
                        "bg-green-400/10 text-green-600 ring-green-600/20 dark:bg-green-400/10 dark:text-green-400 dark:ring-green-500/20",
                        "bg-blue-400/10 text-blue-400 ring-blue-700/10 dark:bg-blue-400/10 dark:text-blue-400 dark:ring-blue-400/30",
                        "bg-indigo-400/10 text-indigo-400 ring-indigo-700/10 dark:bg-indigo-400/10 dark:text-indigo-400 dark:ring-indigo-400/30",
                        "bg-purple-400/10 text-purple-400 ring-purple-700/10 dark:bg-purple-400/10 dark:text-purple-400 dark:ring-purple-400/30",
                        "bg-pink-400/10 text-pink-400 ring-pink-700/10 dark:bg-pink-400/10 dark:text-pink-400 dark:ring-pink-400/20",
                      ];
                      const color = colorClasses[index % colorClasses.length]; // boucle sur la liste

                      return (
                        <Link
                          key={g.GenreID ?? g.Nom}
                          to={`/videos?genres=${encodeURIComponent(g.GenreID)}`}
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ring-1 ring-inset ${color}`}
                        >
                          {g.Nom}
                        </Link>
                      );
                    })
                  ) : (
                    <span className="text-sm text-neutral-400">Aucun genre</span>
                  )}
                </div>
              ) : (
                <div className="relative z-[80] space-y-3 dark:text-neutral-200">
                  {/* on réutilise le composant des checkboxes */}
                  <GenreList
                    genres={allGenres}
                    selectedGenres={selectedGenres}
                    setSelectedGenres={setSelectedGenres}
                  />

                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const resp = await api.put(`/series/${series.SeriesID}/genres`, {
                          GenreIDs: selectedGenres,
                        });
                        const data = resp.data; // { ok, genres: [...] }
                        setSerieGenres(data.genres || []);
                        setIsEditingGenres(false);
                      } catch (e) {
                        console.error(e);
                        alert(e.message);
                      }
                    }}
                    className={saveButtonClass}
                  >
                    <CheckIcon className="size-5" />
                    Enregistrer
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>
      </section>
      {(realisateurCards.length > 0 || acteurCards.length > 0) && (
        <section className="container mx-auto overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
          <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
            <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Crédits</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Détails de production</h2>
          </div>
          <div className="relative p-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
            <div className="relative">
          {realisateurCards.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-lg font-black text-slate-950 dark:text-white">Réalisation (série)</h3>
              <VideoList videos={realisateurCards} />
            </div>
          )}

          {acteurCards.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-lg font-black text-slate-950 dark:text-white">Distribution (série)</h3>
              <VideoList videos={acteurCards} />
            </div>
          )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default SerieDetails;
