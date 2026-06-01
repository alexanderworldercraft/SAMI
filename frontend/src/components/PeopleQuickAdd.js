import React, { useEffect, useState } from "react";
import api from "../services/api";
import ImageUploader from "./ImageUploader";

const apiUrl = process.env.REACT_APP_URL_LOCAL;
const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const labelClass = "mb-2 block text-sm/6 font-bold text-slate-700 dark:text-slate-200";
const submitClass = "inline-flex items-center justify-center rounded-lg border border-sky-300/40 bg-sky-500/15 px-5 py-3 text-sm font-bold text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:text-white";

/**
 * Composant "Ajout rapide d’une personne"
 * - réservé admin/superadmin
 * - multipart vers POST /api/people
 */
export default function PeopleQuickAdd() {
  const [user, setUser] = useState(null);
  const [Nom, setNom] = useState("");
  const [Prenom, setPrenom] = useState("");
  const [Surnom, setSurnom] = useState("");
  const [imageFile, setImageFile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/users/me");
        setUser(data);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const canEdit = user && (user.GradeID === 1 || user.GradeID === 2);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!Nom.trim() || !Prenom.trim()) {
      setMsg({ type: "error", text: "Nom et Prénom sont requis." });
      return;
    }
    try {
      setLoading(true);
      setMsg(null);
      const form = new FormData();
      form.append("Nom", Nom.trim());
      form.append("Prenom", Prenom.trim());
      if (Surnom.trim()) form.append("Surnom", Surnom.trim());
      if (imageFile) form.append("image", imageFile);

      const resp = await fetch(`${apiUrl}/api/people`, {
        method: "POST",
        body: form
      });

      if (!resp.ok) {
        const err = await resp.json().catch(()=>({}));
        throw new Error(err?.error || "Échec de la création.");
      }

      setMsg({ type: "success", text: "Personne créée." });
      setNom(""); setPrenom(""); setSurnom(""); setImageFile(null);
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  };

  if (!canEdit) {
    return (
      <div className="rounded-xl border border-sky-500/10 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-500 dark:bg-slate-950/40 dark:text-slate-300">
        Réservé aux administrateurs.
      </div>
    );
  }

  return (
    <section className="relative overflow-visible rounded-2xl border border-sky-500/10 bg-white/70 p-6 shadow-sm dark:bg-slate-950/40">
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.08),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.06),transparent_22%)]" />
      <div className="relative z-10">
      {msg && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${msg.type==="success" ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" : "border-red-400/30 bg-red-500/10 text-red-700 dark:text-red-200"}`}>
          {msg.text}
        </div>
      )}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4 dark:text-neutral-100">

        <div className="space-y-3">
          <div>
            <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Personnes</p>
            <h3 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">Ajouter une personne</h3>
          </div>
          <div>
            <label className={labelClass}>Nom</label>
            <input
              value={Nom}
              onChange={(e)=>setNom(e.target.value)}
              className={fieldClass}
              placeholder="Downey"
            />
          </div>
          <div>
            <label className={labelClass}>Prénom</label>
            <input
              value={Prenom}
              onChange={(e)=>setPrenom(e.target.value)}
              className={fieldClass}
              placeholder="Robert"
            />
          </div>
          <div>
            <label className={labelClass}>Surnom (optionnel)</label>
            <input
              value={Surnom}
              onChange={(e)=>setSurnom(e.target.value)}
              className={fieldClass}
              placeholder="RDJ"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={submitClass}
          >
            {loading ? "Enregistrement..." : "Créer"}
          </button>
        </div>

        <div className="flex justify-center md:justify-end">
          <ImageUploader setImage={setImageFile} />
        </div>
      </form>
      </div>
    </section>
  );
}
