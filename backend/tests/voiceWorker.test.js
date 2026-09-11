import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

vi.mock("../services/aiDubbing/workerClient.js", () => ({ signedFetch: vi.fn() }));
vi.mock("../services/aiDubbing/commandRunner.js", () => ({ runAiDubbingCommand: vi.fn() }));
import { signedFetch } from "../services/aiDubbing/workerClient.js";
import { runAiDubbingCommand } from "../services/aiDubbing/commandRunner.js";
import { runVoiceLease, isDirectVoiceOutput } from "../services/voices/worker.js";
import { claimVoice } from "../services/voices/leases.js";

let root;
beforeEach(() => { vi.clearAllMocks(); root = fs.mkdtempSync(path.join(os.tmpdir(), "sami-voice-worker-")); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));
const reference = Buffer.from("reference test");
const lease = () => ({ id: crypto.randomUUID(), token: "lease-secret", text: "Bonjour", language: "fr", models: { pipeline: "r9" }, referenceText: "Bonjour", reference: reference.toString("base64"), referenceSha256: crypto.createHash("sha256").update(reference).digest("hex") });
describe("worker de répliques", () => {
  it("utilise la commande de doublage en phase voice et transfère la sortie signée", async () => {
    const job = lease();
    signedFetch.mockResolvedValueOnce({ lease: job }).mockResolvedValue({ ready: true });
    runAiDubbingCommand.mockImplementation(async (command, args, { cwd, timeoutMs }) => {
      expect(timeoutMs).toBe(100 * 60 * 1000);
      expect(command).toBe("/configured-dubbing");
      expect(args.slice(0, 2)).toEqual(["--phase", "voice"]);
      const input = JSON.parse(fs.readFileSync(args[3], "utf8"));
      expect(input.referenceSha256).toBe(job.referenceSha256);
      expect(fs.readFileSync(input.referencePath)).toEqual(reference);
      const audioPath = path.join(cwd, "voice.wav");
      fs.writeFileSync(audioPath, "RIFF test output");
      fs.writeFileSync(args[5], JSON.stringify({ audioPath, watermarked: true, watermarkConfidence: 0.9 }));
    });
    await runVoiceLease({ config: { workRoot: root, command: "/configured-dubbing" } });
    expect(signedFetch).toHaveBeenLastCalledWith(expect.objectContaining({ path: `/api/internal/voices/${job.id}/finish`, body: expect.objectContaining({ token: job.token, watermarked: true, watermarkConfidence: 0.9 }) }));
    expect(fs.existsSync(path.join(root, "voices", job.id))).toBe(false);
  });
  it("refuse une référence altérée avant le chargement du modèle", async () => {
    const job = { ...lease(), referenceSha256: "incorrect" };
    signedFetch.mockResolvedValueOnce({ lease: job }).mockResolvedValue({});
    await expect(runVoiceLease({ config: { workRoot: root, command: "/configured-dubbing" } })).rejects.toThrow("Empreinte");
    expect(runAiDubbingCommand).not.toHaveBeenCalled();
    expect(signedFetch).toHaveBeenLastCalledWith(expect.objectContaining({ body: expect.objectContaining({ error: expect.stringContaining("Empreinte") }) }));
  });
  it("n'exécute rien lorsque la file est vide", async () => {
    signedFetch.mockResolvedValue({ lease: null });
    await runVoiceLease({ config: { workRoot: root } });
    expect(runAiDubbingCommand).not.toHaveBeenCalled();
  });
  it("n'attribue pas de réplique à un ancien runtime ou à un worker occupé", async () => {
    const worker = { Ready: true, Role: "CLONE", Registry: { Enabled: true }, LastHeartbeatAt: new Date(), Capabilities: {} };
    const database = {
      voiceAudio: { updateMany: vi.fn(), count: vi.fn(async () => 0), findMany: vi.fn() },
      aiDubbingWorker: { findUnique: vi.fn(async () => worker) },
      aiDubbingJob: { count: vi.fn(async () => 1) }, aiSubtitleJob: { count: vi.fn(async () => 0) }, videoEncodingTask: { count: vi.fn(async () => 0) },
    };
    database.$transaction = fn => fn(database);
    expect(await claimVoice("clone", database)).toBeNull();
    expect(database.voiceAudio.findMany).not.toHaveBeenCalled();
    worker.Capabilities.voiceLibrary = 1;
    expect(await claimVoice("clone", database)).toBeNull();
    expect(database.voiceAudio.findMany).not.toHaveBeenCalled();
  });
});


describe("chemins de sortie vocale", () => {
  it("accepte les variantes Windows de casse et de séparateurs", () => {
    expect(isDirectVoiceOutput("c:/SAMI/work/job", "C:\\Sami\\work\\job\\voice.wav", path.win32)).toBe(true);
    expect(isDirectVoiceOutput("C:/SAMI/work/job", "D:/SAMI/work/job/voice.wav", path.win32)).toBe(false);
    expect(isDirectVoiceOutput("C:/SAMI/work/job", "C:/SAMI/work/job-other/voice.wav", path.win32)).toBe(false);
    expect(isDirectVoiceOutput("C:/SAMI/work/job", "C:/SAMI/work/job/../voice.wav", path.win32)).toBe(false);
    expect(isDirectVoiceOutput("C:/SAMI/work/job", "C:/SAMI/work/job/sub/voice.wav", path.win32)).toBe(false);
  });
  it.each(["canonical", "outside", "symlink"])("vérifie le chemin réel : %s", async (mode) => {
    const job = lease();
    signedFetch.mockResolvedValueOnce({ lease: job }).mockResolvedValue({});
    runAiDubbingCommand.mockImplementation(async (_command, args, { cwd }) => {
      const actual = fs.realpathSync(cwd);
      const outside = path.join(root, "outside.wav");
      let audioPath = mode === "outside" ? outside : path.join(actual, "voice.wav");
      if (mode === "symlink") {
        fs.writeFileSync(outside, "audio");
        fs.symlinkSync(outside, audioPath);
      } else fs.writeFileSync(audioPath, "audio");
      fs.writeFileSync(args[5], JSON.stringify({ audioPath, watermarked: true, watermarkConfidence: 1 }));
    });
    const work = runVoiceLease({ config: { workRoot: root, command: "/configured-dubbing" } });
    if (mode === "canonical") await expect(work).resolves.toBeUndefined();
    else await expect(work).rejects.toThrow("Sortie vocale hors du dossier autorisé");
  });
});
