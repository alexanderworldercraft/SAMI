import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../services/api";

export default function PasswordRecoveryPage() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("token") || "");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { window.history.replaceState(null, "", window.location.pathname + window.location.search); }, []);
  const confirm = async () => {
    setBusy(true); setError("");
    try { const response = await api.post("/users/password-recovery/confirm", { token }); setResult(response.data); }
    catch (err) { setError(err.response?.data?.error || "La confirmation est momentanément indisponible."); }
    finally { setBusy(false); }
  };
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center p-6">
      <section className="w-full rounded-2xl border border-sky-500/30 bg-white p-6 text-slate-950 shadow-xl dark:bg-slate-950 dark:text-white">
        <h1 className="text-2xl font-bold">Récupération de ton compte SAMI</h1>
        {result ? <>
          <p className="mt-4">Voici le mot de passe temporaire de <strong>{result.surnom}</strong>. Il est affiché une seule fois et permet une seule connexion, pendant quinze minutes.</p>
          <label htmlFor="temporary-recovery-password" className="mt-4 block text-sm text-slate-600 dark:text-slate-300">Mot de passe temporaire</label>
          <input id="temporary-recovery-password" readOnly value={result.temporaryPassword} autoComplete="off" spellCheck="false" onFocus={event => event.target.select()} className="mt-1 w-full rounded-lg border border-amber-500/50 bg-amber-50 p-3 font-mono text-amber-950 dark:bg-black dark:text-amber-200" />
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Après ta connexion, une fenêtre obligatoire te demandera de choisir et confirmer ton nouveau mot de passe. Ne recharge pas cette page avant d’avoir copié le mot de passe temporaire.</p>
          <Link to="/login" className="mt-6 inline-block rounded-lg bg-sky-700 px-4 py-3 font-semibold text-white hover:bg-sky-600">Me connecter</Link>
        </> : <>
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Confirme ta demande pour obtenir un mot de passe temporaire. Ton mot de passe actuel sera alors remplacé.</p>
          {(!token || error) && <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">{error || "Lien absent ou invalide. Demande un nouveau lien depuis la connexion."}</p>}
          <button type="button" onClick={confirm} disabled={!token || busy} className="mt-6 w-full rounded-lg bg-sky-700 px-4 py-3 font-semibold text-white hover:bg-sky-600 disabled:opacity-50">{busy ? "Confirmation en cours…" : "Confirmer la récupération"}</button>
          <Link to="/login" className="mt-4 block text-center text-sm text-sky-700 underline dark:text-sky-300">Retour à la connexion</Link>
        </>}
      </section>
    </main>
  );
}
