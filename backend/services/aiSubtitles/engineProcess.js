import fs from "fs";
import path from "path";
import { execFile } from "child_process";

import { withEncodingCapacity } from "../distributedEncoding/capacity.js";
import { assertAiSubtitleConfig } from "./config.js";
import { buildAiSubtitleProcessEnvironment } from "./processEnvironment.js";

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const TRANSLATION_QUALITY_LOG = "translation-quality-error.json";

const runPython = (config, args, { signal, timeout = 24 * 60 * 60 * 1000 } = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      config.pythonPath,
      [config.workerScript, ...args],
      {
        windowsHide: true,
        shell: false,
        signal,
        timeout,
        maxBuffer: MAX_OUTPUT_BYTES,
        env: buildAiSubtitleProcessEnvironment({ install: config.install }),
      },
      (error, stdout, stderr) => {
        if (error) {
          error.message = `${error.message}${stderr ? `: ${String(stderr).slice(-3000)}` : ""}`;
          reject(error);
          return;
        }
        resolve(String(stdout || ""));
      }
    );
  });

export async function probeAiSubtitleEngine({ config } = {}) {
  const runtimeConfig = config || assertAiSubtitleConfig();
  if (!runtimeConfig.install || !fs.existsSync(runtimeConfig.manifestPath)) {
    return {
      ready: false,
      engine: null,
      device: null,
      model: null,
      translationModel: null,
      error: "Installation IA absente. Exécutez npm run setup:ai.",
    };
  }
  try {
    const stdout = await runPython(runtimeConfig, [
      "--probe",
      "--manifest", runtimeConfig.manifestPath,
    ], { timeout: 60_000 });
    const result = JSON.parse(stdout);
    return { ...result, ready: Boolean(result.ready) };
  } catch (error) {
    return {
      ready: false,
      engine: runtimeConfig.install?.engine || null,
      device: runtimeConfig.install?.device || null,
      model: runtimeConfig.install?.model || null,
      translationModel: runtimeConfig.install?.translationModel || null,
      error: String(error?.message || error).slice(0, 4000),
    };
  }
}

export async function runAiSubtitleEngine({
  jobId,
  audioPath = null,
  transcript = null,
  transcriptionOnly = false,
  targetLanguage,
  signal,
  config,
  onProgress,
} = {}) {
  const runtimeConfig = config || assertAiSubtitleConfig();
  const workspace = path.resolve(runtimeConfig.workRoot, String(jobId));
  const prefix = `${path.resolve(runtimeConfig.workRoot)}${path.sep}`;
  if (!workspace.startsWith(prefix)) throw new TypeError("Workspace IA invalide.");
  await fs.promises.rm(workspace, { recursive: true, force: true });
  await fs.promises.mkdir(workspace, { recursive: true, mode: 0o700 });
  const inputPath = path.join(workspace, "input.json");
  const outputPath = path.join(workspace, "output.json");
  const progressPath = path.join(workspace, "progress.json");
  const diagnosticPath = path.join(workspace, TRANSLATION_QUALITY_LOG);
  await fs.promises.writeFile(inputPath, JSON.stringify({
    audioPath,
    transcript,
    transcriptionOnly,
    targetLanguage,
  }), { encoding: "utf8", mode: 0o600 });

  let completed = false;
  let progressRead = null;
  let lastProgress = "";
  const readProgress = () => {
    if (!onProgress) return Promise.resolve();
    if (progressRead) return progressRead;
    progressRead = (async () => {
      try {
        const value = await fs.promises.readFile(progressPath, "utf8");
        if (value === lastProgress) return;
        const update = JSON.parse(value);
        if (typeof update.phase !== "string" || !Number.isFinite(update.progress)) return;
        lastProgress = value;
        await onProgress({ phase: update.phase, progress: update.progress });
      } catch {
        // Le suivi ne doit pas interrompre le calcul ni exposer le contenu audio.
      }
    })().finally(() => { progressRead = null; });
    return progressRead;
  };
  const progressTimer = onProgress ? setInterval(readProgress, 1000) : null;
  progressTimer?.unref?.();
  try {
    await withEncodingCapacity(
      () => runPython(runtimeConfig, [
        "--manifest", runtimeConfig.manifestPath,
        "--input", inputPath,
        "--output", outputPath,
        "--progress", progressPath,
      ], { signal }),
      { signal }
    );
    await readProgress();
    const result = JSON.parse(await fs.promises.readFile(outputPath, "utf8"));
    completed = true;
    return result;
  } finally {
    if (progressTimer) clearInterval(progressTimer);
    await progressRead;
    if (completed || !fs.existsSync(diagnosticPath)) {
      await fs.promises.rm(workspace, { recursive: true, force: true }).catch(() => {});
    } else {
      // On failure, retain only the targeted quality report. The input can contain
      // the complete transcript and is unnecessary once the report exists.
      await Promise.all([
        fs.promises.rm(inputPath, { force: true }).catch(() => {}),
        fs.promises.rm(outputPath, { force: true }).catch(() => {}),
        fs.promises.rm(progressPath, { force: true }).catch(() => {}),
        fs.promises.rm(`${progressPath}.tmp`, { force: true }).catch(() => {}),
      ]);
    }
  }
}
