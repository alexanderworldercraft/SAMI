import { describe, expect, it } from "vitest";
import {
  serializeEncodingJob,
  serializeEncodingWorker,
} from "../services/distributedEncoding/serializer.js";

describe("sérialisation de l'encodage distribué", () => {
  it("calcule la disponibilité et sérialise les BigInt sans perte", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    const serialized = serializeEncodingWorker({
      VideoEncodingWorkerID: "clone-01",
      Role: "CLONE",
      Enabled: true,
      Draining: false,
      ProtocolVersion: 1,
      PipelineVersion: "sami-hls-libx264-aac-v1",
      MaxNominalHeight: 2160,
      SupportsH264: true,
      SupportsAac: true,
      MaxSlots: 1,
      PerformanceScore: 2.5,
      LastHeartbeatAt: new Date(now.getTime() - 44_999),
      CreatedAt: now,
      UpdatedAt: now,
      _count: { AssignedTasks: 1 },
    }, { now });

    expect(serialized.status).toBe("online");
    expect(serialized.activeLeaseCount).toBe(1);
    expect(serialized.lastHeartbeatAt).toBe("2026-07-31T11:59:15.001Z");
  });

  it("expose les préférences, la fenêtre sans clone et les tailles en chaînes", () => {
    const date = new Date("2026-07-31T12:00:00.000Z");
    const serialized = serializeEncodingJob({
      VideoEncodingJobID: "job-1",
      Status: "RUNNING",
      Progress: 25,
      SourceOriginalName: "source.mkv",
      SourceSize: 9_007_199_254_740_993n,
      SourceSha256: "a".repeat(64),
      RequestSnapshot: {
        title: "Épisode distribué",
        audio: "jpn - AAC - 2 canaux",
        audioTracks: ["Japonais", "Français"],
        subtitles: [{ label: "Français forcés", filename: "fr.vtt" }],
        seasonNumber: 2,
        seriesTitle: "Série de test",
      },
      PipelineVersion: "sami-hls-libx264-aac-v1",
      EncodingSpecHash: "b".repeat(64),
      CancelRequested: false,
      NoCloneSinceAt: date,
      StartedAt: new Date("2026-07-31T11:58:00.000Z"),
      CreatedAt: date,
      UpdatedAt: date,
      Tasks: [{
        VideoEncodingTaskID: "task-1",
        VideoEncodingJobID: "job-1",
        TaskKey: "video:1080p",
        Kind: "VIDEO_PROFILE",
        NominalHeight: 1080,
        Priority: 0,
        Weight: 1080n,
        Required: true,
        Spec: {},
        SpecHash: "c".repeat(64),
        Status: "PENDING",
        PreferredWorkerID: "clone-01",
        PreferenceExpiresAt: date,
        LeaseGeneration: 0,
        AttemptCount: 0,
        MaxAttempts: 3,
        Progress: 0,
        CreatedAt: date,
        UpdatedAt: date,
      }],
    }, { now: date });

    expect(serialized.sourceSize).toBe("9007199254740993");
    expect(serialized.title).toBe("Épisode distribué");
    expect(serialized.noCloneSinceAt).toBe(date.toISOString());
    expect(serialized.elapsedMs).toBe(120_000);
    expect(serialized.video).toEqual({
      titre: "Épisode distribué",
      audio: "jpn - AAC - 2 canaux",
      audioTracks: ["Japonais", "Français"],
      subtitles: ["Français forcés"],
      saisonNumero: 2,
      seriesTitre: "Série de test",
    });
    expect(serialized.tasks[0]).toMatchObject({
      weight: "1080",
      preferredWorkerId: "clone-01",
      preferenceExpiresAt: date.toISOString(),
    });
  });

  it("ordonne les tâches et tentatives en mémoire sans dépendre du tri SQL", () => {
    const createdAt = new Date("2026-07-31T12:00:00.000Z");
    const task = (id, priority, offset, attempts = []) => ({
      VideoEncodingTaskID: id,
      VideoEncodingJobID: "job-1",
      TaskKey: id,
      Kind: "VIDEO_PROFILE",
      Priority: priority,
      Weight: 1n,
      Required: true,
      Spec: {},
      SpecHash: "a".repeat(64),
      Status: "SUCCEEDED",
      LeaseGeneration: 0,
      AttemptCount: attempts.length,
      MaxAttempts: 4,
      Progress: 100,
      CreatedAt: new Date(createdAt.getTime() + offset),
      UpdatedAt: createdAt,
      Attempts: attempts,
    });
    const attempt = (number) => ({
      VideoEncodingTaskAttemptID: `attempt-${number}`,
      VideoEncodingTaskID: "task-high-old",
      VideoEncodingWorkerID: "primary",
      AttemptNumber: number,
      LeaseGeneration: number,
      Status: "SUCCEEDED",
      Progress: 100,
      StartedAt: createdAt,
      CreatedAt: createdAt,
      UpdatedAt: createdAt,
    });

    const serialized = serializeEncodingJob({
      VideoEncodingJobID: "job-1",
      Status: "COMPLETED",
      Progress: 100,
      SourceOriginalName: "source.mkv",
      SourceSize: 1n,
      SourceSha256: "b".repeat(64),
      RequestSnapshot: {},
      PipelineVersion: "pipeline",
      EncodingSpecHash: "c".repeat(64),
      CancelRequested: false,
      CreatedAt: createdAt,
      UpdatedAt: createdAt,
      Tasks: [
        task("task-low", 1, 0),
        task("task-high-new", 10, 2_000),
        task("task-high-old", 10, 1_000, [attempt(2), attempt(1)]),
      ],
    }, { now: createdAt });

    expect(serialized.tasks.map(({ id }) => id)).toEqual([
      "task-high-old",
      "task-high-new",
      "task-low",
    ]);
    expect(serialized.tasks[0].attempts.map(({ attemptNumber }) => attemptNumber))
      .toEqual([1, 2]);
  });
});
