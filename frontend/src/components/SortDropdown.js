import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";

/**
 * Tri disponible:
 *  - "az"      => A-Z (par titre)
 *  - "za"      => Z-A (par titre)
 *  - "recent"  => Récent -> Ancien (CreateDate desc; null = très ancien)
 *  - "ancien"  => Ancien -> Récent (CreateDate asc; null = très ancien en premier)
 *  - "most"    => Regardé le plus (logs / points)
 *  - "least"   => Regardé le moins (logs / points)
 */
// const OPTIONS = [
//   { value: "az",     label: "A-Z" },
//   { value: "za",     label: "Z-A" },
//   { value: "recent", label: "Récent → Ancien" },
//   { value: "ancien", label: "Ancien → Récent" },
//   { value: "most",   label: "Regardé le plus" },
//   { value: "least",  label: "Regardé le moins" },
// ];
const OPTIONS = [
  { value: "az",     label: "Titre — A → Z" },
  { value: "za",     label: "Titre — Z → A" },

  { value: "recent", label: "Ajout — plus récent" },
  { value: "ancien", label: "Ajout — plus ancien" },

  { value: "most",   label: "Popularité — la plus vue" },
  { value: "least",  label: "Popularité — la moins vue" },
];

const SortDropdown = ({ sort, setSort }) => {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const current = OPTIONS.find(o => o.value === sort) || OPTIONS[0];

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        left: rect.left,
        top: rect.bottom + 8,
        width: rect.width,
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

  const handlePick = (value) => {
    setSort(value);     // on propage la valeur au parent
    setOpen(false);     // on ferme le menu
  };

  const dropdown = open && menuPosition
    ? createPortal(
        <div
          ref={menuRef}
          style={{
            left: menuPosition.left,
            top: menuPosition.top,
            width: menuPosition.width,
          }}
          className="fixed z-[9999] overflow-hidden rounded-xl border border-sky-500/20 bg-white text-sm shadow-2xl shadow-sky-950/20 dark:bg-slate-950 dark:text-slate-100"
        >
          {OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => handlePick(opt.value)}
              className={`w-full px-4 py-2.5 text-left transition duration-150 hover:bg-sky-500/10 ${
                sort === opt.value ? "bg-sky-500/15 font-black text-sky-700 dark:text-sky-300" : "font-semibold"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>,
        document.body
      )
    : null;

  return (
    <div className="w-full">
      <label className="mb-2 block text-sm/6 font-bold text-slate-700 dark:text-slate-200">
        Tri
      </label>

      <div className={open ? "relative z-[200]" : "relative z-0"}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 hover:bg-sky-500/10 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white dark:shadow-sky-950/20"
        >
          <span className="truncate">{current.label}</span>
          <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
        </button>
        {dropdown}
      </div>
    </div>
  );
};

export default SortDropdown;
