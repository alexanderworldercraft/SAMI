import React, { useState } from "react";
import { CpuChipIcon } from "@heroicons/react/24/outline";

import { useAiFeaturePreference } from "../context/AiFeaturePreferenceContext";

export default function AiFeatureSettings() {
  const { preference, loading, error, updatePreference } = useAiFeaturePreference();
  const [success, setSuccess] = useState("");

  const save = async (accepted) => {
    setSuccess("");
    try {
      await updatePreference(accepted);
      setSuccess(accepted
        ? "Les fonctionnalités IA sont maintenant accessibles."
        : "Les fonctionnalités IA sont maintenant masquées et bloquées pour votre compte.");
    } catch (_) {
      // Le contexte expose le message d'erreur.
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-5" aria-labelledby="ai-settings-title">
      <div className="flex items-start gap-3">
        <CpuChipIcon className="mt-0.5 size-6 shrink-0 text-sky-600 dark:text-sky-300" aria-hidden="true" />
        <div>
          <h2 id="ai-settings-title" className="text-lg font-black text-slate-950 dark:text-white">
            Intelligence artificielle
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {preference?.disclosure?.summary}
          </p>
        </div>
      </div>

      <fieldset className="mt-5" disabled={loading}>
        <legend className="text-sm font-bold text-slate-900 dark:text-white">Votre choix</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            aria-pressed={preference?.accepted === true}
            onClick={() => save(true)}
            className={`rounded-xl border px-4 py-3 text-left text-sm font-bold transition ${preference?.accepted === true ? "border-sky-500 bg-sky-500/15 text-sky-900 dark:text-sky-100" : "border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}
          >
            J'accepte d'accéder aux fonctions IA
          </button>
          <button
            type="button"
            aria-pressed={preference?.accepted === false}
            onClick={() => save(false)}
            className={`rounded-xl border px-4 py-3 text-left text-sm font-bold transition ${preference?.accepted === false ? "border-slate-600 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"}`}
          >
            Je refuse l'accès aux fonctions IA
          </button>
        </div>
      </fieldset>

      {success && <p role="status" className="mt-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{success}</p>}
      {error && <p role="alert" className="mt-4 text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>}
    </section>
  );
}
