import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";

const GenreSelect = ({
  genres = [],
  value = "",
  onChange,
  label,
  placeholder = "Choisir un genre",
  disabledGenreIds = [],
  required = false,
}) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [menuPosition, setMenuPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const currentValue = value ? String(value) : "";
  const disabledSet = useMemo(
    () => new Set(disabledGenreIds.map((id) => String(id))),
    [disabledGenreIds]
  );

  const selectedGenre = useMemo(
    () => genres.find((genre) => String(genre.GenreID) === currentValue),
    [genres, currentValue]
  );

  const filteredGenres = useMemo(
    () =>
      genres.filter((genre) =>
        genre.Nom.toLowerCase().includes(searchTerm.trim().toLowerCase())
      ),
    [genres, searchTerm]
  );

  useEffect(() => {
    if (!open) return;

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
      setOpen(false);
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
  }, [open]);

  const selectGenre = (genreId) => {
    onChange?.(String(genreId));
    setOpen(false);
    setSearchTerm("");
  };

  const dropdown = open && menuPosition
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
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Rechercher un genre..."
              className="w-full rounded-lg border border-sky-500/20 bg-slate-50 px-3 py-2 text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          {!required && (
            <button
              type="button"
              onClick={() => selectGenre("")}
              className="flex w-full cursor-pointer items-center px-4 py-2.5 text-left font-semibold text-slate-500 transition duration-150 hover:bg-sky-500/10 dark:text-slate-300"
            >
              {placeholder}
            </button>
          )}
          {filteredGenres.length > 0 ? (
            filteredGenres.map((genre) => {
              const optionValue = String(genre.GenreID);
              const disabled = disabledSet.has(optionValue) && optionValue !== currentValue;
              return (
                <button
                  type="button"
                  key={genre.GenreID}
                  onClick={() => selectGenre(optionValue)}
                  disabled={disabled}
                  className={`flex w-full cursor-pointer items-center justify-between px-4 py-2.5 text-left font-semibold transition duration-150 ${
                    optionValue === currentValue
                      ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                      : "text-slate-700 hover:bg-sky-500/10 dark:text-slate-200"
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  <span className="capitalize">{genre.Nom}</span>
                  {optionValue === currentValue && (
                    <span className="text-xs font-black uppercase text-sky-500">Actuel</span>
                  )}
                </button>
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
      {label && (
        <label className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">
          {label}
        </label>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 hover:bg-sky-500/10 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white dark:shadow-sky-950/20"
      >
        <span className="truncate">{selectedGenre?.Nom || placeholder}</span>
        <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
      </button>
      {dropdown}
    </div>
  );
};

export default GenreSelect;
