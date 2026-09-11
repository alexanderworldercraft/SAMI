import { describe, expect, it, vi } from "vitest";

import {
  buildAiDubbingRuntimeInput,
  runAiDubbingCommand,
  terminateDubbingProcessTree,
} from "../services/aiDubbing/processor.js";
import * as watchdogModule from "../services/aiDubbing/generationWatchdog.js";

describe("progression du processeur de doublage IA", () => {
  it("force UTF-8 pour les processus Python sans changer l'environnement parent", async () => {
    vi.stubEnv("PYTHONIOENCODING", "cp1252");
    try {
      const output = await runAiDubbingCommand(process.execPath, ["-e", "console.log(process.env.PYTHONIOENCODING)"], { cwd: process.cwd() });
      expect(output.trim()).toBe("utf-8");
      expect(process.env.PYTHONIOENCODING).toBe("cp1252");
    } finally { vi.unstubAllEnvs(); }
  });
  it("conserve les caractères japonais répartis entre plusieurs buffers stdout", async () => {
    const output = await runAiDubbingCommand(process.execPath, ["-e",
      "const bytes=Buffer.from('はい。 Français'); process.stdout.write(bytes.subarray(0,1)); setTimeout(()=>process.stdout.write(bytes.subarray(1)),50);"],
      { cwd: process.cwd() });
    expect(output).toBe("はい。 Français");
  });
  it("conserve une erreur structurée japonaise répartie entre plusieurs buffers stderr", async () => {
    const output = "[SAMI dubbing error] " + JSON.stringify({ code: "TEST_JA", message: "はい。 Français", retryable: false }) + "\n";
    const script = `const bytes=Buffer.from(${JSON.stringify(output)}); const cut=bytes.indexOf(Buffer.from('は'))+1; process.stderr.write(bytes.subarray(0,cut)); setTimeout(()=>{process.stderr.write(bytes.subarray(cut)); process.exitCode=2;},50);`;
    await expect(runAiDubbingCommand(process.execPath, ["-e", script], { cwd: process.cwd() }))
      .rejects.toMatchObject({ code: "TEST_JA", message: "はい。 Français", retryable: false });
  });
  it("borne aussi le chargement et le contrôle hors synthèse dans une comparaison", async () => {
    await expect(runAiDubbingCommand(process.execPath, ["-e", "setInterval(()=>{},1000)"],
      { cwd: process.cwd(), timeoutMs: 100 })).rejects.toMatchObject({ code: "AI_DUBBING_RUNTIME_TIMEOUT", retryable: false });
  });
  it("interrompt le processus réel et remonte un timeout non relançable", async () => {
    const original = watchdogModule.createGenerationWatchdog;
    const spy = vi.spyOn(watchdogModule, "createGenerationWatchdog").mockImplementation(options => {
      const watchdog = original(options);
      return { clear: watchdog.clear, handle(event) {
        options.onTimeout(Object.assign(new Error("timeout vocal test"), { code: "AI_DUBBING_GENERATION_TIMEOUT", retryable: false }));
      } };
    });
    const progress = vi.fn();
    try {
      await expect(runAiDubbingCommand(process.execPath, ["-e",
        "console.error('[SAMI dubbing watchdog] {\"state\":\"start\"}'); setInterval(()=>{},1000);"],
      { cwd: process.cwd(), onProgress: progress })).rejects.toMatchObject({
        code: "AI_DUBBING_GENERATION_TIMEOUT", retryable: false,
      });
      expect(progress).toHaveBeenCalledWith({ stage: "VOICE_TIMEOUT" });
    } finally { spy.mockRestore(); }
  });

  it("cible l'arbre Windows du runtime, pas seulement son lanceur cmd.exe", () => {
    const killer = { once: vi.fn() };
    const spawn = vi.fn(() => killer);
    terminateDubbingProcessTree({ pid: 12345 }, "win32", spawn);
    expect(spawn).toHaveBeenCalledWith("taskkill.exe", ["/PID", "12345", "/T", "/F"],
      { shell: false, windowsHide: true, stdio: "ignore" });
  });

  it("reçoit les états vocaux en direct puis désarme le délai", async () => {
    const progress = vi.fn();
    const start = { id: "a".repeat(32), state: "start", kind: "sample", speaker: "SPEAKER_01", sourceStart: 164.04, progress: 51 };
    const end = { id: start.id, state: "end" };
    await runAiDubbingCommand(process.execPath, ["-e",
      `console.error(${JSON.stringify("[SAMI dubbing watchdog] " + JSON.stringify(start))}); console.error(${JSON.stringify("[SAMI dubbing watchdog] " + JSON.stringify(end))});`],
    { cwd: process.cwd(), onProgress: progress });
    expect(progress).toHaveBeenCalledWith({ progress: 51, stage: "VS_01_SYN_0" });
  });
  it("applique le début choisi uniquement à l'extrait de validation", () => {
    const job = {
      VideoID: 11,
      TargetLanguage: "fr",
      PreviewStartSeconds: 75,
      ExpectedSpeakerCount: 3,
      RejectedVoiceReferences: [{ sourceStart: 12, sourceEnd: 16 }],
      VoiceSamples: [
        { speaker: "SPEAKER_00", regenerationRequested: false },
        { speaker: "SPEAKER_01", regenerationRequested: true },
      ],
      VoiceProfileChecksum: "a".repeat(64),
      voiceProfileAbsolutePath: "/voice-profile",
      VoiceEngine: "qwen3-tts",
      VoiceModel: "chatterbox",
      VoiceModelRevision: "revision-1",
      DiarizationModel: "pyannote",
      SeparationModel: "bandit",
      PipelineVersion: "sami-dubbing-v5-aligned-quality",
      GenerationConfigHash: "b".repeat(64),
    };
    const common = { job, sourcePlaylist: "/video.m3u8", targetSubtitle: "/fr.vtt" };

    expect(buildAiDubbingRuntimeInput({ ...common, preview: true })).toMatchObject({
      phase: "preview",
      previewDurationSeconds: 45,
      previewStartSeconds: 75,
      expectedSpeakerCount: 3,
      rejectedVoiceReferences: [{ sourceStart: 12, sourceEnd: 16 }],
      regenerationTarget: "SPEAKER_01",
      voiceProfilePath: "/voice-profile",
      voiceProfileChecksum: "a".repeat(64),
      generationConfigHash: "b".repeat(64),
      models: {
        voiceEngine: "qwen3-tts",
        voiceModel: "chatterbox",
        voiceModelRevision: "revision-1",
        pipeline: "sami-dubbing-v5-aligned-quality",
      },
    });
    expect(buildAiDubbingRuntimeInput({ ...common, preview: false })).toMatchObject({
      phase: "full",
      previewStartSeconds: 0,
      expectedSpeakerCount: 3,
      voiceProfilePath: "/voice-profile",
      voiceProfileChecksum: "a".repeat(64),
    });
  });

  it("lit les jalons du runtime au fil de leur émission", async () => {
    const onProgress = vi.fn().mockResolvedValue(undefined);
    const script = [
      "console.error('[SAMI dubbing progress] {\"progress\":8,\"stage\":\"SEPARATING\"}')",
      "console.error('sortie du modèle sans rapport avec SAMI')",
      "console.error('[SAMI dubbing progress] {\"progress\":48,\"stage\":\"SYNTHESIZING\"}')",
    ].join(";");

    await runAiDubbingCommand(process.execPath, ["-e", script], {
      cwd: process.cwd(),
      onProgress,
    });

    expect(onProgress).toHaveBeenNthCalledWith(1, { progress: 8, stage: "SEPARATING" });
    expect(onProgress).toHaveBeenNthCalledWith(2, { progress: 48, stage: "SYNTHESIZING" });
  });

  it("classe un blocage qualité structuré comme déterministe", async () => {
    const script = [
      "console.error('[SAMI dubbing error] {\"code\":\"AI_DUBBING_INPUT_QUALITY_BLOCKED\",\"message\":\"Fenêtre vocale impossible.\",\"retryable\":false}')",
      "process.exit(2)",
    ].join(";");

    await expect(runAiDubbingCommand(process.execPath, ["-e", script], {
      cwd: process.cwd(),
    })).rejects.toMatchObject({
      message: "Fenêtre vocale impossible.",
      code: "AI_DUBBING_INPUT_QUALITY_BLOCKED",
      retryable: false,
    });
  });
});
