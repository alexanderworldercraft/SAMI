import React from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import LoginPage from './components/LoginPage';
//import RegisterPage from './components/RegisterPage';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/NavBar';
import ProfilePage from './components/ProfilePage';
import SettingsPage from './components/SettingsPage';
import Administration from './components/AdministrationPage';
import ProtectedAdminRoute from './components/ProtectedAdminRoute';
import VideoListPage from './components/VideoListPage';
import SagaListPage from './components/SagaListPage';
import VideoSeePage from './components/VideoSeePage';
import FormNewVideoPage from './components/FormNewVideoPage';
import FormNewMusicPage from './components/FormNewMusicPage';
import MusicPage from './components/MusicPage';
import FooterPage from './components/FooterPage';
import NotProtectedRoute from './components/NotProtectedRoute';
import HomePage from './components/HomePage';
import WallPaper from './components/WallPaper';
import { NavProvider } from './context/NavContext';
import { useNav } from './context/NavContext';
import PeopleListPage from "./components/PeopleListPage";
import PersonDetailsPage from "./components/PersonDetailsPage";
import MaintenanceBanner from "./components/MaintenanceBanner";
import UpdatesPage from "./components/UpdatesPage";
import GeneralMessageBanner from "./components/GeneralMessageBanner";
import MusicStickyPlayer from "./components/MusicStickyPlayer";
import { MusicPlayerProvider, useMusicPlayer } from "./context/MusicPlayerContext";

const NameApp = process.env.REACT_APP_NAME + " " + process.env.REACT_APP_VER;


function AppShell({ children, withFooter = true, contentClassName = "" }) {
  const { navMode } = useNav();

  // applique un décalage conditionnel
  const paddingClass = navMode === 'hover' ? 'lg:pl-4' : 'lg:pl-72';

  return (
    <>
      <WallPaper />
      <Navbar />
      <div className={paddingClass}>
        <GeneralMessageBanner />
        <main className={contentClassName || "px-4 sm:px-6 lg:px-8"}>
          {children}
        </main>
        {withFooter && <FooterPage />}
      </div>
    </>
  );
}

function PersistentMusicPlayer() {
  const location = useLocation();
  const { playlist, setPlaylist } = useMusicPlayer();
  const isMusicPage = location.pathname === "/musique";
  const canShowMusicPlayer =
    isMusicPage ||
    location.pathname === "/nouvelle-video" ||
    location.pathname === "/nouvelle-musique" ||
    location.pathname === "/personnes" ||
    location.pathname.startsWith("/personnes/") ||
    location.pathname === "/sagas" ||
    location.pathname === "/videos";

  if (!canShowMusicPlayer || (!isMusicPage && playlist.length === 0)) return null;

  return <MusicStickyPlayer playlist={playlist} setPlaylist={setPlaylist} />;
}


const routesMeta = {
  "/login": {
    title: `Connexion - ${NameApp}`,
    description: `Connectez-vous pour accéder à votre compte ${NameApp}.`,
  },
  "/register": {
    title: `Inscription - ${NameApp}`,
    description: `Créez un compte pour accéder à ${NameApp}.`,
  },
  "/profile": { title: `Profil - ${NameApp}`, description: "Bienvenue sur votre profil." },
  "/settings": { title: `Paramètres - ${NameApp}`, description: "Bienvenue sur vos paramètres." },
  "/administration": {
    title: `Administration - ${NameApp}`,
    description: `Gérez les utilisateurs et les paramètres administratifs de ${NameApp}.`,
  },
  "/videos": { title: `liste des vidéos - ${NameApp}`, description: `La liste des vidéos disponible sur ${NameApp}.` },
  "/sagas": { title: `liste des sagas - ${NameApp}`, description: `La liste des sagas disponible sur ${NameApp}.` },
  "/musique": { title: `Musique - ${NameApp}`, description: `La liste des musiques disponible sur ${NameApp}.` },
  "/nouvelle-video": {
    title: `Formulaire pour ajout de vidéos - ${NameApp}`,
    description: `Formulaire d'ajout de vidéos sur ${NameApp}.`,
  },
  "/nouvelle-musique": {
    title: `Formulaire pour ajout de musique - ${NameApp}`,
    description: `Formulaire d'ajout de musiques et albums sur ${NameApp}.`,
  },
  "/updates": {
    title: `Mises à jour - ${NameApp}`,
    description: `Historique des mises à jour de ${NameApp}.`,
  },
};

function MetaUpdater() {
  const location = useLocation();
  const meta = routesMeta[location.pathname] || {
    title: `${NameApp}`,
    description: `Bienvenue sur ${NameApp}, votre application de streaming privée.`,
  };
  return (
    <Helmet>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
    </Helmet>
  );
}

export default function App() {
  return (
    <NavProvider>
    <MusicPlayerProvider>
      <Router>
        <MetaUpdater />
        <MaintenanceBanner />
        <PersistentMusicPlayer />
        <Routes>
        {/* Pages sans Navbar */}
        <Route path="/login" element={<LoginPage />} />
        {/* Register désactivé pour brider la création de compte */}
        <Route path="/register" element={<LoginPage />} />

        {/* Pages AVEC sidebar */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppShell withFooter={false}>
                <ProfilePage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <AppShell withFooter={false}>
                <SettingsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/videos"
          element={
            <ProtectedRoute>
              <AppShell>
                <VideoListPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/sagas"
          element={
            <ProtectedRoute>
              <AppShell>
                <SagaListPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/musique"
          element={
            <ProtectedRoute>
              <AppShell>
                <MusicPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/personnes"
          element={
            <ProtectedRoute>
              <AppShell>
                <PeopleListPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/personnes/:id"
          element={
            <ProtectedRoute>
              <AppShell>
                <PersonDetailsPage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/lecture/:id"
          element={
            <ProtectedRoute>
              {/* Exemple: page lecteur – pas de padding horizontal pour coller au player si tu veux */}
              <AppShell contentClassName="">
                <VideoSeePage />
              </AppShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration"
          element={
            <ProtectedAdminRoute>
              <AppShell withFooter={false}>
                <Administration />
              </AppShell>
            </ProtectedAdminRoute>
          }
        />
        <Route
          path="/nouvelle-video"
          element={
            <ProtectedAdminRoute>
              <AppShell>
                <FormNewVideoPage />
              </AppShell>
            </ProtectedAdminRoute>
          }
        />
        <Route
          path="/nouvelle-musique"
          element={
            <ProtectedAdminRoute>
              <AppShell>
                <FormNewMusicPage />
              </AppShell>
            </ProtectedAdminRoute>
          }
        />
        <Route
          path="/updates"
          element={
            <NotProtectedRoute>
              <AppShell>
                <UpdatesPage />
              </AppShell>
            </NotProtectedRoute>
          }
        />

        {/* Accueil */}
        <Route
          path="/"
          element={
            <NotProtectedRoute>
              <AppShell>
                <HomePage />
              </AppShell>
            </NotProtectedRoute>
          }
        />
        </Routes>
      </Router>
    </MusicPlayerProvider>
    </NavProvider>
  );
}
