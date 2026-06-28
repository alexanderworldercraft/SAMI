import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PencilIcon, PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import MusicMultiSelect from "./MusicMultiSelect";
import MusicSearchableSelect from "./MusicSearchableSelect";

const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";
const dangerButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-red-300/50 bg-red-500/15 px-5 py-3 text-sm font-bold text-red-700 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200";

const emptyMusic = { MusiqueID: "", Titre: "", Premium: false };
const emptyAlbum = { AlbumID: "", Titre: "" };

const AdminMusicContentManager = ({ activeTab: forcedTab = null }) => {
  const [internalTab, setInternalTab] = useState("musiques");
  const activeTab = forcedTab || internalTab;
  const [musiques, setMusiques] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [genres, setGenres] = useState([]);
  const [musicForm, setMusicForm] = useState(emptyMusic);
  const [albumForm, setAlbumForm] = useState(emptyAlbum);
  const [genreForm, setGenreForm] = useState({ MusiqueGenreID: "", Nom: "" });
  const [musicGenreIds, setMusicGenreIds] = useState([]);
  const [musicAlbumIds, setMusicAlbumIds] = useState([]);
  const [albumGenreIds, setAlbumGenreIds] = useState([]);
  const [albumMusicIds, setAlbumMusicIds] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const sortedMusiques = useMemo(() => [...musiques].sort((a, b) => a.Titre.localeCompare(b.Titre, "fr")), [musiques]);
  const sortedAlbums = useMemo(() => [...albums].sort((a, b) => a.Titre.localeCompare(b.Titre, "fr")), [albums]);
  const sortedGenres = useMemo(() => [...genres].sort((a, b) => a.Nom.localeCompare(b.Nom, "fr")), [genres]);

  const loadData = useCallback(async () => {
    const [musiquesResponse, albumsResponse, genresResponse] = await Promise.all([
      api.get("/music/admin/musiques"),
      api.get("/music/admin/albums"),
      api.get("/music/genres"),
    ]);
    setMusiques(Array.isArray(musiquesResponse.data) ? musiquesResponse.data : []);
    setAlbums(Array.isArray(albumsResponse.data) ? albumsResponse.data : []);
    setGenres(Array.isArray(genresResponse.data) ? genresResponse.data : []);
  }, []);

  useEffect(() => {
    loadData().catch((err) => {
      console.error("Erreur chargement admin musique :", err);
      setError("Impossible de charger les contenus musicaux.");
    });
  }, [loadData]);

  const resetFeedback = () => {
    setMessage("");
    setError("");
  };

  const selectMusic = (id) => {
    const item = musiques.find((music) => music.MusiqueID === Number(id));
    setMusicForm(item ? { MusiqueID: item.MusiqueID, Titre: item.Titre, Premium: Boolean(item.Premium) } : emptyMusic);
    setMusicGenreIds(item?.Genres?.map((genre) => genre.MusiqueGenreID) || []);
    setMusicAlbumIds(item?.Albums?.map((album) => album.AlbumID) || []);
    resetFeedback();
  };

  const selectAlbum = (id) => {
    const item = albums.find((album) => album.AlbumID === Number(id));
    setAlbumForm(item ? { AlbumID: item.AlbumID, Titre: item.Titre } : emptyAlbum);
    setAlbumGenreIds(item?.Genres?.map((genre) => genre.MusiqueGenreID) || []);
    setAlbumMusicIds(item?.Musiques?.map((music) => music.MusiqueID) || []);
    resetFeedback();
  };

  const selectGenre = (id) => {
    const item = genres.find((genre) => genre.MusiqueGenreID === Number(id));
    setGenreForm(item ? { MusiqueGenreID: item.MusiqueGenreID, Nom: item.Nom } : { MusiqueGenreID: "", Nom: "" });
    resetFeedback();
  };

  const saveMusic = async (event) => {
    event.preventDefault();
    if (!musicForm.MusiqueID) return;
    setSaving(true);
    resetFeedback();
    try {
      await api.put(`/music/musiques/${musicForm.MusiqueID}`, {
        Titre: musicForm.Titre,
        Premium: musicForm.Premium,
        GenreIDs: JSON.stringify(musicGenreIds),
        AlbumIDs: JSON.stringify(musicAlbumIds),
      });
      await loadData();
      setMessage("Musique mise à jour.");
    } catch (err) {
      console.error("Erreur mise à jour musique :", err);
      setError(err.response?.data?.error || "Impossible de mettre à jour cette musique.");
    } finally {
      setSaving(false);
    }
  };

  const saveAlbum = async (event) => {
    event.preventDefault();
    if (!albumForm.AlbumID) return;
    setSaving(true);
    resetFeedback();
    try {
      await api.put(`/music/albums/${albumForm.AlbumID}`, {
        Titre: albumForm.Titre,
        GenreIDs: JSON.stringify(albumGenreIds),
        MusiqueIDs: JSON.stringify(albumMusicIds),
      });
      await loadData();
      setMessage("Album mis à jour.");
    } catch (err) {
      console.error("Erreur mise à jour album :", err);
      setError(err.response?.data?.error || "Impossible de mettre à jour cet album.");
    } finally {
      setSaving(false);
    }
  };

  const saveGenre = async (event) => {
    event.preventDefault();
    if (!genreForm.Nom.trim()) return;
    setSaving(true);
    resetFeedback();
    try {
      if (genreForm.MusiqueGenreID) {
        await api.put(`/music/genres/${genreForm.MusiqueGenreID}`, { Nom: genreForm.Nom.trim() });
        setMessage("Genre musical mis à jour.");
      } else {
        await api.post("/music/genres", { Nom: genreForm.Nom.trim() });
        setGenreForm({ MusiqueGenreID: "", Nom: "" });
        setMessage("Genre musical ajouté.");
      }
      await loadData();
    } catch (err) {
      console.error("Erreur sauvegarde genre musical :", err);
      setError(err.response?.data?.error || "Impossible d'enregistrer ce genre musical.");
    } finally {
      setSaving(false);
    }
  };

  const deleteCurrent = async (type) => {
    const config = {
      musique: { id: musicForm.MusiqueID, path: "musiques", label: musicForm.Titre, reset: () => setMusicForm(emptyMusic) },
      album: { id: albumForm.AlbumID, path: "albums", label: albumForm.Titre, reset: () => setAlbumForm(emptyAlbum) },
      genre: { id: genreForm.MusiqueGenreID, path: "genres", label: genreForm.Nom, reset: () => setGenreForm({ MusiqueGenreID: "", Nom: "" }) },
    }[type];
    if (!config?.id || !window.confirm(`Supprimer "${config.label}" ?`)) return;
    setSaving(true);
    resetFeedback();
    try {
      await api.delete(`/music/${config.path}/${config.id}`);
      config.reset();
      await loadData();
      setMessage(type === "genre" ? "Genre musical supprimé." : "Élément placé dans la corbeille.");
    } catch (err) {
      console.error("Erreur suppression contenu musical :", err);
      setError(err.response?.data?.error || "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  };

  const tabButtonClass = (active) =>
    `rounded-lg px-4 py-2 text-sm font-bold transition duration-200 ${active ? "bg-sky-500/20 text-sky-700 ring-1 ring-sky-300/40 dark:text-sky-200" : "text-slate-600 hover:bg-sky-500/10 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"}`;

  const sectionTitle = activeTab === "musiques" ? "Musiques" : activeTab === "albums" ? "Albums" : "Genres musicaux";

  return (
    <section className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">{sectionTitle}</h2>
        {!forcedTab && (
          <div className="mt-5 flex flex-wrap gap-2">
            {["musiques", "albums", "genres"].map((tab) => (
              <button key={tab} type="button" onClick={() => setInternalTab(tab)} className={tabButtonClass(activeTab === tab)}>
                {tab === "musiques" ? "Musiques" : tab === "albums" ? "Albums" : "Genres"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="relative px-6 py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative">
          {message && <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">{message}</div>}
          {error && <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">{error}</div>}

          {activeTab === "musiques" && (
            <form onSubmit={saveMusic} className="grid gap-5">
              <div>
                <label className={labelClass}>Musique à gérer</label>
                <MusicSearchableSelect
                  value={musicForm.MusiqueID}
                  onChange={selectMusic}
                  items={sortedMusiques}
                  idKey="MusiqueID"
                  placeholder="Sélectionner une musique..."
                  searchPlaceholder="Filtrer par titre ou ID..."
                  emptyLabel="Aucune musique trouvée"
                />
              </div>
              {musicForm.MusiqueID && (
                <>
                  <div className="grid gap-5 md:grid-cols-2">
                    <div>
                      <label className={labelClass}>Titre</label>
                      <input value={musicForm.Titre} onChange={(event) => setMusicForm((current) => ({ ...current, Titre: event.target.value }))} className={fieldClass} maxLength={100} required />
                    </div>
                    <label className="mt-8 flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-slate-200">
                      <input type="checkbox" checked={musicForm.Premium} onChange={(event) => setMusicForm((current) => ({ ...current, Premium: event.target.checked }))} className="size-4 rounded border-slate-300 accent-sky-500" />
                      Musique premium
                    </label>
                  </div>
                  <MusicMultiSelect label="Genres musicaux" items={genres} selectedIds={musicGenreIds} setSelectedIds={setMusicGenreIds} idKey="MusiqueGenreID" labelKey="Nom" />
                  <MusicMultiSelect label="Albums" items={albums} selectedIds={musicAlbumIds} setSelectedIds={setMusicAlbumIds} idKey="AlbumID" />
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <button type="button" onClick={() => deleteCurrent("musique")} disabled={saving} className={dangerButtonClass}><TrashIcon className="size-5" />Placer dans la corbeille</button>
                    <button type="submit" disabled={saving} className={buttonClass}><PencilIcon className="size-5" />Enregistrer</button>
                  </div>
                </>
              )}
            </form>
          )}

          {activeTab === "albums" && (
            <form onSubmit={saveAlbum} className="grid gap-5">
              <div>
                <label className={labelClass}>Album à gérer</label>
                <MusicSearchableSelect
                  value={albumForm.AlbumID}
                  onChange={selectAlbum}
                  items={sortedAlbums}
                  idKey="AlbumID"
                  placeholder="Sélectionner un album..."
                  searchPlaceholder="Filtrer par titre ou ID..."
                  emptyLabel="Aucun album trouvé"
                />
              </div>
              {albumForm.AlbumID && (
                <>
                  <div>
                    <label className={labelClass}>Titre</label>
                    <input value={albumForm.Titre} onChange={(event) => setAlbumForm((current) => ({ ...current, Titre: event.target.value }))} className={fieldClass} maxLength={100} required />
                  </div>
                  <MusicMultiSelect label="Genres musicaux" items={genres} selectedIds={albumGenreIds} setSelectedIds={setAlbumGenreIds} idKey="MusiqueGenreID" labelKey="Nom" />
                  <MusicMultiSelect label="Musiques" items={musiques} selectedIds={albumMusicIds} setSelectedIds={setAlbumMusicIds} idKey="MusiqueID" />
                  <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                    <button type="button" onClick={() => deleteCurrent("album")} disabled={saving} className={dangerButtonClass}><TrashIcon className="size-5" />Placer dans la corbeille</button>
                    <button type="submit" disabled={saving} className={buttonClass}><PencilIcon className="size-5" />Enregistrer</button>
                  </div>
                </>
              )}
            </form>
          )}

          {activeTab === "genres" && (
            <form onSubmit={saveGenre} className="grid gap-5">
              <div>
                <label className={labelClass}>Genre à gérer</label>
                <MusicSearchableSelect
                  value={genreForm.MusiqueGenreID}
                  onChange={selectGenre}
                  items={sortedGenres}
                  idKey="MusiqueGenreID"
                  labelKey="Nom"
                  placeholder="Créer un nouveau genre..."
                  searchPlaceholder="Filtrer par nom ou ID..."
                  emptyLabel="Aucun genre trouvé"
                />
              </div>
              <div>
                <label className={labelClass}>Nom</label>
                <input value={genreForm.Nom} onChange={(event) => setGenreForm((current) => ({ ...current, Nom: event.target.value }))} className={fieldClass} maxLength={100} required />
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button type="button" onClick={() => deleteCurrent("genre")} disabled={saving || !genreForm.MusiqueGenreID} className={dangerButtonClass}><TrashIcon className="size-5" />Supprimer</button>
                <button type="submit" disabled={saving} className={buttonClass}>{genreForm.MusiqueGenreID ? <PencilIcon className="size-5" /> : <PlusIcon className="size-5" />}{genreForm.MusiqueGenreID ? "Enregistrer" : "Ajouter"}</button>
              </div>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};

export default AdminMusicContentManager;
