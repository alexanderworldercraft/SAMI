import TotalVideos from "./TotalVideos";
import CalendarSAMI from "./CalendarSAMI";
import CookieList from './CookieList';
import StatsSAMI from './StatsSAMI'

const FooterPage = () => {

  return (
    <div className="py-6 lg:px-8 grid grid-cols-1 gap-8">
      <div className="container border-t border-slate-800 pt-6 grid grid-cols-1 md:grid-cols-2 gap-4 mx-auto">
        <StatsSAMI />
        <CalendarSAMI />
      </div>

        <CookieList />

      <footer className="p-6 mx-auto container dark:text-neutral-100 border-t border-slate-800 flex flex-row justify-between gap-4">
        <div className="grid gap-2">
          <p className="text-base text-center italic font-semibold">© 2024-2025 SAMI.WORLDERCRAFT.FR All Rights Reserved.</p>
          <a
            href="/updates"
            className="text-sm font-semibold text-sky-600 transition duration-200 hover:text-sky-500 dark:text-sky-300 dark:hover:text-sky-200"
          >
            Mises à jour
          </a>
        </div>
        <TotalVideos />
      </footer>
    </div>
  );
};

export default FooterPage;
