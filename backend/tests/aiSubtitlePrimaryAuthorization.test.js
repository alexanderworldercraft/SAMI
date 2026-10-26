import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), approve: vi.fn(), log: vi.fn() }));
vi.mock("../services/db.js", () => ({ prisma: { utilisateur: { findUnique: mocks.user } } }));
vi.mock("../controllers/logController.js", () => ({ createLog: mocks.log }));
vi.mock("../services/aiSubtitles/jobService.js", () => ({
  getVideoAiSubtitleJobs: vi.fn(), listVideosWithoutFrenchSubtitles: vi.fn(), queueAiSubtitleJob: vi.fn(),
  serializeAiSubtitleJob: (job) => ({ id: job.AiSubtitleJobID }),
  approveAiSubtitlePrimary: mocks.approve, getAiSubtitleWorkers: vi.fn(),
}));
import { authorizeAdminAiSubtitlePrimary } from "../controllers/aiSubtitleController.js";

const replyFor = () => {
  const reply = { statusCode: 200, payload: null };
  reply.status = reply.code = (code) => { reply.statusCode = code; return reply; };
  reply.send = (payload) => { reply.payload = payload; return reply; };
  return reply;
};

describe("autorisation administrative du primary IA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.approve.mockResolvedValue({ AiSubtitleJobID: "job-42", VideoID: 42 });
  });
  it.each([1, 2])("autorise le grade %i et écrit l’audit avec l’admin authentifié", async (grade) => {
    mocks.user.mockResolvedValue({ GradeID: grade, EtatID: 1 });
    const request = { user: { userId: 7 }, params: { jobId: "job-42" }, body: { userId: 999 } };
    const reply = replyFor();
    await authorizeAdminAiSubtitlePrimary(request, reply);
    expect(mocks.approve).toHaveBeenCalledWith("job-42", 7);
    expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ UtilisateurID: 7, ActionNom: "ai_subtitle_primary_approved", VideoID: 42 }));
    expect(reply.payload).toEqual({ job: { id: "job-42" } });
  });
  it("refuse un utilisateur ordinaire avant toute mutation", async () => {
    mocks.user.mockResolvedValue({ GradeID: 3, EtatID: 1 });
    const reply = replyFor();
    await authorizeAdminAiSubtitlePrimary({ user: { userId: 9 }, params: { jobId: "job-42" } }, reply);
    expect(reply.statusCode).toBe(403);
    expect(mocks.approve).not.toHaveBeenCalled();
  });
});
