import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../services/db.js", () => ({ prisma: {
  utilisateur: { findUnique: vi.fn() }, video: { findUnique: vi.fn() },
  videoCreditSegment: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  $transaction: vi.fn(), $queryRaw: vi.fn(),
} }));
vi.mock("../services/video/videoCreditDuration.js", () => ({ getCreditVideoDuration: vi.fn() }));
import { prisma } from "../services/db.js";
import { getCreditVideoDuration } from "../services/video/videoCreditDuration.js";
import { createVideoCredit, updateVideoCredit, deleteVideoCredit, listVideoCredits, listCreditQueue } from "../controllers/videoCreditController.js";
const request = (body = {}, params = {}) => ({ user: { userId: 7 }, params: { id: "12", segmentId: "3", ...params }, body });
const reply = () => { const r = { status: vi.fn(), send: vi.fn() }; r.status.mockReturnValue(r); r.send.mockReturnValue(r); return r; };
const pending = { ID: 3, VideoID: 12, AuthorID: 7, Status: "PENDING", Start: 10, End: 20 };
const admin = () => prisma.utilisateur.findUnique.mockResolvedValue({ UtilisateurID: 7, GradeID: 2, EtatID: 1 });
beforeEach(() => {
  vi.resetAllMocks();
  prisma.utilisateur.findUnique.mockResolvedValue({ UtilisateurID: 7, GradeID: 3, EtatID: 1 });
  prisma.video.findUnique.mockResolvedValue({ VideoID: 12, EtatID: 1, Premium: false });
  prisma.$transaction.mockImplementation(fn => fn(prisma));
  prisma.videoCreditSegment.findFirst.mockResolvedValue(pending);
  prisma.videoCreditSegment.findMany.mockResolvedValue([]);
  prisma.videoCreditSegment.count.mockResolvedValue(0);
  getCreditVideoDuration.mockResolvedValue(100);
});
describe("video credits authorization and moderation", () => {
  it("creates a pending proposal with server-owned author and video", async () => {
    const r = reply(); await createVideoCredit(request({ Start: 0, End: 15, AuthorID: 99, VideoID: 99 }), r);
    expect(r.status).toHaveBeenCalledWith(201);
    expect(prisma.videoCreditSegment.create).toHaveBeenCalledWith(expect.objectContaining({ data: { Start: 0, End: 15, Status: "PENDING", AuthorID: 7, VideoID: 12 } }));
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
  it.each([{ Start: -1, End: 10 }, { Start: 20, End: 20 }, { Start: 30, End: 20 }, { Start: 10, End: 101 }, { Start: "10", End: 20 }, { Start: null, End: 20 }])("rejects invalid or out-of-media range %j", async body => {
    const r = reply(); await createVideoCredit(request(body), r); expect(r.status).toHaveBeenCalledWith(400); expect(prisma.videoCreditSegment.create).not.toHaveBeenCalled();
  });
  it("never trusts a client duration", async () => {
    const r = reply(); await createVideoCredit(request({ Start: 90, End: 120, Duration: 1000 }), r); expect(r.status).toHaveBeenCalledWith(400);
  });
  it("rejects user self-approval", async () => {
    const r = reply(); await updateVideoCredit(request({ Status: "APPROVED" }), r); expect(r.status).toHaveBeenCalledWith(403);
  });
  it.each(["APPROVED", "REJECTED"])("locks %s proposals for author edits and deletion", async Status => {
    prisma.videoCreditSegment.findFirst.mockResolvedValue({ ...pending, Status });
    for (const handler of [updateVideoCredit, deleteVideoCredit]) { const r = reply(); await handler(request({ Start: 11, End: 20 }), r); expect(r.status).toHaveBeenCalledWith(403); }
  });
  it("blocks edits to another author's pending proposal", async () => {
    prisma.videoCreditSegment.findFirst.mockResolvedValue({ ...pending, AuthorID: 8 }); const r = reply(); await updateVideoCredit(request({ Start: 11, End: 20 }), r); expect(r.status).toHaveBeenCalledWith(403);
  });
  it("allows the author to edit and delete a pending proposal", async () => {
    await updateVideoCredit(request({ Start: 11, End: 20 }), reply()); expect(prisma.videoCreditSegment.update).toHaveBeenCalled();
    await deleteVideoCredit(request(), reply()); expect(prisma.videoCreditSegment.delete).toHaveBeenCalled();
  });
  it("restricts visibility to approved and own proposals", async () => {
    await listVideoCredits(request(), reply()); expect(prisma.videoCreditSegment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { VideoID: 12, OR: [{ Status: "APPROVED" }, { AuthorID: 7 }] } }));
  });
  it("blocks premium access including series premium", async () => {
    prisma.video.findUnique.mockResolvedValue({ EtatID: 1, Saison: { Series: { Premium: true } } });
    const r = reply(); await listVideoCredits(request(), r); expect(r.status).toHaveBeenCalledWith(403);
  });
  it("blocks deleted videos", async () => { prisma.video.findUnique.mockResolvedValue({ EtatID: 2 }); const r = reply(); await createVideoCredit(request({ Start: 1, End: 3 }), r); expect(r.status).toHaveBeenCalledWith(404); });
  it("protects the admin queue", async () => { const r = reply(); await listCreditQueue(request(), r); expect(r.status).toHaveBeenCalledWith(403); });
  it.each([1, 2])("allows grade %i moderation and records reviewer", async GradeID => {
    prisma.utilisateur.findUnique.mockResolvedValue({ UtilisateurID: 7, GradeID, EtatID: 1 });
    prisma.videoCreditSegment.findFirst.mockResolvedValueOnce(pending).mockResolvedValueOnce(null);
    await updateVideoCredit(request({ Status: "APPROVED", Start: 12, End: 22 }), reply());
    expect(prisma.videoCreditSegment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ Status: "APPROVED", Start: 12, End: 22, ReviewerID: 7, ReviewedAt: expect.any(Date) }) }));
  });
  it("rejects overlap with another approved segment", async () => {
    admin(); const r = reply(); await updateVideoCredit(request({ Status: "APPROVED" }), r); expect(r.status).toHaveBeenCalledWith(409); expect(prisma.videoCreditSegment.update).not.toHaveBeenCalled();
    expect(prisma.videoCreditSegment.findFirst).toHaveBeenLastCalledWith({ where: { VideoID: 12, Status: "APPROVED", ID: { not: 3 }, Start: { lt: 20 }, End: { gt: 10 } } });
  });
  it("fails closed when duration is unavailable, but permits refusal", async () => {
    admin(); getCreditVideoDuration.mockRejectedValue(new Error("missing")); const r = reply(); await updateVideoCredit(request({ Status: "APPROVED" }), r); expect(r.status).toHaveBeenCalledWith(409);
    await updateVideoCredit(request({ Status: "REJECTED" }), reply()); expect(prisma.videoCreditSegment.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ Status: "REJECTED" }) }));
  });
});
