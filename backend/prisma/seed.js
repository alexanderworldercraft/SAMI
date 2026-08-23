import { PrismaClient } from '@prisma/client'; // Import pour Prisma
import bcrypt from 'bcrypt'; // Import pour bcrypt
import { RECENT_LOG_ACTIONS } from "./recentLogActions.js";

const prisma = new PrismaClient();

const AI_SUBTITLE_LOG_ACTIONS = Object.freeze([
  {
    Nom: "ai_subtitles_toggle",
    Description: "Un administrateur modifie l'activation des sous-titres générés par IA.",
    Criticite: 2,
  },
  {
    Nom: "ai_subtitle_requested",
    Description: "Un utilisateur demande la génération d'un sous-titre.",
    Criticite: 1,
  },
  {
    Nom: "ai_subtitle_completed",
    Description: "Une génération locale de sous-titre est terminée.",
    Criticite: 1,
  },
  {
    Nom: "ai_subtitle_failed",
    Description: "Une génération locale de sous-titre a échoué.",
    Criticite: 2,
  },
  {
    Nom: "ai_subtitle_updated",
    Description: "Un administrateur corrige le texte ou les horodatages d'un sous-titre IA.",
    Criticite: 2,
  },
  {
    Nom: "ai_subtitle_deleted",
    Description: "Un administrateur supprime un sous-titre généré par IA.",
    Criticite: 2,
  },
  {
    Nom: "ai_subtitle_recreated",
    Description: "Un administrateur relance la transcription complète d'un sous-titre IA.",
    Criticite: 2,
  },
]);

const uniqueByNom = (items) => {
  const seen = new Set();

  return items.filter((item) => {
    const nom = item.Nom?.trim();
    if (!nom) return false;

    const key = nom.toLocaleLowerCase("fr-FR");
    if (seen.has(key)) return false;

    seen.add(key);
    item.Nom = nom;
    return true;
  });
};

async function main() {
  // Générer un mot de passe sécurisé
  const saltSuperAdmin = await bcrypt.genSalt(10);
  const saltAdmin = await bcrypt.genSalt(10);
  const hashedPasswordSuperAdmin = await bcrypt.hash(`${process.env.PASSWORDSUPERADMIN}`, saltSuperAdmin);
  const hashedPasswordAdmin = await bcrypt.hash(`${process.env.PASSWORDADMIN}`, saltAdmin);


  // Ajouter des grades par défaut
  await prisma.grade.createMany({
    data: uniqueByNom([
      { Nom: "SuperAdmin" },
      { Nom: "Admin" },
      { Nom: "Utilisateur" },
    ]),
    skipDuplicates: true, // Évite les erreurs si les grades existent déjà
  });

  console.log("Grades par défaut ajoutés !");

  // Ajouter des Etat par défaut
  await prisma.etat.createMany({
    data: uniqueByNom([
      { Nom: "Actif" },
      { Nom: "Supprimer" },
      { Nom: "Bloquer" },
      { Nom: "Vendu" },
    ]),
    skipDuplicates: true, // Évite les erreurs si les grades existent déjà
  });

  console.log("Etat par défaut ajoutés !");

  // Ajouter des Etat par défaut
  await prisma.action.createMany({
    data: uniqueByNom([
      {
        Nom: "connexion",
        Description: "Connexion d'un utilisateur.",
        Criticite: 1,
      },
      {
        Nom: "deconnexion",
        Description: "Déconnexion d'un utilisateur.",
        Criticite: 1,
      },
      {
        Nom: "reset_mot_de_passe",
        Description: 'Réinitialisation du mot de passe via la fonctionnalité "Mot de passe oublié".',
        Criticite: 2,
      },
      {
        Nom: "reset_mot_de_passe_echec",
        Description: 'Tentative de réinitialisation de mot de passe avec combinaison surnom/email invalide.',
        Criticite: 3,
      },
      {
        Nom: "connexion_echec",
        Description: 'Tentative de connexion avec mot de passe incorrect.',
        Criticite: 2,
      },
      {
        Nom: "login_lock",
        Description: 'Blocage temporaire des tentatives de connexion après plusieurs échecs.',
        Criticite: 3,
      },
      {
        Nom: "update_parametres",
        Description: 'Maj des paramètres.',
        Criticite: 1,
      },
      {
        Nom: "update_parametres_echec",
        Description: 'Tentative de MAJ des paramètres avec mot de passe incorrect.',
        Criticite: 2,
      },
      {
        Nom: "update_parametres_lock",
        Description: 'Blocage temporaire des tentatives de connexion après plusieurs échecs des MAJ des paramètres.',
        Criticite: 3,
      },
      {
        Nom: "delete_account",
        Description: 'Supression du compte.',
        Criticite: 1,
      },
      {
        Nom: "delete_account_echec",
        Description: 'Tentative de supression du compte avec mot de passe incorrect.',
        Criticite: 2,
      },
      {
        Nom: "delete_account_lock",
        Description: 'Blocage temporaire des tentatives de connexion après plusieurs échecs de supression du compte.',
        Criticite: 3,
      },
      {
        Nom: "video_update",
        Description: 'Utilisateur MAJ X vidéo.',
        Criticite: 1,
      },
      {
        Nom: "serie_update",
        Description: 'Utilisateur MAJ X série.',
        Criticite: 1,
      },
      {
        Nom: "video_delete",
        Description: 'Utilisateur supprime X vidéo.',
        Criticite: 2,
      },
      {
        Nom: "video_soft_delete",
        Description: "Utilisateur place X vidéo dans la corbeille.",
        Criticite: 2,
      },
      {
        Nom: "video_restore",
        Description: "Super administrateur restaure X vidéo.",
        Criticite: 2,
      },
      {
        Nom: "serie_delete",
        Description: 'Utilisateur supprime X série.',
        Criticite: 2,
      },
      {
        Nom: "saison_update",
        Description: 'Utilisateur MAJ X saison.',
        Criticite: 1,
      },
      {
        Nom: "saison_delete",
        Description: 'Utilisateur supprime X saison.',
        Criticite: 2,
      },
      {
        Nom: "video_first_play",
        Description: 'Utilisateur regarde X vidéo.',
        Criticite: 0,
      },
      {
        Nom: "musique_create",
        Description: "Utilisateur ajoute X musique.",
        Criticite: 1,
      },
      {
        Nom: "musique_first_play",
        Description: "Utilisateur écoute X musique.",
        Criticite: 0,
      },
      {
        Nom: "musique_update",
        Description: "Utilisateur MAJ X musique.",
        Criticite: 1,
      },
      {
        Nom: "musique_soft_delete",
        Description: "Utilisateur place X musique dans la corbeille.",
        Criticite: 2,
      },
      {
        Nom: "musique_restore",
        Description: "Super administrateur restaure X musique.",
        Criticite: 2,
      },
      {
        Nom: "musique_delete",
        Description: "Super administrateur supprime définitivement X musique.",
        Criticite: 3,
      },
      {
        Nom: "album_create",
        Description: "Utilisateur ajoute X album musical.",
        Criticite: 1,
      },
      {
        Nom: "album_update",
        Description: "Utilisateur MAJ X album musical.",
        Criticite: 1,
      },
      {
        Nom: "album_soft_delete",
        Description: "Utilisateur place X album musical dans la corbeille.",
        Criticite: 2,
      },
      {
        Nom: "album_restore",
        Description: "Super administrateur restaure X album musical.",
        Criticite: 2,
      },
      {
        Nom: "album_delete",
        Description: "Super administrateur supprime définitivement X album musical.",
        Criticite: 3,
      },
      {
        Nom: "musique_genre_create",
        Description: "Utilisateur ajoute X genre musical.",
        Criticite: 1,
      },
      {
        Nom: "musique_genre_update",
        Description: "Utilisateur MAJ X genre musical.",
        Criticite: 1,
      },
      {
        Nom: "musique_genre_delete",
        Description: "Utilisateur supprime X genre musical.",
        Criticite: 2,
      },
      {
        Nom: "video_resume_play",
        Description: 'Utilisateur reprend X vidéo depuis une progression enregistrée.',
        Criticite: 0,
      },
      {
        Nom: "admin_message_update",
        Description: 'Maj du message général administrateur.',
        Criticite: 1,
      },
      {
        Nom: "admin_message_toggle",
        Description: "Changement d'état du toggle du message général administrateur.",
        Criticite: 1,
      },
      {
        Nom: "content_preview_tooltip_toggle",
        Description: "Changement d'état du tooltip de prévisualisation vidéo.",
        Criticite: 1,
      },
      {
        Nom: "preview_live_toggle",
        Description: "Changement d'état de la prévisualisation au survol de la barre vidéo.",
        Criticite: 1,
      },
      {
        Nom: "manual_database_backup",
        Description: "Super administrateur lance une sauvegarde manuelle de la base de données.",
        Criticite: 3,
      },
      {
        Nom: "premium_payment_fake",
        Description: "Utilisateur s'abonne au premium fake.",
        Criticite: 0,
      },
      {
        Nom: "favorite_add",
        Description: "Utilisateur ajoute un contenu à ses favoris.",
        Criticite: 0,
      },
      {
        Nom: "favorite_remove",
        Description: "Utilisateur retire un contenu de ses favoris.",
        Criticite: 0,
      },
      {
        Nom: "video_export_started",
        Description: "Le super administrateur commence l'export d'une vidéo vers le serveur principal.",
        Criticite: 2,
      },
      {
        Nom: "video_import_started",
        Description: "Le serveur principal commence l'import d'une vidéo depuis un clone.",
        Criticite: 2,
      },
      {
        Nom: "video_import_database_created",
        Description: "Les données bloquées de la vidéo importée sont ajoutées à la base principale.",
        Criticite: 2,
      },
      {
        Nom: "video_transfer_in_progress",
        Description: "Le transfert inter-serveurs des fichiers vidéo est en cours.",
        Criticite: 1,
      },
      {
        Nom: "video_transfer_completed",
        Description: "Le transfert inter-serveurs des fichiers vidéo est terminé et vérifié.",
        Criticite: 2,
      },
      {
        Nom: "video_transfer_failed",
        Description: "Le transfert inter-serveurs d'une vidéo a échoué.",
        Criticite: 3,
      },
      {
        Nom: "video_transfer_cancelled",
        Description: "Le transfert inter-serveurs d'une vidéo a été annulé.",
        Criticite: 2,
      },
      ...AI_SUBTITLE_LOG_ACTIONS,
      ...RECENT_LOG_ACTIONS,
    ]),
    skipDuplicates: true, // Évite les erreurs si les grades existent déjà
  });

  console.log("Action par défaut ajoutés !");
  
// Ajouter des Genre par défaut
await prisma.genre.createMany({
  data: uniqueByNom([
    { Nom: "Action" },
    { Nom: "Animations" },
    { Nom: "Aventure" },
    { Nom: "Biographie" },
    { Nom: "Buddy cop" },
    { Nom: "Catastrophe" },
    { Nom: "Comédie" },
    { Nom: "Court-métrage" },
    { Nom: "Cyberpunk" },
    { Nom: "Documentaire" },
    { Nom: "Drame" },
    { Nom: "Dystopique" },
    { Nom: "Épique" },
    { Nom: "Épouvante" },
    { Nom: "Espionnage" },
    { Nom: "Expérimental" },
    { Nom: "Fantastique" },
    { Nom: "Fantasy" },
    { Nom: "Film culte" },
    { Nom: "Film noir" },
    { Nom: "Films" },
    { Nom: "Guerre" },
    { Nom: "Historique" },
    { Nom: "Horreur" },
    { Nom: "IA" },
    { Nom: "Isekai" },
    { Nom: "Mélo (Mélodrame)" },
    { Nom: "Mockumentaire (faux documentaire)" },
    { Nom: "Musical" },
    { Nom: "Mystère" },
    { Nom: "Parodie" },
    { Nom: "Policier" },
    { Nom: "Post-apocalyptique" },
    { Nom: "Psychologique" },
    { Nom: "Road movie" },
    { Nom: "Romance" },
    { Nom: "Science-fiction" },
    { Nom: "Séries" },
    { Nom: "Shōnen" },
    { Nom: "Slasher" },
    { Nom: "Space opera" },
    { Nom: "Steampunk" },
    { Nom: "Super-héros" },
    { Nom: "Surnaturel" },
    { Nom: "Survival" },
    { Nom: "Suspense" },
    { Nom: "Thriller" },
    { Nom: "Tranche de vie" },
    { Nom: "Uchronie" },
    { Nom: "Western" },
    { Nom: "YouTube" },
  ]),
  skipDuplicates: true,
});

console.log("Genre par défaut ajoutés !");

  // Créer les utilisateurs par défaut si absents.
  const defaultUsers = [
    {
      Surnom: `${process.env.USERNAMESUPERADMIN}`,
      Email: `${process.env.EMAILSUPERADMIN}`,
      Salt: saltSuperAdmin,
      MotDePasse: hashedPasswordSuperAdmin,
      GradeID: 1,
      EtatID: 1,
      PremiumEndDate: "2026-05-13T18:46:36.166Z",
    },
    {
      Surnom: `${process.env.USERNAMEADMIN}`,
      Email: `${process.env.EMAILADMIN}`,
      Salt: saltAdmin,
      MotDePasse: hashedPasswordAdmin,
      GradeID: 2,
      EtatID: 1,
      PremiumEndDate: "2026-05-13T18:46:36.166Z",
    },
  ].filter((user) => user.Surnom && user.Surnom !== "undefined");

  for (const user of defaultUsers) {
    await prisma.utilisateur.upsert({
      where: { Surnom: user.Surnom },
      update: {},
      create: user,
    });
  }

  console.log("Utilisateur par défaut ajouté !");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
