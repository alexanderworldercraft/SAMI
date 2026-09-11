import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { getAiDubbingRuntimeStatus } from "../services/aiDubbing/config.js";
import { getAiDubbingProfile } from "../services/aiDubbing/profiles.js";

const temporaryRoots = [];
const transferEnv = {
  SAMI_INSTANCE_ROLE: "clone",
  SAMI_INSTANCE_ID: "sami-clone-ai-dubbing-test",
  SAMI_PRIMARY_BASE_URL: "http://127.0.0.1:1895",
  SAMI_TRANSFER_SHARED_SECRET: "ai-dubbing-test-secret-with-32-bytes-minimum",
  SAMI_AI_DUBBING_DIARIZATION_MODEL: "pyannote-speaker-diarization-community-1",
  SAMI_AI_DUBBING_PIPELINE_VERSION: "sami-dubbing-v5-aligned-quality",
};

const temporaryRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sami-ai-dubbing-config-"));
  temporaryRoots.push(root);
  return root;
};

afterEach(() => {
  temporaryRoots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});

describe("configuration du runtime de doublage IA", () => {
  it("ajoute R5-R4 sans modifier le contrat R5-R3 ni ses contrôles", () => {
    const previous = getAiDubbingProfile("sami-dubbing-v5-japanese-bounded-r5-r3");
    const next = getAiDubbingProfile("sami-dubbing-v5-english-identity-r5-r4");
    expect(previous.generationConfigHash).toBe("2e5cddc63b77895b7f5d7a45089814b1aa020e44e3e1c4407d2bcbca0eb3feaf");
    expect(next.generationConfigHash).toBe("0086594bd5b648717f336f68e4acb52b05158873d32c96c4c0f499acec8084d7");
    const { schemaVersion, englishVoice, ...inherited } = next.generationConfig;
    const { schemaVersion: oldSchema, ...oldConfig } = previous.generationConfig;
    expect(inherited).toEqual(oldConfig);
    expect(schemaVersion).toBe(oldSchema + 1);
    expect(englishVoice.promptPolicy).toBe("qwen-speaker-embedding-only-en-v1");
  });
  it("reste indisponible sans manifeste d'installation", () => {
    const root = temporaryRoot();
    const command = path.join(root, "runtime");
    fs.writeFileSync(command, "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    expect(getAiDubbingRuntimeStatus({
      ...transferEnv,
      SAMI_AI_DUBBING_ENABLED: "true",
      SAMI_AI_DUBBING_COMMAND: command,
      SAMI_AI_DUBBING_ROOT: root,
    })).toMatchObject({ ready: false, installReady: false });
  });

  it("est prêt uniquement avec l'exécutable, Python et les poids locaux", () => {
    const root = temporaryRoot();
    const command = path.join(root, "runtime");
    const pythonPath = path.join(root, "venv", "bin", "python");
    const chatterboxPath = path.join(root, "models", "chatterbox");
    const banditPath = path.join(root, "models", "bandit.ckpt");
    const qualityPath = path.join(root, "models", "quality");
    fs.mkdirSync(path.dirname(pythonPath), { recursive: true });
    fs.mkdirSync(chatterboxPath, { recursive: true });
    fs.mkdirSync(path.dirname(banditPath), { recursive: true });
    fs.mkdirSync(qualityPath, { recursive: true });
    fs.writeFileSync(command, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    fs.writeFileSync(pythonPath, "python");
    fs.writeFileSync(banditPath, "weights");
    fs.writeFileSync(path.join(root, "install.json"), JSON.stringify({
      offline: true,
      pythonPath,
      separationRequired: true,
      singleSpeakerFallback: true,
      models: {
        chatterbox: { path: chatterboxPath },
        bandit: { path: banditPath, license: "CC-BY-SA-4.0" },
        quality: { path: qualityPath, license: "MIT" },
      },
      pending: { diarization: "Acceptation requise." },
    }));

    expect(getAiDubbingRuntimeStatus({
      ...transferEnv,
      SAMI_AI_DUBBING_ENABLED: "true",
      SAMI_AI_DUBBING_COMMAND: command,
      SAMI_AI_DUBBING_ROOT: root,
    })).toMatchObject({
      ready: true,
      installReady: true,
      capabilities: {
        offline: true,
        singleSpeakerFallback: true,
        separation: { ready: true, license: "CC-BY-SA-4.0" },
        diarization: { ready: false },
      },
    });
  });

  it("exige l'environnement Pyannote isolé quand la diarisation multi-voix est activée", () => {
    const root = temporaryRoot();
    const command = path.join(root, "runtime");
    const pythonPath = path.join(root, "venv", "bin", "python");
    const diarizationPythonPath = path.join(root, "diarization-venv", "bin", "python");
    const diarizationScript = path.join(root, "diarization.py");
    const chatterboxPath = path.join(root, "models", "chatterbox");
    const diarizationPath = path.join(root, "models", "pyannote");
    const qualityPath = path.join(root, "models", "quality");
    fs.mkdirSync(path.dirname(pythonPath), { recursive: true });
    fs.mkdirSync(path.dirname(diarizationPythonPath), { recursive: true });
    fs.mkdirSync(chatterboxPath, { recursive: true });
    fs.mkdirSync(diarizationPath, { recursive: true });
    fs.mkdirSync(qualityPath, { recursive: true });
    fs.writeFileSync(command, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    fs.writeFileSync(pythonPath, "python");
    fs.writeFileSync(diarizationPythonPath, "python");
    fs.writeFileSync(diarizationScript, "python");
    fs.writeFileSync(path.join(root, "install.json"), JSON.stringify({
      offline: true,
      pythonPath,
      diarizationRequired: true,
      diarizationPythonPath,
      diarizationScript,
      separationRequired: false,
      singleSpeakerFallback: true,
      models: {
        chatterbox: { path: chatterboxPath },
        diarization: { path: diarizationPath, license: "CC-BY-4.0" },
        quality: { path: qualityPath, license: "MIT" },
      },
    }));

    const status = getAiDubbingRuntimeStatus({
      ...transferEnv,
      SAMI_AI_DUBBING_ENABLED: "true",
      SAMI_AI_DUBBING_COMMAND: command,
      SAMI_AI_DUBBING_ROOT: root,
    });

    expect(status).toMatchObject({
      ready: true,
      installReady: true,
      capabilities: {
        diarization: {
          ready: true,
          model: "pyannote-speaker-diarization-community-1",
          license: "CC-BY-4.0",
          offline: true,
        },
      },
    });

    fs.rmSync(diarizationPythonPath);
    expect(getAiDubbingRuntimeStatus({
      ...transferEnv,
      SAMI_AI_DUBBING_ENABLED: "true",
      SAMI_AI_DUBBING_COMMAND: command,
      SAMI_AI_DUBBING_ROOT: root,
    })).toMatchObject({ ready: false, installReady: false });
  });

  it("n'annonce V6 prêt que lorsque Sortformer local est installé", () => {
    const root = temporaryRoot();
    const command = path.join(root, "runtime");
    const pythonPath = path.join(root, "venv", "bin", "python");
    const diarizationPythonPath = path.join(root, "diarization-venv", "bin", "python");
    const diarizationScript = path.join(root, "diarization.py");
    const sortformerPythonPath = path.join(root, "sortformer-venv", "bin", "python");
    const sortformerScript = path.join(root, "sortformer.py");
    const voicePath = path.join(root, "models", "voice");
    const qualityPath = path.join(root, "models", "quality");
    const diarizationPath = path.join(root, "models", "pyannote");
    const sortformerPath = path.join(root, "models", "sortformer.nemo");
    [
      path.dirname(pythonPath),
      path.dirname(diarizationPythonPath),
      path.dirname(sortformerPythonPath),
      voicePath,
      qualityPath,
      diarizationPath,
    ].forEach((directory) => fs.mkdirSync(directory, { recursive: true }));
    [
      command,
      pythonPath,
      diarizationPythonPath,
      diarizationScript,
      sortformerPythonPath,
      sortformerScript,
      sortformerPath,
    ].forEach((filename) => fs.writeFileSync(filename, "runtime", { mode: 0o755 }));
    fs.writeFileSync(path.join(root, "install.json"), JSON.stringify({
      offline: true,
      pythonPath,
      diarizationRequired: true,
      diarizationPythonPath,
      diarizationScript,
      hybridDiarizationRequired: true,
      sortformerRuntime: "native",
      sortformerPythonPath,
      sortformerScript,
      separationRequired: false,
      models: {
        voice: { path: voicePath },
        quality: { path: qualityPath },
        diarization: { path: diarizationPath },
        sortformer: {
          hostPath: sortformerPath,
          license: "CC-BY-NC-4.0",
          nonCommercialOnly: true,
        },
      },
    }));

    const hybridEnv = {
      ...transferEnv,
      SAMI_AI_DUBBING_ENABLED: "true",
      SAMI_AI_DUBBING_COMMAND: command,
      SAMI_AI_DUBBING_ROOT: root,
      SAMI_AI_DUBBING_PIPELINE_VERSION: "sami-dubbing-v6-clean-phrases-r9-r1",
      SAMI_AI_DUBBING_DIARIZATION_MODEL:
        "pyannote-speaker-diarization-community-1+nvidia-diar-sortformer-4spk-v1",
    };
    expect(getAiDubbingRuntimeStatus(hybridEnv)).toMatchObject({
      ready: true,
      installReady: true,
      capabilities: {
        sortformer: {
          ready: true,
          nonCommercialOnly: true,
          maxSpeakersPerWindow: 4,
        },
      },
    });

    fs.rmSync(sortformerPath);
    expect(getAiDubbingRuntimeStatus(hybridEnv)).toMatchObject({
      ready: false,
      installReady: false,
    });
  });

  it("refuse un nom de profil inconnu au lieu de mélanger des réglages", () => {
    expect(() => getAiDubbingRuntimeStatus({
      ...transferEnv,
      SAMI_AI_DUBBING_PIPELINE_VERSION: "sami-dubbing-profil-inexistant",
    })).toThrow(/profil de doublage IA inconnu/i);
  });
});
