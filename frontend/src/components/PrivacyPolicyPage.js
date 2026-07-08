import React from "react";

const sections = [
  {
    title: "Données collectées",
    body: [
      "SAMI utilise les informations nécessaires au fonctionnement du compte utilisateur : surnom, adresse e-mail, image de profil, rôle, état du compte, dates de création et de dernière connexion.",
      "L'application peut aussi enregistrer des préférences de genres, des historiques de lecture, des progressions vidéo, des actions d'administration et des journaux techniques liés à l'utilisation du service.",
    ],
  },
  {
    title: "Utilisation des données",
    body: [
      "Les données servent à authentifier les utilisateurs, afficher les contenus autorisés, reprendre la lecture, personnaliser l'accueil, sécuriser l'administration et diagnostiquer les erreurs.",
      "Les journaux d'activité permettent de suivre les opérations sensibles comme les connexions, les modifications de compte, les suppressions, les imports et les actions d'administration.",
    ],
  },
  {
    title: "Cookies et stockage local",
    body: [
      "SAMI peut utiliser des cookies, le stockage local du navigateur et des jetons de session pour maintenir la connexion, appliquer les préférences d'affichage et sécuriser les appels API.",
      "La suppression des cookies ou du stockage local peut déconnecter l'utilisateur ou réinitialiser certains réglages de l'interface.",
    ],
  },
  {
    title: "Accès et partage",
    body: [
      "Les données sont destinées à l'usage interne de SAMI. Elles ne sont pas vendues ni partagées avec des tiers à des fins publicitaires.",
      "Les administrateurs autorisés peuvent accéder aux informations nécessaires à la gestion des comptes, des contenus, des historiques et de la sécurité de l'application.",
    ],
  },
  {
    title: "Conservation",
    body: [
      "Les données sont conservées tant que le compte existe ou tant qu'elles sont utiles au fonctionnement, à la sécurité, à l'historique technique ou à l'administration de SAMI.",
      "La suppression d'un compte ou d'un contenu peut conserver certains journaux minimaux lorsque ceux-ci sont nécessaires à la traçabilité des actions sensibles.",
    ],
  },
  {
    title: "Sécurité",
    body: [
      "Les mots de passe sont stockés sous forme hachée. Les accès aux routes protégées reposent sur une authentification par jeton.",
      "Les contenus, fichiers et sauvegardes doivent être protégés par la configuration serveur, les droits d'accès système et les paramètres d'hébergement.",
    ],
  },
  {
    title: "Droits des utilisateurs",
    body: [
      "Un utilisateur peut demander la consultation, la correction ou la suppression des informations liées à son compte, sous réserve des contraintes techniques et de sécurité.",
      "Les demandes doivent être adressées à l'administrateur de l'instance SAMI concernée.",
    ],
  },
];

const PrivacyPolicyPage = () => (
  <section className="mx-auto grid max-w-5xl gap-8 py-10 text-slate-900 dark:text-neutral-100">
    <header className="grid gap-3">
      <p className="text-sm font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-300">
        Confidentialité
      </p>
      <h1 className="text-3xl font-bold sm:text-4xl">Politique de confidentialité</h1>
      <p className="max-w-3xl text-base leading-7 text-slate-700 dark:text-neutral-300">
        Cette page décrit comment SAMI traite les données nécessaires au fonctionnement de
        l'application, à la sécurité des comptes et à l'administration des contenus.
      </p>
      <p className="text-sm text-slate-500 dark:text-neutral-400">
        Dernière mise à jour : 8 juillet 2026
      </p>
    </header>

    <div className="grid gap-5">
      {sections.map((section) => (
        <article
          key={section.title}
          className="rounded-lg border border-slate-200 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/70"
        >
          <h2 className="text-xl font-semibold">{section.title}</h2>
          <div className="mt-3 grid gap-3 text-sm leading-6 text-slate-700 dark:text-neutral-300">
            {section.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </article>
      ))}
    </div>
  </section>
);

export default PrivacyPolicyPage;
