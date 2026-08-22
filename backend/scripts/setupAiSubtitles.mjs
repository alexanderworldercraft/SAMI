import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

import { buildAiSubtitleProcessEnvironment } from "../services/aiSubtitles/processEnvironment.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const root = path.resolve(process.env.SAMI_AI_SUBTITLE_ROOT || path.join(backendRoot, "var", "ai-subtitles"));
const manifestPath = path.join(root, "install.json");
const checkOnly = process.argv.includes("--check");

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: options.cwd || backendRoot,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    windowsHide: true,
    shell: false,
    env: options.env || process.env,
  });
  if (result.status !== 0) {
    const details = options.capture ? String(result.stderr || result.stdout || "").trim() : "";
    throw new Error(`${command} a échoué${details ? ` : ${details}` : ""}`);
  }
  return String(result.stdout || "").trim();
};

const commandWorks = (command, args = ["--version"]) => {
  const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true, shell: false });
  return result.status === 0;
};

const existingPython = () => {
  const configured = String(process.env.SAMI_AI_SYSTEM_PYTHON || "").trim();
  const candidates = configured
    ? [configured]
    : process.platform === "win32" ? ["py", "python"] : ["python3", "python"];
  const selected = candidates.find((candidate) => commandWorks(
    candidate,
    candidate === "py" ? ["-3", "--version"] : ["--version"]
  ));
  if (!selected) throw new Error("Python 3 est requis pour installer le runtime IA.");
  return { command: selected, prefix: selected === "py" ? ["-3"] : [] };
};

const detectEngine = () => {
  const requested = String(process.env.SAMI_AI_SUBTITLE_ENGINE || "auto").trim().toLowerCase();
  const supported = new Set([
    "faster-whisper",
    "whisper.cpp-metal",
    "whisper.cpp-vulkan",
  ]);
  if (requested !== "auto") {
    if (!supported.has(requested)) {
      throw new Error(`SAMI_AI_SUBTITLE_ENGINE invalide : ${requested}`);
    }
    return requested;
  }
  if (commandWorks("nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"])) {
    return "faster-whisper";
  }
  if (process.platform === "darwin") return "whisper.cpp-metal";
  if (process.platform === "linux") return "whisper.cpp-vulkan";
  throw new Error("Aucun moteur IA automatique n'est disponible sur cette plateforme.");
};

const assertWhisperCppBuildTools = (engine) => {
  if (!engine.startsWith("whisper.cpp")) return;
  const missingBuildTools = ["git", "cmake"].filter((command) => !commandWorks(command));
  if (missingBuildTools.length === 0) return;
  const macosHint = process.platform === "darwin" && commandWorks("brew")
    ? ` Installez ${missingBuildTools.join(" et ")} avec : brew install ${missingBuildTools.join(" ")}`
    : "";
  throw new Error(
    `${missingBuildTools.join(" et ")} ${missingBuildTools.length > 1 ? "sont requis" : "est requis"} pour compiler whisper.cpp.${macosHint}`
  );
};

const findWhisperExecutable = (repo) => {
  const candidates = [
    path.join(repo, "build", "bin", process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli"),
    path.join(repo, "build", "bin", "Release", "whisper-cli.exe"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
};

const status = () => {
  if (!fs.existsSync(manifestPath)) {
    console.log("Runtime IA non installé. Exécutez npm run setup:ai.");
    process.exitCode = 1;
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const required = [manifest.pythonPath, manifest.modelPath, manifest.translationModelPath];
  if (manifest.whisperCppPath) required.push(manifest.whisperCppPath);
  const missing = required.filter((item) => !item || !fs.existsSync(item));
  let probe = null;
  if (missing.length === 0) {
    try {
      probe = JSON.parse(run(manifest.pythonPath, [
        path.join(backendRoot, "scripts", "ai", "worker.py"),
        "--probe",
        "--manifest", manifestPath,
      ], {
        capture: true,
        env: buildAiSubtitleProcessEnvironment({ install: manifest }),
      }));
    } catch (error) {
      probe = { ready: false, error: error.message };
    }
  }
  const installed = missing.length === 0 && probe?.ready === true;
  console.log(JSON.stringify({ installed, missing, probe, ...manifest }, null, 2));
  if (!installed) process.exitCode = 1;
};

if (checkOnly) {
  status();
} else {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const systemPython = existingPython();
  const venvRoot = path.join(root, "venv");
  const pythonPath = process.platform === "win32"
    ? path.join(venvRoot, "Scripts", "python.exe")
    : path.join(venvRoot, "bin", "python");
  if (!fs.existsSync(pythonPath)) {
    run(systemPython.command, [...systemPython.prefix, "-m", "venv", venvRoot]);
  }
  const engine = detectEngine();
  assertWhisperCppBuildTools(engine);
  run(pythonPath, ["-m", "pip", "install", "--upgrade", "pip"]);
  run(pythonPath, ["-m", "pip", "install", "-r", path.join(backendRoot, "scripts", "ai", "requirements.txt")]);
  const torchArgs = ["-m", "pip", "install", "torch>=2.5,<3"];
  const configuredTorchIndex = String(process.env.SAMI_AI_TORCH_INDEX_URL || "").trim();
  if (configuredTorchIndex) {
    torchArgs.push("--index-url", configuredTorchIndex);
  } else if (process.platform === "linux" && engine !== "faster-whisper") {
    torchArgs.push("--index-url", "https://download.pytorch.org/whl/cpu");
  }
  run(pythonPath, torchArgs);
  let cudaLibraryPaths = [];
  if (engine === "faster-whisper") {
    run(pythonPath, ["-m", "pip", "install", "faster-whisper>=1.1,<2"]);
    if (process.platform === "linux") {
      run(pythonPath, [
        "-m", "pip", "install",
        "nvidia-cublas-cu12",
        "nvidia-cudnn-cu12==9.*",
      ]);
      cudaLibraryPaths = JSON.parse(run(pythonPath, [
        "-c",
        [
          "import json",
          "import nvidia.cublas.lib",
          "import nvidia.cudnn.lib",
          "print(json.dumps([str(next(iter(nvidia.cublas.lib.__path__))), str(next(iter(nvidia.cudnn.lib.__path__)))]))",
        ].join("; "),
      ], { capture: true }));
    }
  }

  const model = String(process.env.SAMI_AI_SUBTITLE_MODEL || "large-v3").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(model)) {
    throw new Error("SAMI_AI_SUBTITLE_MODEL contient une valeur invalide.");
  }
  const translationModel = "facebook/nllb-200-distilled-600M";
  const downloaded = JSON.parse(run(pythonPath, [
    path.join(backendRoot, "scripts", "ai", "download_models.py"),
    "--root", root,
    "--engine", engine === "faster-whisper" ? "faster-whisper" : "whisper.cpp",
    "--whisper-model", model,
    "--translation-model", translationModel,
  ], { capture: true }));

  let whisperCppPath = null;
  let modelPath = downloaded.modelPath || null;
  if (engine.startsWith("whisper.cpp")) {
    const repo = path.join(root, "whisper.cpp");
    if (!fs.existsSync(path.join(repo, ".git"))) {
      run("git", ["clone", "--depth", "1", "https://github.com/ggml-org/whisper.cpp.git", repo]);
    }
    const buildArgs = ["-S", repo, "-B", path.join(repo, "build"), "-DCMAKE_BUILD_TYPE=Release"];
    if (engine === "whisper.cpp-vulkan") buildArgs.push("-DGGML_VULKAN=ON");
    if (engine === "whisper.cpp-metal") buildArgs.push("-DGGML_METAL=ON");
    run("cmake", buildArgs);
    run("cmake", ["--build", path.join(repo, "build"), "--config", "Release", "-j", String(Math.max(1, os.cpus().length - 1))]);
    whisperCppPath = findWhisperExecutable(repo);
    const downloadScript = path.join(repo, "models", "download-ggml-model.sh");
    if (!commandWorks("bash")) throw new Error("bash est requis pour télécharger le modèle whisper.cpp.");
    run("bash", [downloadScript, model], { cwd: repo });
    modelPath = path.join(repo, "models", `ggml-${model}.bin`);
  }

  const device = engine === "faster-whisper"
    ? "cuda"
    : engine === "whisper.cpp-metal" ? "metal" : "vulkan";
  const manifest = {
    schemaVersion: 1,
    installedAt: new Date().toISOString(),
    engine,
    device,
    computeType: device === "cuda" ? "float16" : "int8",
    model,
    modelPath,
    whisperCppPath,
    translationModel,
    translationModelPath: downloaded.translationModelPath,
    translationDevice: device === "cuda" ? "cuda" : device === "metal" ? "mps" : "cpu",
    pythonPath,
    cudaLibraryPaths,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  console.log(`Runtime IA installé dans ${root}.`);
  status();
}
