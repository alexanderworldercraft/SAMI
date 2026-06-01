// src/pages/PersonDetailsPage.js
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../services/api";
import VideoList from "./VideoList";
import PersonLinkContentForm from "../components/PersonLinkContentForm";
import ImageUploader from "./ImageUploader";


const apiUrl = process.env.REACT_APP_URL_LOCAL;

// map vidéos -> VideoList
const toVideoCards = (arr = []) =>
  (arr || []).map(v => ({
    type: "video",
    id: v.VideoID,
    Titre: v.Titre,
    CheminImage: v.CheminImage,
    Resumer: v.Resumer,
    Genres: v.Genres || [],
  }));



// map séries -> VideoList (besoin de FirstVideoID pour le href)
const toSeriesCards = (arr = []) =>
  (arr || []).map(s => ({
    type: "series",
    id: s.SeriesID,
    Titre: s.Titre,
    CheminImage: s.CheminImage,
    Resumer: s.Resumer,
    FirstVideoID: s.FirstVideoID || null,
    Genres: s.Genres || [],
  }));

export default function PersonDetailsPage() {
  const { id } = useParams();

  // --- TOUS LES HOOKS EN HAUT ---
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [data, setData] = useState(null);

  const [me, setMe] = useState(null); // utilisateur courant (pour GradeID)
  const canEdit = me && (me.GradeID === 1 || me.GradeID === 2);

  // états des listes (doivent être déclarés avant tout return)
  const [videosActeur, setVideosActeur] = useState([]);
  const [videosRealisateur, setVideosRealisateur] = useState([]);
  const [seriesActeur, setSeriesActeur] = useState([]);
  const [seriesRealisateur, setSeriesRealisateur] = useState([]);

  // --- Edition image personne
  const [isEditingImage, setIsEditingImage] = useState(false);   // toggle mode édition
  const [newImageFile, setNewImageFile] = useState(null);        // fichier sélectionné
  const [isSavingImage, setIsSavingImage] = useState(false);     // état enregistrement


  // fetch détails personne
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const { data } = await api.get(`/people/${id}`); // baseURL = .../api
        if (alive) setData(data);
      } catch (e) {
        console.error(e);
        if (alive) setErr("Impossible de charger cette personne.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  // fetch user (pour canEdit)
  useEffect(() => {
    (async () => {
      try { const { data } = await api.get("/users/me"); setMe(data); } catch { }
    })();
  }, []);

  // synchroniser les listes quand data change
  useEffect(() => {
    if (!data) {
      setVideosActeur([]);
      setVideosRealisateur([]);
      setSeriesActeur([]);
      setSeriesRealisateur([]);
      return;
    }
    setVideosActeur(toVideoCards(data.videos?.Acteur));
    setVideosRealisateur(toVideoCards(data.videos?.Realisateur));
    setSeriesActeur(toSeriesCards(data.series?.Acteur));
    setSeriesRealisateur(toSeriesCards(data.series?.Realisateur));
  }, [data]);

  const fullName = useMemo(() => {
    const p = data?.personne;
    if (!p) return "";
    const base = [p.Prenom, p.Nom].filter(Boolean).join(" ");
    return p.Surnom ? `${base} “${p.Surnom}”` : base;
  }, [data]);

  // --- après TOUS les hooks, on peut faire les returns conditionnels ---
  if (loading) return <div className="p-6 text-neutral-400">Chargement…</div>;
  if (err) return <div className="p-6 text-red-500">{err}</div>;
  if (!data?.personne) return <div className="p-6 text-neutral-400">Introuvable.</div>;

  const p = data.personne;
  // console.log("Données brutes de p:", p);

  // util: bouton “Retirer”
  const RemoveBtn = ({ onClick, label }) => (
    <button
      onClick={onClick}
      className="px-2 py-1 rounded-md text-xs font-medium bg-red-600 hover:bg-red-700 text-white shadow"
      title={label}
    >
      {label}
    </button>
  );

  // appels API unlink
  const unlink = async ({ contenuType, contenuId, EstActeur, EstRealisateur }) => {
    await api.delete(`/people/${p.PersonneID}/unlink`, {
      data: { type: contenuType, contenuId, EstActeur, EstRealisateur }
    });
  };


  console.log(videosRealisateur);



  return (
    <div className="mx-auto px-4 md:px-6 lg:px-8 py-6 space-y-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="w-full md:w-64">
          {!isEditingImage ? (
            <div className="group rounded-xl overflow-hidden border border-neutral-400 bg-gradient-to-br from-slate-950 to-slate-900 relative">
              {p.CheminImage ? (
                <img
                  src={`${apiUrl}/${p.CheminImage}`}
                  alt={fullName}
                  className="w-full h-full object-cover aspect-2/3 group-hover:scale-105 duration-300"
                />
              ) : (
                <div className="w-full h-full aspect-2/3 flex items-center justify-center text-neutral-500">
                  Pas d’image
                </div>
              )}

              {/* Bouton édition si admin/superadmin */}
              {canEdit && (
                <button
                  onClick={() => setIsEditingImage(true)}
                  className="absolute top-2 right-2 text-xs bg-neutral-900/70 border border-neutral-600 px-2 py-1 rounded-md hover:bg-neutral-900"
                  title="Modifier l'image"
                >
                  ✏️
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-400 p-2">
              {/* Uploader au ratio affiche (200x300) — même composant que vidéos/séries */}
              <ImageUploader setImage={setNewImageFile} />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={async () => {
                    if (!newImageFile) return;
                    try {
                      setIsSavingImage(true);
                      const formData = new FormData();
                      formData.append("image", newImageFile);

                      // Appel REST: PUT /api/people/:id/photo
                      const resp = await fetch(`${apiUrl}/api/people/${p.PersonneID}/photo`, {
                        method: "PUT",
                        body: formData,
                      });
                      if (!resp.ok) {
                        const err = await resp.json().catch(() => ({}));
                        throw new Error(err?.error || "Échec de l’upload de l’image.");
                      }
                      const json = await resp.json(); // { CheminImage: 'uploads/images/people/...' }

                      // MAJ de l’état local pour refléter la nouvelle image
                      setData((prev) => prev
                        ? { ...prev, personne: { ...prev.personne, CheminImage: json.CheminImage } }
                        : prev
                      );

                      setIsEditingImage(false);
                      setNewImageFile(null);
                    } catch (e) {
                      console.error(e);
                      alert(e.message);
                    } finally {
                      setIsSavingImage(false);
                    }
                  }}
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

        <div className="flex-1">
          <h1 className="text-3xl font-bold dark:text-white">{fullName}</h1>
          <div className="mt-2 text-sm text-neutral-400">
            Créé le {new Date(p.CreateDate).toLocaleDateString()}
          </div>

          {/* Form admin: lier un contenu */}
          <PersonLinkContentForm personId={p.PersonneID} onLinked={() => window.location.reload()} />
        </div>
      </div>

      {/* ŒUVRES — Réalisation d’abord (films puis séries) */}
      {videosRealisateur.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold dark:text-white mb-3">Réalisation — Films</h2>
          <VideoList
            videos={videosRealisateur}
            overlayActions={canEdit ? (item) => (
              <RemoveBtn
                label="Retirer réal."
                onClick={async () => {
                  try {
                    await unlink({ contenuType: "video", contenuId: item.id, EstActeur: false, EstRealisateur: true });
                    setVideosRealisateur(arr => arr.filter(x => x.id !== item.id));
                  } catch (e) { console.error(e); }
                }}
              />
            ) : undefined}
          />
        </section>
      )}

      {seriesRealisateur.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold dark:text-white mb-3">Réalisation — Séries</h2>
          <VideoList
            videos={seriesRealisateur}
            overlayActions={canEdit ? (item) => (
              <RemoveBtn
                label="Retirer réal."
                onClick={async () => {
                  try {
                    await unlink({ contenuType: "series", contenuId: item.id, EstActeur: false, EstRealisateur: true });
                    setSeriesRealisateur(arr => arr.filter(x => x.id !== item.id));
                  } catch (e) { console.error(e); }
                }}
              />
            ) : undefined}
          />
        </section>
      )}

      {/* Puis l’acting */}
      {videosActeur.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold dark:text-white mb-3">Distribution — Films</h2>
          <VideoList
            videos={videosActeur}
            overlayActions={canEdit ? (item) => (
              <RemoveBtn
                label="Retirer acteur"
                onClick={async () => {
                  try {
                    await unlink({ contenuType: "video", contenuId: item.id, EstActeur: true, EstRealisateur: false });
                    setVideosActeur(arr => arr.filter(x => x.id !== item.id));
                  } catch (e) { console.error(e); }
                }}
              />
            ) : undefined}
          />
        </section>
      )}

      {seriesActeur.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold dark:text-white mb-3">Distribution — Séries</h2>
          <VideoList
            videos={seriesActeur}
            overlayActions={canEdit ? (item) => (
              <RemoveBtn
                label="Retirer acteur"
                onClick={async () => {
                  try {
                    await unlink({ contenuType: "series", contenuId: item.id, EstActeur: true, EstRealisateur: false });
                    setSeriesActeur(arr => arr.filter(x => x.id !== item.id));
                  } catch (e) { console.error(e); }
                }}
              />
            ) : undefined}
          />
        </section>
      )}

      {/* Vide total */}
      {videosRealisateur.length === 0 &&
        seriesRealisateur.length === 0 &&
        videosActeur.length === 0 &&
        seriesActeur.length === 0 && (
          <div className="text-neutral-400 italic">Aucun contenu lié pour le moment.</div>
        )}
    </div>
  );
}
