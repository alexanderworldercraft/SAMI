import React, { useMemo, useState } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import { CheckIcon, ChevronUpDownIcon } from "@heroicons/react/16/solid";

const fieldClass = "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";
const listboxOptionsClass = "z-[9999] max-h-72 w-[var(--button-width)] overflow-auto rounded-xl border border-sky-500/20 bg-white py-2 text-sm shadow-2xl shadow-sky-950/20 focus:outline-none dark:bg-slate-950 dark:text-slate-100";

const MusicSearchableSelect = ({
  value,
  onChange,
  items,
  idKey,
  labelKey = "Titre",
  placeholder = "Rechercher...",
  searchPlaceholder = "Filtrer...",
  emptyLabel = "Aucun résultat",
}) => {
  const [searchTerm, setSearchTerm] = useState("");

  const selectedItem = useMemo(
    () => items.find((item) => item[idKey] === Number(value)) || null,
    [idKey, items, value]
  );

  const filteredItems = useMemo(() => {
    const search = searchTerm.toLowerCase();
    return items.filter((item) =>
      [item[labelKey], item.Nom, String(item[idKey])]
        .filter(Boolean)
        .some((entry) => String(entry).toLowerCase().includes(search))
    );
  }, [idKey, items, labelKey, searchTerm]);

  const getLabel = (item) => item?.[labelKey] || item?.Nom || "";

  return (
    <Listbox value={selectedItem} onChange={(item) => onChange(item ? item[idKey] : "")}>
      <div className="relative z-[60]">
        <ListboxButton className={`${fieldClass} text-left`}>
          <span className="block truncate">{selectedItem ? getLabel(selectedItem) : placeholder}</span>
          <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronUpDownIcon className="size-5 text-sky-500 dark:text-sky-300" />
          </span>
        </ListboxButton>
        <ListboxOptions anchor={{ to: "bottom start", gap: 8 }} className={listboxOptionsClass}>
          <div className="sticky top-0 z-10 bg-white px-3 pb-2 dark:bg-slate-950">
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full rounded-lg border border-sky-500/20 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          {filteredItems.length > 0 ? (
            filteredItems.map((item) => (
              <ListboxOption
                key={item[idKey]}
                value={item}
                className={({ active }) =>
                  `relative cursor-default select-none py-2.5 pl-10 pr-4 ${
                    active ? "bg-sky-500/15 text-sky-700 dark:text-sky-300" : "text-slate-700 dark:text-slate-200"
                  }`
                }
              >
                {({ selected }) => (
                  <>
                    <span className={`block truncate ${selected ? "font-semibold" : "font-normal"}`}>
                      {getLabel(item)}
                    </span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">#{item[idKey]}</span>
                    {selected && (
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-sky-400">
                        <CheckIcon className="size-5" />
                      </span>
                    )}
                  </>
                )}
              </ListboxOption>
            ))
          ) : (
            <div className="px-4 py-3 text-center text-slate-500">{emptyLabel}</div>
          )}
        </ListboxOptions>
      </div>
    </Listbox>
  );
};

export default MusicSearchableSelect;
