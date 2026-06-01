import React, { useEffect, useState } from 'react';
import { Disclosure, Menu } from '@headlessui/react';
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { useLocation, useNavigate } from 'react-router-dom'; // Importer useLocation
import api from '../services/api';
import SearchBar from './SearchBar';
import ThemeToggle from './ThemeToggle';

const apiBaseUrl = process.env.REACT_APP_URL_LOCAL;
const nameCloneUrl = process.env.REACT_APP_NAME_CLONE_URL;
const cloneUrl = process.env.REACT_APP_URL_CLONE;

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default function Navbar() {
  const [user, setUser] = useState(null);
  const location = useLocation(); // Obtenir l'URL actuelle
  const navigate = useNavigate(); // Pour rediriger

  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await api.get('/users/me');
        setUser(response.data);
      } catch (err) {
        console.error('Failed to fetch user profile:', err);
      }
    };

    fetchUserProfile();
  }, []);

  const defaultImage = 'https://via.placeholder.com/150?text=Default+Profile'; // URL de l'image par défaut

  const fetchRandom = async (endpoint) => {
    try {
      const response = await fetch(`${process.env.REACT_APP_URL_LOCAL}/api/videos/${endpoint}`);
      const data = await response.json();
      if (data.VideoID) {
        navigate(`/lecture/${data.VideoID}`); // Redirige vers le lecteur
      } else {
        alert("Aucun média trouvé.");
      }
    } catch (error) {
      console.error("Erreur lors de la récupération d'un média aléatoire :", error);
    }
  };

  // Définir dynamiquement les éléments du menu
  const navigation = [
    { name: 'Vidéos', href: '/videos' },
    { name: `${nameCloneUrl}`, href: `${cloneUrl}` },
    ...(user?.GradeID === 1 || user?.GradeID === 2
      ? [{ name: 'Nouvelle vidéos', href: '/nouvelle-video' }]
      : []), // Ajouter "Administration" uniquement pour les admins
  ];
  const btnRandom = [
    { name: 'Aléatoire', onClick: () => fetchRandom('random-media') },
    { name: 'Film aléatoire', onClick: () => fetchRandom('random-film') },
    { name: 'Série aléatoire', onClick: () => fetchRandom('random-series') },
  ];

  // Définir dynamiquement les éléments du menu dropdown
  const dropdownItems = [
    { name: 'Votre Profil', href: '/profile' },
    { name: 'Paramètres', href: '/settings' },
    ...(user?.GradeID === 1 || user?.GradeID === 2
      ? [{ name: 'Administration', href: '/administration' }]
      : []), // Ajouter "Administration" uniquement pour les admins
  ];

  const cloneSite = [
    ["apiBaseUrl", apiBaseUrl],
    ["nameCloneUrl", nameCloneUrl],
    ["cloneUrl", cloneUrl],
  ];
  // console.table(cloneSite);

  return (
    <Disclosure as="nav" className="bg-transparent sticky top-0 z-20">
      {({ open }) => (
        <>
          <div className="mx-auto max-w-7xl px-2 lg:px-6 xl:px-8">
            <div className="relative flex h-16 items-center justify-between">
              {/* Menu mobile */}
              <div className="absolute inset-y-0 left-0 flex items-center lg:hidden">
                <Disclosure.Button className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-700 hover:dark:text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white">
                  <span className="sr-only">Open main menu</span>
                  {open ? (
                    <XMarkIcon className="block h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Bars3Icon className="block h-6 w-6" aria-hidden="true" />
                  )}
                </Disclosure.Button>
              </div>

              {/* Logo et navigation principale */}
              <div className="flex flex-1 items-center justify-center lg:items-stretch lg:justify-start">
                <a href='/' className="hidden shrink-0 items-center lg:flex rounded bg-black/60 p-1">
                  <img alt="Your Company" src="/logo.png" className="h-8 w-auto" />
                </a>
                {/* Barre de recherche */}
                <div className="flex shrink-0 items-center lg:hidden">
                  <SearchBar /> {/* Ajout du composant SearchBar */}
                </div>
                <div className="hidden lg:ml-6 lg:block">
                  <div className="flex space-x-4">
                    {navigation.map((item) => (
                      <a
                        key={item.name}
                        href={item.href}
                        className={classNames(
                          location.pathname === item.href
                            ? 'bg-sky-700 text-white hover:bg-sky-800'
                            : 'text-gray-300 backdrop-blur bg-black/60 hover:hover:bg-sky-800 hover:dark:text-white hover:-translate-y-1 duration-500',
                          'rounded-md px-4 py-2 text-sm font-semibold shadow-lg'
                        )}
                        aria-current={location.pathname === item.href ? 'page' : undefined}
                      >
                        {item.name}
                      </a>
                    ))}

                    {btnRandom.map((item) => (
                      <button
                        key={item.name}
                        onClick={item.onClick}
                        className={classNames(
                          location.pathname === item.href
                            ? 'bg-sky-700 dark:text-white hover:bg-sky-800'
                            : 'text-gray-300 backdrop-blur bg-black/60 hover:hover:bg-sky-800 hover:dark:text-white hover:-translate-y-1 duration-500',
                          'rounded-md px-4 py-2 text-sm font-semibold shadow-lg'
                        )}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {/* Barre de recherche */}
              <div className="hidden lg:block">
                <SearchBar /> {/* Ajout du composant SearchBar */}
              </div>
              {/* Icônes de droite */}
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 lg:static lg:inset-auto lg:ml-6 lg:pr-0">
              {/* Thème claire/sombre */}
                <ThemeToggle />
                {/* Dropdown utilisateur */}
                <Menu as="div" className="relative ml-3">
                  <div>
                    <Menu.Button className="flex rounded-full bg-gray-800 text-sm focus:outline-none focus:ring-2 duration-300 focus:ring-sky-600 focus:ring-offset-2 focus:ring-offset-gray-800 hover:outline-none hover:ring-2 hover:ring-sky-600 hover:ring-offset-2 hover:ring-offset-gray-800">
                      <span className="sr-only">Open user menu</span>
                      <div className="h-8 w-8 rounded-full flex items-center justify-center overflow-hidden">
                        <img
                          className="h-full w-full object-cover"
                          src={
                            user?.CheminImage
                              ? `${apiBaseUrl}${user.CheminImage}` // Ajout de l'adresse du serveur
                              : defaultImage
                          }
                          alt="Profile"
                        />
                      </div>
                    </Menu.Button>
                  </div>
                  <Menu.Items className="absolute right-0 mt-2 w-48 origin-top-right rounded-md bg-gray-950/60 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none overflow-hidden z-50 backdrop-blur-3xl">
                    {dropdownItems.map((item) => (
                      <Menu.Item key={item.name}>
                        {({ active }) => (
                          <a
                            href={item.href}
                            className={classNames(
                              location.pathname === item.href
                                ? 'bg-gradient-to-r from-sky-800 to-sky-700 shadow-lg shadow-sky-600/30 font-black italic dark:text-white'
                                : active
                                  ? 'bg-gray-100'
                                  : 'text-gray-100',
                              'block px-4 py-2 text-sm backdrop-blur-3xl'
                            )}
                            aria-current={location.pathname === item.href ? 'page' : undefined}
                          >
                            {item.name}
                          </a>
                        )}
                      </Menu.Item>
                    ))}
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => {
                            localStorage.removeItem('token');
                            window.location.href = '/login';
                          }}
                          className={classNames(
                            active ? 'bg-gray-100' : 'text-gray-100',
                            'block w-full text-left px-4 py-2 text-sm backdrop-blur-3xl'
                          )}
                        >
                          Se déconnecter
                        </button>
                      )}
                    </Menu.Item>
                  </Menu.Items>
                </Menu>
              </div>
            </div>
          </div>
          {/* Menu mobile */}
          <Disclosure.Panel className="lg:hidden">
            <div className="flex flex-col gap-3 pt-4">
              {navigation.map((item) => (
                <Disclosure.Button
                  key={item.name}
                  as="a"
                  href={item.href}
                  className={classNames(
                    location.pathname === item.href
                      ? 'bg-gradient-to-r from-sky-800 to-sky-700 shadow-lg shadow-sky-600/30 font-black italic dark:text-white'
                      : 'text-gray-300 backdrop-blur bg-black/60 hover:bg-gradient-to-r from-sky-800 to-sky-700 hover:dark:text-white hover:-translate-y-1 duration-500',
                          'rounded-md px-3 py-2 text-sm font-medium shadow-lg',
                    'block rounded-md px-3 py-2 text-base font-medium mx-auto'
                  )}
                  aria-current={location.pathname === item.href ? 'page' : undefined}
                >
                  {item.name}
                </Disclosure.Button>
              ))}
              {btnRandom.map((item) => (
                <button
                  key={item.name}
                  onClick={item.onClick}
                  className={classNames(
                    location.pathname === item.href
                      ? 'bg-gradient-to-r from-sky-800 to-sky-700 shadow-lg shadow-sky-600/30 font-black italic dark:text-white'
                      : 'text-gray-300 backdrop-blur bg-black/60 hover:bg-gradient-to-r from-sky-800 to-sky-700 hover:dark:text-white hover:-translate-y-1 duration-500',
                          'rounded-md px-3 py-2 text-sm font-medium shadow-lg',
                    'block rounded-md px-3 py-2 text-base font-medium mx-auto w-fit'
                  )}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </Disclosure.Panel>
        </>
      )}
    </Disclosure>
  );
}