export const RECENT_LOG_ACTIONS = Object.freeze([
  {
    Nom: "admin_create",
    Description: "Le super administrateur crée un compte administrateur.",
    Criticite: 2,
  },
  {
    Nom: "multi_audio_toggle",
    Description: "Un administrateur modifie l'activation des imports vidéo multi-audio.",
    Criticite: 1,
  },
  {
    Nom: "distributed_encoding_toggle",
    Description: "Le super administrateur modifie l'activation de l'encodage distribué.",
    Criticite: 2,
  },
  {
    Nom: "distributed_encoding_worker_updated",
    Description: "Le super administrateur ajoute, modifie ou retire un worker d'encodage distribué.",
    Criticite: 2,
  },
  {
    Nom: "distributed_encoding_job_started",
    Description: "Le super administrateur démarre un job d'encodage distribué.",
    Criticite: 2,
  },
  {
    Nom: "distributed_encoding_job_resumed",
    Description: "Le super administrateur reprend un job d'encodage distribué.",
    Criticite: 2,
  },
  {
    Nom: "distributed_encoding_job_cancel_requested",
    Description: "Le super administrateur demande l'annulation d'un job d'encodage distribué.",
    Criticite: 2,
  },
  {
    Nom: "distributed_encoding_job_completed",
    Description: "Un job d'encodage distribué est terminé avec succès.",
    Criticite: 1,
  },
  {
    Nom: "distributed_encoding_job_failed",
    Description: "Un job d'encodage distribué a échoué.",
    Criticite: 3,
  },
  {
    Nom: "distributed_encoding_job_cancelled",
    Description: "Un job d'encodage distribué a été annulé.",
    Criticite: 2,
  },
  {
    Nom: "universe_content_add",
    Description: "Un administrateur ajoute directement un film ou une série à un univers.",
    Criticite: 1,
  },
  {
    Nom: "universe_content_remove",
    Description: "Un administrateur retire un film ou une série d'un univers.",
    Criticite: 1,
  },
  {
    Nom: "universe_items_reorder",
    Description: "Un administrateur modifie l'ordre des éléments d'un univers.",
    Criticite: 1,
  },
  {
    Nom: "player_preferences_update",
    Description: "Un utilisateur modifie ses préférences du lecteur vidéo.",
    Criticite: 0,
  },
  {
    Nom: "person_update",
    Description: "Un administrateur modifie l'identité d'une personne.",
    Criticite: 1,
  },
  {
    Nom: "person_photo_update",
    Description: "Un administrateur ajoute ou remplace la photo d'une personne.",
    Criticite: 1,
  },
  {
    Nom: "person_photo_delete",
    Description: "Un administrateur retire la photo d'une personne.",
    Criticite: 1,
  },
  {
    Nom: "person_bulk_link",
    Description: "Un administrateur importe et lie une liste de personnes à un film ou une série.",
    Criticite: 1,
  },
  {
    Nom: "person_soft_delete",
    Description: "Un administrateur place une personne dans la corbeille.",
    Criticite: 2,
  },
  {
    Nom: "person_restore",
    Description: "Le super administrateur restaure une personne depuis la corbeille.",
    Criticite: 2,
  },
  {
    Nom: "person_delete",
    Description: "Le super administrateur supprime définitivement une personne.",
    Criticite: 3,
  },
  {
    Nom: "person_duplicate_review",
    Description: "Le super administrateur classe une paire de personnes comme douteuse ou distincte.",
    Criticite: 1,
  },
  {
    Nom: "person_duplicate_merge",
    Description: "Le super administrateur fusionne deux fiches de personnes.",
    Criticite: 3,
  },
]);
