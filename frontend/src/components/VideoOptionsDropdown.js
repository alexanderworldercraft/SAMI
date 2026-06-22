import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronUpDownIcon } from "@heroicons/react/16/solid";

const OPTIONS = [
  {
    key: "onlyOngoingSeries",
    label: "Séries en cours",
    description: "Cela permet de lister vos séries en cours de visionnage.",
  },
  {
    key: "hideWatched",
    label: "Masquer le contenu déjà vu",
    description: "Retire les films vus et les séries terminées de la liste.",
  },
  {
    key: "hidePremium",
    label: "Masquer le contenu premium",
    description: "Retire les films et séries marqués comme premium.",
  },
  {
    key: "onlyNew",
    label: "Lister les nouveautés",
    description: "Affiche uniquement les ajouts et nouveaux épisodes récents.",
  },
];

const ToggleOption = ({ option, checked, onChange }) => {
  const labelId = `${option.key}-label`;
  const descriptionId = `${option.key}-description`;

  return (
    <div className="px-4 py-3 transition duration-150 hover:bg-sky-500/10">
      <div className="flex items-center justify-between gap-4">
        <span className="flex grow flex-col">
          <label id={labelId} className="text-sm/6 font-bold text-slate-700 dark:text-slate-200">
            {option.label}
          </label>
          <span id={descriptionId} className="text-xs leading-5 text-slate-500 dark:text-slate-400">
            {option.description}
          </span>
        </span>
        <div className="group relative inline-flex w-12 shrink-0 rounded-full border border-sky-500/20 bg-slate-200 p-0.5 outline-offset-2 outline-sky-400 transition-colors duration-200 ease-in-out has-[:checked]:bg-gradient-to-r has-[:checked]:from-sky-400 has-[:checked]:to-violet-500 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 dark:bg-white/10">
          <span className="size-5 rounded-full bg-white shadow-sm ring-1 ring-gray-900/5 transition-transform duration-200 ease-in-out group-has-[:checked]:translate-x-6" />
          <input
            id={option.key}
            name={option.key}
            type="checkbox"
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            className="absolute inset-0 size-full appearance-none focus:outline-none"
            checked={checked}
            onChange={(event) => onChange(option.key, event.target.checked)}
          />
        </div>
      </div>
    </div>
  );
};

const VideoOptionsDropdown = ({ options, setOptions }) => {
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  const activeCount = useMemo(
    () => OPTIONS.filter((option) => options[option.key]).length,
    [options]
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

  const handleChange = (key, checked) => {
    setOptions((current) => ({ ...current, [key]: checked }));
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
          {OPTIONS.map((option) => (
            <ToggleOption
              key={option.key}
              option={option}
              checked={Boolean(options[option.key])}
              onChange={handleChange}
            />
          ))}
        </div>,
        document.body
      )
    : null;

  return (
    <div className="w-full">
      <label className="mb-2 block text-sm/6 font-bold text-slate-700 dark:text-slate-200">
        Options
      </label>
      <div className={open ? "relative z-[200]" : "relative z-0"}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex w-full items-center justify-between rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 hover:bg-sky-500/10 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white dark:shadow-sky-950/20"
        >
          <span className="truncate">
            {activeCount > 0 ? `${activeCount} option${activeCount > 1 ? "s" : ""} active${activeCount > 1 ? "s" : ""}` : "Options supplémentaires"}
          </span>
          <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
        </button>
        {dropdown}
      </div>
    </div>
  );
};

export default VideoOptionsDropdown;
