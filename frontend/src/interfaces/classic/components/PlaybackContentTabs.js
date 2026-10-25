import React, { useState } from "react";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";

const PlaybackContentTabs = ({ isSeries, details, episodes, series, credits, sagas, universes }) => {
  const [selectedTab, setSelectedTab] = useState(null);
  const tabs = [
    ...(isSeries
      ? [{ id: "episodes", label: "Épisodes", content: episodes }, { id: "series", label: "Série", content: series }]
      : [{ id: "details", label: "Détails", content: details }]),
    { id: "credits", label: "Crédits", content: credits },
    ...(sagas ? [{ id: "sagas", label: "Sagas", content: sagas }] : []),
    ...(universes ? [{ id: "universes", label: "Univers", content: universes }] : []),
  ];
  // Les associations arrivent après le contenu : appliquer le défaut tant que
  // l'utilisateur n'a pas choisi d'onglet lui-même.
  const defaultTab = isSeries ? "episodes" : sagas ? "sagas" : "details";
  const activeTab = tabs.some((tab) => tab.id === selectedTab) ? selectedTab : defaultTab;

  return (
    <TabGroup
      as="section"
      selectedIndex={tabs.findIndex((tab) => tab.id === activeTab)}
      onChange={(index) => setSelectedTab(tabs[index].id)}
      className="container mx-auto rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20"
    >
      <TabList aria-label="Informations du contenu" className="flex flex-wrap gap-2 rounded-t-2xl border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-4 py-3 sm:px-6">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            className={({ selected }) => `rounded-lg px-4 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${selected
              ? "bg-sky-600 text-white shadow-sm dark:bg-sky-500 dark:text-slate-950"
              : "text-slate-600 hover:bg-sky-500/10 hover:text-sky-700 dark:text-slate-300 dark:hover:text-white"}`}
          >
            {tab.label}
          </Tab>
        ))}
      </TabList>
      <TabPanels className="p-4 sm:p-6">
        {tabs.map((tab) => (
          // Conserver les formulaires et le chargement de la saga pour le lecteur.
          <TabPanel key={tab.id} unmount={false} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500">
            {tab.content}
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  );
};

export default PlaybackContentTabs;
