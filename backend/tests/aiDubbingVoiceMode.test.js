import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const runtime = vi.hoisted(() => ({
  ready: true, active: true, voiceEngine: "qwen3-tts", voiceModel: "qwen-base", voiceModelRevision: "revision",
  pipelineVersion: "pipeline", generationConfigHash: "hash", profile: { generationConfig: {} },
}));
vi.mock("../services/aiDubbing/config.js", async importOriginal => ({
  ...await importOriginal(), getAiDubbingConfig: () => runtime, getAiDubbingRuntimeStatus: () => runtime,
}));
import { queueAiDubbingPreview, serializeAiDubbingJob } from "../services/aiDubbing/jobService.js";
import { aiDubbingWorkerMatchesJob, serializeAiDubbingLease } from "../services/aiDubbing/leaseService.js";
import { promoteAiDubbingResult } from "../services/aiDubbing/resultService.js";
import { queueReplica, serializeVoice, voicePath } from "../services/voices/library.js";
import { claimVoice, finishVoice } from "../services/voices/leases.js";

const directories = [];
afterEach(() => directories.splice(0).forEach(directory => fs.rmSync(directory, { recursive: true, force: true })));
const databaseForJob = () => ({
  video: { findFirst: vi.fn(async () => ({ VideoID: 13, VideoSubtitles: [{}] })) },
  aiDubbingJob: { findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }) => data) },
});
const request = database => ({ videoId: 13, targetLanguage: "fr", requestedByUserId: 7, database });

describe("choix du mode vocal", () => {
  it.each([[undefined, "faithful"], ["natural", "natural"], ["faithful", "faithful"]])("persiste %s et le transmet jusqu’au bail", async (voiceMode, expected) => {
    const database = databaseForJob();
    const { job } = await queueAiDubbingPreview({ ...request(database), voiceMode });
    expect(job.VoiceMode).toBe(expected);
    expect(serializeAiDubbingJob(job).voiceMode).toBe(expected);
    expect(serializeAiDubbingLease({ job, phase: "preview" }).job.models.voiceMode).toBe(expected);
    const original = { PersonneID: 4, Text: "Transcription exacte.", AuthorizedBy: 7 };
    const voiceDatabase = { voiceAudio: { findFirst: vi.fn(async () => original), create: vi.fn(async ({ data }) => data) } };
    const voice = await queueReplica({ originalId: "original", body: { title: "Extrait", text: "Bonjour", language: "fr", voiceMode }, userId: 7, database: voiceDatabase });
    expect(voice.Models.voiceMode).toBe(expected);
    expect(serializeVoice(voice).voiceMode).toBe(expected);
  });

  it.each([null, "", "other", true, {}, []])("refuse un mode invalide : %j", async voiceMode => {
    const database = databaseForJob();
    await expect(queueAiDubbingPreview({ ...request(database), voiceMode })).rejects.toMatchObject({ statusCode: 400 });
    expect(database.aiDubbingJob.create).not.toHaveBeenCalled();
  });

  it("refuse le mode fidèle sans transcription de l’original", async () => {
    const database = { voiceAudio: { findFirst: vi.fn(async () => ({ Text: "" })), create: vi.fn() } };
    await expect(queueReplica({ originalId: "original", body: { voiceMode: "faithful" }, database })).rejects.toThrow(/transcription exacte/);
    expect(database.voiceAudio.create).not.toHaveBeenCalled();
  });

  it("ne réutilise pas silencieusement un doublage actif d’un autre mode", async () => {
    const database = databaseForJob();
    database.aiDubbingJob.findFirst.mockResolvedValue({ VoiceMode: "natural" });
    await expect(queueAiDubbingPreview({ ...request(database), voiceMode: "faithful" })).rejects.toMatchObject({ statusCode: 409 });
    expect(database.aiDubbingJob.create).not.toHaveBeenCalled();
    expect((await queueAiDubbingPreview({ ...request(database), voiceMode: "natural" })).alreadyQueued).toBe(true);
  });

  it.each(["natural", "faithful"])("réserve les nouveaux doublages %s aux clones mis à jour", voiceMode => {
    const job = { PipelineVersion: "p", GenerationConfigHash: "h", VoiceEngine: "qwen3-tts", VoiceModel: "m", VoiceMode: voiceMode };
    const worker = { PipelineVersion: "p", Engine: "qwen3-tts", Model: "m", Capabilities: { profile: { generationConfigHash: "h" } } };
    expect(aiDubbingWorkerMatchesJob(worker, job)).toBe(false);
    expect(aiDubbingWorkerMatchesJob(worker, { ...job, VoiceMode: null })).toBe(true);
    worker.Capabilities.voiceModes = 1;
    expect(aiDubbingWorkerMatchesJob(worker, job)).toBe(true);
  });

  it.each(["natural", "faithful"])("réserve aussi les répliques %s aux clones mis à jour", async voiceMode => {
    const id = crypto.randomUUID();
    const reference = voicePath(id);
    directories.push(path.dirname(reference));
    fs.mkdirSync(path.dirname(reference), { recursive: true }); fs.writeFileSync(reference, "reference");
    const worker = { Ready: true, Role: "CLONE", Registry: { Enabled: true }, LastHeartbeatAt: new Date(), Engine: runtime.voiceEngine, Model: runtime.voiceModel, ModelRevision: runtime.voiceModelRevision, PipelineVersion: runtime.pipelineVersion, Capabilities: { voiceLibrary: 1, profile: { generationConfigHash: "hash" } } };
    const row = { VoiceAudioID: crypto.randomUUID(), OriginalID: id, Original: { Text: "Source" }, Kind: "AI", Models: { ...runtime, pipeline: runtime.pipelineVersion, voiceMode } };
    const database = {
      voiceAudio: { updateMany: vi.fn(async () => ({ count: 1 })), count: vi.fn(async () => 0), findMany: vi.fn(async () => [row]) },
      aiDubbingWorker: { findUnique: vi.fn(async () => worker) },
      aiDubbingJob: { count: vi.fn(async () => 0) }, aiSubtitleJob: { count: vi.fn(async () => 0) }, videoEncodingTask: { count: vi.fn(async () => 0) },
    };
    database.$transaction = fn => fn(database);
    expect(await claimVoice("worker", database)).toBeNull();
    worker.Capabilities.voiceModes = 1;
    expect(await claimVoice("worker", database)).toMatchObject({ models: { voiceMode }, referenceText: "Source" });
  });

  it.each([undefined, "natural"])("refuse un résultat fidèle dont le mode annoncé vaut %s", async received => {
    await expect(promoteAiDubbingResult({ job: { VoiceMode: "faithful" }, result: { voiceMode: received } })).rejects.toThrow(/mode vocal/);
    const database = { voiceAudio: { findFirst: vi.fn(async () => ({ Kind: "AI", Models: { voiceMode: "faithful" } })) } };
    await expect(finishVoice("worker", "id", { token: "token", voiceMode: received }, database)).rejects.toThrow(/mode vocal/);
  });
});
