import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon } from '@heroicons/react/20/solid'

const apiUrl = process.env.REACT_APP_URL_LOCAL || "https://192.168.0.17:1234";

/**
 * Props:
 * - className (optionnel): classes à appliquer au conteneur externe (pour s'adapter à la topbar)
 * - maxWidth (optionnel): ex. "max-w-lg", "lg:max-w-xs" (défaut: "max-w-lg lg:max-w-xs")
 */
const SearchBar = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef(null);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (searchQuery.trim().length === 0) {
        setSuggestions([]);
        return;
      }
      try {
        const res = await fetch(
          `${apiUrl}/api/videos/search?search=${encodeURIComponent(searchQuery)}&limit=6`
        );
        const data = await res.json();
        setSuggestions(data.items || []);
      } catch (err) {
        console.error("Erreur lors de la recherche :", err);
      }
    };

    const delay = setTimeout(fetchSuggestions, 300); // debounce 300ms
    return () => clearTimeout(delay);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setDropdownVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = () => {
    if (searchQuery.trim()) {
      navigate(`/videos?search=${encodeURIComponent(searchQuery)}`);
      setDropdownVisible(false);
    }
  };

  const goToVideo = (id) => {
    navigate(`/lecture/${id}`);
    setSearchQuery('');
    setDropdownVisible(false);
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full`}
    >
      {/* Champ de recherche style "nouvelle barre" */}
      <div className="grid grid-cols-1 h-full">
        <input
          type="search"
          id="search"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setDropdownVisible(true);
          }}
          onKeyDown={(e) => e.key === 'Enter' && performSearch()}
          placeholder="Rechercher une vidéo..."
          aria-label="Rechercher"
          className="col-start-1 row-start-1 block w-full py-1.5 pl-10 pr-3 text-base text-gray-900 bg-transparent placeholder:text-gray-400 sm:text-sm/6 dark:text-white dark:outline-white/10 dark:placeholder:text-gray-500"
        />
        <MagnifyingGlassIcon
          aria-hidden="true"
          className="pointer-events-none col-start-1 row-start-1 self-center ml-2.5 size-5 text-gray-400"
        />
      </div>

      {/* Dropdown suggestions */}
      {dropdownVisible && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-neutral-700 bg-gradient-to-t from-slate-200 to-slate-100 shadow-2xl max-h-96 overflow-auto dark:from-slate-950 dark:to-slate-900 dark:text-neutral-100">
          {suggestions.map((item) => {
            const targetId = item.type === "series" ? item.FirstVideoID : item.id;
            const isDisabled = !targetId;

            return (
              <li
                key={`${item.type}-${item.id}`}
                onClick={() => !isDisabled && goToVideo(targetId)}
                className={`flex gap-3 px-3 py-2 cursor-pointer ${
                  isDisabled ? "opacity-40 cursor-not-allowed" : "hover:bg-neutral-200 dark:hover:bg-white/10"
                }`}
              >
                <div className="aspect-[2/3] w-12 flex-shrink-0 bg-neutral-300 dark:bg-neutral-700 rounded overflow-hidden">
                  {item.CheminImage && (
                    <img
                      src={`${apiUrl}/${item.CheminImage}`}
                      alt={item.Titre}
                      className="object-cover w-full h-full"
                    />
                  )}
                </div>
                <div className="min-w-0 text-sm">
                  <p className="font-semibold truncate text-gray-900 dark:text-neutral-100">{item.Titre}</p>
                  {item.type === 'series' && (
                    <p className="text-xs italic text-sky-600 dark:text-sky-400">
                      Série{isDisabled && " (à venir)"}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default SearchBar;
