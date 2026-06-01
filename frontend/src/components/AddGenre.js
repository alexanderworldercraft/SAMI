import React, { useState } from "react";
import Notification from "./Notification";

const apiUrl = process.env.REACT_APP_URL_LOCAL || "https://192.168.0.17:1234";
const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "block text-sm/6 font-bold text-slate-700 dark:text-slate-200";
const submitClass = "inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 dark:text-white";

const AddGenre = () => {
  const [Nom, setNom] = useState("");
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = "success", icon = "ℹ️") => {
    setNotification({ message, type, icon });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    console.log("Données envoyées au backend :", Nom);

    try {
      const response = await fetch(`${apiUrl}/api/genres/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Nom: Nom,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        showNotification("Genre ajoutée avec succès.", "success", "✅");
        setNom("");
      } else {
        showNotification(data.error || "Erreur lors de l'ajout du genre.", "error", "⚠️");
      }
    } catch (error) {
      console.error("Erreur :", error);
      showNotification("Erreur interne du serveur.", "error", "⚠️");
    }
  };

  return (
    <section className="relative overflow-visible rounded-2xl border border-sky-500/10 bg-white/70 p-6 shadow-sm dark:bg-slate-950/40 dark:text-neutral-100">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.08),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.06),transparent_22%)]" />
      <div className="relative z-10">

      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          icon={notification.icon}
          duration={4000}
          onClose={() => console.log('Notification fermée')}
        />
      )}

      <form onSubmit={handleSubmit} className="grid gap-4">
        <div>
          <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Genres</p>
          <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Ajouter un genre</h3>
        </div>
        <div>
          <div className="flex justify-between">
            <label className={labelClass}>
              Nom du genre
            </label>
            <span className="text-sm/6 text-red-500">
              Obligatoire
            </span>
          </div>
          <input
            type="text"
            value={Nom}
            onChange={(e) => setNom(e.target.value)}
            className={fieldClass}
            required
          />
        </div>
        <button
          type="submit"
          className={submitClass}
        >
          Ajouter le genre
        </button>
      </form>
      </div>
    </section>
  );
};

export default AddGenre;
