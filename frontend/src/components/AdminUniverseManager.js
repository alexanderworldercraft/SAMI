import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { ArrowPathIcon, TrashIcon } from "@heroicons/react/24/outline";
import api from "../services/api";

const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";
const dangerButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-red-300/50 bg-red-500/15 px-5 py-3 text-sm font-bold text-red-700 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200";
const listboxOptionsClass = "z-[9999] max-h-72 w-[var(--button-width)] overflow-auto rounded-xl border border-sky-500/20 bg-white py-2 text-sm shadow-2xl shadow-sky-950/20 focus:outline-none dark:bg-slate-950 dark:text-slate-100";

const emptyForm = {
  Titre: "",
  Resume: "",
};

const AdminUniverseManager = () => {
  const [universes, setUniverses] = useState([]);
  const [selectedUniverse, setSelectedUniverse] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [draggedId, setDraggedId] = useState(null);

  const filteredUniverses = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return universes.filter((universe) =>
      [universe.Titre, String(universe.UniverseID)].filter(Boolean).some((value) => String(value).toLowerCase().includes(search))
    );
  }, [universes, searchTerm]);

  const selectedUniverseId = selectedUniverse?.UniverseID || "";

  const resetFeedback = () => {
    setMessage("");
    setErrorMessage("");
  };

  const resetForm = () => {
    setForm(emptyForm);
    setInitialForm(emptyForm);
    setItems([]);
  };

  const loadUniverses = useCallback(async () => {
    try {
      const response = await api.get("/universes/admin");
      setUniverses(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Erreur lors de la récupération des univers :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de récupérer les univers.");
    }
  }, []);

  const loadUniverseDetails = useCallback(async (universeId) => {
    if (!universeId) {
      resetForm();
      return;
    }

    setLoading(true);
    resetFeedback();

    try {
      const response = await api.get(`/universes/${universeId}/admin`);
      const data = response.data;
      const nextForm = {
        Titre: data.Titre || "",
        Resume: data.Resume || "",
      };
      setForm(nextForm);
      setInitialForm(nextForm);
      setItems(Array.isArray(data.Items) ? data.Items : []);
    } catch (error) {
      console.error("Erreur lors de la récupération de l'univers :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de charger cet univers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUniverses();
  }, [loadUniverses]);

  useEffect(() => {
    loadUniverseDetails(selectedUniverseId);
  }, [loadUniverseDetails, selectedUniverseId]);

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedUniverseId) return;

    const title = form.Titre.trim();
    if (!title) {
      setErrorMessage("Le titre est obligatoire.");
      return;
    }

    setSaving(true);
    resetFeedback();

    try {
      const payload = {};
      if (title !== initialForm.Titre) payload.Titre = title;
      if (form.Resume !== initialForm.Resume) payload.Resume = form.Resume;

      if (Object.keys(payload).length === 0) {
        setMessage("Aucune modification à enregistrer.");
        return;
      }

      await api.put(`/universes/${selectedUniverseId}`, payload);
      await loadUniverses();
      await loadUniverseDetails(selectedUniverseId);
      setMessage("Univers mis à jour.");
    } catch (error) {
      console.error("Erreur lors de la mise à jour de l'univers :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de mettre à jour cet univers.");
    } finally {
      setSaving(false);
    }
  };

  const persistOrder = async (nextItems) => {
    if (!selectedUniverseId) return;
    const payloadItems = nextItems.map((item, index) => ({
      UniverseItemType: item.UniverseItemType,
      UniverseSagaID: item.UniverseSagaID,
      UniverseContentID: item.UniverseContentID,
      Ordre: Number(item.Ordre) > 0 ? Number(item.Ordre) : index + 1,
    }));
    await api.put(`/universes/${selectedUniverseId}/items/order`, { items: payloadItems });
  };

  const handleOrderInput = (universeItemKey, value) => {
    setItems((current) =>
      current.map((item) =>
        item.UniverseItemKey === universeItemKey ? { ...item, Ordre: value } : item
      )
    );
  };

  const saveOrder = async () => {
    setSaving(true);
    resetFeedback();

    try {
      const normalized = [...items]
        .map((item) => ({ ...item, Ordre: Math.max(1, Number(item.Ordre) || 1) }))
        .sort((a, b) => Number(a.Ordre) - Number(b.Ordre))
        .map((item, index) => ({ ...item, Ordre: index + 1 }));
      await persistOrder(normalized);
      await loadUniverseDetails(selectedUniverseId);
      setMessage("Ordre de l'univers mis à jour.");
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de l'ordre :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de sauvegarder l'ordre.");
    } finally {
      setSaving(false);
    }
  };

  const handleDrop = async (targetId) => {
    if (!draggedId || draggedId === targetId) return;
    const current = [...items];
    const fromIndex = current.findIndex((item) => item.UniverseItemKey === draggedId);
    const toIndex = current.findIndex((item) => item.UniverseItemKey === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    const next = current.map((item, index) => ({ ...item, Ordre: index + 1 }));
    setItems(next);
    setDraggedId(null);

    try {
      await persistOrder(next);
      setMessage("Ordre de l'univers mis à jour.");
    } catch (error) {
      console.error("Erreur lors du drag and drop :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de sauvegarder l'ordre.");
      await loadUniverseDetails(selectedUniverseId);
    }
  };

  const removeItem = async (item) => {
    if (!selectedUniverseId) return;
    if (!window.confirm(`Retirer "${item.Titre}" de cet univers ?`)) return;

    setSaving(true);
    resetFeedback();

    try {
      if (item.UniverseItemType === "saga") {
        await api.delete(`/universes/${selectedUniverseId}/sagas/${item.UniverseSagaID}`);
      } else {
        await api.delete(`/universes/${selectedUniverseId}/contents/${item.UniverseContentID}`);
      }
      await loadUniverseDetails(selectedUniverseId);
      setMessage("Élément retiré de l'univers.");
    } catch (error) {
      console.error("Erreur lors du retrait de l'élément :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de retirer cet élément.");
    } finally {
      setSaving(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!pendingDelete?.UniverseID) return;

    setSaving(true);
    resetFeedback();

    try {
      await api.delete(`/universes/${pendingDelete.UniverseID}`);
      setSelectedUniverse(null);
      resetForm();
      await loadUniverses();
      setPendingDelete(null);
      setMessage("Univers placé dans la corbeille.");
    } catch (error) {
      console.error("Erreur lors de la mise en corbeille de l'univers :", error);
      setErrorMessage(error.response?.data?.error || "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Univers</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Modifie les univers et l'ordre des sagas, films et séries qui les composent.
        </p>
      </div>

      <div className="relative px-6 py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative">
          {message && <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">{message}</div>}
          {errorMessage && <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">{errorMessage}</div>}

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <label className={labelClass}>Univers à gérer</label>
              <Listbox value={selectedUniverse} onChange={setSelectedUniverse}>
                <div className="relative z-[70]">
                  <ListboxButton className={`${fieldClass} text-left`}>
                    <span className="block truncate">
                      {selectedUniverse ? `#${selectedUniverse.UniverseID} - ${selectedUniverse.Titre}` : "Choisir un univers..."}
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
                      <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
                    </span>
                  </ListboxButton>
                  <ListboxOptions anchor={{ to: "bottom start", gap: 8 }} className={listboxOptionsClass}>
                    <div className="sticky top-0 z-10 bg-white px-3 py-3 dark:bg-slate-950">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        onKeyDown={(event) => event.stopPropagation()}
                        placeholder="Rechercher un univers..."
                        className="w-full rounded-lg border border-sky-500/20 bg-slate-50 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                    {filteredUniverses.length > 0 ? (
                      filteredUniverses.map((universe) => (
                        <ListboxOption
                          key={universe.UniverseID}
                          value={universe}
                          className={({ active }) =>
                            `relative cursor-default select-none py-2.5 pl-10 pr-4 ${active ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"}`
                          }
                        >
                          {({ selected }) => (
                            <>
                              <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>{universe.Titre}</span>
                              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">#{universe.UniverseID}</span>
                              {selected && <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400"><CheckIcon className="size-5" /></span>}
                            </>
                          )}
                        </ListboxOption>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Aucun univers.</div>
                    )}
                  </ListboxOptions>
                </div>
              </Listbox>
            </div>
            <div className="flex items-end">
              <button type="button" onClick={loadUniverses} className={buttonClass}>
                <ArrowPathIcon className="size-5" />
                Actualiser
              </button>
            </div>
          </div>

          {selectedUniverse && (
            <>
              <form onSubmit={handleSave} className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label className={labelClass}>Titre</label>
                  <input value={form.Titre} onChange={(event) => setForm((current) => ({ ...current, Titre: event.target.value }))} className={fieldClass} />
                </div>
                <div>
                  <label className={labelClass}>Résumé</label>
                  <textarea rows={8} value={form.Resume} onChange={(event) => setForm((current) => ({ ...current, Resume: event.target.value }))} className={fieldClass} />
                </div>
                <div className="flex flex-wrap gap-3 md:col-span-2">
                  <button type="submit" disabled={saving || loading} className={buttonClass}>{saving ? "Enregistrement..." : "Enregistrer"}</button>
                  <button type="button" onClick={() => setPendingDelete(selectedUniverse)} disabled={saving || loading} className={dangerButtonClass}>
                    <TrashIcon className="size-5" />
                    Supprimer
                  </button>
                </div>
              </form>

              <div className="mt-8">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-xl font-black text-slate-950 dark:text-white">Ordre des éléments</h3>
                  <button type="button" onClick={saveOrder} disabled={saving || items.length === 0} className={buttonClass}>
                    Sauvegarder l'ordre
                  </button>
                </div>

                {items.length === 0 ? (
                  <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">Aucune saga, aucun film ou aucune série dans cet univers.</p>
                ) : (
                  <ul className="divide-y divide-sky-500/10 overflow-hidden rounded-xl border border-sky-500/10 bg-white/70 dark:bg-slate-950/40">
                    {items.map((item) => (
                      <li
                        key={item.UniverseItemKey}
                        draggable
                        onDragStart={() => setDraggedId(item.UniverseItemKey)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleDrop(item.UniverseItemKey)}
                        className="flex cursor-move flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center"
                      >
                        <div className="flex-1">
                          <p className="font-black text-slate-950 dark:text-white">{item.Titre}</p>
                          <p className="mt-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                            {item.type === "saga" ? `Saga #${item.SagaID}` : item.type === "series" ? `Série #${item.SeriesID}` : `Film #${item.VideoID}`}
                          </p>
                        </div>
                        <input
                          type="number"
                          min="1"
                          value={item.Ordre}
                          onChange={(event) => handleOrderInput(item.UniverseItemKey, event.target.value)}
                          className={`${fieldClass} sm:w-28`}
                          aria-label="Ordre"
                        />
                        <button type="button" onClick={() => removeItem(item)} disabled={saving} className={dangerButtonClass}>
                          Retirer
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-red-300/20 bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-white">
            <h3 className="text-xl font-black text-slate-950 dark:text-white">Mettre l'univers en corbeille</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Mettre "{pendingDelete.Titre}" dans la corbeille ? Les liaisons avec les sagas, films et séries seront conservées jusqu'à la suppression définitive.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPendingDelete(null)} disabled={saving} className="inline-flex items-center justify-center rounded-lg border border-slate-300/60 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Annuler</button>
              <button type="button" onClick={handleSoftDelete} disabled={saving} className={dangerButtonClass}>
                {saving ? "Suppression..." : "Valider la suppression"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default AdminUniverseManager;
