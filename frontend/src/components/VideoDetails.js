import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from '../services/api';
import ImageUploader from "./ImageUploader"; // ⬅️ nouveau
import VideoList from "./VideoList";
import GenreList from "./GenreList";
import FavoriteButton from "./FavoriteButton";

const apiUrl = process.env.REACT_APP_URL_LOCAL;

const VideoDetails = ({
  video,
  isAdmin = false,
  onTitleUpdate,
  onResumerUpdate,
  onImageUpdate,
  onPremiumUpdate,
  onNotify,
  isFavorite = false,
  onFavoriteChange,
}) => {
  // --- états existants
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingResumer, setIsEditingResumer] = useState(false);
  const [newTitle, setNewTitle] = useState(video.Titre);
  const [newResumer, setNewResumer] = useState(video.Resumer);

  // --- Genres
  const [isEditingGenres, setIsEditingGenres] = useState(false);  // état UI édition
  const [allGenres, setAllGenres] = useState([]);                 // tous les genres (pour checkboxes)
  const [videoGenres, setVideoGenres] = useState([]);             // [{GenreID, Nom}] affichés en badges
  const [selectedGenres, setSelectedGenres] = useState([]);       // [GenreID] pour le form


  // --- gestion image
  const [isEditingImage, setIsEditingImage] = useState(false);
  const [newImageFile, setNewImageFile] = useState(null);
  const [isSavingImage, setIsSavingImage] = useState(false);

  // --- user pour droits
  const [user, setUser] = useState(null);
  // --- Premium
  const [isPremium, setIsPremium] = useState(!!video.Premium);
  const [savingPremium, setSavingPremium] = useState(false);

  const [isSavingTitle, setIsSavingTitle] = useState(false);

  // Si la vidéo change, on synchronise
  useEffect(() => {
    setIsPremium(!!video.Premium);
  }, [video.Premium]);

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

  // ⏬ Chargement initial des genres + pré-sélection depuis la vidéo
  useEffect(() => {
    const load = async () => {
      try {
        const [allRes, videoRes] = await Promise.all([
          fetch(`${apiUrl}/api/genres`),
          fetch(`${apiUrl}/api/videos/${video.VideoID}/genres`),
        ]);

        if (!allRes.ok || !videoRes.ok) {
          throw new Error("Erreur lors du chargement des genres.");
        }

        const all = await allRes.json();
        const cur = await videoRes.json();

        setAllGenres(all);
        setVideoGenres(cur);
        setSelectedGenres(cur.map((g) => g.GenreID));
      } catch (e) {
        console.error("Erreur chargement genres vidéo:", e);
      }
    };

    if (video?.VideoID) load();
  }, [video?.VideoID]); // ✅ recharge si on change de vidéo

  // --- handlers titre / résumé (inchangé)
  const handleTitleChange = (e) => setNewTitle(e.target.value);
  const handleResumerChange = (e) => setNewResumer(e.target.value);
  const handleEditTitleClick = () => setIsEditingTitle(true);
  const handleEditResumerClick = () => setIsEditingResumer(true);

  // const handleUpdateTitleClick = async () => {
  //   if (!newTitle.trim()) return;
  //   try {
  //     await api.put(`/videos/${video.VideoID}/title`, { Titre: newTitle });
  //     onTitleUpdate?.(newTitle);
  //     setIsEditingTitle(false);
  //   } catch (error) {
  //     console.error(error);
  //     const msg =
  //       error.response?.data?.error || "Une erreur est survenue lors de la mise à jour du titre.";
  //     alert(msg);
  //   }
  // };
  const handleUpdateTitleClick = async () => {
  const trimmed = (newTitle ?? "").trim();
  if (!trimmed) return;

  // ✅ évite double click
  if (isSavingTitle) return;

  // ✅ évite un PUT inutile + évite un log inutile
  if (trimmed === (video.Titre ?? "").trim()) {
    setIsEditingTitle(false);
    return;
  }

  try {
    setIsSavingTitle(true);

    await api.put(`/videos/${video.VideoID}/title`, { Titre: trimmed });

    onTitleUpdate?.(trimmed);
    setIsEditingTitle(false);
  } catch (error) {
    console.error(error);
    const msg =
      error.response?.data?.error || "Une erreur est survenue lors de la mise à jour du titre.";
    alert(msg);
  } finally {
    setIsSavingTitle(false);
  }
};

  const handleUpdateResumerClick = async () => {
    if (!newResumer.trim()) return;
    try {
      await api.put(`/videos/${video.VideoID}/resumer`, { Resumer: newResumer });
      onResumerUpdate?.(newResumer);
      setIsEditingResumer(false);
    } catch (error) {
      console.error(error);
      const msg =
        error.response?.data?.error || "Une erreur est survenue lors de la mise à jour du résumé.";
      alert(msg);
    }
  };

  // --- handlers image
  const handleEditImageClick = () => setIsEditingImage(true);

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

      const resp = await api.put(`/videos/${video.VideoID}/image`, formData, {
        headers: {
          // pas de Content-Type manuel, axios s'en charge pour FormData
        },
      });

      const data = resp.data; // backend renvoie { CheminImage: '...' }
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
      const msg = e.response?.data?.error || e.message || "Échec de l’upload de l’image.";
      onNotify?.({ message: msg, type: "error" });
    } finally {
      setIsSavingImage(false);
    }
  };

  const toPersonCards = (arr = []) =>
    arr
      .filter(p => p.CheminImage) // on n’affiche que si on a un visuel
      .map(p => ({
        type: "person",
        id: p.PersonneID,
        Titre: [p.Prenom, p.Nom].filter(Boolean).join(" "), // "Prénom Nom"
        Surnom: p.Surnom,
        CheminImage: p.CheminImage,
        Genres: [], // inutilisé
      }));

  const realisateurCards = toPersonCards(video?.Realisateurs);
  const acteurCards = toPersonCards(video?.Acteurs);

  const canEdit = user && (user.GradeID === 1 || user.GradeID === 2);
  const imageUrl = video?.CheminImage ? `${apiUrl}/${video.CheminImage}` : null;

  const handleTogglePremium = async () => {
    if (!isAdmin) return;                    // sécurité côté front
    try {
      setSavingPremium(true);
      const newValue = !isPremium;
      const resp = await api.put(`/videos/${video.VideoID}/premium`, {
        Premium: newValue,
      });

      setIsPremium(resp.data.Premium);
      onPremiumUpdate?.(resp.data.Premium);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la mise à jour du statut premium.");
    } finally {
      setSavingPremium(false);
    }
  };

  return (
    <>
      <section className="container mx-auto overflow-visible rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
        <div className="rounded-t-2xl border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
          <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Détails</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{video.Titre}</h2>
        </div>
      <div className="relative grid gap-4 p-6 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        {/* --- Bloc visuel --- */}
        <div className="relative md:col-span-2 xl:col-span-2">
          {!isEditingImage ? (
            <div className="group relative mb-4 overflow-hidden rounded-xl border border-sky-500/20 bg-gradient-to-br from-slate-950 to-slate-900 shadow-xl shadow-sky-950/20 transition duration-300 ease-in-out">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt={video.Titre}
                  className="aspect-2/3 h-full w-full object-cover duration-300 group-hover:scale-105 dark:text-white"
                />
              ) : (
                <div className="flex aspect-2/3 w-full items-center justify-center text-neutral-400">
                  Aucun visuel
                </div>
              )}
              {canEdit && (
                <button
                  onClick={handleEditImageClick}
                  className="absolute right-2 top-2 rounded-lg border border-white/15 bg-slate-950/80 px-2 py-1 text-xs text-white backdrop-blur transition hover:border-sky-300/60 hover:bg-sky-500/20"
                  title="Modifier l'image"
                >
                  ✏️
                </button>
              )}
              <FavoriteButton
                type="video"
                id={video.VideoID}
                isFavorite={isFavorite}
                onChange={onFavoriteChange}
                size="lg"
                className="absolute left-2 top-2 z-10"
              />
            </div>
          ) : (
            <div className="mb-4">
              {/* Uploader au format affiche (200x300 par défaut) */}
              <ImageUploader setImage={setNewImageFile} />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleSaveImageClick}
                  disabled={isSavingImage || !newImageFile}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 rounded-lg dark:text-white"
                >
                  {isSavingImage ? "Enregistrement..." : "Enregistrer"}
                </button>
                <button
                  onClick={() => { setIsEditingImage(false); setNewImageFile(null); }}
                  className="px-4 py-2 bg-neutral-700 hover:bg-neutral-800 rounded-lg dark:text-white"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>

          <div className="relative z-30 md:col-span-2 xl:col-span-6">
          {/* --- Titre --- */}
          {isEditingTitle ? (
  <div className="flex items-center gap-2">
    <input
      type="text"
      value={newTitle}
      onChange={handleTitleChange}
      onKeyDown={(e) => {
        // ✅ Enter = sauvegarde, sans submit global
        if (e.key === "Enter") {
          e.preventDefault();
          handleUpdateTitleClick();
        }
        // ✅ Escape = annule
        if (e.key === "Escape") {
          e.preventDefault();
          setIsEditingTitle(false);
          setNewTitle(video.Titre);
        }
      }}
      className="text-3xl text-black font-bold italic px-2 py-1 rounded"
    />

    <button
  type="button"
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    handleUpdateTitleClick();
  }}
  disabled={isSavingTitle}
  className="text-green-500 text-2xl disabled:opacity-50"
  title="Valider"
>
  ✔️
</button>

    <button
      type="button"
      onClick={() => { setIsEditingTitle(false); setNewTitle(video.Titre); }}
      className="text-neutral-400 text-2xl"
      title="Annuler"
    >
      ✖️
    </button>
  </div>
) : (
  <div className="flex items-center gap-2">
    <h1 className="text-3xl dark:text-white underline font-bold italic mb-3">{video.Titre}</h1>
    {canEdit && (
      <button
  type="button"
  onClick={(e) => {
    e.preventDefault();
    e.stopPropagation();
    handleEditTitleClick();
  }}
  className="text-gray-400 text-2xl"
>
  ✏️
</button>
    )}
  </div>
)}

          {/* Premium */}
          {isPremium && (
            <span className="inline-flex items-center rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/60 px-2 py-0.5 text-xs font-semibold">
              Premium
            </span>
          )}

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
            <div className="flex items-center gap-2">
              <textarea
                value={newResumer}
                onChange={handleResumerChange}
                className="text-base lg:text-lg text-black px-2 py-1 rounded w-full"
              />
              <button onClick={handleUpdateResumerClick} className="text-green-500 text-2xl">✔️</button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-base lg:text-lg text-neutral-800 dark:text-neutral-200 whitespace-pre-line">{video.Resumer}</p>
              {canEdit && (
                <button onClick={handleEditResumerClick} className="text-gray-400 text-2xl">✏️</button>
              )}
            </div>
          )}
          <div>

            {/* --- Genres --- */}
            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold dark:text-white">Genres</h3>

                {canEdit && (
                  <button
                    onClick={() => setIsEditingGenres((v) => !v)}
                    className="rounded bg-white px-2 py-1 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-white/10 dark:text-white dark:shadow-none dark:ring-white/5 dark:hover:bg-white/20"
                    title={isEditingGenres ? "Annuler l’édition" : "Modifier les genres"}
                  >
                    {isEditingGenres ? "Annuler" : "Modifier"}
                  </button>
                )}
              </div>

              {/* Affichage (badges colorés) */}
              {!isEditingGenres ? (
                <div className="flex flex-wrap gap-2">
                  {videoGenres?.length ? (
                    videoGenres.map((g, index) => {
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
                // Formulaire d’édition (checkboxes + enregistrer)
                <div className="relative z-[80] max-w-lg space-y-3 dark:text-neutral-200">
                  <GenreList
                    genres={allGenres}
                    selectedGenres={selectedGenres}
                    setSelectedGenres={setSelectedGenres}
                  />

                  <button
                    onClick={async () => {
                      try {
                        const resp = await api.put(`/videos/${video.VideoID}/genres`, {
                          GenreIDs: selectedGenres,
                        });
                        const data = resp.data;
                        const genres = data.Genres || data.genres || [];
                        setVideoGenres(genres);
                        setSelectedGenres(genres.map((g) => g.GenreID));
                        setIsEditingGenres(false);
                      } catch (err) {
                        console.error(err);
                        const msg =
                          err.response?.data?.error || "Erreur lors de la sauvegarde des genres.";
                        alert(msg);
                      }
                    }}
                    className="px-3 py-2 rounded-md bg-sky-600 hover:bg-sky-700 text-white"
                  >
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
              <h3 className="mb-3 text-lg font-black text-slate-950 dark:text-white">Réalisation</h3>
              <VideoList videos={realisateurCards} />
            </div>
          )}

          {acteurCards.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-lg font-black text-slate-950 dark:text-white">Distribution</h3>
              {/* même grille que VideoListPage: les cartes s’alignent par lignes */}
              <VideoList videos={acteurCards} />
            </div>
          )}
            </div>
          </div>
        </section>
      )}
    </>
  );
};

export default VideoDetails;
