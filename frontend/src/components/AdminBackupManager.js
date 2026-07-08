import React, { useEffect, useState } from "react";
import { ArrowDownTrayIcon, CircleStackIcon } from "@heroicons/react/24/outline";
import api from "../services/api";

const fallbackFilename = () => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `BDD_sami_${timestamp}_manual.sql`;
};

const filenameFromHeaders = (headers) => {
  const directFilename = headers?.["x-backup-filename"];
  if (directFilename) return directFilename;

  const disposition = headers?.["content-disposition"];
  const match = disposition?.match(/filename="?([^"]+)"?/i);
  return match?.[1] || fallbackFilename();
};

const blobToErrorMessage = async (blob) => {
  try {
    const text = await blob.text();
    const json = JSON.parse(text);
    return json?.error || "Impossible de lancer la sauvegarde manuelle.";
  } catch {
    return "Impossible de lancer la sauvegarde manuelle.";
  }
};

const AdminBackupManager = () => {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const checkSuperAdmin = async () => {
      try {
        const response = await api.get("/users/me");
        setIsSuperAdmin(response.data?.GradeID === 1);
      } catch (error) {
        console.error("Failed to verify super admin:", error);
        setIsSuperAdmin(false);
      } finally {
        setLoadingAuth(false);
      }
    };

    checkSuperAdmin();
  }, []);

  const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleManualBackup = async (event) => {
    event.preventDefault();
    setMessage("");
    setErrorMessage("");

    if (!currentPassword) {
      setErrorMessage("Le mot de passe est requis pour lancer une sauvegarde.");
      return;
    }

    setSaving(true);

    try {
      const response = await api.post(
        "/admin-backup/manual",
        { currentPassword },
        { responseType: "blob" }
      );

      const filename = filenameFromHeaders(response.headers);
      downloadBlob(response.data, filename);
      setCurrentPassword("");
      setMessage(`Sauvegarde créée dans backend/BDD/${filename} et téléchargée.`);
    } catch (error) {
      console.error("Erreur lors de la sauvegarde manuelle :", error);
      const blobError = error.response?.data instanceof Blob
        ? await blobToErrorMessage(error.response.data)
        : null;
      setErrorMessage(blobError || error.response?.data?.error || "Impossible de lancer la sauvegarde manuelle.");
    } finally {
      setSaving(false);
    }
  };

  if (!loadingAuth && !isSuperAdmin) {
    return (
      <section className="mx-auto my-8 max-w-2xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
        <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
          <h2 className="text-xl font-black text-slate-950 dark:text-white">Sauvegarde base de données</h2>
        </div>
        <div className="px-6 py-8 text-center">
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            <span className="font-bold text-sky-600 dark:text-sky-300">Accès interdit :</span><br />
            cette section est réservée au super administrateur.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto my-8 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
        <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Super administration</p>
        <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Sauvegarde base de données</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Crée une sauvegarde SQL dans backend/BDD et télécharge une seconde copie sur cet appareil.
        </p>
      </div>

      <form onSubmit={handleManualBackup} className="relative px-6 py-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
              Mot de passe du compte
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              className="w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white"
              placeholder="Confirmer l'action avec votre mot de passe"
              disabled={saving || loadingAuth}
            />
          </div>
          <button
            type="submit"
            disabled={saving || loadingAuth}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white"
          >
            {saving ? (
              <CircleStackIcon className="size-5 animate-pulse" />
            ) : (
              <ArrowDownTrayIcon className="size-5" />
            )}
            {saving ? "Sauvegarde..." : "Créer et télécharger"}
          </button>
        </div>

        {message && (
          <div className="relative mt-5 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-700 dark:text-emerald-200">
            {message}
          </div>
        )}
        {errorMessage && (
          <div className="relative mt-5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-700 dark:text-red-200">
            {errorMessage}
          </div>
        )}
      </form>
    </section>
  );
};

export default AdminBackupManager;
