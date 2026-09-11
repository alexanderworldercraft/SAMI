import { describe, expect, it, vi } from "vitest";
import { assertManualVoiceReferenceManifest, normalizeManualVoiceReferences } from "../services/aiDubbing/manualReferences.js";
import { serializeAiDubbingLease } from "../services/aiDubbing/leaseService.js";
import { queueAiDubbingPreview, serializeAiDubbingJob } from "../services/aiDubbing/jobService.js";

const env = {
  SAMI_AI_DUBBING_ENABLED: "true", SAMI_AI_DUBBING_WORKER_ENABLED: "false",
  SAMI_AI_DUBBING_PIPELINE_VERSION: "sami-dubbing-v5-guided-references-r4",
  SAMI_INSTANCE_ROLE: "primary", SAMI_INSTANCE_ID: "guided-test",
  SAMI_TRANSFER_SHARED_SECRET: "guided-reference-test-secret-32-bytes-minimum",
};
const input = [{ ranges: [{ start: 1, end: 4 }, { start: 20, end: 24 }] }, { ranges: [{ start: 10, end: 13 }] }];
describe("références vocales guidées", () => {
  it("conserve le mode automatique et attribue des identifiants canoniques", () => {
    expect(normalizeManualVoiceReferences(undefined, null)).toBeNull();
    expect(normalizeManualVoiceReferences(input, 2)).toEqual(input.map((group, i) => ({ ...group, speaker: `SPEAKER_0${i}` })));
  });
  it("refuse les groupes manquants, durées invalides et chevauchements", () => {
    for (const [value, count] of [[input, null], [input, 3], [[], 1], [[{ ranges: [] }], 1],
      [[{ ranges: [{ start: 1, end: 2 }] }], 1], [[{ ranges: [{ start: 1, end: 14 }] }], 1],
      [[{ ranges: [{ start: NaN, end: 5 }] }], 1], [[{ ranges: [{ start: "1", end: 5 }] }], 1],
      [[{ ranges: [{ start: 1, end: 4 }, { start: 3, end: 6 }] }], 1],
      [[{ ranges: [{ start: 1, end: 4 }] }, { ranges: [{ start: 3, end: 6 }] }], 2]]) {
      expect(() => normalizeManualVoiceReferences(value, count)).toThrow();
    }
  });
  it("persiste les alternatives avec le job et refuse un ancien moteur avant toute écriture", async () => {
    const database = { video: { findFirst: vi.fn().mockResolvedValue({ VideoID: 13, VideoSubtitles: [{}] }) },
      aiDubbingJob: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockImplementation(async ({ data }) => data) } };
    const args = { videoId: 13, targetLanguage: "fr", expectedSpeakerCount: 2, manualVoiceReferences: input, requestedByUserId: 1, database, env };
    const { job } = await queueAiDubbingPreview(args);
    expect(job.ManualVoiceReferences).toEqual(normalizeManualVoiceReferences(input, 2));
    expect(serializeAiDubbingLease({ job, phase: "preview" }).job.manualVoiceReferences).toEqual(job.ManualVoiceReferences);
    expect(serializeAiDubbingJob(job).manualVoiceReferences).toEqual(job.ManualVoiceReferences);
    database.aiDubbingJob.create.mockClear();
    await expect(queueAiDubbingPreview({ ...args, env: { ...env, SAMI_AI_DUBBING_PIPELINE_VERSION: "sami-dubbing-v5-flexible-tails-r3" } })).rejects.toMatchObject({ statusCode: 409 });
    expect(database.aiDubbingJob.create).not.toHaveBeenCalled();
  });
  it("rejette au retour du clone une référence hors sélection ou des alternatives perdues", () => {
    const selected = normalizeManualVoiceReferences(input, 2);
    const manifest = { manualVoiceReferences: selected, references: {
      SPEAKER_00: { sourceStart: 20.1, sourceEnd: 23.9 }, SPEAKER_01: { sourceStart: 10.1, sourceEnd: 12.9 },
    } };
    expect(() => assertManualVoiceReferenceManifest(manifest, selected)).not.toThrow();
    expect(() => assertManualVoiceReferenceManifest({ ...manifest, manualVoiceReferences: null }, selected)).toThrow();
    expect(() => assertManualVoiceReferenceManifest({ ...manifest, references: { ...manifest.references, SPEAKER_00: { sourceStart: 5, sourceEnd: 8 } } }, selected)).toThrow(/sort des passages/);
  });
});
