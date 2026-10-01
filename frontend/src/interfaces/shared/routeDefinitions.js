// Les URL et les droits d'accès appartiennent à l'application, pas à un mode
// d'affichage. Les pages et les dispositions sont fournies par chaque interface.
export const APP_ROUTES = Object.freeze([
  { path: "/login", page: "login", access: "public", withoutShell: true },
  // L'inscription reste désactivée : même page de connexion qu'auparavant.
  { path: "/register", page: "login", access: "public", withoutShell: true },
  { path: "/profile", page: "profile", access: "user", withFooter: false },
  { path: "/settings", page: "settings", access: "user", withFooter: false },
  { path: "/videos", page: "videos", access: "user" },
  { path: "/sagas", page: "sagas", access: "user" },
  { path: "/musique", page: "music", access: "user" },
  { path: "/voix", page: "voices", access: "user" },
  { path: "/personnes", page: "people", access: "user" },
  { path: "/personnes/:id", page: "person", access: "user" },
  { path: "/lecture/:id", page: "playback", access: "user", contentClassName: "" },
  { path: "/administration", page: "administration", access: "admin", admin: true, withFooter: false },
  { path: "/nouvelle-video", page: "newVideo", access: "admin", admin: true },
  { path: "/nouvelle-musique", page: "newMusic", access: "admin", admin: true },
  { path: "/updates", page: "updates", access: "public" },
  { path: "/stats", page: "stats", access: "public" },
  { path: "/politique-confidentialite", page: "privacy", access: "public" },
  { path: "/conditions-utilisation", page: "terms", access: "public" },
  { path: "/conformite-donnees", page: "compliance", access: "public" },
  { path: "/", page: "home", access: "public" },
]);

export function isAdministrationPath(pathname) {
  const path = pathname.replace(/\/+$/, "") || "/";
  return APP_ROUTES.some((route) => route.admin && route.path === path);
}
