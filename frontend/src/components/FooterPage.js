import TotalVideos from "./TotalVideos";
import { Link } from "react-router-dom";
import { scrollToPageTop } from "../utils/scrollToPageTop";

const FooterPage = () => {

  return (
    <div className="py-6 lg:px-8">
      <footer className="p-6 mx-auto container dark:text-neutral-100 border-t border-slate-800 flex flex-row justify-between gap-4">
        <div className="grid gap-2">
          <p className="text-base text-center italic font-semibold">© 2024-2026 SAMI.WORLDERCRAFT.FR All Rights Reserved.</p>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:justify-start">
            <Link
              to="/updates"
              onClick={scrollToPageTop}
              className="text-sm font-semibold text-sky-600 transition duration-200 hover:text-sky-500 dark:text-sky-300 dark:hover:text-sky-200"
            >
              Mises à jour
            </Link>
            <Link
              to="/stats"
              onClick={scrollToPageTop}
              className="text-sm font-semibold text-sky-600 transition duration-200 hover:text-sky-500 dark:text-sky-300 dark:hover:text-sky-200"
            >
              Statistiques
            </Link>
            <Link
              to="/politique-confidentialite"
              onClick={scrollToPageTop}
              className="text-sm font-semibold text-sky-600 transition duration-200 hover:text-sky-500 dark:text-sky-300 dark:hover:text-sky-200"
            >
              Politique de confidentialité
            </Link>
            <Link
              to="/conditions-utilisation"
              onClick={scrollToPageTop}
              className="text-sm font-semibold text-sky-600 transition duration-200 hover:text-sky-500 dark:text-sky-300 dark:hover:text-sky-200"
            >
              Conditions d'utilisation
            </Link>
            <Link
              to="/conformite-donnees"
              onClick={scrollToPageTop}
              className="text-sm font-semibold text-sky-600 transition duration-200 hover:text-sky-500 dark:text-sky-300 dark:hover:text-sky-200"
            >
              Conformité des données
            </Link>
          </nav>
        </div>
        <TotalVideos />
      </footer>
    </div>
  );
};

export default FooterPage;
