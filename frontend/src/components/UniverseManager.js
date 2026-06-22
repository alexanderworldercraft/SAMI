import React, { useState } from "react";
import api from "../services/api";
import Notification from "./Notification";

const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "block text-sm/6 font-bold text-slate-700 dark:text-slate-200";
const submitClass = "inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";

const UniverseManager = () => {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  const showNotification = (message, icon = "ℹ️", type = "success") => {
    setNotification({ message, icon, type });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedTitle = title.trim();

    if (!trimmedTitle) {
      showNotification("Le titre de l'univers est obligatoire.", "⚠️", "error");
      return;
    }

    setSaving(true);

    try {
      await api.post("/universes", {
        Titre: trimmedTitle,
        Resume: summary,
        EtatID: 1,
      });
      setTitle("");
      setSummary("");
      showNotification("Univers ajouté avec succès.", "✅", "success");
    } catch (error) {
      console.error("Erreur lors de l'ajout de l'univers :", error);
      showNotification(error.response?.data?.error || "Erreur lors de l'ajout de l'univers.", "⚠️", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="relative overflow-hidden rounded-2xl border border-sky-500/10 bg-white/70 p-6 shadow-sm dark:bg-slate-950/40 dark:text-neutral-100">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.08),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.06),transparent_22%)]" />
      <div className="relative z-10">
        {notification && (
          <Notification
            message={notification.message}
            type={notification.type}
            icon={notification.icon}
            duration={4000}
            onClose={() => setNotification(null)}
          />
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Univers</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Créer un univers</h3>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <div className="flex justify-between">
                <label className={labelClass}>Titre de l'univers</label>
                <span className="text-sm/6 text-red-500">Obligatoire</span>
              </div>
              <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} className={fieldClass} required />
            </div>

            <div>
              <div className="flex justify-between">
                <label className={labelClass}>Résumé</label>
                <span className="text-sm/6 text-green-500">Optionnel</span>
              </div>
              <textarea rows={8} value={summary} onChange={(event) => setSummary(event.target.value)} className={fieldClass} />
            </div>
          </div>

          <button type="submit" disabled={saving} className={`${submitClass} mt-5`}>
            {saving ? "Création..." : "Créer l'univers"}
          </button>
        </form>
      </div>
    </section>
  );
};

export default UniverseManager;
