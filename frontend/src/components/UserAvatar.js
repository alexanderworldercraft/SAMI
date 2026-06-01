import React from "react";

const getInitials = (name) => {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

/**
 * Avatar utilisateur avec badge premium.
 *
 * Props :
 * - src: URL de l'image de profil (optionnel)
 * - alt: texte alternatif
 * - size: "sm" | "md" | "lg" (taille de l'avatar)
 * - isPremium: booléen, true si l'utilisateur est premium
 */
const sizeMap = {
  sm: "size-8",
  md: "size-10",
  lg: "size-12",
  AdminCards: "size-10 sm:size-16 lg:size-24",
};

const badgeSizeMap = {
  sm: "h-4 w-4 text-[9px]",
  md: "h-4.5 w-4.5 text-[10px]",
  lg: "h-5 w-5 text-[11px]",
};

const UserAvatar = ({ src, alt, name, size, isPremium = false }) => {
  const avatarSizeClass = sizeMap[size] || sizeMap.md;
  const badgeSizeClass = badgeSizeMap[size] || badgeSizeMap.md;

  const fallbackInitials = getInitials(name || alt);

  return (
    <span className="relative inline-block">
      {src ? (
        <img
          alt={alt || ""}
          src={src}
          className={`${avatarSizeClass} rounded-md object-cover outline outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10`}
        />
      ) : (
        <span
          className={`${avatarSizeClass} rounded-md flex items-center justify-center bg-slate-700 text-slate-100 text-sm font-semibold outline outline-1 -outline-offset-1 outline-black/5 dark:outline-white/10`}
        >
          {fallbackInitials}
        </span>
      )}

      {/* Badge de statut (premium) */}
      {isPremium && (
        <span
          className={`absolute right-0 top-0 flex items-center justify-center ${badgeSizeClass} -translate-y-1/2 translate-x-1/2 transform rounded-full bg-gradient-to-br from-amber-400 to-yellow-500 text-black font-bold shadow ring-2 ring-white dark:ring-slate-900`}
        >
          {/* M pour "Membre" / "Membre Premium" */}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="size-4">
  <path fillRule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0ZM6.875 6c.09-.22.195-.42.31-.598.413-.638.895-.902 1.315-.902.264 0 .54.1.814.325a.75.75 0 1 0 .953-1.158C9.772 3.259 9.169 3 8.5 3c-1.099 0-1.992.687-2.574 1.587A5.518 5.518 0 0 0 5.285 6H4.75a.75.75 0 0 0 0 1.5h.267a7.372 7.372 0 0 0 0 1H4.75a.75.75 0 0 0 0 1.5h.535c.156.52.372.998.64 1.413C6.509 12.313 7.402 13 8.5 13c.669 0 1.272-.26 1.767-.667a.75.75 0 0 0-.953-1.158c-.275.226-.55.325-.814.325-.42 0-.902-.264-1.315-.902a3.722 3.722 0 0 1-.31-.598H8.25a.75.75 0 0 0 0-1.5H6.521a5.854 5.854 0 0 1 0-1H8.25a.75.75 0 0 0 0-1.5H6.875Z" clipRule="evenodd" />
</svg>

          {/* Si un jour tu veux une icône SVG, tu la mets ici à la place du "M" */}
        </span>
      )}
    </span>
  );
};

export default UserAvatar;