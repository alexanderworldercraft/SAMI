import { describe, expect, it, vi } from "vitest";

import {
  buildCalendarItems,
  buildTimelineSeries,
  countStatisticsForPeriod,
  findTimelineDates,
  formatCalendarDateKey,
  mergeCalendarAdditionCounts,
  parseCalendarDate,
  parseCalendarMonth,
  parseStatisticsRange,
  parseTimelinePeriod,
} from "../controllers/videoCalendarController.js";

describe("videoCalendarController", () => {
  it("valide une année et un mois complets", () => {
    expect(parseCalendarMonth("2026", "7")).toEqual({ year: 2026, monthIndex: 6 });
    expect(parseCalendarMonth("2026", "13")).toBeNull();
    expect(parseCalendarMonth("2026abc", "7")).toBeNull();
    expect(parseCalendarMonth("26", "7")).toBeNull();
  });

  it("accepte uniquement une date ISO réelle", () => {
    const leapDay = parseCalendarDate("2024-02-29");
    expect(leapDay).toBeInstanceOf(Date);
    expect(leapDay.getFullYear()).toBe(2024);
    expect(leapDay.getMonth()).toBe(1);
    expect(leapDay.getDate()).toBe(29);

    expect(parseCalendarDate("2025-02-29")).toBeNull();
    expect(parseCalendarDate("22/07/2026")).toBeNull();
  });

  it("regroupe tous les ajouts sur leur journée locale", () => {
    const afterMidnight = new Date(2026, 6, 30, 0, 30);
    const inTheMorning = new Date(2026, 6, 30, 9, 15);

    expect(formatCalendarDateKey(afterMidnight)).toBe("2026-07-30");
    expect(mergeCalendarAdditionCounts(
      [{ CreateDate: afterMidnight, _count: { _all: 2 } }],
      [{ CreateDate: inTheMorning, _count: { _all: 1 } }],
      [{ CreateDate: inTheMorning, _count: 3 }],
    )).toEqual({
      "2026-07-30": 6,
    });
  });

  it("normalise les cinq familles de contenu du drawer", () => {
    const early = new Date(2026, 6, 29, 8);
    const late = new Date(2026, 6, 29, 20);
    const items = buildCalendarItems({
      videos: [{
        VideoID: 1,
        Titre: "Film",
        CreateDate: late,
        SaisonID: null,
        Saison: null,
      }],
      series: [{ SeriesID: 2, Titre: "Série", CreateDate: early }],
      people: [{
        PersonneID: 3,
        Prenom: "Ada",
        Nom: "Lovelace",
        CreateDate: early,
      }],
      music: [{ MusiqueID: 4, Titre: "Titre musical", CreateDate: late }],
      albums: [{ AlbumID: 5, Titre: "Album", CreateDate: late }],
    });

    expect(items).toHaveLength(5);
    expect(items.map((item) => item.type)).toEqual([
      "series",
      "person",
      "video",
      "music",
      "album",
    ]);
    expect(items.find((item) => item.type === "person").Titre).toBe("Ada Lovelace");
  });

  it("valide et normalise une période statistique", () => {
    const range = parseStatisticsRange("2026-07-01", "2026-07-30");

    expect(range.from.getHours()).toBe(0);
    expect(range.from.getMinutes()).toBe(0);
    expect(range.to.getHours()).toBe(23);
    expect(range.to.getMinutes()).toBe(59);
    expect(parseStatisticsRange("2026-07-30", "2026-07-01")).toBeNull();
    expect(parseStatisticsRange("date-invalide", "2026-07-30")).toBeNull();
  });

  it("agrège les six statistiques d'une période", async () => {
    const database = {
      video: {
        count: vi.fn()
          .mockResolvedValueOnce(4)
          .mockResolvedValueOnce(7),
      },
      series: { count: vi.fn().mockResolvedValue(3) },
      musique: { count: vi.fn().mockResolvedValue(5) },
      log: { count: vi.fn().mockResolvedValue(9) },
    };
    const from = new Date(2026, 6, 1);
    const to = new Date(2026, 6, 30, 23, 59, 59, 999);

    await expect(countStatisticsForPeriod({
      database,
      from,
      to,
      watchActionId: 12,
    })).resolves.toEqual({
      totalVideos: 11,
      films: 4,
      episodes: 7,
      series: 3,
      music: 5,
      watchedVideos: 9,
    });

    expect(database.video.count).toHaveBeenNthCalledWith(1, {
      where: {
        EtatID: 1,
        SaisonID: null,
        CreateDate: { not: null, gte: from, lte: to },
      },
    });
    expect(database.video.count).toHaveBeenNthCalledWith(2, {
      where: {
        EtatID: 1,
        SaisonID: { not: null },
        CreateDate: { not: null, gte: from, lte: to },
      },
    });
    expect(database.log.count).toHaveBeenCalledWith({
      where: {
        ActionID: 12,
        DateAction: { gte: from, lte: to },
      },
    });
  });

  it("prépare les périodes courtes par jour et l'historique par mois", () => {
    const now = new Date(2026, 6, 29, 13, 30);

    const sevenDays = parseTimelinePeriod("7", now);
    expect(sevenDays.key).toBe("7");
    expect(sevenDays.granularity).toBe("day");
    expect(sevenDays.from).toEqual(new Date(2026, 6, 23));

    expect(parseTimelinePeriod("all", now)).toEqual({
      key: "all",
      from: null,
      granularity: "month",
    });
    expect(parseTimelinePeriod("90", now)).toBeNull();
  });

  it("construit une courbe cumulative en complétant les jours sans activité", () => {
    const period = parseTimelinePeriod("7", new Date(2026, 6, 29, 12));
    const timeline = buildTimelineSeries({
      dates: [
        new Date(2026, 6, 23, 9),
        new Date(2026, 6, 23, 15),
        new Date(2026, 6, 25, 10),
      ],
      period,
      now: new Date(2026, 6, 29, 12),
    });

    expect(timeline.points).toHaveLength(7);
    expect(timeline.points[0]).toEqual({
      date: "2026-07-23",
      count: 2,
      total: 2,
    });
    expect(timeline.points[1]).toEqual({
      date: "2026-07-24",
      count: 0,
      total: 2,
    });
    expect(timeline.points.at(-1).total).toBe(3);
    expect(timeline.total).toBe(3);
    expect(timeline.peak).toBe(2);
  });

  it("distingue les vues de films et d'épisodes grâce à la saison du log", async () => {
    const first = new Date(2026, 6, 28, 10);
    const database = {
      action: {
        findUnique: vi.fn().mockResolvedValue({ ActionID: 4 }),
      },
      log: {
        findMany: vi.fn().mockResolvedValue([{ DateAction: first }]),
      },
    };
    const from = new Date(2026, 6, 23);

    await expect(findTimelineDates({
      database,
      metric: "episode-views",
      from,
    })).resolves.toEqual([first]);
    expect(database.log.findMany).toHaveBeenCalledWith({
      where: {
        ActionID: 4,
        SaisonID: { not: null },
        DateAction: { gte: from },
      },
      select: { DateAction: true },
      orderBy: { DateAction: "asc" },
    });
  });
});
