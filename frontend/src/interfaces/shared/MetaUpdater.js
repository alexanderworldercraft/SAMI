import React from "react";
import { useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const NameApp = process.env.REACT_APP_NAME + " " + process.env.REACT_APP_VER;

const routesMeta = {
  "/login": {
    title: `Connexion - ${NameApp}`,
    description: `Connectez-vous pour accéder à votre compte ${NameApp}.`,
  },
  "/register": {
    title: `Inscription - ${NameApp}`,
    description: `Créez un compte pour accéder à ${NameApp}.`,
  },
  "/profile": { title: `Profil - ${NameApp}`, description: "Bienvenue sur votre profil." },
  "/settings": { title: `Paramètres - ${NameApp}`, description: "Bienvenue sur vos paramètres." },
  "/administration": {
    title: `Administration - ${NameApp}`,
    description: `Gérez les utilisateurs et les paramètres administratifs de ${NameApp}.`,
  },
  "/videos": { title: `liste des vidéos - ${NameApp}`, description: `La liste des vidéos disponible sur ${NameApp}.` },
  "/sagas": { title: `liste des sagas - ${NameApp}`, description: `La liste des sagas disponible sur ${NameApp}.` },
  "/musique": { title: `Musique - ${NameApp}`, description: `La liste des musiques disponible sur ${NameApp}.` },
  "/nouvelle-video": {
    title: `Formulaire pour ajout de vidéos - ${NameApp}`,
    description: `Formulaire d'ajout de vidéos sur ${NameApp}.`,
  },
  "/nouvelle-musique": {
    title: `Formulaire pour ajout de musique - ${NameApp}`,
    description: `Formulaire d'ajout de musiques et albums sur ${NameApp}.`,
  },
  "/updates": {
    title: `Mises à jour - ${NameApp}`,
    description: `Historique des mises à jour de ${NameApp}.`,
  },
  "/stats": {
    title: `Statistiques - ${NameApp}`,
    description: `Statistiques, calendrier des ajouts et cookies utilisés par ${NameApp}.`,
  },
  "/politique-confidentialite": {
    title: `Politique de confidentialité - ${NameApp}`,
    description: `Politique de confidentialité de ${NameApp}.`,
  },
  "/conditions-utilisation": {
    title: `Conditions d'utilisation - ${NameApp}`,
    description: `Conditions d'utilisation de ${NameApp}.`,
  },
  "/conformite-donnees": {
    title: `Conformité des données - ${NameApp}`,
    description: `Conformité des données de ${NameApp}.`,
  },
};

export default function MetaUpdater() {
  const location = useLocation();
  if (/^\/lecture\/[^/]+\/?$/.test(location.pathname)) return null;

  const meta = routesMeta[location.pathname] || {
    title: `${NameApp}`,
    description: `Bienvenue sur ${NameApp}, votre application de streaming privée.`,
  };
  return (
    <Helmet>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
    </Helmet>
  );
}

