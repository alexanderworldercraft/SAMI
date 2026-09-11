import { describe, expect, it } from "vitest";

import { retainUntargetedVoiceSample, normalizeQualityReport } from "../services/aiDubbing/resultService.js";

describe("promotion ciblée des profils vocaux", () => {
  it("conserve uniquement les catégories connues de répartition traduite à vérifier", () => {
    const report = normalizeQualityReport({ schemaVersion: 1, warnings: [
      { translationBoundaryReview: "clause_assignment_heuristic" },
      { translationBoundaryReview: "unsplit_translation_dominant_speaker" },
      { translationBoundaryReview: "unknown" },
    ] });
    expect(report.warnings.map(w => w.translationBoundaryReview)).toEqual([
      "clause_assignment_heuristic", "unsplit_translation_dominant_speaker", null,
    ]);
  });
  it("conserve le diagnostic non bloquant des répliques courtes", () => {
    const report = normalizeQualityReport({ schemaVersion: 1, warnings: [{
      sourceStart: 92.83, speaker: "SPEAKER_02", cer: 0.714,
      selectedBestShortAttempt: true, shortCerMismatchAccepted: true, candidateAttempts: 3,
      severity: "warning",
    }] });
    expect(report.warnings[0]).toMatchObject({
      cer: 0.714, selectedBestShortAttempt: true,
      shortCerMismatchAccepted: true, candidateAttempts: 3,
    });
  });
  it("conserve les avertissements de fin prolongée et de chevauchement", () => {
    const report = normalizeQualityReport({ schemaVersion: 1, warnings: [{
      sourceStart: 83.04, speaker: "SPEAKER_00", durationRatio: 1.5,
      originalDurationRatio: 4.133, timingExtensionSeconds: 0.475667, timingOverlapSeconds: 0.3,
      severity: "warning",
    }] });
    expect(report.warnings[0]).toMatchObject({ timingExtensionSeconds: 0.475667, timingOverlapSeconds: 0.3, durationRatio: 1.5 });
  });
  it("conserve sans revalidation le profil accepté qui n'est pas ciblé", () => {
    const retained = retainUntargetedVoiceSample({
      speaker: "SPEAKER_00",
      regenerationTarget: "SPEAKER_01",
      retained: {
        speaker: "SPEAKER_00",
        sourceStart: 12,
        referenceSourceStart: 10,
        referenceSourceEnd: 14,
        referenceSha256: "a".repeat(64),
        text: "Profil déjà validé",
        reviewStatus: "ACCEPTED",
        reviewedByUserId: 1,
        reviewedAt: "2026-08-31T09:00:00.000Z",
        relativePath: "uploads/video/11/audio/ai/fr/job/preview/voices/SPEAKER_00.wav",
        regenerationRequested: false,
      },
      reference: { sha256: "a".repeat(64) },
    });

    expect(retained).toMatchObject({
      speaker: "SPEAKER_00",
      reviewStatus: "ACCEPTED",
      reviewedByUserId: 1,
      reviewedAt: "2026-08-31T09:00:00.000Z",
      relativePath: "uploads/video/11/audio/ai/fr/job/preview/voices/SPEAKER_00.wav",
    });
    expect(retained).not.toHaveProperty("regenerationRequested");
  });

  it("ne conserve pas le profil explicitement ciblé", () => {
    expect(retainUntargetedVoiceSample({
      speaker: "SPEAKER_01",
      regenerationTarget: "SPEAKER_01",
      retained: { referenceSha256: "a".repeat(64) },
      reference: { sha256: "a".repeat(64) },
    })).toBeNull();
  });
});
