import { createContext, useContext, useState, useEffect } from "react";
import { buildCookieValue, parseCookieValue } from "../utils/cookieValue";

const NavContext = createContext();

export function NavProvider({ children }) {
  const [navMode, setNavMode] = useState('permanent');

  // Au démarrage : lit le cookie existant s’il y en a un
  useEffect(() => {
    const cookieValue = document.cookie
      .split('; ')
      .find((row) => row.startsWith('navVisibility='))
      ?.split('=')[1];
    if (cookieValue) setNavMode(parseCookieValue(cookieValue).value || cookieValue);
  }, []);

  // À chaque changement : met à jour le cookie pour persistance
  useEffect(() => {
    const expiresAt = new Date(Date.now() + 31536000 * 1000).toISOString();
    const cookieValue = buildCookieValue(navMode, expiresAt);
    document.cookie = `navVisibility=${cookieValue}; path=/; max-age=31536000`;
  }, [navMode]);

  return (
    <NavContext.Provider value={{ navMode, setNavMode }}>
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  return useContext(NavContext);
}
