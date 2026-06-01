import React from "react";
import { XMarkIcon } from "@heroicons/react/20/solid";

const STORAGE_KEY = "maintenanceBannerDismissedStart";

function getWindowRange(now) {
  // JS : getDay() => 0 (dimanche) .. 6 (samedi)
  const day = now.getDay();
  // Clone "now" pour ne pas modifier l'objet Date d'origine
  const start = new Date(now);
  // Jeudi vaut 4, ce décalage ramène au jeudi de la même semaine
  // Exemples : jeudi (4) => 0, vendredi (5) => -1, lundi (1) => +3
  const diffToThursday = 5 - day;

  // setDate() accepte des valeurs négatives / en dépassement et ajuste le mois/l'année,
  // donc cela fonctionne même lors d'un changement de mois
  start.setDate(now.getDate() + diffToThursday);
  // La fenêtre commence le jeudi à 12h00 (heure locale serveur)
  start.setHours(12, 0, 0, 0);

  // La fenêtre se termine le samedi à 07h00 (même "semaine" ancrée sur ce jeudi)
  const end = new Date(start);
  end.setDate(start.getDate() + 1); // Jeudi + 2 jours => samedi
  end.setHours(7, 0, 0, 0);

  return { start, end };
}

function isInWindow(now) {
  const { start, end } = getWindowRange(now);
  return now >= start && now < end;
}

export default function MaintenanceBanner() {
  const [isVisible, setIsVisible] = React.useState(false);
  const [windowStartKey, setWindowStartKey] = React.useState(null);

  React.useEffect(() => {
    const updateVisibility = () => {
      const now = new Date();
      const { start, end } = getWindowRange(now);
      const inWindow = now >= start && now < end;

      if (!inWindow) {
        setIsVisible(false);
        setWindowStartKey(null);
        return;
      }

      const startKey = String(start.getTime());
      const dismissedKey = window.localStorage.getItem(STORAGE_KEY);

      setWindowStartKey(startKey);
      setIsVisible(dismissedKey !== startKey);
    };

    updateVisibility();
    const intervalId = window.setInterval(updateVisibility, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  React.useEffect(() => {
    if (isVisible) {
      document.body.classList.add("has-maintenance-banner");
    } else {
      document.body.classList.remove("has-maintenance-banner");
    }

    return () => document.body.classList.remove("has-maintenance-banner");
  }, [isVisible]);

  const handleDismiss = () => {
    if (windowStartKey) {
      window.localStorage.setItem(STORAGE_KEY, windowStartKey);
    }
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 sm:flex sm:justify-center sm:px-6 sm:pb-5 lg:px-8 z-50">
      <div className="pointer-events-auto flex items-center justify-between gap-x-6 bg-black/40 dark:bg-white/10 backdrop-blur-md px-6 py-2.5 ring-1 ring-inset ring-white/10 sm:rounded-xl sm:py-3 sm:pl-4 sm:pr-3.5">
        <p className="text-sm/6 text-white">
          <strong className="font-semibold">Maintenance automatique</strong>
          <svg viewBox="0 0 2 2" aria-hidden="true" className="mx-2 inline size-0.5 fill-current">
            <circle r={1} cx={1} cy={1} />
          </svg>
          Se samedi entre 07h00 et 09h00 (heure serveur "Paris")
        </p>
        <button type="button" className="-m-1.5 flex-none p-1.5" onClick={handleDismiss}>
          <span className="sr-only">Masquer</span>
          <XMarkIcon aria-hidden="true" className="size-5 text-white" />
        </button>
      </div>
    </div>
  );
}
