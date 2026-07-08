import React from "react";

const sections = [
  {
    title: "Objet du service",
    body: [
      "SAMI est une application privée de gestion, d'organisation et de lecture de contenus multimédias. Elle permet aux utilisateurs autorisés d'accéder aux contenus disponibles sur l'instance, de reprendre leur lecture et de gérer leurs préférences.",
      "L'accès au service dépend de la configuration de l'instance, des comptes créés par les administrateurs et des droits attribués à chaque utilisateur.",
    ],
  },
  {
    title: "Accès au compte",
    body: [
      "Chaque utilisateur doit conserver la confidentialité de ses identifiants et signaler toute utilisation suspecte à l'administrateur de l'instance.",
      "Les administrateurs peuvent suspendre, bloquer ou supprimer un compte lorsque cela est nécessaire pour protéger le service, les données ou les autres utilisateurs.",
    ],
  },
  {
    title: "Utilisation autorisée",
    body: [
      "L'utilisateur s'engage à utiliser SAMI uniquement dans le cadre prévu par l'instance privée à laquelle il accède.",
      "Il est interdit de contourner les protections d'accès, de perturber le fonctionnement du service, d'extraire massivement des données ou d'utiliser l'application d'une manière susceptible d'endommager l'infrastructure.",
    ],
  },
  {
    title: "Contenus et droits",
    body: [
      "Les contenus ajoutés dans SAMI doivent être gérés dans le respect des droits applicables et des règles définies par l'administrateur de l'instance.",
      "L'utilisateur ne doit pas importer, partager ou exploiter de contenus pour lesquels il ne dispose pas des autorisations nécessaires.",
    ],
  },
  {
    title: "Administration",
    body: [
      "Les comptes administrateurs disposent de droits étendus pour créer, modifier, restaurer ou supprimer des contenus, gérer les utilisateurs, consulter certains historiques et configurer l'application.",
      "Toute action d'administration doit être effectuée avec prudence. Certaines opérations peuvent être journalisées pour assurer la traçabilité et la sécurité du service.",
    ],
  },
  {
    title: "Disponibilité",
    body: [
      "SAMI peut être interrompu temporairement pour maintenance, sauvegarde, mise à jour, correction d'incident ou indisponibilité de l'infrastructure d'hébergement.",
      "Aucune garantie de disponibilité permanente n'est donnée, en particulier pour une instance personnelle ou auto-hébergée.",
    ],
  },
  {
    title: "Sécurité",
    body: [
      "L'utilisateur ne doit pas tenter d'accéder à des comptes, routes, fichiers ou données qui ne lui sont pas destinés.",
      "Toute faille de sécurité, comportement anormal ou perte d'accès doit être signalé à l'administrateur afin de limiter les risques.",
    ],
  },
  {
    title: "Modification des conditions",
    body: [
      "Ces conditions peuvent être mises à jour pour refléter l'évolution de SAMI, de ses fonctionnalités ou des règles d'utilisation de l'instance.",
      "La poursuite de l'utilisation du service après modification vaut acceptation des conditions mises à jour.",
    ],
  },
];

const TermsOfUsePage = () => (
  <section className="mx-auto grid max-w-5xl gap-8 py-10 text-slate-900 dark:text-neutral-100">
    <header className="grid gap-3">
      <p className="text-sm font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-300">
        Cadre d'utilisation
      </p>
      <h1 className="text-3xl font-bold sm:text-4xl">Conditions d'utilisation</h1>
      <p className="max-w-3xl text-base leading-7 text-slate-700 dark:text-neutral-300">
        Ces conditions définissent les règles applicables à l'utilisation de SAMI, à
        l'accès aux comptes, aux contenus multimédias et aux fonctions d'administration.
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

export default TermsOfUsePage;
