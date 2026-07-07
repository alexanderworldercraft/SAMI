import React from "react";

const UploadProgressBar = ({ progress, label, color }) => {
  const safeProgress = Number.isFinite(Number(progress))
    ? Math.min(Math.max(Number(progress), 0), 100)
    : 0;

  return (
    <div className="w-full">
      <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-300 transition-all duration-300 ease-in-out dark:bg-neutral-800">
        <div
          style={{ width: `${safeProgress}%`, transition: "width 0.5s ease" }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <p className="mt-2 text-center text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        {label} {Math.round(safeProgress)}%
      </p>
    </div>
  );
};

export default UploadProgressBar;
