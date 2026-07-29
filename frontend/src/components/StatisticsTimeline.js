import React, { useId, useMemo, useRef, useState, useEffect } from 'react'
import {
  ArrowTrendingUpIcon,
  ChartBarIcon,
  EyeIcon,
  FilmIcon,
  MusicalNoteIcon,
  RectangleStackIcon,
  UserIcon,
} from '@heroicons/react/20/solid'

const API = process.env.REACT_APP_URL_LOCAL

const CATEGORIES = [
  {
    id: 'videos',
    label: 'Vidéos',
    icon: FilmIcon,
    options: [
      { id: 'videos', label: 'Général', chartLabel: 'Vidéos', summary: 'vidéos ajoutées' },
      { id: 'films', label: 'Films', chartLabel: 'Films', summary: 'films ajoutés' },
      { id: 'episodes', label: 'Épisodes', chartLabel: 'Épisodes', summary: 'épisodes ajoutés' },
    ],
  },
  {
    id: 'people',
    label: 'Personne',
    icon: UserIcon,
    options: [
      { id: 'people', label: 'Personne', chartLabel: 'Personnes', summary: 'personnes ajoutées' },
    ],
  },
  {
    id: 'sagas',
    label: 'Sagas',
    icon: RectangleStackIcon,
    options: [
      { id: 'sagas', label: 'Sagas', chartLabel: 'Sagas', summary: 'sagas ajoutées' },
      { id: 'universes', label: 'Univers', chartLabel: 'Univers', summary: 'univers ajoutés' },
    ],
  },
  {
    id: 'views',
    label: 'Vue',
    icon: EyeIcon,
    options: [
      { id: 'views', label: 'Général', chartLabel: 'Toutes les vues', summary: 'vidéos regardées' },
      { id: 'film-views', label: 'Vue films', chartLabel: 'Vues de films', summary: 'films regardés' },
      { id: 'episode-views', label: 'Vue épisodes', chartLabel: 'Vues d’épisodes', summary: 'épisodes regardés' },
    ],
  },
  {
    id: 'music',
    label: 'Musique',
    icon: MusicalNoteIcon,
    options: [
      { id: 'albums', label: 'Album', chartLabel: 'Albums', summary: 'albums ajoutés' },
      { id: 'music', label: 'Musique', chartLabel: 'Musiques', summary: 'musiques ajoutées' },
    ],
  },
]

const PERIODS = [
  { id: '7', label: '7 jours' },
  { id: '30', label: '30 jours' },
  { id: 'all', label: 'Tout' },
]

const EMPTY_POINTS = []

const compactNumber = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 1,
})

const integerNumber = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 0,
})

function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}

function parsePointDate(point, granularity) {
  return new Date(
    granularity === 'month'
      ? `${point.date}-01T00:00:00`
      : `${point.date}T00:00:00`,
  )
}

function formatPointDate(point, granularity, compact = false) {
  const date = parsePointDate(point, granularity)

  if (granularity === 'month') {
    return new Intl.DateTimeFormat('fr-FR', {
      month: compact ? 'short' : 'long',
      year: 'numeric',
    }).format(date)
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: compact ? 'short' : 'long',
    ...(compact ? {} : { year: 'numeric' }),
  }).format(date)
}

function niceStep(value) {
  if (value <= 1) return 1

  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  if (normalized <= 1) return magnitude
  if (normalized <= 2) return 2 * magnitude
  if (normalized <= 5) return 5 * magnitude
  return 10 * magnitude
}

function getTickIndexes(length, maximum = 6) {
  if (length <= maximum) return Array.from({ length }, (_, index) => index)

  return [...new Set(
    Array.from(
      { length: maximum },
      (_, index) => Math.round((index * (length - 1)) / (maximum - 1)),
    ),
  )]
}

export function StatisticsLineChart({ timeline, label, displayMode = 'cumulative' }) {
  const gradientId = useId().replace(/:/g, '')
  const [hoveredIndex, setHoveredIndex] = useState(null)
  const points = timeline?.points || EMPTY_POINTS
  const valueKey = displayMode === 'period' ? 'count' : 'total'
  const periodUnit = timeline?.granularity === 'month' ? 'mois' : 'jour'
  const activeIndex = hoveredIndex ?? Math.max(points.length - 1, 0)
  const activePoint = points[activeIndex]

  const chart = useMemo(() => {
    const width = 920
    const height = 340
    const margin = { top: 24, right: 24, bottom: 52, left: 68 }
    const plotWidth = width - margin.left - margin.right
    const plotHeight = height - margin.top - margin.bottom
    const maximum = Math.max(...points.map((point) => point[valueKey]), 0)
    const step = niceStep(maximum / 4)
    const axisMaximum = Math.max(step * 4, 4)
    const bottom = margin.top + plotHeight
    const positions = points.map((point, index) => ({
      x: points.length === 1
        ? margin.left + plotWidth / 2
        : margin.left + (index / (points.length - 1)) * plotWidth,
      y: margin.top + plotHeight - (point[valueKey] / axisMaximum) * plotHeight,
    }))
    const linePath = positions
      .map((position, index) => `${index === 0 ? 'M' : 'L'} ${position.x} ${position.y}`)
      .join(' ')
    const areaPath = positions.length > 0
      ? `${linePath} L ${positions.at(-1).x} ${bottom} L ${positions[0].x} ${bottom} Z`
      : ''

    return {
      width,
      height,
      margin,
      plotWidth,
      plotHeight,
      axisMaximum,
      bottom,
      positions,
      linePath,
      areaPath,
      xTickIndexes: getTickIndexes(points.length),
    }
  }, [points, valueKey])

  if (points.length === 0) {
    return (
      <div className="grid min-h-80 place-items-center rounded-2xl border border-sky-400/15 bg-slate-950 px-6 text-center">
        <div>
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-sky-400/10 text-sky-300">
            <RectangleStackIcon className="size-6" />
          </div>
          <p className="mt-4 font-bold text-white">Aucune donnée pour le moment</p>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            La courbe apparaîtra dès qu’une activité sera enregistrée.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-sky-400/20 bg-slate-950 shadow-inner shadow-black/30">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-400/10 px-5 py-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
          <span className="size-3 rounded-full bg-sky-400 shadow-[0_0_18px_rgba(56,189,248,0.8)]" />
          {label} · {displayMode === 'cumulative' ? 'Cumulé' : `Par ${periodUnit}`}
        </div>
        <p className="text-sm font-semibold text-slate-400" aria-live="polite">
          {activePoint && (
            <>
              <span className="text-white">{integerNumber.format(activePoint[valueKey])}</span>
              {displayMode === 'cumulative' ? ' au ' : timeline.granularity === 'month' ? ' en ' : ' le '}
              {formatPointDate(activePoint, timeline.granularity)}
              {displayMode === 'cumulative' && activePoint.count > 0 && (
                <span className="ml-2 text-sky-300">
                  +{integerNumber.format(activePoint.count)}
                </span>
              )}
            </>
          )}
        </p>
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          className="h-auto min-w-[680px] w-full"
          role="img"
          aria-label={
            displayMode === 'cumulative'
              ? `Évolution cumulative : ${label}`
              : `Valeur par ${periodUnit} : ${label}`
          }
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {Array.from({ length: 5 }, (_, index) => {
            const value = (chart.axisMaximum / 4) * index
            const y = chart.bottom - (index / 4) * chart.plotHeight

            return (
              <g key={value}>
                <line
                  x1={chart.margin.left}
                  x2={chart.margin.left + chart.plotWidth}
                  y1={y}
                  y2={y}
                  stroke="#172554"
                  strokeWidth="1"
                />
                <text
                  x={chart.margin.left - 12}
                  y={y + 5}
                  fill="#94a3b8"
                  fontSize="13"
                  fontWeight="700"
                  textAnchor="end"
                >
                  {integerNumber.format(value)}
                </text>
              </g>
            )
          })}

          {chart.xTickIndexes.map((index) => {
            const position = chart.positions[index]
            const point = points[index]

            return (
              <g key={point.date}>
                <line
                  x1={position.x}
                  x2={position.x}
                  y1={chart.margin.top}
                  y2={chart.bottom}
                  stroke="#0f2854"
                  strokeWidth="1"
                />
                <text
                  x={position.x}
                  y={chart.bottom + 30}
                  fill="#94a3b8"
                  fontSize="12"
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {formatPointDate(point, timeline.granularity, true)}
                </text>
              </g>
            )
          })}

          <path d={chart.areaPath} fill={`url(#${gradientId})`} />
          <path
            d={chart.linePath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {chart.positions.map((position, index) => (
            <circle
              key={points[index].date}
              cx={position.x}
              cy={position.y}
              r={index === activeIndex ? 6 : 3.5}
              fill={index === activeIndex ? '#e0f2fe' : '#38bdf8'}
              stroke="#0c4a6e"
              strokeWidth="2"
              className="cursor-pointer outline-none transition-all focus:stroke-white"
              tabIndex="0"
              onMouseEnter={() => setHoveredIndex(index)}
              onFocus={() => setHoveredIndex(index)}
              onBlur={() => setHoveredIndex(null)}
            >
              <title>
                {`${formatPointDate(points[index], timeline.granularity)} : ${points[index][valueKey]}`}
              </title>
            </circle>
          ))}
        </svg>
      </div>
    </div>
  )
}

export default function StatisticsTimeline() {
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id)
  const [metricId, setMetricId] = useState(CATEGORIES[0].options[0].id)
  const [period, setPeriod] = useState('30')
  const [displayMode, setDisplayMode] = useState('cumulative')
  const [timeline, setTimeline] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const cache = useRef(new Map())

  const category = CATEGORIES.find((item) => item.id === categoryId) || CATEGORIES[0]
  const metric = category.options.find((item) => item.id === metricId) || category.options[0]

  useEffect(() => {
    const controller = new AbortController()
    const cacheKey = `${metricId}:${period}`
    const cached = cache.current.get(cacheKey)

    if (cached) {
      setTimeline(cached)
      setError(null)
      setLoading(false)
      return () => controller.abort()
    }

    async function loadTimeline() {
      try {
        setLoading(true)
        setError(null)
        setTimeline(null)
        const params = new URLSearchParams({ metric: metricId, period })
        const response = await fetch(
          `${API}/api/videos/stats/timeline?${params}`,
          { signal: controller.signal },
        )
        if (!response.ok) throw new Error('Impossible de charger le graphique')

        const data = await response.json()
        if (controller.signal.aborted) return

        cache.current.set(cacheKey, data)
        setTimeline(data)
      } catch (loadError) {
        if (loadError.name !== 'AbortError') {
          console.error(loadError)
          setTimeline(null)
          setError(loadError.message || 'Erreur inconnue')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    loadTimeline()
    return () => controller.abort()
  }, [metricId, period, refreshKey])

  const selectCategory = (nextCategory) => {
    setCategoryId(nextCategory.id)
    setMetricId(nextCategory.options[0].id)
  }

  const retry = () => {
    cache.current.delete(`${metricId}:${period}`)
    setRefreshKey((value) => value + 1)
  }

  return (
    <section className="mt-8 border-t border-sky-500/10 pt-8" aria-labelledby="statistics-timeline-title">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-500 dark:text-sky-400">
          Analyses
        </p>
        <h4 id="statistics-timeline-title" className="text-2xl font-black text-slate-950 dark:text-white">
          Évolution de la médiathèque
        </h4>
        <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
          {loading && !timeline ? (
            <span className="inline-block h-4 w-72 max-w-full animate-pulse rounded bg-slate-200 dark:bg-white/10" />
          ) : timeline ? (
            <>
              <span className="text-slate-700 dark:text-slate-200">
                {integerNumber.format(timeline.total)} {metric.summary}
              </span>
              {' · '}
              {compactNumber.format(timeline.average)} en moyenne par {timeline.granularity === 'month' ? 'mois' : 'jour'}
              {' · '}
              pic de {integerNumber.format(timeline.peak)}
            </>
          ) : (
            'Suivez les ajouts et les lectures dans le temps.'
          )}
        </p>
      </div>

      <div className="mt-6 overflow-x-auto pb-1">
        <div
          className="inline-flex min-w-max gap-1 rounded-xl border border-sky-500/20 bg-slate-100/80 p-1 dark:bg-slate-950/80"
          role="tablist"
          aria-label="Catégorie de statistiques"
        >
          {CATEGORIES.map((item) => {
            const Icon = item.icon
            const selected = item.id === categoryId

            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectCategory(item)}
                className={classNames(
                  selected
                    ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-lg shadow-sky-500/20'
                    : 'text-slate-500 hover:bg-white hover:text-sky-600 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-sky-300',
                  'inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-black transition duration-200',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        {category.options.length > 1 && (
          <div
            className="flex flex-wrap gap-2"
            role="tablist"
            aria-label={`Détail ${category.label}`}
          >
            {category.options.map((option) => {
              const selected = option.id === metricId

              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setMetricId(option.id)}
                  className={classNames(
                    selected
                      ? 'border-sky-400/60 bg-sky-500/15 text-sky-700 dark:text-sky-200'
                      : 'border-slate-200 bg-white/60 text-slate-500 hover:border-sky-300/60 hover:text-sky-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:text-sky-300',
                    'rounded-full border px-4 py-2 text-sm font-black transition duration-200',
                  )}
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        )}

        <div className={classNames(
          category.options.length === 1 && 'sm:ml-auto',
          'flex flex-wrap items-center gap-2',
        )}>
          <div
            className="inline-flex w-fit rounded-xl border border-sky-500/20 bg-slate-100/80 p-1 dark:bg-slate-950/80"
            role="group"
            aria-label="Mode d'affichage du graphique"
          >
            {[
              { id: 'cumulative', label: 'Cumulé', icon: ArrowTrendingUpIcon },
              {
                id: 'period',
                label: period === 'all' ? 'Par mois' : 'Par jour',
                icon: ChartBarIcon,
              },
            ].map((item) => {
              const Icon = item.icon

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={displayMode === item.id}
                  onClick={() => setDisplayMode(item.id)}
                  className={classNames(
                    displayMode === item.id
                      ? 'bg-violet-500 text-white shadow-md shadow-violet-500/20'
                      : 'text-slate-500 hover:text-violet-600 dark:text-slate-400 dark:hover:text-violet-300',
                    'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-black transition duration-200',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                  {item.label}
                </button>
              )
            })}
          </div>

          <div
            className="inline-flex w-fit rounded-xl border border-sky-500/20 bg-slate-100/80 p-1 dark:bg-slate-950/80"
            role="group"
            aria-label="Période du graphique"
          >
            {PERIODS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={period === item.id}
                onClick={() => setPeriod(item.id)}
                className={classNames(
                  period === item.id
                    ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                    : 'text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-300',
                  'rounded-lg px-3 py-2 text-xs font-black transition duration-200 sm:px-4',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6">
        {error ? (
          <div className="grid min-h-80 place-items-center rounded-2xl border border-red-400/20 bg-red-500/5 p-6 text-center">
            <div>
              <p className="font-bold text-red-700 dark:text-red-300">{error}</p>
              <button
                type="button"
                onClick={retry}
                className="mt-4 rounded-lg bg-red-500 px-4 py-2 text-sm font-black text-white transition hover:bg-red-400"
              >
                Réessayer
              </button>
            </div>
          </div>
        ) : loading ? (
          <div className="min-h-80 animate-pulse rounded-2xl border border-sky-400/15 bg-slate-950 p-6">
            <div className="h-5 w-40 rounded bg-white/10" />
            <div className="mt-12 h-52 rounded-xl bg-[linear-gradient(180deg,rgba(56,189,248,0.12),transparent)]" />
          </div>
        ) : (
          <StatisticsLineChart
            timeline={timeline}
            label={metric.chartLabel}
            displayMode={displayMode}
          />
        )}
      </div>
    </section>
  )
}
