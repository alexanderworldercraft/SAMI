import { describe, expect, it, vi } from "vitest";

import {
  listGeneratedAiSubtitles,
  recreateGeneratedAiSubtitle,
} from "../services/aiSubtitles/adminService.js";

const generatedSubtitle = {
  VideoSubtitleID: 17,
  VideoID: 42,
  Label: "Français (IA)",
  Language: "fr",
  Type: "FULL",
  Origin: "AI",
  AiSubtitleJobID: null,
  CreateDate: new Date("2026-08-23T08:00:00.000Z"),
  AiSubtitleJob: null,
  Video: {
    VideoID: 42,
    Titre: "Film généré",
    CheminAcces: "uploads/video/42/hls/master.m3u8",
    EtatID: 1,
    Saison: null,
  },
};

describe("administration des sous-titres IA", () => {
  it("n'affiche aucune piste tant qu'aucune recherche n'est fournie", async () => {
    const database = {
      video: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
    };

    const result = await listGeneratedAiSubtitles({ database });

    expect(database.video.count).not.toHaveBeenCalled();
    expect(database.video.findMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      items: [],
      pagination: { page: 1, pageSize: 40, total: 0, totalPages: 1 },
      searchRequired: true,
    });
  });

  it("regroupe les pistes par vidéo et pagine quarante vidéos", async () => {
    const database = {
      video: {
        count: vi.fn().mockResolvedValue(41),
        findMany: vi.fn().mockResolvedValue([{
          ...generatedSubtitle.Video,
          CreateDate: generatedSubtitle.CreateDate,
          VideoSubtitles: [{
            VideoSubtitleID: generatedSubtitle.VideoSubtitleID,
            VideoID: generatedSubtitle.VideoID,
            Label: generatedSubtitle.Label,
            Language: generatedSubtitle.Language,
            Type: generatedSubtitle.Type,
            Origin: generatedSubtitle.Origin,
            AiSubtitleJobID: generatedSubtitle.AiSubtitleJobID,
            CreateDate: generatedSubtitle.CreateDate,
            AiSubtitleJob: generatedSubtitle.AiSubtitleJob,
          }, {
            VideoSubtitleID: 18,
            VideoID: generatedSubtitle.VideoID,
            Label: "Anglais (IA)",
            Language: "en",
            Type: generatedSubtitle.Type,
            Origin: generatedSubtitle.Origin,
            AiSubtitleJobID: null,
            CreateDate: generatedSubtitle.CreateDate,
            AiSubtitleJob: null,
          }],
        }]),
      },
    };

    const result = await listGeneratedAiSubtitles({ page: 2, search: "Film", database });

    expect(database.video.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 40,
      take: 40,
    }));
    expect(result.pagination).toEqual({ page: 2, pageSize: 40, total: 41, totalPages: 2 });
    expect(result.items[0]).toMatchObject({
      video: { id: 42, title: "Film généré" },
      subtitles: [
        { id: 17, label: "Français (IA)" },
        { id: 18, label: "Anglais (IA)" },
      ],
    });
  });

  it("supprime la transcription mémorisée et crée un nouveau job sans retirer l'ancienne piste", async () => {
    const tx = {
      aiVideoTranscript: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
      aiSubtitleJob: { create: vi.fn().mockResolvedValue({}) },
      videoSubtitle: { update: vi.fn().mockResolvedValue({}) },
    };
    const database = {
      appSetting: {
        upsert: vi.fn().mockResolvedValue({ Valeur: { active: true }, UpdatedAt: new Date() }),
      },
      videoSubtitle: { findFirst: vi.fn().mockResolvedValue(generatedSubtitle) },
      aiSubtitleJob: {
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn().mockResolvedValue(null),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    };

    const result = await recreateGeneratedAiSubtitle(17, {
      requestedByUserId: 7,
      database,
      config: { pipelineVersion: "pipeline-v2" },
    });

    expect(tx.aiVideoTranscript.deleteMany).toHaveBeenCalledWith({ where: { VideoID: 42 } });
    expect(tx.aiSubtitleJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        VideoID: 42,
        TargetLanguage: "fr",
        RequestedByUserID: 7,
        Status: "QUEUED",
        PipelineVersion: "pipeline-v2",
      }),
    });
    expect(tx.videoSubtitle.update).toHaveBeenCalledWith({
      where: { VideoSubtitleID: 17 },
      data: expect.objectContaining({ AiSubtitleJobID: expect.any(String) }),
    });
    expect(result.job).toMatchObject({ videoId: 42, targetLanguage: "fr", status: "QUEUED" });
  });
});
