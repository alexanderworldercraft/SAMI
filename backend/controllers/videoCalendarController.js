import {
  addDays,
  addMonths,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subDays,
} from "date-fns";

import { ETAT } from "../constants.js";
import { prisma } from "../services/db.js";

const ACTIVE_ETAT_ID = ETAT.ACTIVE;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIMELINE_METRICS = new Set([
  "videos",
  "films",
  "episodes",
  "people",
  "sagas",
  "universes",
  "views",
  "film-views",
  "episode-views",
  "albums",
  "music",
]);

export function parseCalendarMonth(yearValue, monthValue) {
  const year = Number(yearValue);
  const month = Number(monthValue);

  if (
    !Number.isInteger(year)
    || year < 1000
    || year > 9999
    || !Number.isInteger(month)
    || month < 1
    || month > 12
  ) {
    return null;
  }

  return { year, monthIndex: month - 1 };
}

export function parseCalendarDate(value) {
  const match = ISO_DATE_PATTERN.exec(String(value || ""));
  if (!match) return null;

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, monthIndex, day);

  if (
    date.getFullYear() !== year
    || date.getMonth() !== monthIndex
    || date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function parseStatisticsRange(fromValue, toValue) {
  const fromDate = parseCalendarDate(fromValue);
  const toDate = parseCalendarDate(toValue);

  if (!fromDate || !toDate || fromDate > toDate) {
    return null;
  }

  return {
    from: startOfDay(fromDate),
    to: endOfDay(toDate),
  };
}

export async function countStatisticsForPeriod({
  database = prisma,
  from,
  to,
  watchActionId,
}) {
  const creationDateFilter = {
    not: null,
    gte: from,
    lte: to,
  };

  const [films, episodes, series, music, watchedVideos] = await Promise.all([
    database.video.count({
      where: {
        EtatID: ACTIVE_ETAT_ID,
        SaisonID: null,
        CreateDate: creationDateFilter,
      },
    }),
    database.video.count({
      where: {
        EtatID: ACTIVE_ETAT_ID,
        SaisonID: { not: null },
        CreateDate: creationDateFilter,
      },
    }),
    database.series.count({
      where: {
        EtatID: ACTIVE_ETAT_ID,
        CreateDate: creationDateFilter,
      },
    }),
    database.musique.count({
      where: {
        EtatID: ACTIVE_ETAT_ID,
        CreateDate: creationDateFilter,
      },
    }),
    watchActionId
      ? database.log.count({
          where: {
            ActionID: watchActionId,
            DateAction: {
              gte: from,
              lte: to,
            },
          },
        })
      : Promise.resolve(0),
  ]);

  return {
    totalVideos: films + episodes,
    films,
    episodes,
    series,
    music,
    watchedVideos,
  };
}

export function parseTimelinePeriod(value, now = new Date()) {
  if (value === "7" || value === "30") {
    return {
      key: value,
      from: startOfDay(subDays(now, Number(value) - 1)),
      granularity: "day",
    };
  }

  if (value === "all") {
    return {
      key: value,
      from: null,
      granularity: "month",
    };
  }

  return null;
}

export async function findTimelineDates({
  database = prisma,
  metric,
  from,
}) {
  const createDateFilter = {
    not: null,
    ...(from ? { gte: from } : {}),
  };
  const creationQuery = {
    where: { CreateDate: createDateFilter },
    select: { CreateDate: true },
    orderBy: { CreateDate: "asc" },
  };
  let rows;

  switch (metric) {
    case "videos":
      rows = await database.video.findMany({
        ...creationQuery,
        where: {
          ...creationQuery.where,
          EtatID: ACTIVE_ETAT_ID,
        },
      });
      break;
    case "films":
      rows = await database.video.findMany({
        ...creationQuery,
        where: {
          ...creationQuery.where,
          EtatID: ACTIVE_ETAT_ID,
          SaisonID: null,
        },
      });
      break;
    case "episodes":
      rows = await database.video.findMany({
        ...creationQuery,
        where: {
          ...creationQuery.where,
          EtatID: ACTIVE_ETAT_ID,
          SaisonID: { not: null },
        },
      });
      break;
    case "people":
      rows = await database.personne.findMany(creationQuery);
      break;
    case "sagas":
      rows = await database.saga.findMany({
        ...creationQuery,
        where: {
          ...creationQuery.where,
          EtatID: ACTIVE_ETAT_ID,
        },
      });
      break;
    case "universes":
      rows = await database.universe.findMany({
        ...creationQuery,
        where: {
          ...creationQuery.where,
          EtatID: ACTIVE_ETAT_ID,
        },
      });
      break;
    case "albums":
      rows = await database.album.findMany({
        ...creationQuery,
        where: {
          ...creationQuery.where,
          EtatID: ACTIVE_ETAT_ID,
        },
      });
      break;
    case "music":
      rows = await database.musique.findMany({
        ...creationQuery,
        where: {
          ...creationQuery.where,
          EtatID: ACTIVE_ETAT_ID,
        },
      });
      break;
    case "views":
    case "film-views":
    case "episode-views": {
      const action = await database.action.findUnique({
        where: { Nom: "video_first_play" },
        select: { ActionID: true },
      });
      if (!action?.ActionID) return [];

      const viewTypeFilter = metric === "film-views"
        ? { SaisonID: null }
        : metric === "episode-views"
          ? { SaisonID: { not: null } }
          : {};
      const viewRows = await database.log.findMany({
        where: {
          ActionID: action.ActionID,
          ...viewTypeFilter,
          ...(from ? { DateAction: { gte: from } } : {}),
        },
        select: { DateAction: true },
        orderBy: { DateAction: "asc" },
      });
      return viewRows.map((row) => row.DateAction);
    }
    default:
      return null;
  }

  return rows.map((row) => row.CreateDate);
}

export function buildTimelineSeries({
  dates,
  period,
  now = new Date(),
}) {
  const validDates = dates
    .filter((date) => date instanceof Date && !Number.isNaN(date.getTime()))
    .sort((a, b) => a - b);
  const formatBucket = period.granularity === "month"
    ? (date) => format(date, "yyyy-MM")
    : (date) => format(date, "yyyy-MM-dd");
  const counts = new Map();

  validDates.forEach((date) => {
    const key = formatBucket(date);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  if (!period.from && validDates.length === 0) {
    return {
      points: [],
      total: 0,
      average: 0,
      peak: 0,
      granularity: period.granularity,
    };
  }

  const start = period.granularity === "month"
    ? startOfMonth(validDates[0])
    : period.from;
  const end = period.granularity === "month"
    ? startOfMonth(now)
    : startOfDay(now);
  const addBucket = period.granularity === "month" ? addMonths : addDays;
  const points = [];
  let cumulativeTotal = 0;

  for (let cursor = start; cursor <= end; cursor = addBucket(cursor, 1)) {
    const date = formatBucket(cursor);
    const count = counts.get(date) || 0;
    cumulativeTotal += count;
    points.push({
      date,
      count,
      total: cumulativeTotal,
    });
  }

  return {
    points,
    total: cumulativeTotal,
    average: points.length > 0 ? cumulativeTotal / points.length : 0,
    peak: points.reduce((highest, point) => Math.max(highest, point.count), 0),
    granularity: period.granularity,
  };
}

// GET /stats/overview?currentFrom=2026-07-01&currentTo=2026-07-30
//                     &previousFrom=2026-06-01&previousTo=2026-06-30
export const getStatisticsOverview = async (request, reply) => {
  const currentRange = parseStatisticsRange(
    request.query?.currentFrom,
    request.query?.currentTo,
  );
  const previousRange = parseStatisticsRange(
    request.query?.previousFrom,
    request.query?.previousTo,
  );

  if (!currentRange || !previousRange) {
    return reply.code(400).send({
      error: "Périodes invalides (format attendu : AAAA-MM-JJ, début antérieur à la fin).",
    });
  }

  try {
    const watchAction = await prisma.action.findUnique({
      where: { Nom: "video_first_play" },
      select: { ActionID: true },
    });

    const [current, previous] = await Promise.all([
      countStatisticsForPeriod({
        ...currentRange,
        watchActionId: watchAction?.ActionID,
      }),
      countStatisticsForPeriod({
        ...previousRange,
        watchActionId: watchAction?.ActionID,
      }),
    ]);

    return reply.send({ current, previous });
  } catch (error) {
    console.error("Erreur getStatisticsOverview:", error);
    return reply.code(500).send({ error: "Erreur interne du serveur." });
  }
};

// GET /stats/timeline?metric=videos&period=30
export const getStatisticsTimeline = async (request, reply) => {
  const metric = String(request.query?.metric || "");
  const period = parseTimelinePeriod(String(request.query?.period || ""));

  if (!TIMELINE_METRICS.has(metric) || !period) {
    return reply.code(400).send({
      error: "Métrique ou période invalide.",
    });
  }

  try {
    const dates = await findTimelineDates({
      metric,
      from: period.from,
    });
    const timeline = buildTimelineSeries({ dates, period });

    return reply.send({
      metric,
      period: period.key,
      ...timeline,
    });
  } catch (error) {
    console.error("Erreur getStatisticsTimeline:", error);
    return reply.code(500).send({ error: "Erreur interne du serveur." });
  }
};

// GET /calendar/added-by-date?year=2025&month=6
export const getAdditionsByDate = async (request, reply) => {
  const calendarMonth = parseCalendarMonth(request.query?.year, request.query?.month);
  if (!calendarMonth) {
    return reply.code(400).send({ error: "Paramètres année ou mois invalides" });
  }

  const { year, monthIndex } = calendarMonth;
  const referenceDate = new Date(year, monthIndex, 1);
  const from = startOfMonth(referenceDate);
  const to = endOfMonth(referenceDate);

  try {
    const [videoCounts, seriesCounts] = await Promise.all([
      prisma.video.groupBy({
        by: ["CreateDate"],
        _count: true,
        where: {
          EtatID: ACTIVE_ETAT_ID,
          CreateDate: {
            not: null,
            gte: from,
            lte: to,
          },
        },
      }),
      prisma.series.groupBy({
        by: ["CreateDate"],
        _count: true,
        where: {
          CreateDate: {
            not: null,
            gte: from,
            lte: to,
          },
        },
      }),
    ]);

    const combined = {};
    for (const entry of [...videoCounts, ...seriesCounts]) {
      const dateKey = entry.CreateDate.toISOString().split("T")[0];
      combined[dateKey] = (combined[dateKey] || 0) + entry._count;
    }

    return reply.send(combined);
  } catch (error) {
    console.error("Erreur getAdditionsByDate:", error);
    return reply.code(500).send({ error: "Erreur interne du serveur." });
  }
};

// GET /calendar/items-by-day?date=2025-06-14
export const getAdditionsForDate = async (request, reply) => {
  const date = parseCalendarDate(request.query?.date);
  if (!date) {
    return reply.code(400).send({ error: "Paramètre 'date' invalide (format attendu : AAAA-MM-JJ)" });
  }

  const from = startOfDay(date);
  const to = endOfDay(date);

  try {
    const [videos, series] = await Promise.all([
      prisma.video.findMany({
        where: {
          EtatID: ACTIVE_ETAT_ID,
          CreateDate: {
            not: null,
            gte: from,
            lte: to,
          },
        },
        select: {
          VideoID: true,
          Titre: true,
          CheminImage: true,
          SaisonID: true,
          Saison: {
            select: {
              Series: {
                select: { Titre: true },
              },
            },
          },
        },
      }),
      prisma.series.findMany({
        where: {
          CreateDate: {
            not: null,
            gte: from,
            lte: to,
          },
        },
        select: {
          SeriesID: true,
          Titre: true,
          CheminImage: true,
        },
      }),
    ]);

    const items = [
      ...videos.map((video) => ({
        id: video.VideoID,
        Titre: video.Titre,
        CheminImage: video.CheminImage,
        type: "video",
        SaisonID: video.SaisonID,
        SerieTitre: video.Saison?.Series?.Titre || null,
      })),
      ...series.map((item) => ({
        id: item.SeriesID,
        Titre: item.Titre,
        CheminImage: item.CheminImage,
        type: "series",
      })),
    ];

    return reply.send({ items });
  } catch (error) {
    console.error("Erreur getAdditionsForDate:", error);
    return reply.code(500).send({ error: "Erreur interne du serveur." });
  }
};
