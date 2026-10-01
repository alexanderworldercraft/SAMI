import React, { useEffect, useState } from "react";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api from "../../../services/api";
import { useAiFeaturePreference } from "../../../context/AiFeaturePreferenceContext";
import ThemeToggle from "../../../components/ThemeToggle";
import TactileSearch from "../../tactile/components/TactileSearch";

export default function RemoteNavigation() {
  const [user, setUser] = useState(null);
  const [panel, setPanel] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const ai = useAiFeaturePreference();
  useEffect(() => {
    let active = true;
    api.get("/users/me").then(({ data }) => { if (active) setUser(data); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => { setPanel(null); setError(""); }, [pathname, search]);
  const close = () => { setPanel(null); setError(""); };
  const links = [
    ["/", "Accueil"], ["/videos", "Vidéos"], ["/musique", "Musique"],
    ["/sagas", "Sagas"], ["/personnes", "Acteurs et réalisateurs"],
    ...(ai.authenticated && ai.preference?.accepted && !ai.loading ? [["/voix", "Voix"]] : []),
    ...(user ? [["/settings", "Paramètres"]] : [["/login", "Connexion"]]),
  ];
  const more = [
    ...([1, 2].includes(user?.GradeID) ? [["/administration", "Administration"], ["/nouvelle-video", "Nouvelle vidéo"], ["/nouvelle-musique", "Nouvelle musique"]] : []),
    ["/updates", "Mises à jour"], ["/stats", "Statistiques"],
    ["/politique-confidentialite", "Confidentialité"], ["/conditions-utilisation", "Conditions d'utilisation"], ["/conformite-donnees", "Conformité des données"],
  ];
  const random = async (endpoint) => {
    setBusy(true); setError("");
    try {
      const { data } = await api.get(`/videos/${endpoint}`);
      if (!data?.VideoID) throw new Error("empty");
      close(); navigate(`/lecture/${data.VideoID}`);
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
    <nav className="remote-sidebar" aria-label="Navigation télécommande">
      <Link className="remote-brand" to="/"><img src="/logo.png" alt="" />{process.env.REACT_APP_NAME || "SAMI"}</Link>
      <button onClick={() => setPanel("search")}>Rechercher</button>
      {links.map(([href, label]) => <Link key={href} to={href} aria-current={pathname === href ? "page" : undefined}>{label}</Link>)}
      <button onClick={() => setPanel("more")} aria-expanded={panel === "more"}>Plus de rubriques</button>
      <p className="remote-hint">Flèches : naviguer · OK : choisir · Retour : revenir</p>
    </nav>
    <Dialog open={panel !== null} onClose={close} className="relative z-[160]">
      <div className="fixed inset-0 bg-slate-950/80" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-8">
        <DialogPanel className="remote-dialog w-full max-w-4xl overflow-y-auto rounded-2xl bg-white p-8 text-slate-900 dark:bg-slate-950 dark:text-white">
          <div className="mb-6 flex items-center justify-between gap-6"><DialogTitle className="text-3xl font-black">{panel === "search" ? "Rechercher" : "Toutes les rubriques"}</DialogTitle><button onClick={close}>Fermer</button></div>
          {panel === "search" ? <TactileSearch onNavigate={close} /> : <>
            <div className="grid grid-cols-2 gap-4">{more.map(([href, label]) => <Link key={href} to={href} onClick={close}>{label}</Link>)}</div>
            <div className="my-6 flex items-center gap-6"><span>Thème</span><ThemeToggle tactile /></div>
            {user && <><h3 className="mb-4 font-bold">Lecture aléatoire</h3><div className="grid grid-cols-3 gap-4">{[["random-media", "Tout contenu"], ["random-film", "Un film"], ["random-series", "Une série"]].map(([endpoint, label]) => <button key={endpoint} disabled={busy} onClick={() => random(endpoint)}>{label}</button>)}</div><button className="mt-6" disabled={busy} onClick={logout}>Se déconnecter</button></>}
            {error && <p role="alert" className="mt-4 text-red-600 dark:text-red-300">{error}</p>}
          </>}
        </DialogPanel>
      </div>
    </Dialog>
  </>;
}
