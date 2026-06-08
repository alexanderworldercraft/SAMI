import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";

const GenreList = ({ genres = [], selectedGenres, setSelectedGenres }) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [menuPosition, setMenuPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const inputIdPrefix = useId();

  const toggleDropdown = () => {
    setDropdownOpen(!dropdownOpen);
  };

  useEffect(() => {
    if (!dropdownOpen) return;

    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        left: rect.left,
        top: rect.bottom + 8,
        width: rect.width,
        maxHeight: Math.max(180, Math.min(288, window.innerHeight - rect.bottom - 24)),
      });
    };

    const handleClickOutside = (event) => {
      if (
        buttonRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      setDropdownOpen(false);
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  const handleGenreChange = (genreId) => {
    if (selectedGenres.includes(genreId)) {
      setSelectedGenres(selectedGenres.filter((id) => id !== genreId));
    } else {
      setSelectedGenres([...selectedGenres, genreId]);
    }
  };

  const filteredGenres = useMemo(() => {
    return genres.filter((genre) =>
      genre.Nom.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [genres, searchTerm]);

  const selectedLabels = genres
    .filter((g) => selectedGenres.includes(g.GenreID))
    .map((g) => g.Nom)
    .join(", ");

  const dropdown = dropdownOpen && menuPosition
    ? createPortal(
        <div
          ref={menuRef}
          style={{
            left: menuPosition.left,
            top: menuPosition.top,
            width: menuPosition.width,
            maxHeight: menuPosition.maxHeight,
          }}
          className="fixed z-[9999] overflow-auto rounded-xl border border-sky-500/20 bg-white text-sm shadow-2xl shadow-sky-950/20 dark:bg-slate-950 dark:text-slate-100"
        >
          <div className="sticky top-0 z-10 bg-white px-3 py-3 dark:bg-slate-950">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher un genre..."
              className="w-full rounded-lg border border-sky-500/20 bg-slate-50 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          {filteredGenres.length > 0 ? (
            filteredGenres.map((genre) => {
              const optionId = `${inputIdPrefix}-${genre.GenreID}`;
              return (
                <label
                  key={genre.GenreID}
                  htmlFor={optionId}
                  className="flex cursor-pointer items-center gap-3 px-4 py-2.5 font-semibold transition duration-150 hover:bg-sky-500/10"
                >
                  <input
                    type="checkbox"
                    id={optionId}
                    value={genre.GenreID}
                    checked={selectedGenres.includes(genre.GenreID)}
                    onChange={() => handleGenreChange(genre.GenreID)}
                    className="size-4 rounded border-slate-300 accent-sky-500"
                  />
                  <span className="capitalize">{genre.Nom}</span>
                </label>
              );
            })
          ) : (
            <div className="px-4 py-4 text-center text-slate-500">Aucun genre trouvé</div>
          )}
        </div>,
        document.body
      )
    : null;

  return (
    <div className="w-full">
      <label className="mb-2 block text-sm/6 font-bold text-slate-700 dark:text-slate-200">
        Genres
      </label>
      <div className={dropdownOpen ? "relative z-[200]" : "relative z-0"}>
        <button
          ref={buttonRef}
          type="button"
          onClick={toggleDropdown}
          className="flex w-full items-center justify-between rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 hover:bg-sky-500/10 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white dark:shadow-sky-950/20"
        >
          <span className="truncate">
            {selectedGenres.length > 0 ? selectedLabels : "Rechercher un genre..."}
          </span>
          <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
        </button>
        {dropdown}
      </div>
    </div>
  );
};

export default GenreList;
