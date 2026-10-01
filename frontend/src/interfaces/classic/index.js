import ClassicShell from "./layout/ClassicShell";
import ClassicPersistentMusicPlayer from "./players/ClassicPersistentMusicPlayer";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import ProfilePage from "./pages/ProfilePage";
import SettingsPage from "./pages/SettingsPage";
import VideoListPage from "./pages/VideoListPage";
import SagaListPage from "./pages/SagaListPage";
import MusicPage from "./pages/MusicPage";
import PeopleListPage from "./pages/PeopleListPage";
import PersonDetailsPage from "./pages/PersonDetailsPage";
import VideoSeePage from "./pages/VideoSeePage";
import VoiceLibraryPage from "./pages/VoiceLibrary";
import UpdatesPage from "./pages/UpdatesPage";
import StatsPage from "./pages/StatsPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsOfUsePage from "./pages/TermsOfUsePage";
import DataCompliancePage from "./pages/DataCompliancePage";

// Les composants gardent leur identité pour préserver leur état lorsque deux
// modes utilisent provisoirement la même interface.
export const classicInterface = Object.freeze({
  id: "classic",
  renderedMode: "classic",
  Shell: ClassicShell,
  PersistentMusicPlayer: ClassicPersistentMusicPlayer,
  pages: Object.freeze({
    home: HomePage,
    login: LoginPage,
    profile: ProfilePage,
    settings: SettingsPage,
    videos: VideoListPage,
    sagas: SagaListPage,
    music: MusicPage,
    people: PeopleListPage,
    person: PersonDetailsPage,
    playback: VideoSeePage,
    voices: VoiceLibraryPage,
    updates: UpdatesPage,
    stats: StatsPage,
    privacy: PrivacyPolicyPage,
    terms: TermsOfUsePage,
    compliance: DataCompliancePage,
  }),
});
