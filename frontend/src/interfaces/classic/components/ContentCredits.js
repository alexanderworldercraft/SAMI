import React from "react";
import VideoList from "./VideoList";
import { scrollToPageTop } from "../../../utils/scrollToPageTop";

const toPersonCards = (people = []) => people.map((person) => ({
  type: "person",
  id: person.PersonneID,
  Titre: [person.Prenom, person.Nom].filter(Boolean).join(" ") || person.Surnom || "Personne sans nom",
  Surnom: person.Surnom,
  CheminImage: person.CheminImage,
  Personnages: person.Personnages || [],
  MissingImageLabel: person.CheminImage ? null : "Photo manquante pour cette personne",
  Genres: [],
}));

const ContentCredits = ({ content, isSeries = false, embedded = false }) => {
  const directors = toPersonCards(content?.Realisateurs);
  const actors = toPersonCards(content?.Acteurs);
  if (!directors.length && !actors.length) {
    return embedded ? <p className="text-sm text-slate-600 dark:text-slate-300">Aucun crédit renseigné.</p> : null;
  }

  return (
    <section className={embedded ? undefined : "container mx-auto overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20"}>
      {!embedded && (
        <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
          <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Crédits</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Détails de production</h2>
        </div>
      )}
      <div className={embedded ? "space-y-6" : "relative space-y-6 p-6"}>
        {!embedded && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />}
        {[["Réalisation", directors], ["Distribution", actors]].map(([label, people]) => people.length > 0 && (
          <div key={label} className="relative">
            <h3 className="mb-3 text-lg font-black text-slate-950 dark:text-white">{label}{isSeries ? " (série)" : ""}</h3>
            <VideoList videos={people} onPersonClick={scrollToPageTop} />
          </div>
        ))}
      </div>
    </section>
  );
};

export default ContentCredits;
