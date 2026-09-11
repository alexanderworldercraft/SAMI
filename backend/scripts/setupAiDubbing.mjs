import fs from "fs";
import crypto from "crypto";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

import { buildWindowsTorchIndex } from "./ai/torch_index.mjs";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = path.resolve(
  process.env.SAMI_AI_DUBBING_ROOT || path.join(backendRoot, "var", "ai-dubbing")
);
const scriptsRoot = path.join(backendRoot, "scripts", "ai-dubbing");
const runtimeCommand = path.join(scriptsRoot, process.platform === "win32" ? "runtime.cmd" : "runtime");
const runtimeScript = path.join(scriptsRoot, "runtime.py");
const manifestPath = path.join(runtimeRoot, "install.json");
const checkOnly = process.argv.includes("--check");
const smokeTest = process.argv.includes("--smoke-test");
const setupDiarization = process.argv.includes("--setup-diarization");
const setupSortformer = process.argv.includes("--setup-sortformer");
const skipBandit = process.argv.includes("--skip-bandit");
const voiceEngine = String(process.env.SAMI_AI_DUBBING_VOICE_ENGINE || "qwen3-tts").trim().toLowerCase();
const voiceModel = String(
  process.env.SAMI_AI_DUBBING_VOICE_MODEL || "Qwen/Qwen3-TTS-12Hz-1.7B-Base"
).trim();
const voiceModelRevision = String(process.env.SAMI_AI_DUBBING_VOICE_MODEL_REVISION || "").trim();

const BANDIT_ADAPTER_REVISION = "d45cdec634bf1ee01cdd2acea74a2d100e639c8a";
const CHATTERBOX_REVISION = "5de7a54aa4e5e2baadb0182dde554908b48b85c2";
const PERTH_REVISION = "ce86c49d029f42272c1902eccb675556b9ed2330";
const BANDIT_ADAPTER = `${process.platform === "darwin" ? "bandit-infer[mlx]" : "bandit-infer"} @ git+https://github.com/openmirlab/bandit-infer.git@${BANDIT_ADAPTER_REVISION}`;
const DIARIZATION_MODEL_FILES = [
  "config.yaml",
  "segmentation/pytorch_model.bin",
  "embedding/pytorch_model.bin",
  "plda/plda.npz",
  "plda/xvec_transform.npz",
];
const SORTFORMER_REVISION = "9f17b10df44c0a4c8f3c86fbddc9ee2d6ab9ac08";
const SORTFORMER_NEMO_VERSION = "2.7.3";

const sha256File = (filename) => {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filename));
  return hash.digest("hex");
};

const processEnvironment = () => ({
  ...process.env,
  SAMI_AI_DUBBING_ROOT: runtimeRoot,
  HF_HOME: path.join(runtimeRoot, "cache", "huggingface"),
  BANDIT_INFER_WEIGHTS: path.join(runtimeRoot, "models", "bandit"),
  HF_HUB_DISABLE_TELEMETRY: "1",
  DO_NOT_TRACK: "1",
  TOKENIZERS_PARALLELISM: "false",
  PYANNOTE_METRICS_ENABLED: "0",
});

const run = (command, args, { capture = false, env = processEnvironment() } = {}) => {
  const result = spawnSync(command, args, {
    cwd: backendRoot,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
    windowsHide: true,
    shell: false,
    env,
  });
  if (result.status !== 0) {
    const details = capture ? String(result.stderr || result.stdout || "").trim() : "";
    throw new Error(`${command} a échoué${details ? ` : ${details}` : ""}`);
  }
  return String(result.stdout || "").trim();
};

const parseLastJsonLine = (output) => {
  const lines = String(output || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Certains modèles écrivent un message de chargement avant le JSON final.
    }
  }
  throw new Error(`Le runtime n'a renvoyé aucun résultat JSON valide : ${String(output).slice(-1000)}`);
};

const commandWorks = (command, args = ["--version"]) =>
  spawnSync(command, args, { encoding: "utf8", shell: false }).status === 0;

const detectWindowsTorchIndex = () => {
  const result = spawnSync("nvidia-smi", [], {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  const match = String(result.stdout || result.stderr || "")
    .match(/CUDA Version:\s*([0-9]+\.[0-9]+)/i);
  return buildWindowsTorchIndex(match?.[1]);
};

const installTorchRuntime = (python) => {
  const args = ["-m", "pip", "install", "torch>=2.5,<3", "torchaudio>=2.5,<3"];
  const configured = String(process.env.SAMI_AI_TORCH_INDEX_URL || "").trim();
  const automatic = process.platform === "win32" ? detectWindowsTorchIndex() : "";
  const index = configured || automatic;
  if (index) args.push("--index-url", index);
  run(python, args);
};

const systemPython = () => {
  const configured = String(process.env.SAMI_AI_SYSTEM_PYTHON || "").trim();
  const candidates = configured
    ? [configured]
    : process.platform === "darwin"
      ? ["/opt/homebrew/bin/python3.12", "python3.12", "/opt/homebrew/bin/python3.11", "python3.11", "python3"]
      : ["python3.12", "python3.11", "python"];
  const selected = candidates.find((candidate) => commandWorks(candidate));
  if (!selected) throw new Error("Python 3.12 (ou 3.11) est requis pour le doublage IA local.");
  const version = run(selected, ["-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"], { capture: true });
  if (!new Set(["3.11", "3.12"]).has(version)) {
    throw new Error(`Python 3.12 (ou 3.11) est requis ; version détectée : ${version}.`);
  }
  return selected;
};

const pythonPath = process.platform === "win32"
  ? path.join(runtimeRoot, "venv", "Scripts", "python.exe")
  : path.join(runtimeRoot, "venv", "bin", "python");
const diarizationVenv = path.join(runtimeRoot, "diarization-venv");
const diarizationPythonPath = process.platform === "win32"
  ? path.join(diarizationVenv, "Scripts", "python.exe")
  : path.join(diarizationVenv, "bin", "python");
const diarizationScript = path.join(scriptsRoot, "diarization.py");
const diarizationModelPath = path.join(
  runtimeRoot,
  "models",
  "pyannote-speaker-diarization-community-1"
);
const sortformerVenv = path.join(runtimeRoot, "sortformer-venv");
const sortformerPythonPath = process.platform === "win32"
  ? path.join(sortformerVenv, "Scripts", "python.exe")
  : path.join(sortformerVenv, "bin", "python");
const sortformerScript = path.join(scriptsRoot, "sortformer.py");
const sortformerModelRoot = path.join(runtimeRoot, "models", "nvidia-diar-sortformer-4spk-v1");
const sortformerModelPath = path.join(sortformerModelRoot, "diar_sortformer_4spk-v1.nemo");

const wslPath = (filename) => run("wsl.exe", ["wslpath", "-a", "-u", filename], { capture: true });
const wslExec = (python, args, options = {}) => run(
  "wsl.exe", ["--exec", python, ...args], options
);

const probe = () => {
  if (!fs.existsSync(pythonPath) || !fs.existsSync(manifestPath)) {
    return { ready: false, error: "Runtime ou manifeste absent." };
  }
  try {
    return parseLastJsonLine(run(pythonPath, [runtimeScript, "--probe"], { capture: true }));
  } catch (error) {
    return { ready: false, error: error.message };
  }
};

if (checkOnly) {
  const result = probe();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 1;
} else if (smokeTest) {
  const result = parseLastJsonLine(run(pythonPath, [runtimeScript, "--smoke-test"], {
    capture: true,
    env: {
      ...processEnvironment(),
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
    },
  }));
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 1;
} else if (setupDiarization) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Installez d'abord le runtime de doublage avec npm run setup:ai-dubbing.");
  }
  if (!fs.existsSync(path.join(diarizationModelPath, "config.yaml"))) {
    throw new Error(
      `Le modèle Community-1 doit être téléchargé dans ${diarizationModelPath}.`
    );
  }
  if (!fs.existsSync(diarizationPythonPath)) {
    run(systemPython(), ["-m", "venv", diarizationVenv]);
  }
  run(diarizationPythonPath, ["-m", "pip", "install", "--upgrade", "pip", "setuptools<81", "wheel"]);
  if (process.platform === "win32") installTorchRuntime(diarizationPythonPath);
  run(diarizationPythonPath, [
    "-m", "pip", "install",
    ...(process.platform === "win32" ? [] : ["torch==2.8.0", "torchaudio==2.8.0"]),
    "torchcodec==0.7.0",
    "pyannote.audio==4.0.0",
    "soundfile>=0.12,<1",
  ]);
  const versions = parseLastJsonLine(run(diarizationPythonPath, [
    "-c",
    "import importlib.metadata as m,json; print(json.dumps({n:m.version(n) for n in ['pyannote-audio','torch','torchaudio','torchcodec','soundfile']}))",
  ], { capture: true }));
  const mainRuntimeVersions = parseLastJsonLine(run(pythonPath, [
    "-c",
    "import importlib.metadata as m,json; print(json.dumps({n:m.version(n) for n in ['torch','torchaudio']}))",
  ], { capture: true }));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const pending = { ...(manifest.pending || {}) };
  const mainPackages = Object.fromEntries(
    Object.entries(manifest.packages || {}).filter(
      ([name]) => !["pyannote-audio", "torchcodec"].includes(name)
    )
  );
  delete pending.diarization;
  const updated = {
    ...manifest,
    diarizationRequired: true,
    diarizationPythonPath,
    diarizationScript,
    packages: { ...mainPackages, ...mainRuntimeVersions },
    diarizationPackages: versions,
    models: {
      ...(manifest.models || {}),
      diarization: {
        repo: "pyannote/speaker-diarization-community-1",
        path: diarizationModelPath,
        license: "CC-BY-4.0",
        files: Object.fromEntries(DIARIZATION_MODEL_FILES.map((relativePath) => [
          relativePath,
          sha256File(path.join(diarizationModelPath, relativePath)),
        ])),
      },
    },
    pending,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
  const result = probe();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready || result.components?.diarization?.ready !== true) {
    throw new Error(result.error || "Pyannote Community-1 ne passe pas le contrôle local.");
  }
} else if (setupSortformer) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error("Installez d'abord le runtime de doublage avec npm run setup:ai-dubbing.");
  }
  if (!fs.existsSync(sortformerModelPath)) {
    throw new Error(
      `Le checkpoint diar_sortformer_4spk-v1.nemo doit être téléchargé dans ${sortformerModelRoot}.`
    );
  }

  let runtimeKind = "native";
  let installedPython = sortformerPythonPath;
  let installedScript = sortformerScript;
  let installedModel = sortformerModelPath;
  const installPackages = (python, runner = run) => {
    runner(python, ["-m", "pip", "install", "--upgrade", "pip", "setuptools<81", "wheel", "Cython", "packaging"]);
    const torchArgs = ["-m", "pip", "install", "torch>=2.5,<3", "torchaudio>=2.5,<3"];
    const torchIndex = String(process.env.SAMI_AI_TORCH_INDEX_URL || "").trim();
    if (torchIndex) torchArgs.push("--index-url", torchIndex);
    runner(python, torchArgs);
    runner(python, ["-m", "pip", "install", `nemo_toolkit[asr]==${SORTFORMER_NEMO_VERSION}`]);
  };

  if (process.platform === "win32") {
    runtimeKind = "wsl";
    const wslSystemPython = String(process.env.SAMI_AI_SORTFORMER_WSL_PYTHON || "python3").trim();
    const wslVenv = wslPath(sortformerVenv);
    installedPython = `${wslVenv}/bin/python`;
    installedScript = wslPath(sortformerScript);
    installedModel = wslPath(sortformerModelPath);
    wslExec(wslSystemPython, ["-m", "venv", wslVenv]);
    installPackages(installedPython, (python, args) => wslExec(python, args));
  } else {
    if (!fs.existsSync(sortformerPythonPath)) {
      run(systemPython(), ["-m", "venv", sortformerVenv]);
    }
    installPackages(sortformerPythonPath);
  }

  const versions = parseLastJsonLine(
    runtimeKind === "wsl"
      ? wslExec(installedPython, [
        "-c",
        "import importlib.metadata as m,json; print(json.dumps({n:m.version(n) for n in ['nemo-toolkit','torch','torchaudio']}))",
      ], { capture: true })
      : run(installedPython, [
        "-c",
        "import importlib.metadata as m,json; print(json.dumps({n:m.version(n) for n in ['nemo-toolkit','torch','torchaudio']}))",
      ], { capture: true })
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const pending = { ...(manifest.pending || {}) };
  delete pending.sortformer;
  const updated = {
    ...manifest,
    hybridDiarizationRequired: true,
    sortformerRuntime: runtimeKind,
    sortformerPythonPath: installedPython,
    sortformerScript: installedScript,
    sortformerPackages: versions,
    pending,
    models: {
      ...(manifest.models || {}),
      sortformer: {
        repo: "nvidia/diar_sortformer_4spk-v1",
        revision: SORTFORMER_REVISION,
        path: runtimeKind === "wsl" ? installedModel : sortformerModelPath,
        hostPath: sortformerModelPath,
        sha256: sha256File(sortformerModelPath),
        license: "CC-BY-NC-4.0",
        nonCommercialOnly: true,
        maxSpeakersPerWindow: 4,
      },
    },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(updated, null, 2)}\n`, { mode: 0o600 });
  const result = probe();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready || result.components?.sortformer?.ready !== true) {
    throw new Error(result.error || "NVIDIA Sortformer ne passe pas le contrôle local CUDA.");
  }
} else {
  fs.mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(runtimeRoot, "cache", "huggingface"), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(runtimeRoot, "models", "bandit"), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(pythonPath)) {
    run(systemPython(), ["-m", "venv", path.join(runtimeRoot, "venv")]);
  }
  run(pythonPath, ["-m", "pip", "install", "--upgrade", "pip", "setuptools<81", "wheel"]);
  installTorchRuntime(pythonPath);
  run(pythonPath, ["-m", "pip", "install", "soundfile>=0.12,<1", "setuptools<81"]);
  run(pythonPath, ["-m", "pip", "install", "faster-whisper>=1.1,<2"]);
  if (voiceEngine === "qwen3-tts") {
    run(pythonPath, ["-m", "pip", "install", "qwen-tts"]);
  } else if (voiceEngine === "chatterbox") {
    run(pythonPath, [
      "-m", "pip", "install", "--force-reinstall", "--no-deps",
      `git+https://github.com/resemble-ai/chatterbox.git@${CHATTERBOX_REVISION}`,
    ]);
  } else {
    throw new Error(`Moteur vocal non pris en charge : ${voiceEngine}`);
  }
  run(pythonPath, [
    "-m", "pip", "install", "--force-reinstall", "--no-deps",
    `git+https://github.com/resemble-ai/Perth.git@${PERTH_REVISION}`,
  ]);
  if (!skipBandit) {
    run(pythonPath, ["-m", "pip", "install", BANDIT_ADAPTER]);
  }
  const downloaded = parseLastJsonLine(run(pythonPath, [
    path.join(scriptsRoot, "download_models.py"),
    "--root", runtimeRoot,
    "--voice-engine", voiceEngine,
    "--voice-model", voiceModel,
    ...(voiceModelRevision ? ["--voice-model-revision", voiceModelRevision] : []),
    ...(skipBandit ? ["--skip-bandit"] : []),
  ], { capture: true }));
  const packages = parseLastJsonLine(run(pythonPath, [
    "-c",
    "import importlib.metadata as m,json; names=['torch','torchaudio','transformers','resemble-perth','faster-whisper']; names += (['qwen-tts'] if m.packages_distributions().get('qwen_tts') else ['chatterbox-tts']); names += (['bandit-infer'] if m.packages_distributions().get('bandit_infer') else []); names += (['mlx'] if m.packages_distributions().get('mlx') else []); print(json.dumps({n:m.version(n) for n in names}))",
  ], { capture: true }));
  const manifest = {
    schemaVersion: 1,
    installedAt: new Date().toISOString(),
    platform: process.platform,
    architecture: process.arch,
    pythonPath,
    runtimeCommand,
    offline: true,
    singleSpeakerFallback: true,
    separationRequired: !skipBandit,
    hybridDiarizationRequired: false,
    packages,
    voiceEngine,
    voiceModel: downloaded.voice.repo,
    voiceModelRevision: downloaded.voice.revision,
    chatterboxRevision: CHATTERBOX_REVISION,
    perthRevision: PERTH_REVISION,
    adapterRevision: skipBandit ? null : BANDIT_ADAPTER_REVISION,
    models: downloaded,
    pending: {
      diarization: "pyannote Community-1 requiert l'acceptation Hugging Face et un HF_TOKEN personnel.",
      sortformer: "NVIDIA Sortformer V6 doit être téléchargé puis installé séparément (usage non commercial).",
    },
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  if (process.platform !== "win32") fs.chmodSync(runtimeCommand, 0o755);
  const result = probe();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) throw new Error(result.error || "Le runtime installé ne passe pas le contrôle de santé.");
  console.log(`Runtime de doublage IA installé dans ${runtimeRoot}.`);
}
