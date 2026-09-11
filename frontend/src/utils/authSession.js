const DEFAULT_RETURN_PATH = "/";

export const getSafeReturnPath = (search = "") => {
  const candidate = new URLSearchParams(search).get("returnTo");
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return DEFAULT_RETURN_PATH;
  }
  return candidate;
};

export const buildSessionExpiredLoginUrl = (location = window.location) => {
  const returnTo = `${location.pathname || "/"}${location.search || ""}${location.hash || ""}`;
  const params = new URLSearchParams({
    reason: "session-expired",
    returnTo,
  });
  return `/login?${params.toString()}`;
};

let redirectStarted = false;

export const redirectToLoginForExpiredSession = () => {
  if (redirectStarted || window.location.pathname === "/login") return;
  redirectStarted = true;
  localStorage.removeItem("token");
  window.location.assign(buildSessionExpiredLoginUrl());
};
