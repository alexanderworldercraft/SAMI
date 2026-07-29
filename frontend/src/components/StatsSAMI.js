import React, { useEffect, useMemo, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon } from '@heroicons/react/20/solid'
import { format, subDays } from 'date-fns'
import StatisticsTimeline from './StatisticsTimeline'

const API = process.env.REACT_APP_URL_LOCAL

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

function toYMD(d) {
  return format(d, 'yyyy-MM-dd')
}

// Calcule % de variation
function computeChange(current, previous) {
  if (previous === 0) {
    if (current === 0) return { label: '0%', type: 'increase' } // neutre
    return { label: '—', type: 'increase' } // infini, on affiche "—"
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100
  return {
    label: `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
    type: pct >= 0 ? 'increase' : 'decrease',
  }
}

export default function StatsSAMI() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState({
    total: { cur: 0, prev: 0 },
    films: { cur: 0, prev: 0 },
    episodes: { cur: 0, prev: 0 },
    series: { cur: 0, prev: 0 },
    music: { cur: 0, prev: 0 },
    watched: { cur: 0, prev: 0 },
  })

  // Fenêtres de calcul : aujourd’hui inclus
  const today = useMemo(() => new Date(), [])
  const curStart = useMemo(() => subDays(today, 29), [today])    // J-29 → J (30 jours)
  const curEnd = today
  const prevStart = useMemo(() => subDays(today, 59), [today])   // J-59 → J-30 (30 jours)
  const prevEnd = useMemo(() => subDays(today, 30), [today])

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        setLoading(true)
        setError(null)

        const params = new URLSearchParams({
          currentFrom: toYMD(curStart),
          currentTo: toYMD(curEnd),
          previousFrom: toYMD(prevStart),
          previousTo: toYMD(prevEnd),
        })
        const response = await fetch(`${API}/api/videos/stats/overview?${params}`)
        if (!response.ok) throw new Error('Erreur lors du chargement des statistiques')

        const data = await response.json()

        if (cancelled) return

        setStats({
          total: { cur: data.current.totalVideos, prev: data.previous.totalVideos },
          films: { cur: data.current.films, prev: data.previous.films },
          episodes: { cur: data.current.episodes, prev: data.previous.episodes },
          series: { cur: data.current.series, prev: data.previous.series },
          music: { cur: data.current.music, prev: data.previous.music },
          watched: { cur: data.current.watchedVideos, prev: data.previous.watchedVideos },
        })
      } catch (e) {
        console.error(e)
        if (!cancelled) setError(e.message || 'Erreur inconnue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [curEnd, curStart, prevEnd, prevStart])

  const cards = useMemo(() => {
    const definitions = [
      ['Total vidéos ajoutées', stats.total],
      ['Films ajoutés', stats.films],
      ['Épisodes ajoutés', stats.episodes],
      ['Séries ajoutées', stats.series],
      ['Musiques ajoutées', stats.music],
      ['Vidéos regardées', stats.watched],
    ]

    return definitions.map(([name, values]) => {
      const change = computeChange(values.cur, values.prev)

      return {
        name,
        stat: `${values.cur}`,
        previousStat: `${values.prev}`,
        change: change.label,
        changeType: change.type,
      }
    })
  }, [stats])

  if (error) {
    return (
      <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-semibold text-red-700 dark:text-red-300">
        Erreur lors du chargement des statistiques : {error}
      </div>
    )
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-sky-500/10 bg-white/80 p-6 shadow-xl shadow-slate-950/5 backdrop-blur dark:bg-slate-950/70 dark:shadow-sky-950/20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_20%,rgba(14,165,233,0.12),transparent_26%),radial-gradient(circle_at_88%_0%,rgba(139,92,246,0.10),transparent_22%)]" />
      <div className="relative">
      <p className="text-sm font-bold uppercase text-sky-500 dark:text-sky-400">
        Statistiques
      </p>
      <h3 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">30 derniers jours</h3>

      <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {(loading ? [1, 2, 3, 4, 5, 6] : cards).map((item, idx) => (
          <div key={item?.name || idx} className="overflow-hidden rounded-xl border border-sky-500/10 bg-white/85 px-4 py-5 shadow-sm sm:p-6 dark:bg-slate-950/65 dark:shadow-sky-950/20">
            <dt className="truncate text-sm font-bold text-slate-500 dark:text-slate-400">
              {loading ? <span className="inline-block h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-white/10" /> : item.name}
            </dt>

            <dd className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white">
              <div className="flex items-baseline text-3xl font-black text-sky-600 dark:text-sky-300">
                {loading ? (
                  <span className="inline-block h-8 w-16 animate-pulse rounded bg-sky-100 dark:bg-white/10" />
                ) : (
                  <>
                    {item.stat}
                    <span className="ml-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
                      sur {item.previousStat}
                    </span>
                  </>
                )}
              </div>

              <div
                className={classNames(
                  loading
                    ? 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400'
                    : item.changeType === 'increase'
                      ? 'bg-green-100 text-green-800 dark:bg-green-400/10 dark:text-green-400'
                      : 'bg-red-100 text-red-800 dark:bg-red-400/10 dark:text-red-400',
                  'mt-3 inline-flex items-baseline rounded-full px-2.5 py-0.5 text-sm font-bold',
                )}
              >
                {loading ? (
                  <span className="inline-block h-4 w-10 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
                ) : item.changeType === 'increase' ? (
                  <>
                    <ArrowUpIcon aria-hidden="true" className="-ml-1 mr-0.5 size-5 shrink-0 self-center text-green-500 dark:text-green-400" />
                    <span className="sr-only"> Augmentation de </span>
                    {item.change}
                  </>
                ) : (
                  <>
                    <ArrowDownIcon aria-hidden="true" className="-ml-1 mr-0.5 size-5 shrink-0 self-center text-red-500 dark:text-red-400" />
                    <span className="sr-only"> Diminution de </span>
                    {item.change}
                  </>
                )}
              </div>
            </dd>
          </div>
        ))}
      </dl>
      <StatisticsTimeline />
      </div>
    </section>
  )
}
