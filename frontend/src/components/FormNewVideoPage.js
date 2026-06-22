import React, { useState, useEffect } from "react";
import TaskHistory from "./TaskHistory";
import NewVideoForm from "./NewVideoForm";
import SeasonsManager from "./SeasonsManager";
import SeriesManager from "./SeriesManager";
import SagaManager from "./SagaManager";
import SagaContentManager from "./SagaContentManager";
import UniverseManager from "./UniverseManager";
import UniverseSagaManager from "./UniverseSagaManager";
import AddGenre from "./AddGenre";
import ImportDrawer from "./ImportDrawer";
import PeopleQuickAdd from "./PeopleQuickAdd";
import { io } from "socket.io-client";

import { ChevronDownIcon } from "@heroicons/react/16/solid";
import {
  BuildingOfficeIcon,
  CreditCardIcon,
  UserIcon,
  UsersIcon,
} from "@heroicons/react/20/solid";

const apiUrl = process.env.REACT_APP_URL_LOCAL || "https://192.168.0.17:1234";

// Helper pour les classes conditionnelles
function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

// Définition des tabs
const tabs = [
  { id: "video", name: "Vidéo", icon: UserIcon },
  { id: "seasons", name: "Saisons", icon: BuildingOfficeIcon },
  { id: "genres", name: "Genres", icon: UsersIcon },
  { id: "people", name: "Acteurs / Réalisateurs", icon: CreditCardIcon },
  { id: "series", name: "Séries", icon: UsersIcon }, // tu pourras changer l'icône si tu veux
  { id: "sagas", name: "Sagas", icon: UsersIcon },
  { id: "saga-content", name: "Contenus saga", icon: BuildingOfficeIcon },
  { id: "universes", name: "Univers", icon: UsersIcon },
  { id: "universe-sagas", name: "Sagas univers", icon: BuildingOfficeIcon },
];

const FormNewVideoPage = () => {
  const [completed, setCompleted] = useState(false);
  const [tasksHistory, setTasksHistory] = useState([]);
  const [isCardVisible, setIsCardVisible] = useState(false);

  // Onglet actif
  const [currentTabId, setCurrentTabId] = useState(tabs[0].id);

  useEffect(() => {
    const socket = io(apiUrl);

    socket.on("progress", (data) => {
      setIsCardVisible(true);

      setTasksHistory((prev) => {
        const taskId =
          data.stage === "conversion" ? `conversion-${data.resolution}` : data.stage;

        const taskLabel =
          data.stage === "conversion"
            ? `Conversion ${data.resolution} ...`
            : data.stage === "initial-encoding"
            ? "Réencodage initial ..."
            : data.stage === "upload"
            ? "Téléchargement ..."
            : data.stage;

        const index = prev.findIndex((t) => t.id === taskId);

        if (index !== -1) {
          const updated = {
            ...prev[index],
            progress: data.progress,
            completed: data.progress === 100,
          };
          return [...prev.slice(0, index), updated, ...prev.slice(index + 1)];
        }

        return [
          ...prev,
          {
            id: taskId,
            label: taskLabel,
            progress: data.progress,
            completed: data.progress === 100,
            error: null,
          },
        ];
      });
    });

    socket.on("completed", () => {
      setTasksHistory((prev) => prev.map((t) => ({ ...t, completed: true })));
      setCompleted(true);
    });

    return () => socket.disconnect();
  }, []);

  // Rendu du contenu en fonction de l'onglet actif
  const renderTabContent = () => {
    switch (currentTabId) {
      case "video":
        return <NewVideoForm />;
      case "seasons":
        return <SeasonsManager />;
      case "genres":
        return <AddGenre />;
      case "people":
        return <PeopleQuickAdd />;
      case "series":
        return <SeriesManager />;
      case "sagas":
        return <SagaManager />;
      case "saga-content":
        return <SagaContentManager />;
      case "universes":
        return <UniverseManager />;
      case "universe-sagas":
        return <UniverseSagaManager />;
      default:
        return null;
    }
  };

  return (
    <main className="container mx-auto flex grow flex-col px-4 py-10 sm:px-6 lg:px-8">
      {isCardVisible && <TaskHistory tasks={tasksHistory} />}

      <div className="relative overflow-visible rounded-2xl border border-sky-500/10 bg-white/80 p-6 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.12),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.10),transparent_22%)]" />
        <div className="relative">
        {/* Tabs mobile : select */}
        <div className="grid grid-cols-1 sm:hidden">
          <select
            value={currentTabId}
            onChange={(e) => setCurrentTabId(e.target.value)}
            aria-label="Sélectionner une section"
            className="col-start-1 row-start-1 w-full appearance-none rounded-xl border border-sky-500/20 bg-white/85 py-3 pl-4 pr-10 text-base font-semibold text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-gray-100 dark:*:bg-slate-900"
          >
            {tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.name}
              </option>
            ))}
          </select>
          <ChevronDownIcon
            aria-hidden="true"
            className="pointer-events-none col-start-1 row-start-1 mr-3 size-5 self-center justify-self-end fill-sky-500 dark:fill-sky-300"
          />
        </div>

        <div className="hidden sm:block">
          <div className="rounded-xl border border-sky-500/10 bg-slate-950/5 p-1 dark:bg-slate-950/40">
            <nav aria-label="Tabs" className="flex gap-2 overflow-x-auto">
              {tabs.map((tab) => {
                const isCurrent = tab.id === currentTabId;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCurrentTabId(tab.id)}
                    aria-current={isCurrent ? "page" : undefined}
                    className={classNames(
                      isCurrent
                        ? "border-sky-300/60 bg-gradient-to-r from-sky-500/25 via-blue-500/15 to-transparent text-sky-800 shadow-[0_0_22px_rgba(56,189,248,0.22)] dark:text-white"
                        : "border-transparent text-slate-600 hover:border-sky-400/40 hover:bg-sky-500/10 hover:text-sky-700 dark:text-slate-300 dark:hover:text-white",
                      "group inline-flex shrink-0 items-center rounded-xl border px-4 py-2.5 text-sm font-bold transition duration-200"
                    )}
                  >
                    <tab.icon
                      aria-hidden="true"
                      className={classNames(
                        isCurrent
                          ? "text-sky-500 dark:text-sky-300"
                          : "text-slate-400 group-hover:text-sky-500 dark:group-hover:text-sky-300",
                        "mr-2 size-5"
                      )}
                    />
                    <span>{tab.name}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Contenu de l’onglet */}
        <div className="relative z-10 mt-6">
          {renderTabContent()}
        </div>
        </div>
      </div>

      <ImportDrawer />
    </main>
  );
};

export default FormNewVideoPage;
