import { describe, expect, it } from "vitest";

import {
  buildAudioDurationWarnings,
  buildDistributedEncodingTasks,
} from "../services/distributedEncoding/jobService.js";

describe("création des tâches d'encodage distribué", () => {
  it("utilise un identifiant audio court tout en conservant le libellé complet", () => {
    const fullLabel = "Français — Dolby Digital 5.1 avec audiodescription";
    const tasks = buildDistributedEncodingTasks({
      encodingSpecHash: "a".repeat(64),
      plan: {
        profiles: [{ label: "1080p", width: 1920, height: 1080, bitrate: 12000 }],
        multiAudio: true,
        videoStreamIndex: 0,
        audioStreamIndex: 1,
        durationSeconds: 3600,
        segmentDurationSeconds: 4,
        audioBitrateKbps: 192,
        audioRenditions: [{
          label: fullLabel,
          language: "fr",
          isDefault: true,
          order: 0,
          sourceIndex: 1,
          outputChannels: 2,
        }],
      },
    });

    expect(tasks[1]).toMatchObject({
      key: "audio-0",
      profileLabel: "Audio 1",
      spec: {
        track: {
          label: fullLabel,
          order: 0,
        },
      },
    });
  });

  it("signale les pistes qui seront complétées avec du silence", () => {
    expect(buildAudioDurationWarnings({
      durationSeconds: 5991.611,
      audioRenditions: [{
        label: "Français",
        order: 0,
        sourceDurationSeconds: 5740.394,
        silencePaddingSeconds: 251.217,
      }, {
        label: "Canadien",
        order: 1,
        sourceDurationSeconds: 5991.466,
        silencePaddingSeconds: 0.145,
      }, {
        label: "Inconnue",
        order: 2,
        sourceDurationSeconds: null,
        silencePaddingSeconds: null,
      }],
    })).toEqual([
      expect.objectContaining({
        code: "AUDIO_TRACK_PADDED_WITH_SILENCE",
        trackOrder: 0,
        sourceDurationSeconds: 5740.394,
        targetDurationSeconds: 5991.611,
        silencePaddingSeconds: 251.217,
      }),
      expect.objectContaining({
        code: "AUDIO_TRACK_DURATION_UNKNOWN",
        trackOrder: 2,
        sourceDurationSeconds: null,
        targetDurationSeconds: 5991.611,
      }),
    ]);
  });
});
