import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { AI_DISCLOSURE_VERSION } from "../services/userAiPreferenceService.js";
import { AI_DUBBING_STATUS } from "../services/aiDubbing/constants.js";
import { getAiDubbingGenerationConfigHash } from "../services/aiDubbing/generationConfig.js";
import {
  addAiDubbingSpeaker,
  approveAiDubbingPreview,
  deleteAiDubbing,
  normalizeAiDubbingExpectedSpeakerCount,
  normalizeAiDubbingPreviewStartSeconds,
  publishAiDubbing,
  queueAiDubbingPreview,
  regenerateAiDubbingVoiceProfile,
  rejectAiDubbing,
  retryFailedAiDubbing,
  reviewAiDubbingVoiceProfile,
  serializeAiDubbingJob,
} from "../services/aiDubbing/jobService.js";

const baseJob = (overrides = {}) => ({
  AiDubbingJobID: "job-1",
  VideoID: 42,
  TargetLanguage: "fr",
  SourceLanguage: "en",
  Status: AI_DUBBING_STATUS.FINAL_REVIEW,
  Phase: "FINAL_REVIEW",
  Progress: 100,
  PreviewRelativePath: "uploads/video/42/audio/ai/fr/job-1/preview/preview.wav",
  FinalPlaylistPath: "uploads/video/42/hls/audio/ai/fr/job-1/playlist.m3u8",
  VoiceModel: "chatterbox-multilingual-v3",
  DiarizationModel: "pyannote-speaker-diarization-community-1+nvidia-diar-sortformer-4spk-v1",
  SeparationModel: "bandit",
  PipelineVersion: "sami-dubbing-v6-clean-phrases-r9-r1",
  GenerationConfigHash: getAiDubbingGenerationConfigHash(
    "sami-dubbing-v6-clean-phrases-r9-r1"
  ),
  DisclosureVersion: AI_DISCLOSURE_VERSION,
  Watermarked: true,
  PreviewStartSeconds: 75,
  ExpectedSpeakerCount: 3,
  VoiceProfileRelativePath: "uploads/video/42/audio/ai/fr/job-1/profile",
  VoiceProfileChecksum: "a".repeat(64),
  SpeakerCount: 3,
  VoiceSamples: [
    { speaker: "SPEAKER_00", relativePath: "sample-0.wav", referenceSourceStart: 10, referenceSourceEnd: 14, reviewStatus: "ACCEPTED" },
    { speaker: "SPEAKER_01", relativePath: "sample-1.wav", referenceSourceStart: 20, referenceSourceEnd: 24, reviewStatus: "ACCEPTED" },
    { speaker: "SPEAKER_02", relativePath: "sample-2.wav", referenceSourceStart: 30, referenceSourceEnd: 34, reviewStatus: "ACCEPTED" },
  ],
  RejectedVoiceReferences: [],
  Video: { VideoID: 42, Titre: "Film" },
  GeneratedAudioTrack: null,
  ...overrides,
});

const runtimeEnv = {
  SAMI_AI_DUBBING_ENABLED: "true",
  SAMI_AI_DUBBING_WORKER_ENABLED: "false",
  SAMI_AI_DUBBING_PIPELINE_VERSION: "sami-dubbing-v6-clean-phrases-r9-r1",
  SAMI_INSTANCE_ROLE: "primary",
  SAMI_INSTANCE_ID: "sami-primary-ai-dubbing-test",
  SAMI_TRANSFER_SHARED_SECRET: "ai-dubbing-test-secret-with-32-bytes-minimum",
};

describe("cycle de validation des doublages IA", () => {
  it("expose tous les échantillons privés lorsque les profils sont verrouillés", () => {
    const serialized = serializeAiDubbingJob(baseJob());
    expect(serialized).toMatchObject({
      voiceProfilesLocked: true,
      voiceProfilesAccepted: true,
      speakerCount: 3,
      expectedSpeakerCount: 3,
    });
    expect(serialized.voiceSamples).toHaveLength(3);
    expect(serialized.voiceSamples[0].url).toBe(
      "/api/ai-dubbing/jobs/job-1/voice-samples/SPEAKER_00"
    );
  });

  it("valide un nombre d'intervenants explicite et conserve le mode automatique", () => {
    expect(normalizeAiDubbingExpectedSpeakerCount(undefined)).toBeNull();
    expect(normalizeAiDubbingExpectedSpeakerCount("")).toBeNull();
    expect(normalizeAiDubbingExpectedSpeakerCount("3")).toBe(3);
    expect(() => normalizeAiDubbingExpectedSpeakerCount(0)).toThrow(/nombre d'intervenants/i);
    expect(() => normalizeAiDubbingExpectedSpeakerCount(31)).toThrow(/nombre d'intervenants/i);
  });

  it("valide un début d'extrait entier et refuse une valeur hors contrat", () => {
    expect(normalizeAiDubbingPreviewStartSeconds(undefined)).toBe(0);
    expect(normalizeAiDubbingPreviewStartSeconds("75")).toBe(75);
    expect(() => normalizeAiDubbingPreviewStartSeconds(-1)).toThrow(/début de l'extrait/i);
    expect(() => normalizeAiDubbingPreviewStartSeconds(1.5)).toThrow(/début de l'extrait/i);
  });

  it("refuse une génération lorsque le runtime local n'est pas prêt", async () => {
    const database = { video: { findFirst: vi.fn() } };
    await expect(queueAiDubbingPreview({
      videoId: 42,
      targetLanguage: "fr",
      requestedByUserId: 3,
      database,
      env: {
        SAMI_AI_DUBBING_ENABLED: "false",
        SAMI_INSTANCE_ROLE: "primary",
        SAMI_INSTANCE_ID: "sami-primary-ai-dubbing-test",
        SAMI_TRANSFER_SHARED_SECRET: "ai-dubbing-test-secret-with-32-bytes-minimum",
      },
    })).rejects.toMatchObject({ statusCode: 409, code: "AI_DUBBING_RUNTIME_NOT_READY" });
    expect(database.video.findFirst).not.toHaveBeenCalled();
  });

  it("ne passe à la piste complète qu'après validation de l'extrait", async () => {
    const previewJob = baseJob({ Status: AI_DUBBING_STATUS.PREVIEW_REVIEW, Phase: "PREVIEW_REVIEW" });
    const database = {
      aiDubbingJob: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn()
          .mockResolvedValueOnce(previewJob)
          .mockResolvedValueOnce({
            ...previewJob,
            Status: AI_DUBBING_STATUS.QUEUED_FULL,
            Phase: "FULL",
          }),
      },
    };
    const approved = await approveAiDubbingPreview({ jobId: "job-1", adminUserId: 7, database });
    expect(database.aiDubbingJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AiDubbingJobID: "job-1", Status: AI_DUBBING_STATUS.PREVIEW_REVIEW },
      data: expect.objectContaining({
        Status: AI_DUBBING_STATUS.QUEUED_FULL,
        PreviewApprovedByUserID: 7,
      }),
    }));
    expect(approved.Status).toBe(AI_DUBBING_STATUS.QUEUED_FULL);
  });

  it("refuse un ancien extrait qui ne verrouille aucun profil vocal", async () => {
    const database = {
      aiDubbingJob: {
        findUnique: vi.fn().mockResolvedValue(baseJob({
          Status: AI_DUBBING_STATUS.PREVIEW_REVIEW,
          VoiceProfileRelativePath: null,
          VoiceProfileChecksum: null,
          SpeakerCount: null,
          VoiceSamples: null,
        })),
      },
    };

    await expect(approveAiDubbingPreview({ jobId: "job-1", adminUserId: 7, database }))
      .rejects.toMatchObject({ statusCode: 409, code: "AI_DUBBING_VOICE_PROFILE_REQUIRED" });
  });

  it("bloque la validation générale tant qu'un profil reste refusé", async () => {
    const database = {
      aiDubbingJob: {
        findUnique: vi.fn().mockResolvedValue(baseJob({
          Status: AI_DUBBING_STATUS.PREVIEW_REVIEW,
          VoiceSamples: baseJob().VoiceSamples.map((sample, index) => ({
            ...sample,
            reviewStatus: index === 1 ? "REJECTED" : "ACCEPTED",
          })),
        })),
      },
    };
    await expect(approveAiDubbingPreview({ jobId: "job-1", adminUserId: 7, database }))
      .rejects.toMatchObject({ code: "AI_DUBBING_VOICE_PROFILES_NOT_ACCEPTED" });
  });

  it("enregistre une décision explicite pour un profil vocal", async () => {
    const job = baseJob({
      Status: AI_DUBBING_STATUS.PREVIEW_REVIEW,
      VoiceSamples: baseJob().VoiceSamples.map((sample) => ({ ...sample, reviewStatus: "PENDING" })),
    });
    const database = {
      aiDubbingJob: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(job)
          .mockResolvedValueOnce({
            ...job,
            VoiceSamples: job.VoiceSamples.map((sample, index) => index === 0
              ? { ...sample, reviewStatus: "ACCEPTED" }
              : sample),
          }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const reviewed = await reviewAiDubbingVoiceProfile({
      jobId: "job-1", speaker: "SPEAKER_00", accepted: true, adminUserId: 7, database,
    });
    expect(database.aiDubbingJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { VoiceSamples: expect.arrayContaining([
        expect.objectContaining({ speaker: "SPEAKER_00", reviewStatus: "ACCEPTED", reviewedByUserId: 7 }),
      ]) },
    }));
    expect(reviewed.VoiceSamples[0].reviewStatus).toBe("ACCEPTED");
  });

  it.each(["sami-dubbing-v6-clean-phrases-r9-r1", "sami-dubbing-v5-guided-references-r4", "sami-dubbing-v5-guided-references-r4-r1", "sami-dubbing-v5-guided-references-r4-r2", "sami-dubbing-v5-translated-clauses-r5"])("exclut la référence rejetée et conserve les validations des autres profils (%s)", async (pipeline) => {
    const job = baseJob({ Status: AI_DUBBING_STATUS.PREVIEW_REVIEW, PipelineVersion: pipeline,
      GenerationConfigHash: getAiDubbingGenerationConfigHash(pipeline),
      ManualVoiceReferences: pipeline.startsWith("sami-dubbing-v5-") ? [
        { speaker: "SPEAKER_00", ranges: [{ start: 10, end: 14 }] },
        { speaker: "SPEAKER_01", ranges: [{ start: 20, end: 24 }, { start: 40, end: 44 }] },
        { speaker: "SPEAKER_02", ranges: [{ start: 30, end: 34 }] },
      ] : null,
    });
    const database = {
      aiDubbingJob: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(job)
          .mockResolvedValueOnce({ ...job, Status: AI_DUBBING_STATUS.QUEUED_PREVIEW }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    await regenerateAiDubbingVoiceProfile({
      jobId: "job-1", speaker: "SPEAKER_01", database, env: { ...runtimeEnv, SAMI_AI_DUBBING_PIPELINE_VERSION: pipeline },
    });
    expect(database.aiDubbingJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        Status: AI_DUBBING_STATUS.QUEUED_PREVIEW,
        PipelineVersion: pipeline,
        RejectedVoiceReferences: [expect.objectContaining({ sourceStart: 20, sourceEnd: 24 })],
        VoiceProfileRelativePath: job.VoiceProfileRelativePath,
        VoiceProfileChecksum: job.VoiceProfileChecksum,
        VoiceSamples: [
          expect.objectContaining({ speaker: "SPEAKER_00", regenerationRequested: false, reviewStatus: "ACCEPTED" }),
          expect.objectContaining({ speaker: "SPEAKER_01", regenerationRequested: true }),
          expect.objectContaining({ speaker: "SPEAKER_02", regenerationRequested: false, reviewStatus: "ACCEPTED" }),
        ],
      }),
    }));
    expect(database.aiDubbingJob.updateMany.mock.calls[0][0].data).not.toHaveProperty("ManualVoiceReferences");
  });

  it("ne relance aucun calcul lorsque les alternatives manuelles sont épuisées", async () => {
    const job = baseJob({ Status: AI_DUBBING_STATUS.PREVIEW_REVIEW, ManualVoiceReferences: [
      { speaker: "SPEAKER_01", ranges: [{ start: 20, end: 24 }] },
    ] });
    const database = { aiDubbingJob: { findUnique: vi.fn().mockResolvedValue(job), updateMany: vi.fn() } };
    await expect(regenerateAiDubbingVoiceProfile({ jobId: "job-1", speaker: "SPEAKER_01", database, env: runtimeEnv }))
      .rejects.toMatchObject({ code: "AI_DUBBING_MANUAL_ALTERNATIVES_EXHAUSTED" });
    expect(database.aiDubbingJob.updateMany).not.toHaveBeenCalled();
  });

  it("ajoute automatiquement un intervenant et relance l'analyse complète", async () => {
    const job = baseJob({ Status: AI_DUBBING_STATUS.PREVIEW_REVIEW });
    const database = {
      aiDubbingJob: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(job)
          .mockResolvedValueOnce({
            ...job, Status: AI_DUBBING_STATUS.QUEUED_PREVIEW, ExpectedSpeakerCount: 4,
          }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const updated = await addAiDubbingSpeaker({ jobId: "job-1", database, env: runtimeEnv });
    expect(database.aiDubbingJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        Status: AI_DUBBING_STATUS.QUEUED_PREVIEW,
        ExpectedSpeakerCount: 4,
        PipelineVersion: "sami-dubbing-v6-clean-phrases-r9-r1",
      }),
    }));
    expect(updated.ExpectedSpeakerCount).toBe(4);
  });

  it("relance manuellement un job en échec depuis une nouvelle analyse d'aperçu", async () => {
    const job = baseJob({
      Status: AI_DUBBING_STATUS.FAILED,
      Phase: "FAILED",
      Progress: 38,
      ErrorMessage: "Découpage vocal impossible",
      PreferredWorkerID: "pcfixe-3090",
    });
    const database = {
      aiDubbingJob: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(job)
          .mockResolvedValueOnce({
            ...job,
            Status: AI_DUBBING_STATUS.QUEUED_PREVIEW,
            Phase: "QUEUED",
            Progress: 0,
          }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const retried = await retryFailedAiDubbing({ jobId: "job-1", database, env: runtimeEnv });
    expect(database.aiDubbingJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { AiDubbingJobID: "job-1", Status: AI_DUBBING_STATUS.FAILED },
      data: expect.objectContaining({
        Status: AI_DUBBING_STATUS.QUEUED_PREVIEW,
        PipelineVersion: "sami-dubbing-v6-clean-phrases-r9-r1",
        PreferredWorkerID: null,
        VoiceSamples: Prisma.DbNull,
        ErrorMessage: null,
      }),
    }));
    expect(retried.Status).toBe(AI_DUBBING_STATUS.QUEUED_PREVIEW);
  });

  it("reprend une régénération ciblée en échec sans perdre les validations existantes", async () => {
    const job = baseJob({
      Status: AI_DUBBING_STATUS.FAILED,
      Phase: "FAILED",
      VoiceSamples: [
        {
          speaker: "SPEAKER_00",
          reviewStatus: "ACCEPTED",
          reviewedByUserId: 7,
          reviewedAt: "2026-08-31T09:00:00.000Z",
          referenceSha256: "a".repeat(64),
          relativePath: "uploads/video/11/audio/ai/fr/job-1/preview/voices/SPEAKER_00.wav",
          regenerationRequested: false,
        },
        {
          speaker: "SPEAKER_01",
          reviewStatus: "PENDING",
          referenceSha256: "b".repeat(64),
          relativePath: "uploads/video/11/audio/ai/fr/job-1/preview/voices/SPEAKER_01.wav",
          regenerationRequested: true,
        },
      ],
    });
    const database = {
      aiDubbingJob: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(job)
          .mockResolvedValueOnce({ ...job, Status: AI_DUBBING_STATUS.QUEUED_PREVIEW }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await retryFailedAiDubbing({ jobId: "job-1", database, env: runtimeEnv });

    expect(database.aiDubbingJob.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        VoiceProfileRelativePath: job.VoiceProfileRelativePath,
        VoiceProfileChecksum: job.VoiceProfileChecksum,
        VoiceSamples: job.VoiceSamples,
      }),
    }));
  });

  it("publie une piste explicitement marquée IA après la validation finale", async () => {
    const job = baseJob();
    const tx = {
      videoAudioTrack: {
        aggregate: vi.fn().mockResolvedValue({ _max: { Ordre: 2 } }),
        create: vi.fn().mockResolvedValue({}),
      },
      aiDubbingJob: { update: vi.fn().mockResolvedValue({}) },
    };
    const database = {
      aiDubbingJob: {
        findUnique: vi.fn()
          .mockResolvedValueOnce(job)
          .mockResolvedValueOnce({
            ...job,
            Status: AI_DUBBING_STATUS.PUBLISHED,
            GeneratedAudioTrack: { VideoAudioTrackID: 19 },
          }),
      },
      $transaction: vi.fn(async (callback) => callback(tx)),
    };

    const published = await publishAiDubbing({ jobId: "job-1", adminUserId: 7, database });
    expect(tx.videoAudioTrack.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        Label: "Français — doublage IA",
        Language: "fr",
        Origin: "AI_DUB",
        Synthetic: true,
        DisclosureVersion: AI_DISCLOSURE_VERSION,
        PipelineVersion: job.PipelineVersion,
        AiDubbingJobID: "job-1",
        IsDefault: false,
        Ordre: 3,
      }),
    });
    expect(tx.aiDubbingJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        Status: AI_DUBBING_STATUS.PUBLISHED,
        FinalApprovedByUserID: 7,
      }),
    }));
    expect(published.GeneratedAudioTrack.VideoAudioTrackID).toBe(19);
  });

  it("interdit la publication d'une ancienne piste sans échantillons validés", async () => {
    const database = {
      aiDubbingJob: {
        findUnique: vi.fn().mockResolvedValue(baseJob({ VoiceSamples: null })),
      },
    };
    await expect(publishAiDubbing({ jobId: "job-1", adminUserId: 7, database }))
      .rejects.toMatchObject({ statusCode: 409, code: "AI_DUBBING_VOICE_PROFILE_REQUIRED" });
  });

  it("interdit de refuser une piste déjà publiée", async () => {
    const database = {
      aiDubbingJob: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    await expect(rejectAiDubbing({ jobId: "job-1", adminUserId: 7, database }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("supprime atomiquement une version de doublage IA publiée et sa piste synthétique", async () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    const job = baseJob({
      AiDubbingJobID: jobId,
      Status: AI_DUBBING_STATUS.PUBLISHED,
      GeneratedAudioTrack: {
        VideoAudioTrackID: 19,
        Origin: "AI_DUB",
        Synthetic: true,
        IsDefault: false,
      },
    });
    const tx = {
      videoAudioTrack: { delete: vi.fn().mockResolvedValue({}) },
      aiDubbingJob: { delete: vi.fn().mockResolvedValue({}) },
    };
    const database = {
      aiDubbingJob: { findUnique: vi.fn().mockResolvedValue(job) },
      $transaction: vi.fn(async (callback) => callback(tx)),
    };

    await expect(deleteAiDubbing({ jobId, database })).resolves.toMatchObject({
      job,
      cleanupCompleted: true,
    });
    expect(tx.videoAudioTrack.delete).toHaveBeenCalledWith({
      where: { VideoAudioTrackID: 19 },
    });
    expect(tx.aiDubbingJob.delete).toHaveBeenCalledWith({
      where: { AiDubbingJobID: jobId },
    });
  });

  it("refuse de supprimer une piste active, non IA ou définie par défaut", async () => {
    for (const job of [
      baseJob({ Status: AI_DUBBING_STATUS.PROCESSING_FULL }),
      baseJob({ Status: AI_DUBBING_STATUS.PUBLISHED, GeneratedAudioTrack: {
        VideoAudioTrackID: 20, Origin: "ORIGINAL", Synthetic: false, IsDefault: false,
      } }),
      baseJob({ Status: AI_DUBBING_STATUS.PUBLISHED, GeneratedAudioTrack: {
        VideoAudioTrackID: 21, Origin: "AI_DUB", Synthetic: true, IsDefault: true,
      } }),
    ]) {
      const database = {
        aiDubbingJob: { findUnique: vi.fn().mockResolvedValue(job) },
        $transaction: vi.fn(),
      };
      await expect(deleteAiDubbing({ jobId: "job-1", database }))
        .rejects.toMatchObject({ statusCode: 409 });
      expect(database.$transaction).not.toHaveBeenCalled();
    }
  });
});
