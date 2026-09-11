import { formatCreditTime, parseCreditTime, getCreditActions, getNextCreditEpisode } from "./videoCredits";
const segments = [{ Start: 10, End: 20, Status: "APPROVED" }, { Start: 80, End: 90, Status: "APPROVED" }, { Start: 95, End: 99, Status: "PENDING" }];
test("parses strict timecodes and formats hours", () => {
  expect(parseCreditTime("01:02:03")).toBe(3723); expect(formatCreditTime(3723)).toBe("01:02:03");
  ["1:23", "00:60:00", "-01:00:00", "aa:00:00"].forEach(v => expect(parseCreditTime(v)).toBeNaN());
});
test("skip is visible from start inclusive to end exclusive", () => {
  expect(getCreditActions(segments, 9, 100).active).toBeNull();
  expect(getCreditActions(segments, 10, 100).active).toEqual(segments[0]);
  expect(getCreditActions(segments, 19.9, 100).active).toEqual(segments[0]);
  expect(getCreditActions(segments, 20, 100).active).toBeNull();
});
test("next starts at the last approved credits and persists to the end", () => {
  expect(getCreditActions(segments, 79, 100).showNext).toBe(false);
  [80, 90, 100].forEach(t => expect(getCreditActions(segments, t, 100).showNext).toBe(true));
  expect(getCreditActions(segments, 95, 100).active).toBeNull();
  expect(getCreditActions(segments, 15, 100).showNext).toBe(false);
});
test("50 percent is strict; invalid, refused and unavailable-duration segments are ignored", () => {
  expect(getCreditActions([{ Start: 50, End: 60, Status: "APPROVED" }], 55, 100).showNext).toBe(false);
  expect(getCreditActions([{ Start: 80, End: 120, Status: "APPROVED" }], 85, 100).active).toBeNull();
  expect(getCreditActions([{ Start: 80, End: 90, Status: "REJECTED" }], 85, 100).showNext).toBe(false);
  expect(getCreditActions(segments, 85, 0).showNext).toBe(false);
});
test("next episode crosses seasons and respects access without skipping a locked episode", () => {
  const series = { Saisons: [{ Episodes: [{ VideoID: 1 }] }, { Episodes: [{ VideoID: 2, Premium: true }, { VideoID: 3 }] }] };
  expect(getNextCreditEpisode(series, 1, true).VideoID).toBe(2);
  expect(getNextCreditEpisode(series, 1, false)).toBeNull();
  expect(getNextCreditEpisode(series, 3, true)).toBeNull();
  expect(getNextCreditEpisode(null, 1, true)).toBeNull();
  expect(getNextCreditEpisode(series, 99, true)).toBeNull();
});
