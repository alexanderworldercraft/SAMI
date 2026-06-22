import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/16/solid";
import { ArrowPathIcon, TrashIcon } from "@heroicons/react/24/outline";
import api from "../services/api";

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
};

const contentLabel = (item) => {
  if (!item) return "";
  if (item.type === "series") return `${item.Titre} (série)`;
  return item.Titre;
};

const AdminSagaManager = () => {
  const [sagas, setSagas] = useState([]);
  const [selectedSaga, setSelectedSaga] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [contents, setContents] = useState([]);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const fileInputRef = useRef(null);

  const filteredSagas = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return sagas.filter((saga) =>
      [saga.Titre, String(saga.SagaID)].filter(Boolean).some((value) => String(value).toLowerCase().includes(search))
    );
  }, [sagas, searchTerm]);

  const selectedSagaId = selectedSaga?.SagaID || "";

  const imageSrc = imagePreview || (form.CheminImage ? `${apiUrl}/${form.CheminImage}` : "");

  const resetFeedback = () => {
    setMessage("");
    setErrorMessage("");
  };

  const resetForm = () => {
    setForm(emptyForm);
    setInitialForm(emptyForm);
    setContents([]);
    setImageFile(null);
    setImagePreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const loadSagas = useCallback(async () => {
    try {
      const response = await api.get("/sagas/admin");
      setSagas(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Erreur lors de la récupération des sagas :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de récupérer les sagas.");
    }
  }, []);

  const loadSagaDetails = useCallback(async (sagaId) => {
    if (!sagaId) {
      resetForm();
      return;
    }

    setLoading(true);
    resetFeedback();

    try {
      const response = await api.get(`/sagas/${sagaId}/admin`);
      const data = response.data;
      const nextForm = {
        Titre: data.Titre || "",
        Resumer: data.Resumer || "",
        Premium: Boolean(data.Premium),
        CheminImage: data.CheminImage || "",
      };
      setForm(nextForm);
      setInitialForm(nextForm);
      setContents(Array.isArray(data.Contents) ? data.Contents : []);
      setImageFile(null);
      setImagePreview("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      console.error("Erreur lors de la récupération de la saga :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de charger cette saga.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSagas();
  }, [loadSagas]);

  useEffect(() => {
    loadSagaDetails(selectedSagaId);
  }, [loadSagaDetails, selectedSagaId]);

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedSagaId) return;

    const title = form.Titre.trim();
    if (!title) {
      setErrorMessage("Le titre est obligatoire.");
      return;
    }

    setSaving(true);
    resetFeedback();

    try {
      const requests = [];
      const payload = {};

      if (title !== initialForm.Titre) payload.Titre = title;
      if (form.Resumer !== initialForm.Resumer) payload.Resumer = form.Resumer;
      if (form.Premium !== initialForm.Premium) payload.Premium = form.Premium;
      if (Object.keys(payload).length > 0) requests.push(api.put(`/sagas/${selectedSagaId}`, payload));

      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);
        requests.push(api.put(`/sagas/${selectedSagaId}/image`, formData));
      }

      if (requests.length === 0) {
        setMessage("Aucune modification à enregistrer.");
        return;
      }

      await Promise.all(requests);
      await loadSagas();
      await loadSagaDetails(selectedSagaId);
      setMessage("Saga mise à jour.");
    } catch (error) {
      console.error("Erreur lors de la mise à jour de la saga :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de mettre à jour cette saga.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveImage = async () => {
    if (!selectedSagaId) return;

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

    if (!window.confirm("Retirer définitivement l'image de cette saga ?")) return;

    setSaving(true);
    resetFeedback();

    try {
      await api.delete(`/sagas/${selectedSagaId}/image`);
      await loadSagas();
      await loadSagaDetails(selectedSagaId);
      setMessage("Image de la saga retirée.");
    } catch (error) {
      console.error("Erreur lors de la suppression de l'image de la saga :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de retirer l'image de cette saga.");
    } finally {
      setSaving(false);
    }
  };

  const persistOrder = async (nextContents) => {
    if (!selectedSagaId) return;
    const items = nextContents.map((item, index) => ({
      SagaContentID: item.SagaContentID,
      Ordre: Number(item.Ordre) > 0 ? Number(item.Ordre) : index + 1,
    }));
    await api.put(`/sagas/${selectedSagaId}/contents/order`, { items });
  };

  const handleOrderInput = (sagaContentId, value) => {
    setContents((current) =>
      current.map((item) =>
        item.SagaContentID === sagaContentId ? { ...item, Ordre: value } : item
      )
    );
  };

  const saveOrder = async () => {
    setSaving(true);
    resetFeedback();

    try {
      const normalized = [...contents]
        .map((item) => ({ ...item, Ordre: Math.max(1, Number(item.Ordre) || 1) }))
        .sort((a, b) => Number(a.Ordre) - Number(b.Ordre));
      await persistOrder(normalized);
      await loadSagaDetails(selectedSagaId);
      setMessage("Ordre de la saga mis à jour.");
    } catch (error) {
      console.error("Erreur lors de la sauvegarde de l'ordre :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de sauvegarder l'ordre.");
    } finally {
      setSaving(false);
    }
  };

  const handleDrop = async (targetId) => {
    if (!draggedId || draggedId === targetId) return;
    const current = [...contents];
    const fromIndex = current.findIndex((item) => item.SagaContentID === draggedId);
    const toIndex = current.findIndex((item) => item.SagaContentID === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    const next = current.map((item, index) => ({ ...item, Ordre: index + 1 }));
    setContents(next);
    setDraggedId(null);

    try {
      await persistOrder(next);
      setMessage("Ordre de la saga mis à jour.");
    } catch (error) {
      console.error("Erreur lors du drag and drop :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de sauvegarder l'ordre.");
      await loadSagaDetails(selectedSagaId);
    }
  };

  const removeContent = async (item) => {
    if (!selectedSagaId) return;
    if (!window.confirm(`Retirer "${item.Titre}" de cette saga ?`)) return;

    setSaving(true);
    resetFeedback();

    try {
      await api.delete(`/sagas/${selectedSagaId}/contents/${item.SagaContentID}`);
      await loadSagaDetails(selectedSagaId);
      setMessage("Contenu retiré de la saga.");
    } catch (error) {
      console.error("Erreur lors du retrait du contenu :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de retirer ce contenu.");
    } finally {
      setSaving(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!pendingDelete?.SagaID) return;

    setSaving(true);
    resetFeedback();

    try {
      await api.delete(`/sagas/${pendingDelete.SagaID}`);
      setSelectedSaga(null);
      resetForm();
      await loadSagas();
      setPendingDelete(null);
      setMessage("Saga placée dans la corbeille.");
    } catch (error) {
      console.error("Erreur lors de la mise en corbeille de la saga :", error);
      setErrorMessage(error.response?.data?.error || "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Sagas</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Modifie les sagas, leurs affiches, leur statut Premium et l'ordre des contenus.
        </p>
      </div>

      <div className="relative px-6 py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative">
          {message && <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">{message}</div>}
          {errorMessage && <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">{errorMessage}</div>}

          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto]">
            <div>
              <label className={labelClass}>Saga à gérer</label>
              <Listbox value={selectedSaga} onChange={setSelectedSaga}>
                <div className="relative z-[70]">
                  <ListboxButton className={`${fieldClass} text-left`}>
                    <span className="block truncate">
                      {selectedSaga ? `#${selectedSaga.SagaID} - ${selectedSaga.Titre}` : "Choisir une saga..."}
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
                        placeholder="Rechercher une saga..."
                        className="w-full rounded-lg border border-sky-500/20 bg-slate-50 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                    {filteredSagas.length > 0 ? (
                      filteredSagas.map((saga) => (
                        <ListboxOption
                          key={saga.SagaID}
                          value={saga}
                          className={({ active }) =>
                            `relative cursor-default select-none py-2.5 pl-10 pr-4 ${active ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"}`
                          }
                        >
                          {({ selected }) => (
                            <>
                              <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>{saga.Titre}</span>
                              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">#{saga.SagaID}</span>
                              {selected && <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400"><CheckIcon className="size-5" /></span>}
                            </>
                          )}
                        </ListboxOption>
                      ))
                    ) : (
                      <div className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Aucune saga.</div>
                    )}
                  </ListboxOptions>
                </div>
              </Listbox>
            </div>
            <div className="flex items-end">
              <button type="button" onClick={loadSagas} className={buttonClass}>
                <ArrowPathIcon className="size-5" />
                Actualiser
              </button>
            </div>
          </div>

          {selectedSaga && (
            <>
              <form onSubmit={handleSave} className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div className="grid gap-4">
                  <div>
                    <label className={labelClass}>Titre</label>
                    <input value={form.Titre} onChange={(event) => setForm((current) => ({ ...current, Titre: event.target.value }))} className={fieldClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Résumé</label>
                    <textarea rows={8} value={form.Resumer} onChange={(event) => setForm((current) => ({ ...current, Resumer: event.target.value }))} className={fieldClass} />
                  </div>
                  <label className="flex items-center gap-3 rounded-xl border border-sky-500/10 bg-white/60 px-4 py-3 text-sm font-bold text-slate-700 dark:bg-slate-950/40 dark:text-slate-200">
                    <input type="checkbox" checked={form.Premium} onChange={(event) => setForm((current) => ({ ...current, Premium: event.target.checked }))} className="size-4 rounded" />
                    Saga Premium
                  </label>
                </div>
                <div>
                  <label className={labelClass}>Affiche</label>
                  {imageSrc && (
                    <img src={imageSrc} alt="" className="mb-4 h-52 w-36 rounded-xl object-cover ring-1 ring-sky-500/20" />
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className={fieldClass} />
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button type="submit" disabled={saving || loading} className={buttonClass}>{saving ? "Enregistrement..." : "Enregistrer"}</button>
                    <button type="button" onClick={handleRemoveImage} disabled={saving || loading} className={dangerButtonClass}>Retirer l'image</button>
                    <button type="button" onClick={() => setPendingDelete(selectedSaga)} disabled={saving || loading} className={dangerButtonClass}>
                      <TrashIcon className="size-5" />
                      Supprimer
                    </button>
                  </div>
                </div>
              </form>

              <div className="mt-8">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-xl font-black text-slate-950 dark:text-white">Ordre des contenus</h3>
                  <button type="button" onClick={saveOrder} disabled={saving || contents.length === 0} className={buttonClass}>
                    Sauvegarder l'ordre
                  </button>
                </div>

                {contents.length === 0 ? (
                  <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">Aucun contenu dans cette saga.</p>
                ) : (
                  <ul className="divide-y divide-sky-500/10 overflow-hidden rounded-xl border border-sky-500/10 bg-white/70 dark:bg-slate-950/40">
                    {contents.map((item) => (
                      <li
                        key={item.SagaContentID}
                        draggable
                        onDragStart={() => setDraggedId(item.SagaContentID)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => handleDrop(item.SagaContentID)}
                        className="flex cursor-move flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center"
                      >
                        <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-200 dark:bg-slate-800">
                          {item.CheminImage && <img src={`${apiUrl}/${item.CheminImage}`} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="flex-1">
                          <p className="font-black text-slate-950 dark:text-white">{contentLabel(item)}</p>
                          <p className="mt-1 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                            {item.type === "series" ? "Série" : "Film / épisode"}
                          </p>
                        </div>
                        <input
                          type="number"
                          min="1"
                          value={item.Ordre}
                          onChange={(event) => handleOrderInput(item.SagaContentID, event.target.value)}
                          className={`${fieldClass} sm:w-28`}
                          aria-label="Ordre"
                        />
                        <button type="button" onClick={() => removeContent(item)} disabled={saving} className={dangerButtonClass}>
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
            <h3 className="text-xl font-black text-slate-950 dark:text-white">Mettre la saga en corbeille</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              Mettre "{pendingDelete.Titre}" dans la corbeille ? Les liaisons et l'affiche seront conservées jusqu'à la suppression définitive.
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

export default AdminSagaManager;
