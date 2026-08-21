import React from "react";
import {
  CalendarDaysIcon,
  ChartBarSquareIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import StatsSAMI from "./StatsSAMI";
import CalendarSAMI from "./CalendarSAMI";
import CookieList from "./CookieList";

const sections = [
  {
    id: "statistiques",
    label: "Statistiques",
    description: "Activité des trente derniers jours",
    icon: ChartBarSquareIcon,
  },
  {
    id: "calendrier",
    label: "Calendrier",
    description: "Ajouts classés par date",
    icon: CalendarDaysIcon,
  },
  {
    id: "cookies",
    label: "Cookies",
    description: "Données présentes dans ce navigateur",
    icon: ShieldCheckIcon,
  },
];

const StatsPage = () => (
  <div className="container mx-auto space-y-8 px-4 py-10 sm:px-6 lg:px-8">
    <section className="overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-900/80 dark:shadow-black/20">
      <header className="relative overflow-hidden border-b border-sky-500/10 bg-gradient-to-br from-sky-500/10 via-transparent to-indigo-500/10 px-6 py-7 sm:px-8">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_46%)]" />
        <div className="relative">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400">
            Tableau de bord SAMI
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Statistiques et activité
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Consultez l’évolution du catalogue, les ajouts du calendrier et les cookies utilisés par votre navigateur.
          </p>
        </div>
      </header>

      <nav aria-label="Sections des statistiques" className="grid gap-3 p-4 sm:grid-cols-3 sm:p-6">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="group flex items-center gap-3 rounded-xl border border-sky-500/10 bg-white/75 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-sky-400/50 hover:bg-sky-500/5 dark:bg-slate-950/35"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-600 transition group-hover:bg-sky-500/20 dark:text-sky-300">
              <section.icon className="size-6" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block font-black text-slate-950 dark:text-white">{section.label}</span>
              <span className="mt-0.5 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                {section.description}
              </span>
            </span>
          </a>
        ))}
      </nav>
    </section>

    <div id="statistiques" className="scroll-mt-24">
      <StatsSAMI />
    </div>

    <div id="calendrier" className="scroll-mt-24">
      <CalendarSAMI />
    </div>

    <div id="cookies" className="scroll-mt-24">
      <CookieList embedded />
    </div>
  </div>
);

export default StatsPage;
