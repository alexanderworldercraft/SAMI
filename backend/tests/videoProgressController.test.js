import { beforeEach, expect, it, vi } from "vitest";
import { getCreditActions } from "../../frontend/src/utils/videoCredits.js";

vi.mock("../services/db.js", () => ({ prisma: {
  video: { findFirst: vi.fn() },
  userVideoProgress: { upsert: vi.fn(), deleteMany: vi.fn() },
} }));
vi.mock("../controllers/logController.js", () => ({ updateLatestVideoPlayLogProgress: vi.fn() }));
import { prisma } from "../services/db.js";
import { updateLatestVideoPlayLogProgress } from "../controllers/logController.js";
import { upsertVideoProgress } from "../controllers/videoProgressController.js";

const credit = (Start, End, Status = "APPROVED") => ({ Start, End, Status });
const reply = () => {
  const response = { status: vi.fn(), send: vi.fn() };
  response.status.mockReturnValue(response);
  return response;
};
beforeEach(() => vi.resetAllMocks());

it.each([
  ["old 80 percent boundary", [], 80, false],
  ["above the old threshold", [], 85, false],
  ["before fallback", [], 89, false],
  ["at fallback", [], 90, true],
  ["video end", [], 100, true],
  ["opening credits", [credit(10, 20)], 85, false],
  ["exact halfway is excluded", [credit(50, 60)], 60, false],
  ["halfway fallback", [credit(50, 60)], 90, true],
  ["just after halfway", [credit(51, 60)], 51, true],
  ["before ending credits", [credit(75, 85)], 74, false],
  ["at ending credits", [credit(75, 85)], 75, true],
  ["after ending credits", [credit(75, 85)], 86, true],
  ["latest credits win", [credit(65, 70), credit(80, 85)], 70, false],
  ["latest credits reached", [credit(65, 70), credit(80, 85)], 80, true],
  ["late credits override fallback", [credit(95, 99)], 90, false],
  ["late credits reached", [credit(95, 99)], 95, true],
  ["pending credits ignored", [credit(75, 85, "PENDING")], 80, false],
  ["rejected credits ignored", [credit(75, 85, "REJECTED")], 80, false],
  ["out of range ignored", [credit(75, 101)], 80, false],
  ["reversed interval ignored", [credit(85, 75)], 85, false],
  ["invalid last credit ignored", [credit(75, 85), credit(90, 101)], 75, true],
])("completion matches the player: %s", async (_label, segments, timecode, completed) => {
  prisma.video.findFirst.mockResolvedValue({
    VideoID: 12,
    CreditSegments: segments.filter(s => s.Status === "APPROVED").sort((a, b) => b.Start - a.Start),
  });
  prisma.userVideoProgress.upsert.mockResolvedValue({ UserID: 7, VideoID: 12, Timecode: timecode, Duration: 100 });
  const response = reply();
  await upsertVideoProgress({ user: { userId: 7 }, params: { id: "12" }, body: {
    Timecode: timecode, Duration: 100, ProgressLogAction: "video_resume_play",
  } }, response);

  expect(getCreditActions(segments, timecode, 100).showNext).toBe(completed);
  expect(prisma.video.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    select: expect.objectContaining({ CreditSegments: {
      where: { Status: "APPROVED" }, select: { Start: true, End: true }, orderBy: { Start: "desc" },
    } }),
  }));
  expect(response.send).toHaveBeenCalledWith(expect.objectContaining({ deleted: completed }));
  expect(prisma.userVideoProgress.deleteMany).toHaveBeenCalledTimes(completed ? 1 : 0);
  expect(prisma.userVideoProgress.upsert).toHaveBeenCalledTimes(completed ? 0 : 1);
  if (completed) {
    expect(prisma.userVideoProgress.deleteMany).toHaveBeenCalledWith({ where: { UserID: 7, VideoID: 12 } });
    expect(response.send).toHaveBeenCalledWith({ progress: null, deleted: true, reason: "PROGRESS_COMPLETED" });
  }
  expect(updateLatestVideoPlayLogProgress).toHaveBeenCalledWith({
    UtilisateurID: 7, VideoID: 12, endTimecode: completed ? 100 : timecode,
    duration: 100, final: completed, ActionNoms: ["video_resume_play"],
  });
});

it("does not mutate progress for an unavailable video", async () => {
  prisma.video.findFirst.mockResolvedValue(null);
  const response = reply();
  await upsertVideoProgress({ user: { userId: 7 }, params: { id: "12" }, body: { Timecode: 90, Duration: 100 } }, response);
  expect(response.status).toHaveBeenCalledWith(404);
  expect(prisma.userVideoProgress.deleteMany).not.toHaveBeenCalled();
  expect(prisma.userVideoProgress.upsert).not.toHaveBeenCalled();
  expect(updateLatestVideoPlayLogProgress).not.toHaveBeenCalled();
});
