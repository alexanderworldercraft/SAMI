import { describe, it, expect, vi } from "vitest";
import { listAiDubbingJobs } from "../services/aiDubbing/jobService.js";

describe("navigation des doublages par état et par vidéo", () => {
  it("pagine cinq vidéos sans limiter le nombre de versions de chacune", async () => {
    const job = language => ({ AiDubbingJobID: language, TargetLanguage: language, Status: "PUBLISHED", VideoID: 13, Video: { VideoID: 13, Titre: "Extrait" } });
    const database = { video: { count: vi.fn().mockResolvedValue(7), findMany: vi.fn().mockResolvedValue([
      { VideoID: 13, Titre: "Extrait", AiDubbingJobs: [job("en"), job("ja"), job("fr"), { ...job("fr"), AiDubbingJobID: "fr-old" }] },
    ]) } };
    const result = await listAiDubbingJobs({ view: "published", page: 99, database });
    expect(database.video.count).toHaveBeenCalledWith({ where: { AiDubbingJobs: { some: { Status: "PUBLISHED" } } } });
    const query = database.video.findMany.mock.calls[0][0];
    expect(query.take).toBe(5); expect(query.skip).toBe(5);
    expect(query.select.AiDubbingJobs.where).toEqual({ Status: "PUBLISHED" });
    expect(query.select.AiDubbingJobs.take).toBeUndefined();
    expect(result.pagination).toEqual({ page: 2, pageSize: 5, total: 7, totalPages: 2 });
    expect(result.groups[0].jobs.map(job => job.targetLanguage)).toEqual(["fr", "fr", "ja", "en"]);
  });
  it("laisse erreurs, refus et validations en attente dans les traitements en cours", async () => {
    const database = { aiDubbingJob: { count: vi.fn().mockResolvedValue(41), findMany: vi.fn().mockResolvedValue([]) } };
    const result = await listAiDubbingJobs({ view: "ongoing", page: 2, database });
    expect(database.aiDubbingJob.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { Status: { not: "PUBLISHED" } }, skip: 40, take: 40 }));
    expect(result.pagination.page).toBe(2);
  });
  it("gère une bibliothèque vide et refuse les vues inconnues", async () => {
    const database = { video: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) } };
    expect((await listAiDubbingJobs({ view: "published", database })).pagination.totalPages).toBe(1);
    await expect(listAiDubbingJobs({ view: "other", database })).rejects.toMatchObject({ statusCode: 400 });
  });
});
