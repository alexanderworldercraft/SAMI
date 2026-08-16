import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowPathIcon, TrashIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import PersonDuplicateChecker from "./PersonDuplicateChecker";

const apiUrl = process.env.REACT_APP_URL_LOCAL;
const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200";
const buttonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";
const dangerButtonClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-red-300/50 bg-red-500/15 px-5 py-3 text-sm font-bold text-red-700 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200";

const emptyForm = { Nom: "", Prenom: "", Surnom: "", CheminImage: "", ImageStatut: "DEFAULT" };

const personLabel = (person) => {
  if (!person) return "";
  const identity = [person.Prenom, person.Nom].filter(Boolean).join(" ");
  return person.Surnom ? `${identity} (${person.Surnom})` : identity;
};

const AdminPersonManager = () => {
  const [people, setPeople] = useState([]);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingDelete, setPendingDelete] = useState(false);
  const fileInputRef = useRef(null);

  const filteredPeople = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    if (!search) return people;
    return people.filter((person) =>
      [person.Prenom, person.Nom, person.Surnom, String(person.PersonneID)]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [people, searchTerm]);

  const selectedPerson = useMemo(
    () => people.find((person) => person.PersonneID === Number(selectedPersonId)) || null,
    [people, selectedPersonId]
  );

  const resetFeedback = () => {
    setMessage("");
    setErrorMessage("");
  };

  const resetImageSelection = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const loadPeople = useCallback(async (personIdToKeep = null) => {
    try {
      const response = await api.get("/people/admin");
      const nextPeople = Array.isArray(response.data) ? response.data : [];
      setPeople(nextPeople);
      if (personIdToKeep && !nextPeople.some((person) => person.PersonneID === Number(personIdToKeep))) {
        setSelectedPersonId("");
      }
    } catch (error) {
      console.error("Erreur lors de la récupération des personnes :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de récupérer les personnes.");
    }
  }, []);

  useEffect(() => {
    loadPeople();
  }, [loadPeople]);

  useEffect(() => {
    resetImageSelection();
    if (!selectedPerson) {
      setForm(emptyForm);
      setInitialForm(emptyForm);
      return;
    }

    const nextForm = {
      Nom: selectedPerson.Nom || "",
      Prenom: selectedPerson.Prenom || "",
      Surnom: selectedPerson.Surnom || "",
      CheminImage: selectedPerson.CheminImage || "",
      ImageStatut: selectedPerson.ImageStatut || "DEFAULT",
    };
    setForm(nextForm);
    setInitialForm(nextForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPerson]);

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!selectedPerson) return;

    const Nom = form.Nom.trim();
    const Prenom = form.Prenom.trim();
    const Surnom = form.Surnom.trim();
    if (!Nom || !Prenom) {
      setErrorMessage("Le nom et le prénom sont obligatoires.");
      return;
    }

    setSaving(true);
    resetFeedback();
    try {
      const requests = [];
      if (Nom !== initialForm.Nom || Prenom !== initialForm.Prenom || Surnom !== initialForm.Surnom) {
        requests.push(api.put(`/people/${selectedPerson.PersonneID}`, { Nom, Prenom, Surnom }));
      }
      if (imageFile) {
        const formData = new FormData();
        formData.append("image", imageFile);
        requests.push(api.put(`/people/${selectedPerson.PersonneID}/photo`, formData));
      }
      if (requests.length === 0) {
        setMessage("Aucune modification à enregistrer.");
        return;
      }

      await Promise.all(requests);
      await loadPeople(selectedPerson.PersonneID);
      resetImageSelection();
      setMessage("Personne mise à jour.");
    } catch (error) {
      console.error("Erreur lors de la mise à jour de la personne :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de mettre à jour la personne.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!selectedPerson) return;
    if (imageFile && !initialForm.CheminImage) {
      resetImageSelection();
      return;
    }
    if (!initialForm.CheminImage) {
      setMessage("Aucune photo personnalisée à retirer.");
      return;
    }
    if (!window.confirm("Retirer définitivement la photo de cette personne ?")) return;

    setSaving(true);
    resetFeedback();
    try {
      await api.delete(`/people/${selectedPerson.PersonneID}/photo`);
      await loadPeople(selectedPerson.PersonneID);
      resetImageSelection();
      setMessage("Photo de la personne retirée.");
    } catch (error) {
      console.error("Erreur lors de la suppression de la photo :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de retirer la photo.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedPerson) return;
    setSaving(true);
    resetFeedback();
    try {
      const label = personLabel(selectedPerson);
      await api.delete(`/people/${selectedPerson.PersonneID}`);
      setPendingDelete(false);
      setSelectedPersonId("");
      setForm(emptyForm);
      setInitialForm(emptyForm);
      resetImageSelection();
      await loadPeople();
      setMessage(`Personne placée dans la corbeille : ${label}`);
    } catch (error) {
      console.error("Erreur lors de la mise en corbeille :", error);
      setErrorMessage(error.response?.data?.error || "Impossible de placer cette personne dans la corbeille.");
    } finally {
      setSaving(false);
    }
  };

  const imageSrc = imagePreview || (form.CheminImage ? `${apiUrl}/${form.CheminImage}` : "");

  return (
    <>
      <section className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Gestion des personnes</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Modifie l'identité et la photo d'une personne, ou place-la dans la corbeille.
        </p>
      </div>

      <div className="relative px-6 py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative">
          {message && <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">{message}</div>}
          {errorMessage && <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">{errorMessage}</div>}

          <div className="mb-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label htmlFor="person-search" className={labelClass}>Rechercher une personne</label>
              <input id="person-search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Nom, prénom, surnom ou ID..." className={fieldClass} />
            </div>
            <button type="button" onClick={() => loadPeople(selectedPersonId)} disabled={saving} className={buttonClass}>
              <ArrowPathIcon className="size-5" /> Actualiser
            </button>
          </div>

          <div className="mb-6">
            <label htmlFor="person-select" className={labelClass}>Personne à modifier</label>
            <select id="person-select" value={selectedPersonId} onChange={(event) => { resetFeedback(); setSelectedPersonId(event.target.value); }} className={fieldClass}>
              <option value="">Sélectionner une personne</option>
              {filteredPeople.map((person) => <option key={person.PersonneID} value={person.PersonneID}>{personLabel(person)} — #{person.PersonneID}</option>)}
            </select>
          </div>

          {!selectedPerson ? (
            <p className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-5 text-sm font-semibold text-slate-600 dark:bg-slate-950/40 dark:text-slate-300">
              {people.length === 0 ? "Aucune personne disponible." : "Sélectionne une personne pour modifier ses informations."}
            </p>
          ) : (
            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <div><label htmlFor="person-firstname" className={labelClass}>Prénom</label><input id="person-firstname" value={form.Prenom} onChange={(event) => setForm((current) => ({ ...current, Prenom: event.target.value }))} className={fieldClass} /></div>
                <div><label htmlFor="person-lastname" className={labelClass}>Nom</label><input id="person-lastname" value={form.Nom} onChange={(event) => setForm((current) => ({ ...current, Nom: event.target.value }))} className={fieldClass} /></div>
                <div className="sm:col-span-2"><label htmlFor="person-nickname" className={labelClass}>Surnom</label><input id="person-nickname" value={form.Surnom} onChange={(event) => setForm((current) => ({ ...current, Surnom: event.target.value }))} className={fieldClass} /></div>
              </div>

              <div className="grid gap-5 sm:grid-cols-[8rem_1fr] sm:items-center">
                <div className="flex h-36 w-32 items-center justify-center overflow-hidden rounded-xl border border-sky-500/15 bg-slate-200 text-3xl font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                  {imageSrc ? <img src={imageSrc} alt={personLabel(selectedPerson)} className="h-full w-full object-cover" /> : `${form.Prenom?.[0] || ""}${form.Nom?.[0] || ""}`}
                </div>
                <div>
                  <label htmlFor="person-photo" className={labelClass}>Photo</label>
                  <input ref={fileInputRef} id="person-photo" type="file" accept="image/*" onChange={handleImageChange} className={fieldClass} />
                  <button type="button" onClick={handleRemovePhoto} disabled={saving || (!imageFile && !initialForm.CheminImage)} className={`${dangerButtonClass} mt-3`}>
                    <TrashIcon className="size-5" /> Retirer la photo
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-sky-500/10 pt-5 sm:flex-row sm:justify-between">
                <button type="button" onClick={() => setPendingDelete(true)} disabled={saving} className={dangerButtonClass}><TrashIcon className="size-5" /> Mettre dans la corbeille</button>
                <button type="submit" disabled={saving} className={buttonClass}>{saving ? "Enregistrement..." : "Enregistrer les modifications"}</button>
              </div>
            </form>
          )}
        </div>
      </div>

      </section>

      <PersonDuplicateChecker onPeopleChanged={() => loadPeople()} />

      {pendingDelete && selectedPerson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-red-300/20 bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-white">
            <h3 className="text-xl font-black text-slate-950 dark:text-white">Mise en corbeille</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">Placer « {personLabel(selectedPerson)} » dans la corbeille ? Ses associations seront conservées pour permettre sa restauration.</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setPendingDelete(false)} disabled={saving} className="inline-flex items-center justify-center rounded-lg border border-slate-300/60 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">Annuler</button>
              <button type="button" onClick={handleDelete} disabled={saving} className={dangerButtonClass}><TrashIcon className="size-5" /> {saving ? "Mise en corbeille..." : "Confirmer"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminPersonManager;
