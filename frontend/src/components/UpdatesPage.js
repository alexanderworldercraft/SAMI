import React from "react";

const updates = [
  {
    version: "6.7.0",
    title: "Gestion administrateur des series",
    date: "8 juin 2026",
    sections: [
      {
        title: "Administration",
        items: [
          "Ajout d'une nouvelle section Series dans la page Administration.",
          "Ajout d'un select avec recherche pour retrouver rapidement la serie a gerer.",
          "Ajout d'un formulaire de modification pour le titre, le resume, l'affiche, les genres et le statut premium.",
          "Ajout de la modification des numeros de saisons directement depuis la fiche administrateur.",
          "Aucune creation de serie n'a ete ajoutee dans cette section, pour garder la creation dans la page Nouvelle video.",
        ],
      },
      {
        title: "Suppression des series et saisons",
        items: [
          "Ajout d'une confirmation avant chaque suppression de saison.",
          "Ajout d'une confirmation avant chaque suppression de serie.",
          "La suppression d'une saison est bloquee si elle est reliee a des videos.",
          "La suppression d'une serie supprime aussi ses saisons uniquement si aucune saison n'est reliee a des videos.",
          "Le feedback affiche les saisons et videos qui bloquent la suppression quand l'action est refusee.",
        ],
      },
      {
        title: "Backend",
        items: [
          "Ajout de l'endpoint GET /api/series/:id pour recuperer les details complets d'une serie.",
          "Ajout des endpoints PUT /api/series/saisons/:saisonId et DELETE /api/series/saisons/:saisonId.",
          "Ajout de l'endpoint DELETE /api/series/:id pour supprimer une serie et ses saisons eligibles.",
          "Les endpoints de modification et suppression des saisons verifient le role administrateur.",
          "Les logs existants sont detaches avant suppression pour eviter les contraintes de relation.",
        ],
      },
      {
        title: "Dropdowns",
        items: [
          "Correction des dropdowns qui passaient sous les autres cards.",
          "Les select Headless UI de series, saisons et contenus lies utilisent maintenant un rendu portalise.",
          "Les dropdowns Genres et Tri sont maintenant rendus hors des cards avec une position fixe.",
          "La correction couvre les pages Nouvelle video, Administration, Details video, Details serie, Personnes et Videos.",
          "Les menus gardent leur largeur alignee avec le bouton tout en restant au-dessus des autres elements.",
        ],
      },
    ],
  },
  {
    version: "6.6.1",
    title: "Ameliorations des formulaires et historiques",
    date: "8 juin 2026",
    sections: [
      {
        title: "Nouvelle video",
        items: [
          "Remplacement du tooltip de la section Fichier Video par un bouton dropdown.",
          "Le tableau des parametres d'encodage s'affiche maintenant dans la carte du fichier video.",
          "Suppression du positionnement fixe qui pouvait placer le tableau trop a droite de l'ecran.",
          "Restylage du tableau avec le design SAMI actuel, en clair et en sombre.",
          "Ajout d'un scroll horizontal pour garder le tableau lisible sur les petits ecrans.",
        ],
      },
      {
        title: "Administration",
        items: [
          "Ajout du toggle Historique brut dans les drawers administrateur.",
          "Ajout du toggle Historique brut dans les drawers utilisateur de la page Administration.",
          "Le toggle reprend le style de celui des Parametres dans la section Contenu regarde.",
          "Les drawers peuvent maintenant alterner entre l'historique regroupe et les logs stricts.",
        ],
      },
      {
        title: "Contenu regarde",
        items: [
          "Ajout du mode brut dans le composant d'historique utilise par le panel administrateur.",
          "Le mode brut affiche les lectures non regroupees, triees de la plus recente a la plus ancienne.",
          "Chaque entree brute conserve le contenu, l'episode si present, la date, l'action, la progression et le lien de lecture.",
          "Ajout d'une pagination dediee au mode brut dans les drawers.",
        ],
      },
    ],
  },
  {
    version: "6.6.0",
    title: "Gestion administrateur des genres",
    date: "8 juin 2026",
    sections: [
      {
        title: "Administration",
        items: [
          "Ajout d'une nouvelle section Genres dans la page Administration.",
          "Ajout du CRUD administrateur pour creer, renommer et supprimer les genres.",
          "Ajout d'une pagination de 10 genres par page pour garder une liste lisible.",
          "Ajout d'une confirmation avant chaque suppression de genre.",
          "La section reprend le style des cards administrateur existantes.",
        ],
      },
      {
        title: "Suppression des genres",
        items: [
          "La suppression est bloquee quand le genre est relie a des videos, series ou preferences utilisateur.",
          "Le feedback de suppression affiche les types de liens qui empechent la suppression.",
          "Un genre relie uniquement au contenu a la une peut maintenant etre supprime.",
          "Quand ce cas arrive, le contenu a la une associe est supprime avec le genre.",
        ],
      },
      {
        title: "Backend et base de donnees",
        items: [
          "Ajout des endpoints POST /api/genres/admin, PUT /api/genres/admin/:id et DELETE /api/genres/admin/:id.",
          "Les endpoints administrateur verifient le role admin avant modification.",
          "Ajout de contraintes uniques sur Etat.Nom et Genre.Nom dans le schema Prisma.",
          "Ajout d'une migration pour consolider les doublons existants avant l'ajout des index uniques.",
          "Mise a jour de seed.js pour dedupliquer les entrees par Nom avant les createMany.",
        ],
      },
    ],
  },
  {
    version: "6.5.0",
    title: "Message general administrable",
    date: "4 juin 2026",
    sections: [
      {
        title: "Administration",
        items: [
          "Ajout d'une nouvelle section Message general dans la page Administration.",
          "Ajout d'un formulaire avec titre, description et bouton de validation.",
          "Ajout d'un toggle on/off pour activer ou desactiver l'affichage du message.",
          "Le formulaire reprend le style des cards administrateur existantes.",
        ],
      },
      {
        title: "Banniere generale",
        items: [
          "Ajout d'une banniere generale visible dans l'application quand le message est actif.",
          "La banniere affiche le titre et la description configures par les administrateurs.",
          "La banniere ne s'affiche pas si le toggle est desactive ou si le message est vide.",
          "Ajout d'un bouton pour masquer la banniere cote utilisateur pendant la session.",
        ],
      },
      {
        title: "Backend et base de donnees",
        items: [
          "Ajout de la table AdminMessage avec Titre, Description, Actif, CreateDate et UpdatedAt.",
          "Ajout de l'endpoint GET /api/admin-message pour recuperer la configuration cote admin.",
          "Ajout de l'endpoint PUT /api/admin-message pour mettre a jour le formulaire.",
          "Ajout de l'endpoint PUT /api/admin-message/toggle pour changer l'etat du toggle.",
          "Ajout de l'endpoint GET /api/admin-message/active pour recuperer le message actif cote public.",
        ],
      },
      {
        title: "Logs et actions",
        items: [
          "Ajout de l'action admin_message_update pour tracer les maj du formulaire.",
          "Ajout de l'action admin_message_toggle pour tracer les changements d'etat du toggle.",
          "Ajout des actions dans la migration et dans seed.js pour les prochains deploiements.",
        ],
      },
    ],
  },
  {
    version: "6.4.0",
    title: "Historique de lecture et reprises detaillees",
    date: "2 juin 2026",
    sections: [
      {
        title: "Lecture video",
        items: [
          "Ajout de la nouvelle action video_resume_play lorsqu'un utilisateur reprend une video depuis une progression enregistree.",
          "Le clic Reprendre du modal log maintenant une reprise distincte du premier lancement de la page.",
          "Quand une reprise est acceptee, video_first_play n'est plus logue pour ce lancement.",
          "Le modal Reprendre la lecture est maintenant obligatoire quand une progression existe.",
          "Un clic en dehors du modal ne le ferme plus et fait pulser les boutons Reprendre et Repartir du debut.",
        ],
      },
      {
        title: "Logs et progressions",
        items: [
          "Ajout des timecodes dans les logs de lecture via Meta.",
          "video_first_play conserve son timecode de lecture initial et ne reprend plus les timecodes des reprises.",
          "video_resume_play stocke le timecode de depart et le dernier timecode de progression.",
          "La suppression de progression depuis le modal ne complete plus l'ancien log video_first_play.",
          "Quand la progression est terminee normalement, le log actif est complete avec la duree max de la video.",
        ],
      },
      {
        title: "Contenu regarde",
        items: [
          "Ajout de video_resume_play dans les sections Contenu regarde.",
          "Ajout de barres de progression sur les lectures et reprises affichees dans l'historique.",
          "Les reprises affichent une barre segmentee avec une partie vide avant le timecode de depart.",
          "Ajout d'un mode Historique brut dans les parametres pour afficher les logs stricts, sans regroupement.",
          "Le mode brut conserve la recherche, la pagination, la date, l'heure et les informations du contenu.",
        ],
      },
      {
        title: "Backend et donnees de base",
        items: [
          "Ajout de l'action video_resume_play dans seed.js pour les prochains deploiements.",
          "Correction du seed pour ne plus recreer les utilisateurs par defaut s'ils existent deja.",
          "Le seed utilise maintenant une creation idempotente des utilisateurs par Surnom.",
        ],
      },
    ],
  },
  {
    version: "6.3.1",
    title: "Reprise d'accueil plus intelligente",
    date: "22 mai 2026",
    sections: [
      {
        title: "Accueil",
        items: [
          "Mise a jour de la carte A reprendre sur la page d'accueil.",
          "Priorite conservee sur les videos en cours, films ou episodes, avant toute autre proposition.",
          "Ajout de la reprise du prochain episode de la serie regardee le plus recemment.",
          "Quand cette serie n'a plus d'episode a reprendre, la carte passe a la serie recente suivante, puis aux suivantes.",
          "La suggestion finale utilise maintenant un contenu aleatoire parmi les tendances des 30 derniers jours.",
        ],
      },
      {
        title: "Backend",
        items: [
          "L'endpoint GET /api/videos/progress/resume renvoie maintenant une liste nextSeriesEpisodes.",
          "Le champ nextSeriesEpisode reste disponible pour garder la compatibilite avec l'ancien format.",
        ],
      },
    ],
  },
  {
    version: "6.2.0",
    title: "Listes par genre avec contenu a la une",
    date: "20 mai 2026",
    sections: [
      {
        title: "Accueil",
        items: [
          "Refonte des sections par genre sur la page d'accueil.",
          "Chaque genre affiche maintenant 5 contenus standards et un 6eme contenu mis a la une.",
          "Ajout d'une mise en page dediee inspiree de la section Isekai de reference.",
          "Le contenu a la une dispose d'un badge A la une visible directement sur l'affiche.",
          "Creation du nouveau composant GenreFeaturedVideoSection sans modifier VideoList.",
        ],
      },
      {
        title: "Selection a la une",
        items: [
          "Ajout d'une table GenreFeaturedContent pour relier un genre a un contenu mis en avant.",
          "Le contenu a la une doit posseder le genre de la section ou il est affiche.",
          "Un meme contenu ne peut pas etre a la une sur deux genres en meme temps.",
          "La selection commence par les genres qui ont le moins de contenus disponibles.",
          "Le contenu actif la semaine precedente est exclu de la selection de la semaine suivante.",
        ],
      },
      {
        title: "Rotation automatique",
        items: [
          "Ajout d'une rotation automatique des contenus a la une chaque lundi a 9h00.",
          "La rotation utilise le meme fuseau horaire que la sauvegarde hebdomadaire de la base de donnees.",
          "Ajout d'un service backend reutilise par le cron et par l'action manuelle d'administration.",
          "Ajout de l'endpoint GET /api/genres/featured pour recuperer les contenus a la une actifs.",
          "Ajout de l'endpoint POST /api/genres/featured/refresh pour forcer une nouvelle rotation.",
        ],
      },
      {
        title: "Administration et navigation",
        items: [
          "Ajout d'une section Contenus a la une dans la page Administration.",
          "Les administrateurs peuvent forcer l'actualisation des contenus a la une depuis l'interface.",
          "Le bouton Voir tout des sections par genre redirige vers la page Videos avec le filtre du genre actif.",
          "La page Videos lit maintenant le parametre genres depuis l'URL pour appliquer le filtre automatiquement.",
        ],
      },
    ],
  },
  {
    version: "6.1.1",
    title: "Nouvelle section tendances sur l'accueil",
    date: "19 mai 2026",
    sections: [
      {
        title: "Accueil",
        items: [
          "Remplacement du bloc Les plus regardes par Tendances en ce moment.",
          "Ajout d'une mise en page dediee aux tendances avec une premiere affiche mise en avant.",
          "La premiere affiche affiche maintenant son titre et son genre directement dans le bas de l'image.",
          "Sur mobile, la premiere affiche occupe les deux premieres colonnes pour rester plus grande que les autres.",
          "Ajustement de la taille desktop pour que les 5 affiches tiennent mieux sur la ligne.",
        ],
      },
      {
        title: "Composants",
        items: [
          "Creation du nouveau composant VideoListTendance sans modifier VideoList.",
          "Conservation de l'effet au survol avec flou et resume du film ou de la serie.",
          "Deplacement du badge Premium en haut a droite.",
          "Deplacement du badge Vu en bas a droite, dans le meme esprit visuel que Premium.",
          "Suppression de l'affichage de date sur les cartes tendances.",
        ],
      },
      {
        title: "Navigation",
        items: [
          "Le bouton Voir tout des tendances redirige vers la page Videos.",
          "La page Videos lit maintenant le parametre sort=most depuis l'URL.",
          "Le tri Popularite - la plus vue est applique automatiquement depuis le lien des tendances.",
        ],
      },
    ],
  },
  {
    version: "6.1.0",
    title: "Recommencer une serie sans perdre l'historique",
    date: "18 mai 2026",
    sections: [
      {
        title: "Series",
        items: [
          "Ajout d'un bouton Recommencer la serie sur la page de lecture d'un episode.",
          "Remise a zero des badges vu / non vu d'une serie sans supprimer les logs de lecture.",
          "Les episodes repassent en non vus apres le reset, puis redeviennent vus uniquement lorsqu'ils sont relances.",
          "Le filtre des series en cours prend maintenant en compte la date de remise a zero.",
        ],
      },
      {
        title: "Backend et base de donnees",
        items: [
          "Ajout de la table UserSeriesWatchReset pour stocker la derniere remise a zero par utilisateur et par serie.",
          "Ajout de l'endpoint PUT /api/series/:id/watch-reset pour enregistrer une remise a zero.",
          "Mise a jour du calcul Watched, WatchedCount et WatchedAll pour ignorer les logs anterieurs au dernier reset.",
          "Conservation complete de la table Log pour l'historique, les statistiques et les recommandations.",
        ],
      },
      {
        title: "Accueil",
        items: [
          "Correction de la carte A reprendre sur la page d'accueil.",
          "La carte utilise maintenant l'image de la video pour un film.",
          "La carte utilise maintenant l'image de la serie quand la reprise concerne un episode.",
        ],
      },
    ],
  },
];

export default function UpdatesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-sky-400">
          SAMI
        </p>
        <h1 className="mt-3 text-4xl font-black text-slate-950 dark:text-white">
          Mises a jour
        </h1>
        <p className="mt-4 max-w-2xl text-base text-slate-600 dark:text-slate-300">
          Historique des changements importants apportes a l'application.
        </p>
      </header>

      <div className="space-y-8">
        {updates.map((update) => (
          <article
            key={update.version}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-black/20"
          >
            <div className="border-b border-slate-200 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5 dark:border-slate-800">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-sky-600 dark:text-sky-300">
                    Version {update.version}
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                    {update.title}
                  </h2>
                </div>
                <time className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {update.date}
                </time>
              </div>
            </div>

            <div className="grid gap-6 px-6 py-6">
              {update.sections.map((section) => (
                <section key={section.title}>
                  <h3 className="text-base font-bold text-slate-950 dark:text-white">
                    {section.title}
                  </h3>
                  <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-700 dark:text-slate-300">
                    {section.items.map((item) => (
                      <li key={item} className="flex gap-3">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-sky-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
