import React from "react";

const sections = [
  {
    title: "Périmètre",
    body: [
      "Cette page présente les mesures de conformité appliquées aux données traitées par SAMI dans le cadre d'une instance privée ou auto-hébergée.",
      "Elle complète la politique de confidentialité et les conditions d'utilisation en décrivant l'organisation pratique du traitement, de la sécurité et de la traçabilité.",
    ],
  },
  {
    title: "Catégories de données",
    body: [
      "SAMI traite principalement des données de compte, des préférences utilisateur, des historiques de lecture, des progressions vidéo, des journaux d'activité et des informations d'administration.",
      "Les contenus multimédias, images, sous-titres, fichiers audio, vidéos et affiches sont stockés pour permettre l'organisation et la lecture dans l'application.",
    ],
  },
  {
    title: "Finalités",
    body: [
      "Les données sont utilisées pour authentifier les utilisateurs, appliquer les droits d'accès, afficher les contenus, reprendre la lecture, personnaliser l'accueil et sécuriser les opérations sensibles.",
      "Les journaux et historiques techniques servent à diagnostiquer les erreurs, suivre les actions d'administration, détecter les abus et maintenir la cohérence du service.",
    ],
  },
  {
    title: "Minimisation",
    body: [
      "Les informations demandées doivent rester limitées à ce qui est utile au fonctionnement de l'instance : identification du compte, accès, préférences, suivi de lecture et administration.",
      "Les champs inutiles ou obsolètes doivent être évités, corrigés ou supprimés lorsque leur conservation n'a plus de justification opérationnelle.",
    ],
  },
  {
    title: "Conservation",
    body: [
      "Les données de compte sont conservées pendant la durée d'existence du compte, sauf suppression ou anonymisation décidée par l'administrateur.",
      "Les historiques, progressions, journaux et sauvegardes peuvent être conservés plus longtemps lorsqu'ils sont nécessaires à la sécurité, à la maintenance ou à la traçabilité des actions sensibles.",
    ],
  },
  {
    title: "Sécurité et contrôle d'accès",
    body: [
      "Les routes sensibles sont protégées par authentification et par vérification des rôles. Les comptes administrateurs disposent d'accès étendus qui doivent être attribués avec retenue.",
      "Les mots de passe sont hachés. La sécurité complète dépend aussi de la configuration de l'hébergement, des certificats, des sauvegardes, des droits fichiers et de l'accès à la base de données.",
    ],
  },
  {
    title: "Traçabilité",
    body: [
      "Certaines actions sont journalisées pour garder une trace des connexions, modifications, créations, suppressions, restaurations, imports, sauvegardes et opérations d'administration.",
      "La journalisation doit rester proportionnée : elle vise la sécurité et la maintenance, pas une surveillance excessive des utilisateurs.",
    ],
  },
  {
    title: "Sauvegardes",
    body: [
      "Les sauvegardes de base de données et de fichiers doivent être protégées avec le même niveau d'exigence que les données actives.",
      "L'accès aux sauvegardes doit être limité aux personnes autorisées, et leur conservation doit suivre une durée adaptée aux besoins de restauration et de sécurité.",
    ],
  },
  {
    title: "Droits et demandes",
    body: [
      "Les utilisateurs peuvent demander l'accès, la correction ou la suppression des données liées à leur compte auprès de l'administrateur de l'instance.",
      "Certaines données peuvent être conservées temporairement lorsque leur suppression immédiate compromettrait la sécurité, la traçabilité ou l'intégrité technique du service.",
    ],
  },
  {
    title: "Responsabilités",
    body: [
      "L'administrateur de l'instance est responsable de la configuration, de l'accès aux données, des sauvegardes, des droits utilisateurs et de la conformité de l'utilisation réelle de SAMI.",
      "Les utilisateurs doivent respecter les règles d'accès, protéger leurs identifiants et signaler toute anomalie ou suspicion d'accès non autorisé.",
    ],
  },
];

const DataCompliancePage = () => (
  <section className="mx-auto grid max-w-5xl gap-8 py-10 text-slate-900 dark:text-neutral-100">
    <header className="grid gap-3">
      <p className="text-sm font-semibold uppercase tracking-wide text-sky-600 dark:text-sky-300">
        Gouvernance des données
      </p>
      <h1 className="text-3xl font-bold sm:text-4xl">Conformité des données</h1>
      <p className="max-w-3xl text-base leading-7 text-slate-700 dark:text-neutral-300">
        Cette page synthétise les principes appliqués à la collecte, à la conservation,
        à la sécurité et à la traçabilité des données dans SAMI.
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

export default DataCompliancePage;
