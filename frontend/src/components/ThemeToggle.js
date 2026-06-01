import React, { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { Switch } from '@headlessui/react';
import { EllipsisVerticalIcon } from '@heroicons/react/20/solid';
import { SunIcon, MoonIcon } from '@heroicons/react/20/solid';
import { buildCookieValue, parseCookieValue } from "../utils/cookieValue";

const ThemeToggle = () => {
  const [theme, setTheme] = useState(() => {
    const saved = Cookies.get('theme');
    if (saved) return parseCookieValue(saved).value || saved;
    return 'system';
  });

  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const updateIsDark = () => {
      if (theme === 'dark') return setIsDark(true);
      if (theme === 'light') return setIsDark(false);
      return setIsDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
    };
    applyTheme(theme);
    updateIsDark();
  }, [theme]);

  useEffect(() => {
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const systemChangeHandler = () => {
        applyTheme('system');
        setIsDark(mediaQuery.matches);
      };
      mediaQuery.addEventListener('change', systemChangeHandler);
      return () => mediaQuery.removeEventListener('change', systemChangeHandler);
    }
  }, [theme]);

  const applyTheme = (value) => {
    const root = document.documentElement;
    if (value === 'dark') {
      root.classList.add('dark');
    } else if (value === 'light') {
      root.classList.remove('dark');
    } else if (value === 'system') {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    Cookies.set('theme', buildCookieValue(value, expiresAt), { expires: 365 });
  };

  const handleSelectChange = (value) => {
    setTheme(value);
  };

  const handleToggleChange = (enabled) => {
    setTheme(enabled ? 'dark' : 'light');
  };

  return (
    <div className="flex items-center gap-4">
      <Switch
        title="Choix du thème du site (Claire/Sombre)."
        checked={isDark}
        onChange={handleToggleChange}
        className="group relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-gray-200 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 data-[checked]:bg-indigo-600"
      >
        <span className="sr-only">Basculer le thème</span>
        <span className="pointer-events-none relative inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out group-data-[checked]:translate-x-5">
          <span
            aria-hidden="true"
            className="absolute inset-0 flex size-full items-center justify-center transition-opacity duration-200 ease-in group-data-[checked]:opacity-0 group-data-[checked]:duration-100 group-data-[checked]:ease-out"
          >
            <SunIcon className="size-3 text-yellow-500" />
          </span>
          <span
            aria-hidden="true"
            className="absolute inset-0 flex size-full items-center justify-center opacity-0 transition-opacity duration-100 ease-out group-data-[checked]:opacity-100 group-data-[checked]:duration-200 group-data-[checked]:ease-in"
          >
            <MoonIcon className="size-3 text-indigo-600" />
          </span>
        </span>
      </Switch>

      <Menu as="div" className="relative inline-block text-left">
        <div>
          <MenuButton className="flex items-center rounded-full bg-tranparent text-gray-300 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-100">
            <span className="sr-only">Ouvrir les options</span>
            <EllipsisVerticalIcon aria-hidden="true" className="size-5" />
          </MenuButton>
        </div>

        <MenuItems
          className="absolute right-0 z-10 mt-2 w-56 origin-top-right rounded-md bg-white dark:bg-slate-900 shadow-lg ring-1 ring-black/5 focus:outline-none"
        >
          <div className="py-1">
            <MenuItem>
              {({ active }) => (
                <button
                  onClick={() => handleSelectChange('light')}
                  className={`block w-full px-4 py-2 text-left text-sm ${active ? 'bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}
                >
                  Clair
                </button>
              )}
            </MenuItem>
            <MenuItem>
              {({ active }) => (
                <button
                  onClick={() => handleSelectChange('dark')}
                  className={`block w-full px-4 py-2 text-left text-sm ${active ? 'bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}
                >
                  Sombre
                </button>
              )}
            </MenuItem>
            <MenuItem>
              {({ active }) => (
                <button
                  onClick={() => handleSelectChange('system')}
                  className={`block w-full px-4 py-2 text-left text-sm ${active ? 'bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}
                >
                  Système
                </button>
              )}
            </MenuItem>
          </div>
        </MenuItems>
      </Menu>
    </div>
  );
};

export default ThemeToggle;
