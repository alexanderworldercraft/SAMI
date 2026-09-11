import React, { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MicrophoneIcon, SparklesIcon } from "@heroicons/react/24/outline";
import api from "../services/api";
import { useAiFeaturePreference } from "../context/AiFeaturePreferenceContext";
import DubbingVideoSelect from "./DubbingVideoSelect";
import { VOICE_PRESENTATION_TEXT } from "../constants/voicePresentation";

const inputClass = "w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-950 dark:border-slate-600 dark:bg-slate-950 dark:text-white";
const buttonClass = "rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:opacity-50";
const panelClass = "rounded-2xl border border-sky-500/15 bg-white p-5 shadow-sm dark:bg-slate-900";
const languages = [{ code: "fr", label: "Français" }, { code: "en", label: "Anglais" }, { code: "ja", label: "Japonais" }];
const languageName = code => languages.find(l => l.code === code)?.label || code;
const personName = person => [person?.Prenom, person?.Nom].filter(Boolean).join(" ") || person?.Surnom || "Personne";
const statusNames = { QUEUED: "En attente d’un worker", PROCESSING: "Génération en cours", FAILED: "Génération échouée", READY: "Prêt" };
const audioUrl = (id, download = false) => `${api.defaults.baseURL}/voices/${id}/${download ? "download" : "audio"}`;

function LanguageSelect({ value, onChange }) {
  return <label className="grid gap-2 text-sm font-medium">Langue
    <select className={inputClass} value={value} onChange={e => onChange(e.target.value)}>{languages.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}</select>
  </label>;
}

function OriginalForm({ onSaved, personId }) {
  const [people, setPeople] = useState([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ personId: personId || "", title: "", language: "fr", text: "", authorizationNote: "", authorized: false, videoId: "", start: "0", end: "10" });
  const [source, setSource] = useState("upload");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  useEffect(() => {
    let active = true;
    api.get("/people", { params: { search } }).then(r => { if (active) setPeople(r.data); }).catch(() => { if (active) setError("Impossible de charger les personnes."); });
    return () => { active = false; };
  }, [search]);
  const submit = async e => {
    e.preventDefault(); setBusy(true); setError("");
    try {
      let body = form;
      if (source === "upload") {
        if (!file) throw new Error("Sélectionnez un fichier audio.");
        body = new FormData();
        Object.entries(form).forEach(([key, value]) => body.append(key, value));
        body.append("audio", file);
      }
      await api.post("/voices/originals", body);
      onSaved();
    } catch (err) { setError(err.response?.data?.error || err.message || "Ajout impossible."); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit} className={`${panelClass} grid gap-4`}>
    <h2 className="text-lg font-bold">Ajouter une voix originale</h2>
    <p className="text-sm text-slate-600 dark:text-slate-300">Conservez un extrait original de 3 à 30 secondes, avec une seule personne qui parle. L’ajout ne déclenche aucune génération. Cet original restera disponible comme référence pour de futures répliques et sera privé jusqu’à sa publication.</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-medium">Rechercher une personne<input className={inputClass} value={search} onChange={e => setSearch(e.target.value)} placeholder="Nom ou prénom" /></label>
      <label className="grid gap-2 text-sm font-medium">Personne<select required className={inputClass} value={form.personId} onChange={e => set("personId", e.target.value)}><option value="">Sélectionner une personne</option>{people.map(p => <option key={p.PersonneID} value={p.PersonneID}>{personName(p)}</option>)}</select></label>
      <label className="grid gap-2 text-sm font-medium">Titre<input required maxLength={191} className={inputClass} value={form.title} onChange={e => set("title", e.target.value)} placeholder="Extrait de référence" /></label>
      <LanguageSelect value={form.language} onChange={v => set("language", v)} />
    </div>
    <label className="grid gap-2 text-sm font-medium">Source<select className={inputClass} value={source} onChange={e => setSource(e.target.value)}><option value="upload">Importer un fichier audio</option><option value="video">Extraire une vidéo SAMI</option></select></label>
    {source === "upload" ? <label className="grid gap-2 text-sm">Fichier audio · 50 Mo maximum<input required type="file" accept="audio/*" onChange={e => setFile(e.target.files[0])} /></label> : <>
      <DubbingVideoSelect value={form.videoId} onChange={v => set("videoId", v)} />
      <div className="grid grid-cols-2 gap-4">{[["start", "Début (secondes)"], ["end", "Fin (secondes)"]].map(([key, label]) => <label key={key} className="grid gap-2 text-sm">{label}<input required className={inputClass} type="number" min="0" step="0.1" value={form[key]} onChange={e => set(key, e.target.value)} /></label>)}</div>
    </>}
    <label className="grid gap-2 text-sm font-medium">Transcription exacte de l’extrait<textarea required maxLength={1000} rows={3} className={inputClass} value={form.text} onChange={e => set("text", e.target.value)} /></label>
    <label className="grid gap-2 text-sm font-medium">Justificatif d’autorisation<textarea required maxLength={2000} rows={2} className={inputClass} value={form.authorizationNote} onChange={e => set("authorizationNote", e.target.value)} placeholder="Origine de l’autorisation, périmètre et référence du justificatif" /></label>
    <label className="flex items-start gap-3 text-sm"><input required type="checkbox" className="mt-1" checked={form.authorized} onChange={e => set("authorized", e.target.checked)} />Je confirme disposer de l’autorisation d’utiliser cette voix pour créer et, si je les publie, partager des répliques synthétiques.</label>
    {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
    <button disabled={busy} className={`${buttonClass} justify-self-start`}>{busy ? "Import en cours…" : "Conserver l’original"}</button>
  </form>;
}

function ReplicaForm({ original, onSaved, onClose }) {
  const [title, setTitle] = useState(`Présentation IA · ${personName(original.person)}`.slice(0, 191));
  const [text, setText] = useState(VOICE_PRESENTATION_TEXT[original.language] || VOICE_PRESENTATION_TEXT.fr);
  const [language, setLanguage] = useState(original.language);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <form className={`${panelClass} grid gap-4`} onSubmit={async e => {
    e.preventDefault(); setBusy(true); setError("");
    try { await api.post(`/voices/${original.id}/replicas`, { title, text, language }); onSaved(); }
    catch (err) { setError(err.response?.data?.error || "Génération impossible."); }
    finally { setBusy(false); }
  }}>
    <h2 className="text-lg font-bold">Générer une réplique IA · {personName(original.person)}</h2>
    <p className="text-sm">Voix de référence : {original.title}. La réplique sera privée et pourra être écoutée avant publication.</p>
    <label className="grid gap-2 text-sm">Titre<input required maxLength={191} className={inputClass} value={title} onChange={e => setTitle(e.target.value)} /></label>
    <LanguageSelect value={language} onChange={next => {
      if (text === VOICE_PRESENTATION_TEXT[language]) setText(VOICE_PRESENTATION_TEXT[next]);
      setLanguage(next);
    }} />
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p>Le texte de présentation est proposé par défaut. Vous pouvez le modifier librement.</p><button type="button" className="text-sky-700 underline dark:text-sky-300" onClick={() => setText(VOICE_PRESENTATION_TEXT[language])}>Rétablir le texte de présentation</button></div>
    <label className="grid gap-2 text-sm">Texte à prononcer · {text.length}/500<textarea required maxLength={500} rows={4} className={inputClass} value={text} onChange={e => setText(e.target.value)} /></label>
    {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
    <div className="flex gap-3"><button disabled={busy} className={buttonClass}>{busy ? "Envoi…" : "Générer la réplique"}</button><button type="button" onClick={onClose}>Annuler</button></div>
  </form>;
}

export function VoiceCollection({ personId, compact = false }) {
  const [data, setData] = useState(null); const [page, setPage] = useState(1);
  const [search, setSearch] = useState(""); const [error, setError] = useState("");
  const [adding, setAdding] = useState(false); const [original, setOriginal] = useState(null);
  const [workerReady, setWorkerReady] = useState(null); const [busyId, setBusyId] = useState(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(v => v + 1), []);
  useEffect(() => {
    let active = true;
    const load = () => api.get("/voices", { params: { personId, page, search } }).then(r => {
      if (active) { setData(r.data); setError(""); }
    }).catch(err => { if (active) { setError(err.response?.data?.error || "Bibliothèque indisponible."); if ([401, 403, 428].includes(err.response?.status)) setData(null); } });
    load();
    const timer = setInterval(load, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [personId, page, search, revision]);
  useEffect(() => {
    if (!data?.admin) return;
    let active = true;
    const load = () => api.get("/voices/config").then(r => { if (active) setWorkerReady(r.data.workerReady); }).catch(() => {});
    load();
    const timer = setInterval(load, 10000);
    return () => { active = false; clearInterval(timer); };
  }, [data?.admin, revision]);
  const action = async (id, suffix, body) => {
    setBusyId(id); setError("");
    try { if (suffix === "visibility") await api.patch(`/voices/${id}/${suffix}`, body); else await api.post(`/voices/${id}/${suffix}`, body); refresh(); }
    catch (err) { setError(err.response?.data?.error || "Opération impossible."); }
    finally { setBusyId(null); }
  };
  return <section className="grid gap-5 text-slate-900 dark:text-white" aria-label="Bibliothèque de voix">
    <div className="flex flex-wrap items-center justify-between gap-3">
      {compact ? <h2 className="text-xl font-bold">Voix originales et répliques IA</h2> : <label className="w-full max-w-md"><span className="sr-only">Rechercher une voix</span><input className={inputClass} placeholder="Rechercher une personne ou un extrait…" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>}
      {data?.admin && <div className="flex flex-wrap gap-3"><button className={buttonClass} onClick={() => { setAdding(v => !v); setOriginal(null); }}>{adding ? "Fermer l’ajout" : "Ajouter une voix originale"}</button>{compact && <Link className="self-center text-sm text-sky-700 underline dark:text-sky-300" to={`/voix?personId=${personId}`}>Voir la bibliothèque</Link>}</div>}
    </div>
    {data?.admin && (!compact || original) && workerReady === false && <p className="rounded-xl bg-amber-500/10 p-3 text-sm">Aucun worker vocal compatible n’est disponible actuellement. Les générations resteront en attente.</p>}
    {adding && <OriginalForm personId={personId} onSaved={() => { setAdding(false); setPage(1); refresh(); }} />}
    {original && <ReplicaForm key={original.id} original={original} onClose={() => setOriginal(null)} onSaved={() => { setOriginal(null); setPage(1); refresh(); }} />}
    {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
    {!data && !error && <p>Chargement des voix…</p>}
    {data?.items.length === 0 && <div className={`${panelClass} py-10 text-center`}><MicrophoneIcon className="mx-auto mb-3 h-9 w-9 text-sky-500" /><p>Aucune voix {data.admin ? "enregistrée" : "publiée"} pour le moment.</p></div>}
    <div className="grid gap-4 lg:grid-cols-2">{data?.items.map(item => <article key={item.id} className={`${panelClass} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center gap-2 text-xs font-bold"><span className={`rounded-full px-3 py-1 ${item.kind === "AI" ? "bg-violet-500/15 text-violet-700 dark:text-violet-300" : "bg-sky-500/15 text-sky-700 dark:text-sky-300"}`}>{item.kind === "AI" ? "IA · Voix synthétique" : "Original"}</span><span>{languageName(item.language)}</span>{data.admin && <span className="ml-auto text-slate-500 dark:text-slate-400">{item.public ? "Publié" : "Privé · admins"}</span>}</div>
      <div><h3 className="text-lg font-bold">{item.title}</h3><Link className="text-sm text-sky-700 hover:underline dark:text-sky-300" to={`/personnes/${item.personId}`}>{personName(item.person)}{item.kind === "AI" ? " · IA" : ""}</Link></div>
      <p className="whitespace-pre-wrap break-words text-sm text-slate-600 dark:text-slate-300">{item.text}</p>
      {item.status === "READY" ? <audio aria-label={`${item.kind === "AI" ? "IA" : "Original"} : ${item.title}`} controls controlsList={data.admin ? undefined : "nodownload"} preload="none" crossOrigin="use-credentials" src={audioUrl(item.id)} className="mt-auto w-full" onContextMenu={data.admin ? undefined : e => e.preventDefault()} /> : <p role="status" className="text-sm">{statusNames[item.status]}</p>}
      {item.originalId && item.kind === "AI" && <details className="text-sm"><summary className="cursor-pointer text-sky-700 dark:text-sky-300">Écouter l’original de référence</summary><audio aria-label={`Original de référence : ${item.title}`} controls controlsList={data.admin ? undefined : "nodownload"} crossOrigin="use-credentials" preload="none" src={audioUrl(item.originalId)} className="mt-3 w-full" /></details>}
      {data.admin && <>
        {item.error && <p className="text-sm text-red-600 dark:text-red-400">{item.error}</p>}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {item.kind === "ORIGINAL" && <button className={buttonClass} onClick={() => { setOriginal(item); setAdding(false); }}>Utiliser comme référence</button>}
          {item.status === "READY" && <><button disabled={busyId === item.id} className="font-semibold text-sky-700 dark:text-sky-300" onClick={() => action(item.id, "visibility", { public: !item.public })}>{item.public ? "Rendre privé" : "Publier"}</button><a className="text-slate-600 underline dark:text-slate-300" href={audioUrl(item.id, true)}>Télécharger {item.kind === "AI" ? "l’IA" : "l’original"}</a></>}
          {item.status === "FAILED" && <button disabled={busyId === item.id} className={buttonClass} onClick={() => action(item.id, "retry", {})}>Relancer</button>}
        </div>
        <details className="text-xs text-slate-500 dark:text-slate-400"><summary className="cursor-pointer">Autorisation d’utilisation</summary><p className="mt-2 whitespace-pre-wrap">{item.authorizationNote}</p><p>Confirmée par l’administrateur #{item.authorizedBy} le {new Date(item.authorizedAt).toLocaleDateString("fr-FR")}.</p></details>
      </>}
    </article>)}</div>
    {data?.pages > 1 && <nav aria-label="Pagination des voix" className="flex items-center justify-center gap-4"><button className={buttonClass} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Précédent</button><span>{page} / {data.pages}</span><button className={buttonClass} disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>Suivant</button></nav>}
  </section>;
}

export function PersonVoiceSection({ personId }) {
  const { authenticated, preference, loading } = useAiFeaturePreference();
  if (!authenticated || loading || !preference?.accepted) return null;
  return <VoiceCollection key={personId} personId={personId} compact />;
}

export default function VoiceLibraryPage() {
  const { authenticated, preference, loading } = useAiFeaturePreference();
  const [params] = useSearchParams();
  if (loading) return <p className="py-10">Chargement…</p>;
  if (!authenticated || !preference?.accepted) return <div className="py-10 text-slate-900 dark:text-white"><p>L’accès aux voix nécessite une connexion et l’acceptation des conditions IA de SAMI.</p><Link className="text-sky-600 underline" to="/settings">Gérer mes préférences</Link></div>;
  return <div className="mx-auto max-w-6xl space-y-7 py-8">
    <header className="rounded-3xl border border-sky-500/20 bg-gradient-to-br from-sky-500/15 via-violet-500/10 to-transparent p-7 text-slate-900 dark:text-white">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-sky-700 dark:text-sky-300"><MicrophoneIcon className="h-5 w-5" />SAMI · Voix</div>
      <h1 className="text-3xl font-black sm:text-4xl">Des voix, des originaux aux répliques.</h1>
      <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">Écoutez les voix originales et leurs répliques synthétiques. Chaque extrait IA est identifié : il ne constitue pas une déclaration réelle de la personne.</p>
      <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-violet-700 dark:text-violet-300"><SparklesIcon className="h-4 w-4" />Génération locale · Originaux conservés</p>
    </header>
    <VoiceCollection key={params.get("personId") || "all"} personId={params.get("personId") || undefined} />
  </div>;
}
