import React, { useCallback, useEffect, useState } from "react";
import { MusicalNoteIcon, RectangleStackIcon, TagIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import MusicMultiSelect from "./MusicMultiSelect";

const tabs = [
  { id: "musique", name: "Musique", icon: MusicalNoteIcon },
  { id: "album", name: "Album", icon: RectangleStackIcon },
  { id: "genres", name: "Genres", icon: TagIcon },
];

const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200";
const buttonClass = "inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";

const classNames = (...classes) => classes.filter(Boolean).join(" ");

const Feedback = ({ message, error }) => (
  <>
    {message && <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">{message}</div>}
    {error && <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">{error}</div>}
  </>
);

const FormNewMusicPage = () => {
  const [currentTabId, setCurrentTabId] = useState("musique");
  const [genres, setGenres] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [musiques, setMusiques] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [musicForm, setMusicForm] = useState({ Titre: "", Premium: false });
  const [musicAudio, setMusicAudio] = useState(null);
  const [musicImage, setMusicImage] = useState(null);
  const [musicGenreIds, setMusicGenreIds] = useState([]);
  const [musicAlbumIds, setMusicAlbumIds] = useState([]);

  const [albumTitle, setAlbumTitle] = useState("");
  const [albumImage, setAlbumImage] = useState(null);
  const [albumGenreIds, setAlbumGenreIds] = useState([]);
  const [albumMusicIds, setAlbumMusicIds] = useState([]);

  const [genreName, setGenreName] = useState("");

  const loadData = useCallback(async () => {
    const [genresResponse, albumsResponse, musiquesResponse] = await Promise.all([
      api.get("/music/genres"),
      api.get("/music/albums"),
      api.get("/music/musiques"),
    ]);
    setGenres(Array.isArray(genresResponse.data) ? genresResponse.data : []);
    setAlbums(Array.isArray(albumsResponse.data) ? albumsResponse.data : []);
    setMusiques(Array.isArray(musiquesResponse.data) ? musiquesResponse.data : []);
  }, []);

  useEffect(() => {
    loadData().catch((err) => {
      console.error("Erreur lors du chargement musique :", err);
      setError("Impossible de charger les données musicales.");
    });
  }, [loadData]);

  const resetFeedback = () => {
    setMessage("");
    setError("");
  };

  const handleCreateMusic = async (event) => {
    event.preventDefault();
    resetFeedback();
    if (!musicForm.Titre.trim()) return setError("Le titre de la musique est obligatoire.");
    if (!musicAudio) return setError("Ajoute un fichier audio.");

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("Titre", musicForm.Titre.trim());
      formData.append("Premium", String(musicForm.Premium));
      formData.append("GenreIDs", JSON.stringify(musicGenreIds));
      formData.append("AlbumIDs", JSON.stringify(musicAlbumIds));
      if (musicAudio) formData.append("audio", musicAudio);
      if (musicImage) formData.append("image", musicImage);
      await api.post("/music/musiques", formData);
      setMusicForm({ Titre: "", Premium: false });
      setMusicAudio(null);
      setMusicImage(null);
      setMusicGenreIds([]);
      setMusicAlbumIds([]);
      await loadData();
      setMessage("Musique ajoutée.");
    } catch (err) {
      console.error("Erreur ajout musique :", err);
      setError(err.response?.data?.error || "Impossible d'ajouter cette musique.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAlbum = async (event) => {
    event.preventDefault();
    resetFeedback();
    if (!albumTitle.trim()) return setError("Le titre de l'album est obligatoire.");

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("Titre", albumTitle.trim());
      formData.append("GenreIDs", JSON.stringify(albumGenreIds));
      formData.append("MusiqueIDs", JSON.stringify(albumMusicIds));
      if (albumImage) formData.append("image", albumImage);
      await api.post("/music/albums", formData);
      setAlbumTitle("");
      setAlbumImage(null);
      setAlbumGenreIds([]);
      setAlbumMusicIds([]);
      await loadData();
      setMessage("Album ajouté.");
    } catch (err) {
      console.error("Erreur ajout album :", err);
      setError(err.response?.data?.error || "Impossible d'ajouter cet album.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateGenre = async (event) => {
    event.preventDefault();
    resetFeedback();
    if (!genreName.trim()) return;
    setSaving(true);
    try {
      await api.post("/music/genres", { Nom: genreName.trim() });
      setGenreName("");
      await loadData();
      setMessage("Genre musical ajouté.");
    } catch (err) {
      console.error("Erreur ajout genre musical :", err);
      setError(err.response?.data?.error || "Impossible d'ajouter ce genre musical.");
    } finally {
      setSaving(false);
    }
  };

  const renderContent = () => {
    if (currentTabId === "album") {
      return (
        <form onSubmit={handleCreateAlbum} className="grid gap-5">
          <div>
            <label className={labelClass}>Titre de l'album</label>
            <input value={albumTitle} onChange={(event) => setAlbumTitle(event.target.value)} className={fieldClass} maxLength={100} required />
          </div>
          <div>
            <label className={labelClass}>Image</label>
            <input type="file" accept="image/*" onChange={(event) => setAlbumImage(event.target.files?.[0] || null)} className={fieldClass} />
          </div>
          <MusicMultiSelect
            label="Genres musicaux"
            items={genres}
            selectedIds={albumGenreIds}
            setSelectedIds={setAlbumGenreIds}
            idKey="MusiqueGenreID"
            labelKey="Nom"
            placeholder="Rechercher un genre musical..."
            searchPlaceholder="Rechercher un genre musical..."
            emptyLabel="Aucun genre musical trouvé"
          />
          <MusicMultiSelect
            label="Musiques de l'album"
            items={musiques}
            selectedIds={albumMusicIds}
            setSelectedIds={setAlbumMusicIds}
            idKey="MusiqueID"
            placeholder="Rechercher une musique..."
            searchPlaceholder="Rechercher une musique..."
            emptyLabel="Aucune musique trouvée"
          />
          <button type="submit" disabled={saving} className={buttonClass}>{saving ? "Ajout..." : "Ajouter l'album"}</button>
        </form>
      );
    }

    if (currentTabId === "genres") {
      return (
        <form onSubmit={handleCreateGenre} className="grid gap-5">
          <div>
            <label className={labelClass}>Nom du genre musical</label>
            <input value={genreName} onChange={(event) => setGenreName(event.target.value)} className={fieldClass} maxLength={100} required />
          </div>
          <button type="submit" disabled={saving} className={buttonClass}>{saving ? "Ajout..." : "Ajouter le genre"}</button>
        </form>
      );
    }

    return (
      <form onSubmit={handleCreateMusic} className="grid gap-5">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className={labelClass}>Titre de la musique</label>
            <input value={musicForm.Titre} onChange={(event) => setMusicForm((current) => ({ ...current, Titre: event.target.value }))} className={fieldClass} maxLength={100} required />
          </div>
          <label className="mt-8 flex items-center gap-3 text-sm font-bold text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={musicForm.Premium} onChange={(event) => setMusicForm((current) => ({ ...current, Premium: event.target.checked }))} className="size-4 rounded border-slate-300 accent-sky-500" />
            Musique premium
          </label>
        </div>
        <div>
          <label className={labelClass}>Fichier audio</label>
          <input type="file" accept="audio/*" onChange={(event) => setMusicAudio(event.target.files?.[0] || null)} className={fieldClass} required />
        </div>
        <div>
          <label className={labelClass}>Image</label>
          <input type="file" accept="image/*" onChange={(event) => setMusicImage(event.target.files?.[0] || null)} className={fieldClass} />
        </div>
        <MusicMultiSelect
          label="Genres musicaux"
          items={genres}
          selectedIds={musicGenreIds}
          setSelectedIds={setMusicGenreIds}
          idKey="MusiqueGenreID"
          labelKey="Nom"
          placeholder="Rechercher un genre musical..."
          searchPlaceholder="Rechercher un genre musical..."
          emptyLabel="Aucun genre musical trouvé"
        />
        <MusicMultiSelect
          label="Albums"
          items={albums}
          selectedIds={musicAlbumIds}
          setSelectedIds={setMusicAlbumIds}
          idKey="AlbumID"
          placeholder="Rechercher un album..."
          searchPlaceholder="Rechercher un album..."
          emptyLabel="Aucun album trouvé"
        />
        <button type="submit" disabled={saving} className={buttonClass}>{saving ? "Ajout..." : "Ajouter la musique"}</button>
      </form>
    );
  };

  return (
    <main className="container mx-auto flex grow flex-col px-4 py-10 sm:px-6 lg:px-8">
      <div className="relative overflow-visible rounded-2xl border border-sky-500/10 bg-white/80 p-6 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.12),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.10),transparent_22%)]" />
        <div className="relative">
          <div className="rounded-xl border border-sky-500/10 bg-slate-950/5 p-1 dark:bg-slate-950/40">
            <nav aria-label="Tabs" className="flex gap-2 overflow-x-auto">
              {tabs.map((tab) => {
                const isCurrent = tab.id === currentTabId;
                return (
                  <button key={tab.id} type="button" onClick={() => setCurrentTabId(tab.id)} className={classNames(isCurrent ? "border-sky-300/60 bg-gradient-to-r from-sky-500/25 via-blue-500/15 to-transparent text-sky-800 dark:text-white" : "border-transparent text-slate-600 hover:border-sky-400/40 hover:bg-sky-500/10 hover:text-sky-700 dark:text-slate-300 dark:hover:text-white", "group inline-flex shrink-0 items-center rounded-xl border px-4 py-2.5 text-sm font-bold transition duration-200")}>
                    <tab.icon className="mr-2 size-5" />
                    {tab.name}
                  </button>
                );
              })}
            </nav>
          </div>
          <section className="relative mt-6 overflow-visible rounded-2xl border border-sky-500/10 bg-white/70 p-6 shadow-sm dark:bg-slate-950/40 dark:text-neutral-100">
            <Feedback message={message} error={error} />
            {renderContent()}
          </section>
        </div>
      </div>
    </main>
  );
};

export default FormNewMusicPage;
