import React, { useEffect, useMemo, useRef, useState } from "react";
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from "@headlessui/react";
import {
  CheckIcon,
  ChevronUpDownIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
} from "@heroicons/react/24/outline";
import VideoList from "./VideoList";
import PaginationPage from "./PaginationPage";
import api from "../services/api";

const sortOptions = [
  { value: "az", label: "Nom (A à Z)" },
  { value: "za", label: "Nom (Z à A)" },
];

const controlClass =
  "block w-full rounded-xl border border-sky-500/20 bg-white/85 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm transition duration-200 hover:border-sky-400/60 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-950/65 dark:text-white";

function PeopleListPage() {
  const directoryRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rawPeople, setRawPeople] = useState([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("az");
  const [page, setPage] = useState(1);
  const perPage = 40;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErr("");

    const timer = window.setTimeout(async () => {
      try {
        const trimmedQuery = query.trim();
        const response = await api.get("/people", {
          params: trimmedQuery ? { search: trimmedQuery } : {},
        });
        if (active) setRawPeople(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        if (active) setErr(error?.response?.data?.message || "Impossible de charger les personnes.");
      } finally {
        if (active) setLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  const sortedPeople = useMemo(() => {
    const items = [...rawPeople];
    items.sort((a, b) => {
      const first = `${a.Nom || ""} ${a.Prenom || ""}`.trim();
      const second = `${b.Nom || ""} ${b.Prenom || ""}`.trim();
      return sort === "az"
        ? first.localeCompare(second, "fr", { sensitivity: "base" })
        : second.localeCompare(first, "fr", { sensitivity: "base" });
    });
    return items;
  }, [rawPeople, sort]);

  const totalItems = sortedPeople.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  const people = useMemo(() => {
    const start = (page - 1) * perPage;
    return sortedPeople.slice(start, start + perPage).map((person) => {
      const title = [person.Prenom, person.Nom].filter(Boolean).join(" ").trim();
      return {
        ...person,
        type: "person",
        id: person.PersonneID ?? person.ID,
        Titre: title || "Personne sans nom",
        CheminImage: person.CheminImage || null,
        MissingImageLabel: person.CheminImage ? null : "Photo manquante pour cette personne",
        Surnom: person.Surnom || "",
      };
    });
  }, [page, sortedPeople]);

  const selectedSort = sortOptions.find((option) => option.value === sort) || sortOptions[0];

  return (
    <main ref={directoryRef} className="container mx-auto px-4 py-10 sm:px-6 lg:px-8">
      <section className="overflow-visible rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-900/80 dark:shadow-black/20">
        <header className="relative overflow-hidden rounded-t-2xl border-b border-sky-500/10 bg-gradient-to-br from-sky-500/10 via-transparent to-indigo-500/10 px-6 py-7 sm:px-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_46%)]" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-sky-600 dark:text-sky-400">
                Répertoire SAMI
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
                Personnes
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                Retrouvez les acteurs, actrices, réalisateurs et réalisatrices associés au catalogue.
              </p>
            </div>
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-500/15 bg-white/75 px-4 py-2 text-sm font-bold text-slate-700 shadow-sm dark:bg-slate-950/45 dark:text-slate-200">
              <UserGroupIcon className="h-5 w-5 text-sky-500" aria-hidden="true" />
              {totalItems} personne{totalItems > 1 ? "s" : ""}
            </div>
          </div>
        </header>

        <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="relative z-30 overflow-visible rounded-2xl border border-sky-500/10 bg-white/75 p-4 shadow-lg shadow-slate-950/5 dark:bg-slate-950/35 sm:p-5">
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_48%)]" />
            <div className="relative grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.34fr)] lg:items-end">
              <label className="block">
                <span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                  Rechercher une personne
                </span>
                <span className="relative block">
                  <MagnifyingGlassIcon
                    className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-sky-500"
                    aria-hidden="true"
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    placeholder="Prénom et nom, ou surnom…"
                    className={`${controlClass} pl-12`}
                  />
                </span>
              </label>

              <Listbox
                value={sort}
                onChange={(value) => {
                  setSort(value);
                  setPage(1);
                }}
              >
                <div className="relative">
                  <Listbox.Label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                    Trier les résultats
                  </Listbox.Label>
                  <ListboxButton className={`${controlClass} relative pr-11 text-left`}>
                    <span className="block truncate">{selectedSort.label}</span>
                    <ChevronUpDownIcon
                      className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-sky-500"
                      aria-hidden="true"
                    />
                  </ListboxButton>
                  <ListboxOptions className="absolute right-0 z-50 mt-2 max-h-64 w-full overflow-auto rounded-xl border border-sky-500/20 bg-white/95 p-1 text-sm shadow-2xl backdrop-blur focus:outline-none dark:bg-slate-950/95">
                    {sortOptions.map((option) => (
                      <ListboxOption
                        key={option.value}
                        value={option.value}
                        className="group relative cursor-pointer select-none rounded-lg py-2.5 pl-10 pr-3 font-semibold text-slate-700 data-[focus]:bg-sky-500/10 data-[selected]:text-sky-700 dark:text-slate-200 dark:data-[selected]:text-sky-300"
                      >
                        <CheckIcon
                          className="absolute left-3 top-1/2 hidden h-5 w-5 -translate-y-1/2 text-sky-500 group-data-[selected]:block"
                          aria-hidden="true"
                        />
                        {option.label}
                      </ListboxOption>
                    ))}
                  </ListboxOptions>
                </div>
              </Listbox>
            </div>
          </div>

          {err ? (
            <div role="alert" className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-5 py-4 text-sm font-semibold text-rose-700 dark:text-rose-300">
              {err}
            </div>
          ) : null}

          {loading ? (
            <div className="flex min-h-64 items-center justify-center rounded-2xl border border-sky-500/10 bg-slate-50/70 text-sm font-semibold text-slate-500 dark:bg-slate-950/25 dark:text-slate-400">
              Chargement des personnes…
            </div>
          ) : people.length > 0 ? (
            <>
              <VideoList videos={people} type="person" />
              <PaginationPage
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={totalItems}
                itemsPerPage={perPage}
                scrollTarget={directoryRef}
                scrollOffset={80}
              />
            </>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-sky-500/20 bg-slate-50/70 px-6 text-center dark:bg-slate-950/25">
              <UserGroupIcon className="h-10 w-10 text-sky-500" aria-hidden="true" />
              <p className="mt-3 font-bold text-slate-900 dark:text-white">Aucune personne trouvée</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Essayez un autre prénom, nom complet ou surnom.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

export default PeopleListPage;
