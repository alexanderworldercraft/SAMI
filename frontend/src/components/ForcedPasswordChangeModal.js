import React, { useRef, useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import api from "../services/api";
import { notifySessionChanged } from "../utils/sessionEvents";

export default function ForcedPasswordChangeModal({ onCompleted }) {
  const firstInput = useRef(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    setError("");
    if (password !== confirmation) { setError("Le mot de passe et sa confirmation ne correspondent pas."); return; }
    setBusy(true);
    try {
      await api.post("/users/password-recovery/complete", { newPassword: password, confirmPassword: confirmation });
      setPassword(""); setConfirmation("");
      notifySessionChanged();
      onCompleted();
    } catch (err) { setError(err.response?.data?.error || "Impossible de modifier le mot de passe. Réessaie."); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    setBusy(true);
    try {
      await api.post("/users/logout");
      notifySessionChanged();
      window.location.assign("/login");
    } catch (_) { setError("La déconnexion a échoué. Réessaie."); setBusy(false); }
  };
  return (
    <Dialog open onClose={() => {}} initialFocus={firstInput} className="relative z-[300]">
      <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <DialogPanel className="w-full max-w-md rounded-2xl border border-sky-500/40 bg-white p-6 text-slate-950 shadow-2xl dark:bg-slate-950 dark:text-white">
          <DialogTitle className="text-xl font-bold">Choisis ton nouveau mot de passe</DialogTitle>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Tu as utilisé un mot de passe de récupération. Pour accéder à SAMI, remplace-le par ton mot de passe personnel.</p>
          <p id="recovery-password-policy" className="mt-2 text-xs text-slate-600 dark:text-slate-400">8 à 20 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial.</p>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="recovery-new-password" className="mb-1 block text-sm">Nouveau mot de passe</label>
              <input ref={firstInput} id="recovery-new-password" type="password" autoComplete="new-password" aria-describedby="recovery-password-policy" required minLength={8} maxLength={20} disabled={busy} value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-lg border border-slate-400 bg-white dark:border-slate-600 dark:bg-slate-900 px-3 py-2 focus:border-sky-400" />
            </div>
            <div>
              <label htmlFor="recovery-password-confirmation" className="mb-1 block text-sm">Confirmer le nouveau mot de passe</label>
              <input id="recovery-password-confirmation" type="password" autoComplete="new-password" required minLength={8} maxLength={20} disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)} className="w-full rounded-lg border border-slate-400 bg-white dark:border-slate-600 dark:bg-slate-900 px-3 py-2 focus:border-sky-400" />
            </div>
            {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-sky-700 px-4 py-3 font-semibold text-white hover:bg-sky-600 disabled:opacity-50">{busy ? "Modification en cours…" : "Enregistrer mon mot de passe"}</button>
          </form>
          <button type="button" disabled={busy} onClick={logout} className="mt-4 w-full text-sm text-slate-600 dark:text-slate-300 underline disabled:opacity-50">Me déconnecter</button>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
