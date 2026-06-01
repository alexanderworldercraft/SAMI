import React from "react";

const SummaryField = ({ summary, setSummary }) => (
  <div>
    <label htmlFor="resumer" className="block font-bold text-xl text-neutral-200 italic">
      Résumé
    </label>
    <textarea
      id="resumer"
      value={summary}
      onChange={(e) => setSummary(e.target.value)}
      placeholder="Ajoutez un résumé de la vidéo"
      style={{ height: "300px" }}
      className="block w-full rounded-md border-0 px-3 py-1.5 text-neutral-200 bg-neutral-900/50 shadow-sm ring-1 ring-inset ring-neutral-200/50 focus:ring-2 focus:ring-inset focus:ring-sky-600 outline-none placeholder:text-neutral-700 sm:text-sm/6"
    ></textarea>
  </div>
);

export default SummaryField;
