import React, { useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import api from "../services/api";
import PersonCharacterFields from "./PersonCharacterFields";

export default function PersonCharacterEditor({ personId, content, onClose, onSaved }) {
  const [names, setNames] = useState(content.Personnages || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put(`/people/${personId}/characters`, {
        type: content.type, contenuId: content.id,
        Personnages: names.map((name) => name.trim()).filter(Boolean),
      });
      onSaved(data.Personnages);
    } catch (err) {
      setError(err.response?.data?.error || "Impossible de mettre à jour les personnages.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={() => { if (!saving) onClose(); }} className="relative z-[100]">
      <div className="fixed inset-0 bg-black/70" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <DialogPanel className="my-auto max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900 dark:text-white">
          <DialogTitle className="text-xl font-black">Modifier les personnages</DialogTitle>
          <p className="mb-5 mt-1 text-sm text-slate-500 dark:text-slate-300">{content.Titre}</p>
          <form onSubmit={save} className="space-y-5">
            <PersonCharacterFields names={names} onChange={setNames} disabled={saving} />
            {error && <p role="alert" className="text-sm text-rose-600 dark:text-rose-300">{error}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-slate-400/30 px-4 py-2 font-bold">Annuler</button>
              <button type="submit" disabled={saving} className="rounded-lg bg-sky-600 px-4 py-2 font-bold text-white disabled:opacity-60">{saving ? "Enregistrement…" : "Enregistrer"}</button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
