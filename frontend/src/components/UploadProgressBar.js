import React from "react";

const UploadProgressBar = ({ progress, label, color }) => {
  if (!progress || progress === 0) return null; // Affiche une barre uniquement si `progress > 0`.

  return (
    <div className="w-full bg-neutral-400 dark:bg-neutral-800 rounded-full h-4 mb-10 transition-all duration-300 ease-in-out">
      <div
        style={{ width: `${progress}%`, transition: "width 0.5s ease" }}
        className={`h-full rounded-full ${color}`}
      ></div>
      <p className="text-center text-sm text-neutral-700 dark:text-neutral-200 mt-2">{label} {progress}%</p>
    </div>
  );
};

export default UploadProgressBar;