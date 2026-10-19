import React, { useId, useRef, useState } from "react";
import { ClipboardDocumentIcon } from "@heroicons/react/24/outline";

const AlternativeTitlesInput = ({ value, onChange, fieldClass, labelClass }) => {
  const id = useId();
  const [feedback, setFeedback] = useState("");
  const separatorRef = useRef(null);

  const copySeparator = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText("|");
      } else {
        separatorRef.current.focus();
        separatorRef.current.select();
        if (!document.execCommand?.("copy")) throw new Error("Copie indisponible");
      }
      setFeedback("Séparateur | copié.");
    } catch {
      separatorRef.current.focus();
      separatorRef.current.select();
      setFeedback("Copie automatique indisponible. Copiez le séparateur sélectionné.");
    }
  };

  return (
    <div>
      <label htmlFor={id} className={labelClass}>Titres alternatifs (facultatif)</label>
      <div className="mt-2 flex items-center gap-2">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={10000}
          aria-describedby={`${id}-help`}
          placeholder="Mégalodon | En eau trouble"
          className={`${fieldClass} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={copySeparator}
          title="Copier le séparateur |"
          aria-label="Copier le séparateur |"
          className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-sky-300/40 bg-sky-500/15 px-3 py-3 text-sm font-bold text-slate-900 hover:bg-sky-500/25 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:text-white"
        >
          <ClipboardDocumentIcon className="size-5" aria-hidden="true" />
          <span aria-hidden="true">|</span>
        </button>
      </div>
      <p id={`${id}-help`} className="mt-2 text-xs text-slate-600 dark:text-slate-300">
        Séparez les titres par | pour les retrouver dans la recherche.
      </p>
      <input
        ref={separatorRef}
        aria-label="Séparateur à copier manuellement"
        value="|"
        readOnly
        className="sr-only focus:not-sr-only"
      />
      {feedback && <p role="status" className="mt-1 text-xs text-slate-600 dark:text-slate-300">{feedback}</p>}
    </div>
  );
};

export default AlternativeTitlesInput;
