import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/20/solid";

// Petite fonction utilitaire pour remonter en haut
const scrollToTop = (target, offset = 0) => {
  const element = typeof target === "function" ? target() : target?.current || target;

  if (element) {
    if (offset === 0) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }

    const top = element.getBoundingClientRect().top + window.scrollY - offset;

    window.scrollTo({
      top,
      behavior: "smooth",
    });
    return;
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth", // Smooth = UX plus douce
  });
};

const PaginationPage = ({
  currentPage,
  totalPages,
  totalItems,
  onPageChange,
  itemsPerPage,
  scrollTarget,
  scrollOffset = 0,
}) => {
  // Calcul des éléments affichés
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Gestion intelligente des numéros affichés
  const getPageNumbers = () => {
    const maxPagesToShow = 6;
    const pages = [];

    let start = Math.max(currentPage - 2, 1);
    let end = Math.min(start + maxPagesToShow - 1, totalPages);

    if (end - start < maxPagesToShow - 1) {
      start = Math.max(end - maxPagesToShow + 1, 1);
    }

    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  const handleChangePage = (page) => {
    if (page < 1 || page > totalPages) return;

    onPageChange(page);
    scrollToTop(scrollTarget, scrollOffset); // Remonte la page automatiquement
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 sm:px-6">

      {/* Version mobile : seulement Précédent / Suivant */}
      <div className="flex flex-1 justify-between sm:hidden">
        <button
          onClick={() => handleChangePage(currentPage - 1)}
          disabled={currentPage === 1}
          className="relative inline-flex items-center rounded-md border border-gray-300 bg-white dark:bg-white/5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/10 disabled:opacity-50"
        >
          Précédent
        </button>

        <button
          onClick={() => handleChangePage(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white dark:bg-white/5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/10 disabled:opacity-50"
        >
          Suivant
        </button>
      </div>

      {/* Version desktop */}
      <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
        {/* Affichage du range */}
        <p className="text-sm text-gray-700 dark:text-gray-300">
          Affichage de <span className="font-medium">{startItem}</span>{" "}
          à <span className="font-medium">{endItem}</span> sur{" "}
          <span className="font-medium">{totalItems}</span> résultats
        </p>

        {/* Pagination complète */}
        <nav
          aria-label="Pagination"
          className="isolate inline-flex -space-x-px rounded-md shadow-sm dark:shadow-none"
        >
          {/* Bouton précédent */}
          <button
            onClick={() => handleChangePage(currentPage - 1)}
            disabled={currentPage === 1}
            className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 dark:text-gray-300 ring-1 ring-inset ring-gray-300 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50"
          >
            <span className="sr-only">Previous</span>
            <ChevronLeftIcon aria-hidden="true" className="size-5" />
          </button>

          {pageNumbers.map((page) => (
            <button
              key={page}
              onClick={() => handleChangePage(page)}
              aria-current={currentPage === page ? "page" : undefined}
              className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                currentPage === page
                  ? "z-10 bg-sky-600 text-white dark:bg-sky-500"
                  : "text-gray-900 dark:text-gray-200 ring-1 ring-inset ring-gray-300 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-white/5"
              }`}
            >
              {page}
            </button>
          ))}

          {/* Bouton suivant */}
          <button
            onClick={() => handleChangePage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 dark:text-gray-300 ring-1 ring-inset ring-gray-300 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50"
          >
            <span className="sr-only">Next</span>
            <ChevronRightIcon aria-hidden="true" className="size-5" />
          </button>
        </nav>
      </div>
    </div>
  );
};

export default PaginationPage;
