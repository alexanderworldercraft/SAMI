import React, { useEffect, useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { HomeIcon, FilmIcon, MusicalNoteIcon, Bars3Icon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import api from "../../../services/api";
import ThemeToggle from "../../../components/ThemeToggle";
import { useAiFeaturePreference } from "../../../context/AiFeaturePreferenceContext";
import { scrollToPageTop } from "../../../utils/scrollToPageTop";
import TactileSearch from "../components/TactileSearch";

const mainLinks = [
  { href: "/", label: "Accueil", Icon: HomeIcon },
  { href: "/videos", label: "Vidéos", Icon: FilmIcon },
  { href: "/musique", label: "Musique", Icon: MusicalNoteIcon },
];

export default function TactileNavigation() {
  const [panel, setPanel] = useState(null);
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const ai = useAiFeaturePreference();
  useEffect(() => {
    let active = true;
    api.get("/users/me").then((response) => { if (active) setUser(response.data); }).catch(() => { if (active) setUser(null); });
    return () => { active = false; };
  }, []);
  useEffect(() => { setPanel(null); setError(""); }, [pathname, search]);
  const close = () => { setPanel(null); setError(""); };
  const onNavigate = () => { close(); scrollToPageTop(); };
  const links = [
    { href: "/sagas", label: "Sagas" },
    { href: "/personnes", label: "Acteurs et réalisateurs" },
    ...(ai.authenticated && ai.preference?.accepted && !ai.loading ? [{ href: "/voix", label: "Voix" }] : []),
    ...(user ? [{ href: "/profile", label: "Mon profil" }, { href: "/settings", label: "Paramètres" }] : [{ href: "/login", label: "Connexion" }]),
    ...([1, 2].includes(user?.GradeID) ? [{ href: "/administration", label: "Administration" }, { href: "/nouvelle-video", label: "Nouvelle vidéo" }, { href: "/nouvelle-musique", label: "Nouvelle musique" }] : []),
    { href: "/updates", label: "Mises à jour" },
    { href: "/stats", label: "Statistiques" },
    { href: "/politique-confidentialite", label: "Confidentialité" },
    { href: "/conditions-utilisation", label: "Conditions d'utilisation" },
    { href: "/conformite-donnees", label: "Conformité des données" },
  ];
  const random = async (endpoint) => {
    setBusy(true); setError("");
    try {
      const response = await api.get(`/videos/${endpoint}`);
      if (!response.data?.VideoID) throw new Error("empty");
      onNavigate(); navigate(`/lecture/${response.data.VideoID}`);
    } catch (_) { setError("Aucun contenu disponible pour ce choix."); }
    finally { setBusy(false); }
  };
  const logout = async () => {
    setBusy(true); setError("");
    try {
      await api.post("/users/logout");
      localStorage.removeItem("token"); setUser(null); close(); navigate("/login");
    } catch (_) { setError("Déconnexion impossible. Réessayez."); }
    finally { setBusy(false); }
  };
  return <>
    <header className="tactile-topbar sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-sky-500/15 bg-white/95 px-4 py-2 text-slate-900 backdrop-blur dark:bg-slate-950/95 dark:text-white">
      <Link to="/" onClick={onNavigate} className="tactile-action flex items-center gap-2 font-black"><img src="/logo.png" alt="" className="h-8 w-auto" />{process.env.REACT_APP_NAME || "SAMI"}</Link>
      <div className="flex gap-2"><button className="tactile-action bg-sky-500/10" aria-label="Rechercher" onClick={() => setPanel("search")}><MagnifyingGlassIcon className="size-6" aria-hidden="true" /></button></div>
    </header>
    <nav aria-label="Navigation tactile" className="tactile-bottom-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-sky-500/20 bg-white/95 text-slate-900 backdrop-blur dark:bg-slate-950/95 dark:text-white">
      {mainLinks.map(({ href, label, Icon }) => <Link key={href} to={href} onClick={onNavigate} aria-current={pathname === href ? "page" : undefined} className={`tactile-tab ${pathname === href ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : ""}`}><Icon className="size-6" aria-hidden="true" /><span>{label}</span></Link>)}
      <button aria-label="Plus de rubriques" aria-expanded={panel === "menu"} onClick={() => setPanel("menu")} className="tactile-tab"><Bars3Icon className="size-6" aria-hidden="true" /><span>Plus</span></button>
    </nav>
    <Dialog open={panel !== null} onClose={close} className="relative z-[160]">
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm" aria-hidden="true" />
      <div className="fixed inset-0 flex items-end justify-center p-3 sm:items-center sm:p-6">
        <DialogPanel className="tactile-menu-panel w-full max-w-xl overflow-y-auto rounded-2xl border border-sky-400/20 bg-white p-5 text-slate-900 shadow-2xl dark:bg-slate-950 dark:text-white">
          <div className="sticky top-0 z-10 mb-4 flex items-center justify-between gap-3 bg-white py-2 dark:bg-slate-950"><DialogTitle className="text-xl font-black">{panel === "search" ? "Rechercher" : "Toutes les rubriques"}</DialogTitle><button className="tactile-action bg-sky-500/10" aria-label="Fermer" onClick={close}><XMarkIcon className="size-6" aria-hidden="true" /></button></div>
          {panel === "search" ? <TactileSearch onNavigate={onNavigate} /> : <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{links.map(({ href, label }) => <Link key={href} to={href} onClick={onNavigate} aria-current={pathname === href ? "page" : undefined} className="tactile-action bg-sky-500/10">{label}</Link>)}</div>
            <div className="mt-5 flex flex-wrap items-center gap-3"><span>Thème</span><ThemeToggle tactile /></div>
            {user && <><h3 className="mb-2 mt-5 font-bold">Lecture aléatoire</h3><div className="grid gap-2 sm:grid-cols-3">{[["random-media", "Tout contenu"], ["random-film", "Un film"], ["random-series", "Une série"]].map(([endpoint, label]) => <button key={endpoint} disabled={busy} onClick={() => random(endpoint)} className="tactile-action bg-sky-500/10">{label}</button>)}</div><button className="tactile-action mt-5 w-full border border-red-400/30 text-red-700 dark:text-red-300" disabled={busy} onClick={logout}>Se déconnecter</button></>}
            {error && <p role="alert" className="mt-3 text-red-700 dark:text-red-300">{error}</p>}
            <p className="mt-4 text-xs text-slate-600 dark:text-slate-400">SAMI {process.env.REACT_APP_VER}</p>
          </>}
        </DialogPanel>
      </div>
    </Dialog>
  </>;
}
