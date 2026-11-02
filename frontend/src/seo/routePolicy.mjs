// Politique commune au HTML serveur et aux métadonnées React.
const STATIC_ROUTES = {
  "/": ["", "Bienvenue sur {site}, votre application de streaming privée.", true],
  "/updates": ["Mises à jour", "Historique des mises à jour de {site}.", true],
  "/politique-confidentialite": ["Politique de confidentialité", "Politique de confidentialité de {site}.", true],
  "/conditions-utilisation": ["Conditions d'utilisation", "Conditions d'utilisation de {site}.", true],
  "/conformite-donnees": ["Conformité des données", "Conformité des données de {site}.", true],
  "/stats": ["Statistiques", "Statistiques et activité de {site}."],
  "/login": ["Connexion", "Connectez-vous pour accéder à votre compte {site}."],
  // L'inscription reste désactivée : cette URL affiche la connexion.
  "/register": ["Connexion", "Connectez-vous pour accéder à votre compte {site}."],
  "/recuperation-mot-de-passe": ["Récupération du compte", "Confirmez la récupération de votre compte {site}."],
  "/profile": ["Profil", "Votre profil sur {site}."],
  "/settings": ["Paramètres", "Vos paramètres sur {site}."],
  "/videos": ["Vidéos", "Le catalogue vidéo de {site}."],
  "/sagas": ["Sagas", "Les sagas de {site}."],
  "/musique": ["Musique", "Le catalogue musical de {site}."],
  "/voix": ["Voix", "La bibliothèque vocale de {site}."],
  "/personnes": ["Personnes", "Les personnes associées aux contenus de {site}."],
  "/administration": ["Administration", "Administration de {site}."],
  "/nouvelle-video": ["Ajouter une vidéo", "Ajout de vidéos dans {site}."],
  "/nouvelle-musique": ["Ajouter une musique", "Ajout de musiques dans {site}."],
};

export const STATIC_PAGE_PATHS = Object.freeze(Object.keys(STATIC_ROUTES));
export const INDEXABLE_PAGE_PATHS = Object.freeze(STATIC_PAGE_PATHS.filter((pathname) => STATIC_ROUTES[pathname][2]));
export const normalizePagePath = (pathname) => String(pathname || "/").replace(/\/+$/, "") || "/";

export function parseContentId(value) {
  const text = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(text)) return null;
  const id = Number(text);
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}

export function getSeoRoute(pathname) {
  const path = normalizePagePath(pathname);
  if (Object.prototype.hasOwnProperty.call(STATIC_ROUTES, path)) return { path, dynamic: false, indexable: Boolean(STATIC_ROUTES[path][2]) };
  const match = /^\/(lecture|personnes)\/([^/]+)$/.exec(path);
  if (!match || !parseContentId(match[2])) return null;
  return { path, dynamic: true, indexable: false };
}

export function buildRouteSeo({ pathname, siteName = "SAMI", origin, statusCode = 200 }) {
  const name = String(siteName || "SAMI").replace(/\s+/g, " ").trim() || "SAMI";
  const route = getSeoRoute(pathname);
  const unavailable = statusCode >= 500;
  const missing = !route || statusCode === 404;
  const indexable = !unavailable && !missing && route.indexable;
  const path = route?.path;
  const [label, description] = unavailable
    ? ["Service temporairement indisponible", "Le service est temporairement indisponible. Réessayez plus tard."]
    : missing
      ? ["Page introuvable", "Cette page n'existe pas ou n'est plus disponible."]
      : STATIC_ROUTES[path] || [path.startsWith("/lecture/") ? "Lecture" : "Personne", "Accédez à ce contenu sur {site} avec votre compte."];
  const publicOrigin = new URL(origin).origin;
  return {
    siteName: name,
    title: label ? `${label} - ${name}` : name,
    description: description.replaceAll("{site}", () => name),
    type: "website",
    robots: indexable ? "index, follow" : "noindex, nofollow",
    canonicalUrl: unavailable || missing ? null : new URL(path === "/register" ? "/login" : path, publicOrigin).href,
    imageUrl: new URL("/logo512.png", publicOrigin).href,
    imageAlt: `Logo ${name}`,
  };
}
