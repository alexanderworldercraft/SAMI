import React, { useRef } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { CpuChipIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

export default function AiFeatureConsentModal({ disclosure, loading, error, onDecision }) {
  const acceptButtonRef = useRef(null);

  const decide = async (accepted) => {
    try {
      await onDecision(accepted);
    } catch (_) {
      // Le message détaillé est affiché dans la modale, qui reste volontairement ouverte.
    }
  };

  return (
    <Dialog
      open
      onClose={() => {}}
      initialFocus={acceptButtonRef}
      className="relative z-[200]"
      data-testid="ai-consent-modal"
    >
      <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4 sm:p-8">
        <DialogPanel className="w-full max-w-2xl rounded-2xl border border-sky-400/30 bg-white p-6 shadow-2xl dark:bg-slate-950 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="rounded-2xl bg-sky-500/15 p-3 text-sky-600 dark:text-sky-300">
              <CpuChipIcon className="size-7" aria-hidden="true" />
            </span>
            <div>
              <DialogTitle className="text-xl font-black text-slate-950 dark:text-white sm:text-2xl">
                {disclosure?.title || "Fonctionnalités d'intelligence artificielle de SAMI"}
              </DialogTitle>
              <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                {disclosure?.summary}
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
            <div className="flex gap-3">
              <ExclamationTriangleIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p>
                Votre réponse est obligatoire pour continuer, mais accepter ne l'est pas.
                Vous pourrez changer d'avis à tout moment dans Paramètres.
              </p>
            </div>
          </div>

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">
              {error}
            </p>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              ref={acceptButtonRef}
              type="button"
              disabled={loading}
              onClick={() => decide(true)}
              className="rounded-xl bg-sky-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-sky-500 disabled:cursor-wait disabled:opacity-60"
            >
              {disclosure?.acceptLabel || "Oui, je souhaite y accéder"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => decide(false)}
              className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-100 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800"
            >
              {disclosure?.refuseLabel || "Non, je ne souhaite pas y accéder"}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
