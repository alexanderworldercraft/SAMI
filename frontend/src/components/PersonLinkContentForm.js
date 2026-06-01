// src/components/PersonLinkContentForm.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import { Listbox, ListboxButton, ListboxOptions, ListboxOption } from "@headlessui/react";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { CheckIcon } from "@heroicons/react/20/solid";

/**
 * Lier un contenu (film/épisode OU série) à une personne.
 * - Dropdown HeadlessUI + barre de recherche (filtrage FRONT, comme SeriesAndSeasonSelector)
 * - Précharge les listes à l’ouverture du menu (ou après changement de type)
 *
 * Props
 *  - personId: number
 *  - onLinked?: (payload) => void
 */
export default function PersonLinkContentForm({ personId, onLinked }) {
  // ---------------- Hooks (jamais conditionnels)
  const [user, setUser] = useState(null);

  // Sélection du type à chercher
  const [type, setType] = useState("video"); // "video" | "series"

  // Données chargées
  const [videos, setVideos] = useState([]); // [{id, titre, image}]
  const [series, setSeries] = useState([]); // [{id, titre, image}]

  // UI dropdown + recherche
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [fetching, setFetching] = useState(false);
  const dropdownRef = useRef(null);

  // Sélection finale
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedTitle, setSelectedTitle] = useState("");

  // Rôles
  const [EstActeur, setEstActeur] = useState(true);
  const [EstRealisateur, setEstRealisateur] = useState(false);

  // Soumission
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // --------- Auth/Grade
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/users/me");
        setUser(data);
      } catch {
        setUser(null);
      }
    })();
  }, []);
  const canEdit = user && (user.GradeID === 1 || user.GradeID === 2);

  // --------- Fermer dropdown si clic hors zone
  useEffect(() => {
    const onClickOutside = (e) => {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [isOpen]);

  // --------- Préchargement listes lors de l’ouverture / changement de type
  useEffect(() => {
    const loadLists = async () => {
      try {
        setFetching(true);

        if (type === "video" && videos.length === 0) {
          // ⚠️ /api/videos renvoie { items, totalItems, totalPages }
          //    items contient à la fois des séries et des vidéos (type: "series" | "video")
          const resp = await fetch(`${process.env.REACT_APP_URL_LOCAL}/api/videos`);
          const payload = await resp.json();
          const items = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.items)
            ? payload.items
            : [];

          // On ne garde que les FILMS/VIDEOS (type === "video")
          const onlyVideos = items
            .filter((x) => x?.type === "video")
            .map((v) => ({
              id: v.id ?? v.VideoID,          // l’API formate déjà en id
              titre: v.Titre,
              image: v.CheminImage || null,
            }));

          setVideos(onlyVideos);
        }

        if (type === "series" && series.length === 0) {
          // /api/series renvoie un tableau simple de séries
          const resp = await fetch(`${process.env.REACT_APP_URL_LOCAL}/api/series`);
          const data = await resp.json();
          const mapped = (Array.isArray(data) ? data : []).map((s) => ({
            id: s.SeriesID,
            titre: s.Titre,
            image: s.CheminImage || null,
          }));
          setSeries(mapped);
        }
      } catch (e) {
        console.error("Erreur de chargement (videos/series):", e);
      } finally {
        setFetching(false);
      }
    };

    if (isOpen) {
      loadLists();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, type]);

// 🔎 Recherche côté serveur (endpoint dédié) pour FILMS
useEffect(() => {
  let timer;
  if (type === "video") {
    const q = searchTerm.trim();
    timer = setTimeout(async () => {
      try {
        const url = `${process.env.REACT_APP_URL_LOCAL}/api/videos/search?q=${encodeURIComponent(q)}&limit=120`;
        const resp = await fetch(url);
        const data = await resp.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        setVideos(items); // items = [{id, titre, image}]
      } catch (e) {
        console.error("Erreur quickSearchVideos:", e);
      }
    }, 250);
  }
  return () => clearTimeout(timer);
}, [type, searchTerm]);



  // --------- Source + filtrage local (comme ton SeriesAndSeasonSelector)
  const source = type === "video" ? videos : series;
  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return source;
    return source.filter((x) => (x.titre || "").toLowerCase().includes(q));
  }, [source, searchTerm]);

  // --------- Sélection / reset
  const onPick = (item) => {
    setSelectedItem(item);
    setSelectedId(item?.id || null);
    setSelectedTitle(item?.titre || "");
    setIsOpen(false);
  };

  const handleChangeType = (t) => {
    setType(t);
    setSelectedItem(null);
    setSelectedId(null);
    setSelectedTitle("");
    setSearchTerm("");
  };

  // --------- Validation + submit
  const valid = !!selectedId && (EstActeur || EstRealisateur);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!valid) {
      setMsg({ type: "error", text: "Choisis un contenu et au moins un rôle." });
      return;
    }
    try {
      setLoading(true);
      setMsg(null);
      await api.post(`/people/${personId}/link`, {
        type,                  // "video" | "series"
        contenuId: selectedId, // ID choisi
        EstActeur,
        EstRealisateur,
      });
      setMsg({ type: "success", text: "Lien créé." });
      if (onLinked) onLinked({ type, contenuId: selectedId, EstActeur, EstRealisateur });
    } catch (e) {
      console.error(e);
      setMsg({ type: "error", text: "Échec de la liaison." });
    } finally {
      setLoading(false);
    }
  };

  // --------- Rendu
  if (!canEdit) return null;

  return (
    <div className="p-4 rounded-xl border border-neutral-700 bg-blue-50 dark:bg-gradient-to-br from-slate-950 to-slate-900 dark:text-white">
      <h3 className="text-lg font-semibold mb-3">Lier un film/série à cette personne</h3>

      {msg && (
        <div className={`mb-3 text-sm ${msg.type === "success" ? "text-green-500" : "text-red-500"}`}>
          {msg.text}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4" ref={dropdownRef}>
        {/* Type de contenu */}
        <div className="flex items-center gap-2">
          <label className="text-sm">Type :</label>
          <select
            value={type}
            onChange={(e) => handleChangeType(e.target.value)}
            className="px-3 py-2 rounded bg-white dark:bg-neutral-900 dark:text-neutral-100 ring-1 ring-neutral-700 focus:outline-none focus:ring-sky-600"
          >
            <option value="video">Vidéo (film/épisode)</option>
            <option value="series">Série</option>
          </select>
        </div>

        {/* Dropdown HeadlessUI + barre de recherche */}
        <div>
          <label className="block text-sm/6 font-medium">
            {type === "video" ? "Film/épisode" : "Série"}
          </label>

          <Listbox value={selectedItem} onChange={onPick}>
            <div className="relative">
              <ListboxButton
                onClick={() => setIsOpen((v) => !v)}
                className="w-full cursor-default rounded-md bg-neutral-900/50 py-1.5 pl-3 pr-10 text-left text-neutral-200 shadow-sm ring-1 ring-inset ring-neutral-200/50 focus:outline-none focus:ring-2 focus:ring-sky-600 sm:text-sm"
              >
                <span className="block truncate">
                  {selectedTitle ||
                    (type === "video"
                      ? "Sélectionner un film/épisode..."
                      : "Sélectionner une série...")}
                </span>
                <span className="absolute inset-y-0 right-0 flex items-center pr-2">
                  <ChevronUpDownIcon className="h-5 w-5 text-neutral-400" aria-hidden="true" />
                </span>
              </ListboxButton>

              {isOpen && (
                <ListboxOptions className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-neutral-900 py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm space-y-1">
                  {/* Barre de recherche */}
                  <div className="px-3 pb-1">
                    <input
                      type="text"
                      placeholder="Filtrer par titre..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-md bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-100 ring-1 ring-neutral-700 placeholder:text-neutral-500 focus:ring-sky-500 focus:outline-none text-sm"
                    />
                  </div>

                  {fetching ? (
                    <div className="px-4 py-2 text-neutral-500 italic">Chargement…</div>
                  ) : filtered.length > 0 ? (
                    filtered.map((item) => (
                      <ListboxOption
                        key={`${type}-${item.id}`}
                        value={item}
                        className={({ active }) =>
                          `relative cursor-default select-none py-2 pl-10 pr-4 ${
                            active ? "bg-sky-600 text-white" : "dark:text-neutral-200"
                          }`
                        }
                      >
                        {({ selected }) => (
                          <>
                            <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>
                              {item.titre}
                            </span>
                            {selected && (
                              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400">
                                <CheckIcon className="h-5 w-5" aria-hidden="true" />
                              </span>
                            )}
                          </>
                        )}
                      </ListboxOption>
                    ))
                  ) : (
                    <div className="px-4 py-2 text-neutral-500 italic">
                      {searchTerm.trim() ? "Aucun résultat" : "Aucun élément"}
                    </div>
                  )}
                </ListboxOptions>
              )}
            </div>
          </Listbox>
        </div>

        {/* Rôles */}
        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={EstActeur} onChange={(e) => setEstActeur(e.target.checked)} />
            Acteur
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={EstRealisateur} onChange={(e) => setEstRealisateur(e.target.checked)} />
            Réalisateur
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={!valid || loading}
          className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 dark:text-white"
        >
          {loading ? "Enregistrement…" : "Lier"}
        </button>
      </form>
    </div>
  );
}
