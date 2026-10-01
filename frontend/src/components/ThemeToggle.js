import React from 'react';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { Switch } from '@headlessui/react';
import { EllipsisVerticalIcon } from '@heroicons/react/20/solid';
import { SunIcon, MoonIcon } from '@heroicons/react/20/solid';
import useTheme from "../hooks/useTheme";

const ThemeToggle = ({ tactile = false }) => {
  const { isDark, selectTheme } = useTheme();
  const handleSelectChange = selectTheme;
  const handleToggleChange = (enabled) => selectTheme(enabled ? 'dark' : 'light');

  return (
    <div className="flex items-center gap-4">
      <Switch
        title="Choix du thème du site (Claire/Sombre)."
        checked={isDark}
        onChange={handleToggleChange}
        className={`group relative inline-flex ${tactile ? "h-11 w-20 items-center border-0 p-1" : "h-6 w-11 border-2"} shrink-0 cursor-pointer rounded-full border-transparent bg-gray-200 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 data-[checked]:bg-indigo-600`}
      >
        <span className="sr-only">Basculer le thème</span>
        <span className={`pointer-events-none relative inline-block ${tactile ? "size-9 group-data-[checked]:translate-x-9" : "size-5 group-data-[checked]:translate-x-5"} transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}>
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
          anchor={tactile ? { to: "bottom start", gap: 8, padding: 16 } : undefined}
          className={`${tactile ? "z-[170] max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto" : "absolute right-0 z-10 mt-2 origin-top-right"} w-56 rounded-md bg-white dark:bg-slate-900 shadow-lg ring-1 ring-black/5 focus:outline-none`}
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
