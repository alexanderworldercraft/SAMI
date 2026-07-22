import { endOfDay, endOfMonth, startOfDay, startOfMonth } from "date-fns";

import { ETAT } from "../constants.js";
import { prisma } from "../services/db.js";

const ACTIVE_ETAT_ID = ETAT.ACTIVE;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

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
