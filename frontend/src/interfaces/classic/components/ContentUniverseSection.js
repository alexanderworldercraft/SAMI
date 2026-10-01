import React from "react";
import { GlobeAltIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";

const ContentUniverseSection = ({ universes = [] }) => {
  if (!Array.isArray(universes) || universes.length === 0) return null;

  return (
    <section className="container mx-auto overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-violet-500/15 via-sky-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-violet-600 dark:text-violet-300">Univers</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
          Ce contenu appartient à
        </h2>
      </div>
      <div className="relative p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(139,92,246,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(14,165,233,0.08),transparent_22%)]" />
        <div className="relative grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {universes.map((universe) => (
            <Link
              key={universe.UniverseID}
              to={`/sagas#universe-${universe.UniverseID}`}
              aria-label={`Voir l'univers ${universe.Titre}`}
              className="rounded-2xl border border-violet-400/20 bg-white/75 p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:border-sky-400/50 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/55"
            >
              <div className="flex items-start gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-500/10 text-violet-600 dark:text-violet-300">
                  <GlobeAltIcon className="size-6" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase tracking-wide text-sky-600 dark:text-sky-400">
                    Univers
                  </p>
                  <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">
                    {universe.Titre}
                  </h3>
                </div>
              </div>
              {universe.Resume && (
                <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  {universe.Resume}
                </p>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ContentUniverseSection;
