import React, { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/20/solid";
import api from "../services/api";

const GeneralMessageBanner = () => {
  const [message, setMessage] = useState(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const fetchMessage = async () => {
      try {
        const response = await api.get("/admin-message/active");
        if (response.data?.Actif) {
          setMessage(response.data);
          setIsVisible(true);
        }
      } catch (error) {
        console.error("Erreur lors de la récupération du message général :", error);
      }
    };

    fetchMessage();
  }, []);

  if (!message || !isVisible) {
    return null;
  }

  return (
    <div className="mx-auto mt-4 max-w-6xl px-4 sm:px-6 lg:px-8">
      <div className="flex items-start justify-between gap-4 rounded-xl border border-sky-300/30 bg-sky-500/15 px-5 py-4 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-sky-400/10 dark:shadow-sky-950/20">
        <div>
          <p className="text-sm font-black text-slate-950 dark:text-white">{message.Titre}</p>
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-slate-200">
            {message.Description}
          </p>
        </div>
        <button type="button" className="-m-1.5 flex-none p-1.5" onClick={() => setIsVisible(false)}>
          <span className="sr-only">Masquer</span>
          <XMarkIcon aria-hidden="true" className="size-5 text-slate-700 dark:text-white" />
        </button>
      </div>
    </div>
  );
};

export default GeneralMessageBanner;
