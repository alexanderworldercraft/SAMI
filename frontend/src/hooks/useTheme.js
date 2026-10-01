import { useLayoutEffect, useState } from "react";
import Cookies from "js-cookie";
import { buildCookieValue, parseCookieValue } from "../utils/cookieValue";

const THEME_CHANGED = "sami:theme-changed";
const readTheme = () => {
  const value = parseCookieValue(Cookies.get("theme")).value;
  return ["light", "dark", "system"].includes(value) ? value : "system";
};

// Le thème reste actif même lorsque son sélecteur n'est pas affiché.
export default function useTheme() {
  const [theme, setTheme] = useState(readTheme);
  const [isDark, setIsDark] = useState(false);

  useLayoutEffect(() => {
    const update = () => setTheme(readTheme());
    window.addEventListener(THEME_CHANGED, update);
    return () => window.removeEventListener(THEME_CHANGED, update);
  }, []);

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.classList.toggle("dark", dark);
      setIsDark(dark);
    };
    apply();
    if (theme !== "system") return undefined;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  const selectTheme = (value) => {
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    Cookies.set("theme", buildCookieValue(value, expiresAt), { expires: 365 });
    window.dispatchEvent(new Event(THEME_CHANGED));
  };

  return { theme, isDark, selectTheme };
}
