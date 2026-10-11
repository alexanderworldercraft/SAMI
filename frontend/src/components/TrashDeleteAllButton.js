import React, { useRef, useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { TrashIcon } from "@heroicons/react/24/outline";
import api from "../services/api";

const dangerClass = "inline-flex items-center justify-center gap-2 rounded-lg border border-red-300/50 bg-red-500/15 px-5 py-3 text-sm font-bold text-red-700 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-red-200";

const TrashDeleteAllButton = ({ items, getDeleteUrl, label, disabled, setSaving, reload, setMessage, setError }) => {
  const [selection, setSelection] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const inProgress = useRef(false);

  const close = () => {
    if (!inProgress.current) setSelection(null);
  };

  const confirm = async () => {
    if (!selection?.length || inProgress.current) return;
    inProgress.current = true;
    setDeleting(true);
    setSaving(true);
    setMessage("");
    setError("");
    let deleted = 0;
    let failed = 0;
    try {
      // Keep the confirmed URLs fixed and reuse each resource's protected cleanup route.
      for (const url of selection) {
        try {
          await api.delete(url);
          deleted += 1;
        } catch (error) {
          failed += 1;
        }
      }
      await reload();
      if (deleted) setMessage(`${deleted} élément(s) supprimé(s) définitivement dans l’onglet ${label}.`);
      if (failed) setError(`${failed} élément(s) n’ont pas pu être supprimés. Consultez la liste actualisée avant de réessayer.`);
    } finally {
      setSelection(null);
      setSaving(false);
      setDeleting(false);
      inProgress.current = false;
    }
  };

  return <>
    <button type="button" className={dangerClass} disabled={disabled || deleting || items.length === 0}
      onClick={() => setSelection(items.map(getDeleteUrl))}>
      <TrashIcon className="size-5" />Tout supprimer
    </button>
    <Dialog open={selection !== null} onClose={close} className="relative z-[120]">
      <div className="fixed inset-0 bg-slate-950/60" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <DialogPanel className="w-full max-w-md rounded-2xl border border-red-300/20 bg-white p-6 shadow-2xl dark:bg-slate-950 dark:text-white">
          <DialogTitle className="text-xl font-black">Tout supprimer — {label}</DialogTitle>
          <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
            Supprimer définitivement les {selection?.length} élément(s) listés dans cet onglet ?
            Cette action est irréversible et supprime aussi les fichiers et associations concernés par leur suppression définitive.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" data-autofocus onClick={close} disabled={deleting}
              className="rounded-lg border border-slate-300/60 px-5 py-3 text-sm font-bold disabled:opacity-60">Non, annuler</button>
            <button type="button" onClick={confirm} disabled={deleting} className={dangerClass}>
              {deleting ? "Suppression..." : "Oui, tout supprimer"}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  </>;
};

export default TrashDeleteAllButton;
