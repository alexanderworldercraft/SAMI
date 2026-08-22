import { describe, expect, it, vi } from "vitest";

import {
  listVideosWithoutFrenchSubtitles,
  videoHasFullSubtitle,
} from "../services/aiSubtitles/jobService.js";

describe("catalogue des sous-titres français manquants", () => {
  it("utilise une pagination fixe de 40", async () => {
    const database = {
      video: {
        count: vi.fn(async () => 41),
        findMany: vi.fn(async () => [{
          VideoID: 12,
          Titre: "Film sans français",
          CreateDate: new Date("2026-08-22T00:00:00Z"),
          Saison: null,
          AiSubtitleJobs: [],
        }]),
      },
    };
    const result = await listVideosWithoutFrenchSubtitles({ page: 2, database });
    expect(database.video.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 40,
      take: 40,
    }));
    expect(result.pagination).toEqual(expect.objectContaining({
      page: 2,
      pageSize: 40,
      total: 41,
      totalPages: 2,
    }));
  });

  it("ne considère pas un français forcé comme une piste complète", async () => {
    const database = {
      videoSubtitle: {
        findMany: vi.fn(async () => [{
          Language: "fr",
          Label: "French (Forced)",
          CheminSubtitle: "uploads/video/1/sousTitre/fre_1.vtt",
          Type: "FORCED",
        }]),
      },
    };
    await expect(videoHasFullSubtitle(1, "fr", { database })).resolves.toBe(false);
  });
});
