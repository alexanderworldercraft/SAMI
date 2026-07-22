import { describe, expect, it } from "vitest";

import {
  parseCalendarDate,
  parseCalendarMonth,
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
});
