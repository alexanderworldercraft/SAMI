// One catalogue shared by the administration page and both sidebar layouts.
export const ADMIN_SECTIONS = [
  { id: "featured", label: "Contenus à la une" },
  { id: "message", label: "Message général" },
  { id: "experimental", label: "Fonctionnalités expérimentales", superAdmin: true },
  { id: "missing-subtitles", label: "Sous-titres français manquants" },
  { id: "ai-subtitles", label: "Sous-titres IA" },
  { id: "ai-dubbing", label: "Doublages audio IA" },
  { id: "subtitle-editor", label: "Éditeur temporel des sous-titres IA", superAdmin: true },
  { id: "encoding", label: "Diagnostic d'encodage distribué", superAdmin: true },
  { id: "homepage-genres", label: "Genres de la page d'accueil" },
  { id: "favorites", label: "Contenus favoris" },
  { id: "credits", label: "Validation des génériques" },
  { id: "content", label: "Gestion des contenus" },
  { id: "music", label: "Gestion des contenus musicaux" },
  { id: "trash", label: "Corbeilles", superAdmin: true },
  { id: "backups", label: "Sauvegardes", superAdmin: true },
  { id: "new-admin", label: "Ajouter un administrateur", superAdmin: true },
  { id: "admins", label: "Liste des administrateurs" },
  { id: "users", label: "Gestion des utilisateurs" },
];

export const adminSectionsFor = (grade) => [1, 2].includes(grade)
  ? ADMIN_SECTIONS.filter(section => !section.superAdmin || grade === 1) : [];

export const activeAdminSection = (search, grade) => {
  const available = adminSectionsFor(grade);
  const requested = new URLSearchParams(search || "").get("section");
  return available.find(section => section.id === requested)?.id || available[0]?.id;
};
