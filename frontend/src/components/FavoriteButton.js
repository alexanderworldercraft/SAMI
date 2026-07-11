import React, { useState } from "react";
import { StarIcon } from "@heroicons/react/24/solid";
import api from "../services/api";

const FavoriteButton = ({
  type,
  id,
  isFavorite = false,
  onChange,
  className = "",
  size = "md",
}) => {
  const [saving, setSaving] = useState(false);
  const active = !!isFavorite;
  const sizeClass = size === "lg" ? "size-6" : "size-5";

  const handleClick = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    if (saving || !type || !id) return;

    try {
      setSaving(true);
      const response = await api.post("/users/favorites/toggle", { type, id });
      onChange?.(!!response.data?.IsFavorite);
    } catch (error) {
      console.error("Erreur lors de la mise à jour du favori :", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={saving || !type || !id}
      aria-pressed={active}
      title={active ? "Retirer des favoris" : "Ajouter aux favoris"}
      className={`inline-flex items-center justify-center rounded-full border p-2 bg-gradient-to-br shadow-inner backdrop-blur transition duration-300 disabled:cursor-wait disabled:opacity-60 ${
        active
          ? "border-amber-200/35 from-amber-500/95 via-yellow-200/95 to-amber-500/95 text-slate-950 hover:via-yellow-500/95 shadow-amber-950/55 ring-1 ring-amber-100/25"
          : "border-white/20 from-slate-400/95 via-gray-500/95 to-slate-400/95 text-white hover:border-amber-200/70 hover:text-amber-300"
      } ${className}`}
    >
      <StarIcon className={sizeClass} />
      <span className="sr-only">{active ? "Retirer des favoris" : "Ajouter aux favoris"}</span>
    </button>
  );
};

export default FavoriteButton;
