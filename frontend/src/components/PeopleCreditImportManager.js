import React, { useEffect, useMemo, useState } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/16/solid";
import api from "../services/api";
import Notification from "./Notification";
import { buildSagaContentItems } from "./SagaContentManager";

const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200";
const submitClass = "inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";
const listboxOptionsClass = "z-[9999] max-h-72 w-[var(--button-width)] overflow-auto rounded-xl border border-sky-500/20 bg-white py-2 text-sm shadow-2xl shadow-sky-950/20 focus:outline-none dark:bg-slate-950 dark:text-slate-100";

const imageStatusLabels = {
  imported: "Photo ajoutée",
  existing: "Photo déjà présente",
  "already-has-image": "Photo déjà présente",
  "not-found": "Personne non trouvée sur Wikimedia",
  "no-image": "Aucune photo exploitable",
  ambiguous: "Identité ambiguë, aucune photo ajoutée",
  error: "Recherche de photo en erreur",
};

const relationStatusLabels = {
  created: "Lien créé",
  updated: "Rôle ajouté",
  unchanged: "Lien déjà présent",
};

export default function PeopleCreditImportManager() {
  const [videos, setVideos] = useState([]);
  const [series, setSeries] = useState([]);
  const [selectedContent, setSelectedContent] = useState(null);
  const [contentSearch, setContentSearch] = useState("");
  const [role, setRole] = useState("actor");
  const [names, setNames] = useState("");
  const [loadingContents, setLoadingContents] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);
  const [result, setResult] = useState(null);

  const contents = useMemo(() => buildSagaContentItems(videos, series), [series, videos]);
  const filteredContents = useMemo(() => {
    const search = contentSearch.trim().toLowerCase();
    if (!search) return contents;
    return contents.filter((item) =>
      [item.label, item.meta, String(item.id)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [contentSearch, contents]);

  useEffect(() => {
    const loadContents = async () => {
      setLoadingContents(true);
      try {
        const [videoResponse, seriesResponse] = await Promise.all([
          api.get("/videos/admin"),
          api.get("/series"),
        ]);
        setVideos(Array.isArray(videoResponse.data) ? videoResponse.data : []);
        setSeries(Array.isArray(seriesResponse.data) ? seriesResponse.data : []);
      } catch (error) {
        console.error("Erreur lors du chargement des contenus pour l'import de personnes :", error);
        setNotification({
          message: "Impossible de charger les films et les séries.",
          icon: "⚠️",
          type: "error",
        });
      } finally {
        setLoadingContents(false);
      }
    };
    loadContents();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedContent?.id || !names.trim()) {
      setNotification({
        message: "Sélectionne un contenu et ajoute au moins une personne.",
        icon: "⚠️",
        type: "error",
      });
      return;
    }

    setSaving(true);
    setResult(null);
    try {
      const response = await api.post("/people/bulk-link", {
        type: selectedContent.type,
        contenuId: Number(selectedContent.id),
        role,
        names,
      });
      setResult(response.data);
      setNames("");
      const imageUnavailable = response.data?.imageSearch?.status === "unavailable";
      setNotification({
        message: imageUnavailable
          ? "Personnes liées, mais la recherche de photos n'a pas pu démarrer."
          : "Personnes vérifiées, liées et photos recherchées.",
        icon: imageUnavailable ? "⚠️" : "✅",
        type: imageUnavailable ? "error" : "success",
      });
    } catch (error) {
      console.error("Erreur lors de l'import des personnes :", error);
      setNotification({
        message: error.response?.data?.error || "Impossible d'importer cette liste de personnes.",
        icon: "⚠️",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const imageResults = new Map(
    (result?.imageSearch?.results ?? []).map((item) => [item.PersonneID, item]),
  );

  return (
    <section className="relative overflow-visible rounded-2xl border border-sky-500/10 bg-white/70 p-6 shadow-sm dark:bg-slate-950/40 dark:text-neutral-100">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.08),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.06),transparent_22%)]" />
      <div className="relative z-10">
        {notification && (
          <Notification
            message={notification.message}
            type={notification.type}
            icon={notification.icon}
            duration={6000}
            onClose={() => setNotification(null)}
          />
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Personnes</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Import semi-automatique</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Les personnes déjà présentes sont réutilisées. Les autres sont créées, liées au contenu, puis leur photo est recherchée prudemment sur Wikimedia.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div>
              <label className={labelClass}>Film ou série</label>
              <Listbox value={selectedContent} onChange={setSelectedContent}>
                <div className="relative z-[70]">
                  <ListboxButton className={`${fieldClass} text-left`}>
                    <span className="block truncate">
                      {selectedContent ? selectedContent.label : "Choisir un film ou une série..."}
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                      <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
                    </span>
                  </ListboxButton>
                  <ListboxOptions anchor={{ to: "bottom start", gap: 8 }} className={listboxOptionsClass}>
                    <div className="sticky top-0 z-10 bg-white px-3 py-3 dark:bg-slate-950">
                      <input
                        type="text"
                        value={contentSearch}
                        onChange={(event) => setContentSearch(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        placeholder="Rechercher un film ou une série..."
                        className="w-full rounded-lg border border-sky-500/20 bg-slate-50 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                    {loadingContents ? (
                      <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Chargement...</div>
                    ) : filteredContents.length > 0 ? filteredContents.map((item) => (
                      <ListboxOption
                        key={item.key}
                        value={item}
                        className={({ active }) => `relative cursor-default select-none py-2.5 pl-10 pr-4 ${active ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"}`}
                      >
                        {({ selected }) => (
                          <>
                            <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>{item.label}</span>
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{item.meta}</span>
                            {selected && <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400"><CheckIcon className="size-5" /></span>}
                          </>
                        )}
                      </ListboxOption>
                    )) : (
                      <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Aucun contenu trouvé.</div>
                    )}
                  </ListboxOptions>
                </div>
              </Listbox>
            </div>

            <div>
              <span className={labelClass}>Type de personnes</span>
              <div className="grid grid-cols-2 rounded-xl border border-sky-500/20 bg-slate-950/5 p-1 dark:bg-slate-950/55">
                {[
                  { id: "actor", label: "Acteurs" },
                  { id: "director", label: "Réalisateurs" },
                ].map((option) => {
                  const selected = role === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setRole(option.id)}
                      className={`rounded-lg px-4 py-2.5 text-sm font-bold transition ${selected ? "bg-sky-500/20 text-sky-800 shadow-sm dark:text-sky-200" : "text-slate-500 hover:text-sky-700 dark:text-slate-400 dark:hover:text-sky-300"}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-5">
            <label htmlFor="people-credit-names" className={labelClass}>Liste des personnes</label>
            <textarea
              id="people-credit-names"
              value={names}
              onChange={(event) => setNames(event.target.value)}
              rows={5}
              className={fieldClass}
              placeholder="Tom Hanks | Catherine Zeta-Jones | Stanley Tucci | Chi McBride"
            />
            <p className="mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              Sépare chaque nom avec |. Les retours à la ligne sont également acceptés. Maximum 50 personnes par import.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving || loadingContents || !selectedContent || !names.trim()}
            className={`${submitClass} mt-5`}
          >
            {saving ? "Vérification et recherche des photos..." : "Vérifier, créer et lier"}
          </button>
        </form>

        {result && (
          <div className="mt-7 border-t border-sky-500/10 pt-6">
            <h4 className="text-lg font-black text-slate-950 dark:text-white">Bilan de l'import</h4>
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                ["Personnes traitées", result.summary?.requested ?? 0],
                ["Personnes créées", result.summary?.peopleCreated ?? 0],
                ["Liens créés", result.summary?.linksCreated ?? 0],
                ["Rôles complétés", result.summary?.linksUpdated ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-sky-500/10 bg-white/60 px-4 py-3 dark:bg-slate-950/45">
                  <p className="text-2xl font-black text-sky-700 dark:text-sky-300">{value}</p>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
                </div>
              ))}
            </div>

            <ul className="mt-4 divide-y divide-sky-500/10 overflow-hidden rounded-xl border border-sky-500/10 bg-white/60 dark:bg-slate-950/45">
              {result.results?.map((person) => {
                const imageResult = imageResults.get(person.PersonneID);
                return (
                  <li key={person.PersonneID} className="flex flex-col gap-1 px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white">{person.name} <span className="text-xs text-slate-400">#{person.PersonneID}</span></p>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {person.personStatus === "created" ? "Personne créée" : "Personne existante"} · {relationStatusLabels[person.linkStatus]}
                      </p>
                    </div>
                    <p className={`text-xs font-bold ${["imported", "existing", "already-has-image"].includes(imageResult?.status) ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300"}`}>
                      {imageStatusLabels[imageResult?.status] || "Photo non traitée"}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
