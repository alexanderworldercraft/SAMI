import React, { useEffect, useState } from "react";
import api from "../services/api";

export const toDateTimeLocalValue = (value) => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return localDate.toISOString().slice(0, 19);
};

const getExpirationForApi = (value) => {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date <= new Date()) {
    throw new Error("La date de désactivation doit être dans le futur.");
  }

  return date.toISOString();
};

const AdminMessageSettings = () => {
  const [titre, setTitre] = useState("");
  const [description, setDescription] = useState("");
  const [actif, setActif] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const fetchAdminMessage = async () => {
      try {
        const response = await api.get("/admin-message");
        setTitre(response.data?.Titre || "");
        setDescription(response.data?.Description || "");
        setActif(Boolean(response.data?.Actif));
        setExpiresAt(
          response.data?.Actif ? toDateTimeLocalValue(response.data?.ExpiresAt) : ""
        );
      } catch (error) {
        console.error("Erreur lors de la récupération du message admin :", error);
        setErrorMessage(error.response?.data?.error || "Impossible de récupérer le message admin.");
      } finally {
        setLoading(false);
      }
    };

    fetchAdminMessage();
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setErrorMessage("");

    try {
      const payload = {
        Titre: titre,
        Description: description,
      };

      if (actif && expiresAt) {
        payload.ExpiresAt = getExpirationForApi(expiresAt);
      }

      const response = await api.put("/admin-message", payload);

      setTitre(response.data?.Titre || "");
      setDescription(response.data?.Description || "");
      setActif(Boolean(response.data?.Actif));
      setExpiresAt(
        response.data?.Actif ? toDateTimeLocalValue(response.data?.ExpiresAt) : ""
      );
      setMessage("Message mis à jour.");
    } catch (error) {
      console.error("Erreur lors de la maj du message admin :", error);
      setErrorMessage(
        error.response?.data?.error ||
          error.message ||
          "Impossible de mettre à jour le message admin."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async () => {
    const nextActif = !actif;
    setActif(nextActif);
    setMessage("");
    setErrorMessage("");

    try {
      const payload = {
        Actif: nextActif,
      };

      if (nextActif && expiresAt) {
        payload.ExpiresAt = getExpirationForApi(expiresAt);
      }

      const response = await api.put("/admin-message/toggle", payload);

      setActif(Boolean(response.data?.Actif));
      setExpiresAt(
        response.data?.Actif ? toDateTimeLocalValue(response.data?.ExpiresAt) : ""
      );
      setMessage(response.data?.Actif ? "Message activé." : "Message désactivé.");
    } catch (error) {
      console.error("Erreur lors du changement d'état du message admin :", error);
      setActif(!nextActif);
      setErrorMessage(
        error.response?.data?.error ||
          error.message ||
          "Impossible de changer l'état du message admin."
      );
    }
  };

  return (
    <section className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="flex flex-col gap-4 border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Administration</p>
          <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Message général</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
            Configure le message visible sur l'application.
          </p>
        </div>

        <button
          type="button"
          onClick={handleToggle}
          disabled={loading}
          className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full border transition duration-200 ${
            actif
              ? "border-emerald-300/70 bg-emerald-500/80"
              : "border-slate-300/70 bg-slate-300/70 dark:border-slate-700 dark:bg-slate-800"
          } disabled:cursor-not-allowed disabled:opacity-60`}
        >
          <span className="sr-only">
            {actif ? "Désactiver le message général" : "Activer le message général"}
          </span>
          <span
            className={`inline-block size-6 rounded-full bg-white shadow transition duration-200 ${
              actif ? "translate-x-9" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <div className="relative px-6 py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative">
          {message && (
            <div className="mb-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">
              {message}
            </div>
          )}
          {errorMessage && (
            <div className="mb-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="grid gap-5">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Titre</label>
              <input
                type="text"
                className="w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white"
                value={titre}
                onChange={(event) => setTitre(event.target.value)}
                maxLength={150}
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">Description</label>
              <textarea
                className="min-h-32 w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
            </div>

            <div>
              <label
                htmlFor="admin-message-expires-at"
                className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200"
              >
                Date de désactivation (optionnelle)
              </label>
              <input
                id="admin-message-expires-at"
                type="datetime-local"
                step="1"
                className="[color-scheme:light] dark:[color-scheme:dark] w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white"
                value={expiresAt}
                min={toDateTimeLocalValue(new Date())}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Si ce champ reste vide à l'activation, le message sera désactivé
                automatiquement 7 jours plus tard.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || saving}
              className="inline-flex w-full items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white"
            >
              {saving ? "Enregistrement..." : "Valider"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
};

export default AdminMessageSettings;
