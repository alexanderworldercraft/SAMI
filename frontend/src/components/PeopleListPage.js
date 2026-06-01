// src/pages/PeopleListPage.js
import React, { useEffect, useMemo, useState } from "react";
import VideoList from "../components/VideoList";          // réutilise l’UI carte 2/3
import PaginationPage from "../components/PaginationPage"; // même pagination visuelle
import api from "../services/api";

const apiUrl = process.env.REACT_APP_URL_LOCAL;

/**
 * PeopleListPage
 * - Recherche backend (q = Nom|Prenom|Surnom)
 * - Tri A-Z / Z-A côté front
 * - Pagination côté front pour rester léger côté API
 *
 * NB: Le composant VideoList supporte déjà item.type === "person".
 *     Ici on mappe l’API vers ce format.
 */
export default function PeopleListPage() {
  // --- états UI
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // --- données
  const [rawPeople, setRawPeople] = useState([]); // brut depuis API
  const [query, setQuery] = useState("");         // recherche
  const [sort, setSort] = useState("AZ");         // "AZ" | "ZA"

  // --- pagination
  const [page, setPage] = useState(1);
  const perPage = 40; // 8 colonnes x 5 lignes = 40 cartes par page

  // Récupération depuis /api/people?search=
  const fetchPeople = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get(`/people`, {
        params: query?.trim() ? { search: query.trim() } : {},
      });
      setRawPeople(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setErr("Impossible de charger les personnes.");
      setRawPeople([]);
    } finally {
      setLoading(false);
    }
  };

  // auto-load au montage + à chaque changement de query
  useEffect(() => {
    setPage(1); // reset pagination à chaque nouvelle recherche
    fetchPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Tri + mapping -> “cartes”
  const items = useMemo(() => {
    // Tri local
    const sorted = [...rawPeople].sort((a, b) => {
      const nameA = `${a.Prenom || ""} ${a.Nom || ""}`.trim().toLowerCase();
      const nameB = `${b.Prenom || ""} ${b.Nom || ""}`.trim().toLowerCase();
      if (sort === "AZ") return nameA.localeCompare(nameB);
      if (sort === "ZA") return nameB.localeCompare(nameA);
      return 0;
    });

    // Mapping vers VideoList (type: "person")
    return sorted.map((p) => ({
      type: "person",
      id: p.PersonneID,
      Titre: [p.Prenom, p.Nom].filter(Boolean).join(" ") || (p.Surnom || "—"),
      CheminImage: p.CheminImage || "uploads/images/people/default.webp", // fallback si tu en as un
      Genres: [], // non utilisé par les personnes
    }));
  }, [rawPeople, sort]);

  // Découpage pagination
  const totalItems = Array.isArray(items) ? items.length : 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const paginated = useMemo(() => {
    const start = (page - 1) * perPage;
    return (items || []).slice(start, start + perPage);
  }, [items, page]);

  // Gestion changement page
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) setPage(newPage);
  };

  return (
    <div className="mx-auto px-4 md:px-6 lg:px-8 py-6">


      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold dark:text-white">Personnes</h1>
          <p className="text-sm text-neutral-400">Acteurs & réalisateurs</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          {/* Recherche */}
          <div className="w-full sm:w-64">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher (nom, prénom, surnom)…"
              className="w-full px-3 py-2 rounded bg-neutral-900 text-neutral-100 ring-1 ring-neutral-700 focus:outline-none focus:ring-sky-600"
            />
          </div>

          {/* Tri */}
          <div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="px-3 py-2 rounded bg-neutral-900 text-neutral-100 ring-1 ring-neutral-700 focus:outline-none focus:ring-sky-600"
              title="Trier"
            >
              <option value="AZ">A-Z</option>
              <option value="ZA">Z-A</option>
            </select>
          </div>
        </div>
      </div>

      {/* Corps */}
      {loading ? (
        <div className="text-neutral-400">Chargement…</div>
      ) : err ? (
        <div className="text-red-500">{err}</div>
      ) : (
        <>
          <VideoList videos={paginated} />

          {/* Pagination */}
          <div className="mt-6">
            <PaginationPage
              currentPage={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              totalItems={totalItems}
              itemsPerPage={perPage}
            />
          </div>
        </>
      )}
    </div>
  );
}
