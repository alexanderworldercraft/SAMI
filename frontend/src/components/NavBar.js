'use client'

import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  TransitionChild,
} from '@headlessui/react'
import {
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  UserIcon,
  FilmIcon,
  MusicalNoteIcon,
  RectangleStackIcon,
  PlusCircleIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline'
import { ChevronDownIcon } from '@heroicons/react/20/solid'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../services/api'
import SearchBar from './SearchBar'
import ThemeToggle from './ThemeToggle'
import NavVisibilityToggle from './NavVisibilityToggle'
import { useNav } from '../context/NavContext'
import UserAvatar from "./UserAvatar";
import { scrollToPageTop } from '../utils/scrollToPageTop'

const apiBaseUrl = process.env.REACT_APP_URL_LOCAL
const appName = process.env.REACT_APP_NAME || 'SAMI'
const appVersion = process.env.REACT_APP_VER

const AppBrand = () => (
  <span className="flex items-baseline gap-2">
    <span className="text-sm font-semibold text-gray-900 dark:text-white">{appName}</span>
    {appVersion && (
      <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[10px] font-black text-sky-700 dark:text-sky-300">
        v{appVersion}
      </span>
    )}
  </span>
)

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

const navItemClass = (active) =>
  classNames(
    active
      ? 'border-sky-400/70 bg-gradient-to-r from-sky-500/30 via-blue-700/25 to-transparent text-sky-950 shadow-[0_0_24px_rgba(56,189,248,0.35)] dark:text-white'
      : 'border-transparent text-gray-700 hover:border-sky-400/40 hover:bg-sky-500/10 hover:text-sky-700 dark:text-gray-300 dark:hover:text-white',
    'group flex gap-x-3 rounded-xl border px-3 py-2.5 text-sm/6 font-semibold transition duration-200'
  )

const navIconClass = (active) =>
  classNames(
    active
      ? 'text-sky-500 dark:text-sky-300'
      : 'text-gray-400 group-hover:text-sky-600 dark:group-hover:text-sky-300',
    'size-6 shrink-0 transition duration-200'
  )

export default function NavBar() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState(null)
  // Nouvel état : pour savoir si on est encore en train de charger /users/me
  const [isUserLoading, setIsUserLoading] = useState(true)

  const { navMode, setNavMode } = useNav()

  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    // On essaie de récupérer l'utilisateur courant
    const fetchUser = async () => {
      try {
        setIsUserLoading(true)
        const res = await api.get('/users/me')
        setUser(res.data)
      } catch (err) {
        // Si ça échoue (pas de token, token expiré…), on logge juste
        console.error('Failed to fetch user profile:', err)
        setUser(null)
      } finally {
        // Dans tous les cas, on indique que le chargement est terminé
        setIsUserLoading(false)
      }
    }

    fetchUser()
  }, [])

  const navigation = [
    { name: 'Accueil', href: '/', icon: HomeIcon, scrollToTop: true },
    { name: 'Vidéos', href: '/videos', icon: FilmIcon, scrollToTop: true },
    { name: 'Musique', href: '/musique', icon: MusicalNoteIcon, scrollToTop: true },
    { name: 'Sagas', href: '/sagas', icon: RectangleStackIcon, scrollToTop: true },
    { name: 'Acteur/réalisateur', href: '/personnes', icon: UserIcon, scrollToTop: true },
    ...(user?.GradeID === 1 || user?.GradeID === 2
      ? [
          { name: 'Nouveau contenu', href: '/nouvelle-video', icon: PlusCircleIcon },
          { name: 'Nouvelle musique', href: '/nouvelle-musique', icon: MusicalNoteIcon },
        ]
      : []),
  ]

  const dropdownItems = [
    { name: 'Votre Profil', href: '/settings' },
    ...(user?.GradeID === 1 || user?.GradeID === 2
      ? [{ name: 'Administration', href: '/administration' }]
      : []),
  ]

  // Image par défaut pour le profil
  const defaultImage = 'https://via.placeholder.com/150?text=Profile'

  // Fonction utilitaire pour récupérer un média aléatoire
  const fetchRandom = async (endpoint) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/videos/${endpoint}`)
      const data = await res.json()
      if (data?.VideoID) {
        setSidebarOpen(false)
        navigate(`/lecture/${data.VideoID}`)
        scrollToPageTop()
      } else {
        alert('Aucun média trouvé.')
      }
    } catch (err) {
      console.error("Erreur lors de la récupération d'un média aléatoire :", err)
    }
  }

  const navVisibilityClass =
    navMode === 'hover'
      ? 'opacity-0 group-hover:opacity-100 transition-all duration-300 lg:-translate-x-64 group-hover:translate-x-0'
      : 'opacity-100 translate-x-0 transition-all duration-300'

  const topbarPaddingClass =
    navMode === 'hover'
      ? 'lg:pl-0 group-hover:lg:pl-72 opacity-0 group-hover:opacity-100 transition-all duration-300'
      : 'lg:pl-72 opacity-100 transition-all duration-300'

  // Petite fonction pour gérer la déconnexion proprement
  const handleLogout = async () => {
    try {
      await fetch('/api/users/logout', {
        method: 'POST',
        credentials: 'include',
      })
    } catch (err) {
      console.error('Erreur lors de la déconnexion :', err)
    } finally {
      localStorage.removeItem('token')
      setUser(null)
      navigate('/login')
    }
  }

  const handleMainNavigation = (closeSidebar = false, shouldScrollToTop = false) => {
    if (closeSidebar) setSidebarOpen(false)
    if (shouldScrollToTop) scrollToPageTop()
  }

  return (
    <>
      {/* Drawer mobile */}
      <Dialog open={sidebarOpen} onClose={setSidebarOpen} className="relative z-50 lg:hidden">
        <DialogBackdrop
          transition
          className="fixed inset-0 bg-gray-900/80 transition-opacity duration-300 ease-linear data-[closed]:opacity-0"
        />
        <div className="fixed inset-0 flex">
          <DialogPanel
            transition
            className="relative mr-16 flex w-full max-w-xs flex-1 transform transition duration-300 ease-in-out data-[closed]:-translate-x-full"
          >
            <TransitionChild>
              <div className="absolute left-full top-0 flex w-16 justify-center pt-5 duration-300 ease-in-out data-[closed]:opacity-0">
                <button type="button" onClick={() => setSidebarOpen(false)} className="-m-2.5 p-2.5">
                  <span className="sr-only">Close sidebar</span>
                  <XMarkIcon aria-hidden="true" className="size-6 text-white" />
                </button>
              </div>
            </TransitionChild>

            {/* Sidebar mobile */}
            <div className="relative flex grow flex-col gap-y-5 overflow-y-auto bg-white px-6 pb-4 dark:bg-gray-900 dark:ring dark:ring-white/10 dark:before:pointer-events-none dark:before:absolute dark:before:inset-0 dark:before:bg-black/10">
              <div className="relative flex h-16 shrink-0 items-center">
                <Link to="/" className="flex items-center gap-3">
                  <img src="/logo.png" alt="Logo" className="h-8 w-auto" />
                  <AppBrand />
                </Link>
              </div>

              <nav className="relative flex flex-1 flex-col">
                <ul role="list" className="flex flex-1 flex-col gap-y-7">
                  {/* Navigation */}
                  <li>
                    <ul role="list" className="-mx-2 space-y-1">
                      {navigation.map((item) => {
                        const active = location.pathname === item.href
                        return (
                          <li key={item.name}>
                            <Link
                              to={item.href}
                              onClick={() => handleMainNavigation(true, item.scrollToTop)}
                              className={navItemClass(active)}
                            >
                              <item.icon
                                aria-hidden="true"
                                className={navIconClass(active)}
                              />
                              {item.name}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </li>

                  {/* Aléatoires */}
                  <li>
                    <div className="text-xs/6 font-semibold text-gray-400">Aléatoires</div>
                    <ul role="list" className="-mx-2 mt-2 space-y-1">
                      <li>
                        <button
                          onClick={() => fetchRandom('random-media')}
                          className="group flex w-full gap-x-3 rounded-md p-2 text-left text-sm/6 font-semibold text-gray-700 hover:bg-gray-50 hover:text-sky-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                        >
                          <FilmIcon className="size-6 shrink-0 text-gray-400 group-hover:text-sky-600 dark:group-hover:text-white" />
                          Aléatoire
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => fetchRandom('random-film')}
                          className="group flex w-full gap-x-3 rounded-md p-2 text-left text-sm/6 font-semibold text-gray-700 hover:bg-gray-50 hover:text-sky-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                        >
                          <FilmIcon className="size-6 shrink-0 text-gray-400 group-hover:text-sky-600 dark:group-hover:text-white" />
                          Film aléatoire
                        </button>
                      </li>
                      <li>
                        <button
                          onClick={() => fetchRandom('random-series')}
                          className="group flex w-full gap-x-3 rounded-md p-2 text-left text-sm/6 font-semibold text-gray-700 hover:bg-gray-50 hover:text-sky-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                        >
                          <FilmIcon className="size-6 shrink-0 text-gray-400 group-hover:text-sky-600 dark:group-hover:text-white" />
                          Série aléatoire
                        </button>
                      </li>
                    </ul>
                  </li>

                  {/* Settings */}
                  <li className="mt-auto">
                    <Link
                      to="/settings"
                      onClick={() => setSidebarOpen(false)}
                      className="group -mx-2 flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold text-gray-700 hover:bg-gray-50 hover:text-sky-600 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white"
                    >
                      <Cog6ToothIcon
                        aria-hidden="true"
                        className="size-6 shrink-0 text-gray-400 group-hover:text-sky-600 dark:group-hover:text-white"
                      />
                      Paramètres
                    </Link>
                  </li>
                </ul>
              </nav>
            </div>
          </DialogPanel>
        </div>
      </Dialog>

      <div className="group">
        {/* Sidebar desktop */}
        <div
          className={classNames(
            'hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-72 lg:flex-col backdrop-blur-2xl',
            navVisibilityClass,
          )}
        >
          <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 pb-4 dark:border-white/10 dark:bg-black/50">
            <div className="flex h-16 shrink-0 items-center">
              <Link to="/" className="flex items-center gap-3">
                <img src="/logo.png" alt="Logo" className="h-8 w-auto" />
                <AppBrand />
              </Link>
            </div>

            <nav className="flex flex-1 flex-col">
              <ul role="list" className="flex flex-1 flex-col gap-y-7">
                {/* Navigation */}
                <li>
                  <ul role="list" className="-mx-2 space-y-1">
                    {navigation.map((item) => {
                      const active = location.pathname === item.href
                      return (
                        <li key={item.name}>
                          <Link
                            to={item.href}
                            onClick={() => handleMainNavigation(false, item.scrollToTop)}
                            className={navItemClass(active)}
                          >
                            <item.icon
                              aria-hidden="true"
                              className={navIconClass(active)}
                            />
                            {item.name}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </li>

                {/* Aléatoires */}
                <li>
                  <div className="text-xs/6 font-semibold text-gray-400">Aléatoires</div>
                  <ul role="list" className="-mx-2 mt-2 space-y-1">
                    <li>
                      <button
                        onClick={() => fetchRandom('random-media')}
                        className="group flex w-full gap-x-3 rounded-md p-2 text-left text-sm/6 font-semibold text-gray-700 hover:bg-gray-50 hover:text-sky-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                      >
                        <FilmIcon className="size-6 shrink-0 text-gray-400 group-hover:text-sky-600 dark:group-hover:text-white" />
                        Aléatoire
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => fetchRandom('random-film')}
                        className="group flex w-full gap-x-3 rounded-md p-2 text-left text-sm/6 font-semibold text-gray-700 hover:bg-gray-50 hover:text-sky-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                      >
                        <FilmIcon className="size-6 shrink-0 text-gray-400 group-hover:text-sky-600 dark:group-hover:text-white" />
                        Film aléatoire
                      </button>
                    </li>
                    <li>
                      <button
                        onClick={() => fetchRandom('random-series')}
                        className="group flex w-full gap-x-3 rounded-md p-2 text-left text-sm/6 font-semibold text-gray-700 hover:bg-gray-50 hover:text-sky-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                      >
                        <FilmIcon className="size-6 shrink-0 text-gray-400 group-hover:text-sky-600 dark:group-hover:text-white" />
                        Série aléatoire
                      </button>
                    </li>
                  </ul>
                </li>

                {/* Settings */}
                <li className="mt-auto">
                  <Link
                    to="/settings"
                    className="group -mx-2 flex gap-x-3 rounded-md p-2 text-sm/6 font-semibold text-gray-700 hover:bg-gray-50 hover:text-sky-600 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white"
                  >
                    <Cog6ToothIcon
                      aria-hidden="true"
                      className="size-6 shrink-0 text-gray-400 group-hover:text-sky-600 dark:group-hover:text-white"
                    />
                    Paramètres
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>

        {/* Topbar */}
        <div className={classNames(topbarPaddingClass, 'transition-[padding] duration-300')}>
          <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8 dark:border-white/10 dark:bg-black/50 dark:shadow-none">
            {/* Burger mobile */}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="-m-2.5 p-2.5 text-gray-700 hover:text-gray-900 lg:hidden dark:text-gray-400 dark:hover:text-white"
            >
              <span className="sr-only">Open sidebar</span>
              <Bars3Icon aria-hidden="true" className="size-6" />
            </button>

            {/* Separator */}
            <div aria-hidden="true" className="h-6 w-px bg-gray-200 lg:hidden dark:bg-white/10" />

            {/* Search + droite */}
            <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
              <div className="grid flex-1 grid-cols-1 relative">
                <SearchBar />
              </div>

              <div className="flex items-center gap-x-4 lg:gap-x-6">
                {/* Toggle thème */}
                <ThemeToggle />

                {/* Separator desktop */}
                <div aria-hidden="true" className="hidden lg:block lg:h-6 lg:w-px lg:bg-gray-200 dark:lg:bg-white/10" />

                {/* Zone droite : soit profil, soit Connexion/Inscription */}
                {isUserLoading ? (
                  // Option simple : petit "squelette" ou rien
                  <div className="h-8 w-24 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse" />
                ) : user ? (
                  // === UTILISATEUR CONNECTÉ : menu profil (comportement actuel) ===
                  <Menu as="div" className="relative">
                    <MenuButton className="relative flex items-center">
                      <span className="absolute -inset-1.5" />
                      <span className="sr-only">Ouvrir le menu utilisateur</span>

                      <UserAvatar
                        src={user?.CheminImage
                            ? `${apiBaseUrl}${user.CheminImage}`
                            : defaultImage}
                        alt={user.Surnom}
                        name={user.Surnom}
                        size="md"
                        isPremium={user.isPremium} // <-- flag renvoyé par /users/me
                      />
                      <span className="hidden lg:ps-4 lg:flex lg:items-center">
                        <div className='grid grid-cols-1 gap-4'>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {user.Surnom}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {user.isPremium ? "Compte Premium" : "Compte gratuit"}
                        </p>
                        </div>
                        <ChevronDownIcon
                          aria-hidden="true"
                          className="ml-2 size-5 text-gray-400 dark:text-gray-500"
                        />
                      </span>
                    </MenuButton>
                    <MenuItems
                      transition
                      className="absolute right-0 z-10 mt-2.5 w-56 origin-top-right rounded-xl bg-black/10 dark:bg-gray-50/10 backdrop-blur py-2 shadow-lg outline outline-1 outline-gray-900/5 transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in dark:shadow-none dark:-outline-offset-1 dark:outline-white/10"
                    >
                      {dropdownItems.map((item) => (
                        <MenuItem key={item.name}>
                          <Link
                            to={item.href}
                            className="block px-3 py-2 text-sm/6 text-gray-900 data-[focus]:bg-gray-50 data-[focus]:outline-none dark:text-white dark:data-[focus]:bg-white/5"
                          >
                            {item.name}
                          </Link>
                        </MenuItem>
                      ))}

                      {/* Visibilité de la barre */}
                      <div className="px-3 py-2 grid grid-cols-2 gap-2">
                        <span className="block text-xs text-gray-900 dark:text-white">Visibilité de la barre</span>
                        <NavVisibilityToggle onModeChange={setNavMode} />
                      </div>

                      <MenuItem>
                        <button
                          onClick={handleLogout}
                          className="block w-full text-left px-3 py-2 text-sm/6 text-gray-900 data-[focus]:bg-gray-50 data-[focus]:outline-none dark:text-white dark:data-[focus]:bg-white/5"
                        >
                          Se déconnecter
                        </button>
                      </MenuItem>
                    </MenuItems>
                  </Menu>
                ) : (
                  // === AUCUN UTILISATEUR : double bouton Connexion / Inscription ===
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => navigate('/login')}
                      className="rounded-md bg-sky-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-800 hover:-translate-y-[1px] transition duration-200"
                    >
                      Connexion
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/register')}
                      className="rounded-md border border-sky-700 px-3 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-50 hover:-translate-y-[1px] transition duration-200 dark:border-sky-400 dark:text-sky-300 dark:hover:bg-white/5"
                    >
                      Inscription
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
