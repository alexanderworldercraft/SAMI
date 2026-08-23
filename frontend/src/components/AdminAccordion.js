import React, { useId, useState } from "react";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

const AdminAccordion = ({ title, description = "", children, defaultOpen = false }) => {
  const regionId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(defaultOpen);

  const toggle = () => {
    setMounted(true);
    setOpen((current) => !current);
  };

  return (
    <section className="mx-auto my-4 max-w-4xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-lg shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={toggle}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-sky-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400 sm:px-6"
      >
        <span className="min-w-0">
          <span className="block text-base font-black text-slate-950 dark:text-white sm:text-lg">
            {title}
          </span>
          {description && (
            <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400 sm:text-sm">
              {description}
            </span>
          )}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className={`size-5 shrink-0 text-sky-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {mounted && (
        <div
          id={regionId}
          hidden={!open}
          className="border-t border-sky-500/10 bg-slate-50/30 px-3 py-4 dark:bg-slate-950/20 sm:px-5 [&>section]:my-0 [&>section]:max-w-none"
        >
          {children}
        </div>
      )}
    </section>
  );
};

export default AdminAccordion;
