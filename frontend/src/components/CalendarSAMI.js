// CalendarSAMI.js
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ChevronLeftIcon, ChevronRightIcon, XMarkIcon } from '@heroicons/react/20/solid';
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { format, startOfWeek, addDays, isSameDay, isSameMonth, startOfMonth } from 'date-fns';

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

function getCalendarDays(currentDate) {
  const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
  const days = [];
  const today = new Date();

  for (let i = 0; i < 42; i++) {
    const date = addDays(start, i);
    days.push({
      date: format(date, 'yyyy-MM-dd'),
      isCurrentMonth: isSameMonth(date, currentDate),
      isToday: isSameDay(date, today),
    });
  }

  return days;
}

export default function CalendarSAMI() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [days, setDays] = useState([]);
  const [itemsByDate, setItemsByDate] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [items, setItems] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDays(getCalendarDays(currentDate));
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;

    fetch(`${process.env.REACT_APP_URL_LOCAL}/api/videos/calendar/added-by-date?year=${year}&month=${month}`)
      .then(res => res.json())
      .then(setItemsByDate)
      .catch(console.error);
  }, [currentDate]);

  const handleDateClick = async (date) => {
    setSelectedDate(date);
    setDrawerOpen(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_URL_LOCAL}/api/videos/calendar/items-by-day?date=${date}`);
      const data = await res.json();
      setItems(data.items);
    } catch (e) {
      console.error("Erreur lors du fetch des items:", e);
      setItems([]);
    }
  };

  const prevMonth = () => {
    const prev = new Date(currentDate);
    prev.setMonth(currentDate.getMonth() - 1);
    setCurrentDate(prev);
  };

  const nextMonth = () => {
    const next = new Date(currentDate);
    next.setMonth(currentDate.getMonth() + 1);
    setCurrentDate(next);
  };

  const monthName = currentDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const getLinkForItem = (item) => {
    if (item.type === 'video') {
      return `/lecture/${item.id}`;
    }
    if (item.type === 'series' && item.FirstVideoID) {
      return `/lecture/${item.FirstVideoID}`;
    }
    return null;
  };

  return (
    <section className="container mx-auto max-w-5xl overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent px-6 py-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">Calendrier</p>
            <h2 className="mt-1 text-2xl font-black capitalize text-slate-950 dark:text-white">{monthName}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={prevMonth}
              className="grid size-10 place-items-center rounded-lg border border-sky-300/40 bg-sky-500/15 text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 dark:text-white"
              aria-label="Mois précédent"
            >
              <ChevronLeftIcon className="size-5" />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="grid size-10 place-items-center rounded-lg border border-sky-300/40 bg-sky-500/15 text-slate-900 transition duration-200 hover:border-sky-300/80 hover:bg-sky-500/25 dark:text-white"
              aria-label="Mois suivant"
            >
              <ChevronRightIcon className="size-5" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.10),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.08),transparent_22%)]" />
        <div className="relative">
          <div className="grid grid-cols-7 text-center text-xs font-black uppercase text-slate-500 dark:text-slate-400">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-sky-500/10 bg-sky-500/10 text-sm shadow-lg shadow-slate-950/5 dark:shadow-sky-950/20">
            {days.map((day) => {
              const count = itemsByDate[day.date];
              return (
                <button
                  key={day.date}
                  type="button"
                  onClick={() => handleDateClick(day.date)}
                  className={classNames(
                    day.isCurrentMonth
                      ? "bg-white/85 text-slate-900 dark:bg-slate-950/65 dark:text-white"
                      : "bg-slate-100/70 text-slate-400 dark:bg-slate-900/70 dark:text-slate-500",
                    day.isToday && "z-10 bg-sky-500/15 text-sky-700 ring-1 ring-inset ring-sky-300/60 dark:text-sky-200",
                    "relative min-h-20 p-2 text-left transition duration-200 hover:bg-sky-500/10 focus:z-10 focus:outline-none focus:ring-2 focus:ring-sky-400"
                  )}
                >
                  <time
                    dateTime={day.date}
                    className={classNames(
                      day.isToday ? "bg-gradient-to-r from-sky-400 to-violet-500 text-white" : "",
                      "grid size-8 place-items-center rounded-lg font-black"
                    )}
                  >
                    {parseInt(day.date.split('-')[2], 10)}
                  </time>
                  {count && (
                    <span className="absolute bottom-2 right-2 rounded-md bg-sky-500 px-2 py-1 text-[10px] font-black text-white shadow-lg">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={drawerOpen} onClose={setDrawerOpen} className="relative z-[120]">
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-md" />
        <div className="fixed inset-0 overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
              <DialogPanel className="pointer-events-auto w-screen max-w-md transform border-l border-sky-500/10 bg-white/95 shadow-2xl shadow-slate-950/20 backdrop-blur dark:bg-slate-950/95 dark:shadow-sky-950/30">
                <div className="flex h-full flex-col overflow-y-auto">
                  <div className="border-b border-sky-500/10 bg-gradient-to-r from-sky-500/15 via-blue-500/10 to-transparent p-6">
                    <div className="flex items-start justify-between gap-4">
                    <DialogTitle className="text-base font-black text-slate-950 dark:text-white">
                      Ajouts du {selectedDate && new Date(selectedDate).toLocaleDateString('fr-FR')}
                    </DialogTitle>
                    <button
                      type="button"
                      onClick={() => setDrawerOpen(false)}
                      className="grid size-9 shrink-0 place-items-center rounded-lg border border-sky-300/30 bg-white/60 text-slate-500 transition hover:border-sky-300/70 hover:text-sky-600 dark:bg-slate-950/50 dark:text-slate-300"
                      aria-label="Fermer"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                    </div>
                  </div>
                  <ul className="divide-y divide-sky-500/10">
                    {items.length > 0 ? items.map((item) => {
                      const link = getLinkForItem(item);
                      return (
                        <li key={item.id} className="flex flex-col gap-2 p-4 transition duration-150 hover:bg-sky-500/5">
                          <div className="flex items-center gap-4">
                            <img src={`${process.env.REACT_APP_URL_LOCAL}/${item.CheminImage}`} alt={item.Titre} className="h-16 w-12 rounded-lg object-cover shadow-md" />
                            <div className="min-w-0">
                              {link ? (
                                <Link
                                  to={link}
                                  className="line-clamp-2 text-sm font-bold text-slate-950 hover:text-sky-600 dark:text-white dark:hover:text-sky-300"
                                >
                                  {item.Titre}
                                </Link>
                              ) : (
                                <span className="line-clamp-2 cursor-default text-sm font-bold text-slate-950 opacity-50 dark:text-white">
                                  {item.Titre}
                                </span>
                              )}
                              <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {item.type === 'video' && item.SaisonID ? `Épisode de la série "${item.SerieTitre || 'Inconnue'}"` :
                                 item.type === 'video' ? 'Film' :
                                 item.type === 'series' ? 'Série' :
                                 item.type === 'saison' ? `Saison de "${item.SerieTitre || 'Série inconnue'}"` :
                                 item.type === 'genre' ? 'Genre ajouté' : 'Type inconnu'}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    }) : (
                      <li className="p-4 text-sm font-semibold text-slate-500 dark:text-slate-300">Aucun ajout ce jour-là.</li>
                    )}
                  </ul>
                </div>
              </DialogPanel>
            </div>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
