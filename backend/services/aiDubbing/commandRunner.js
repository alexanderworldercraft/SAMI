import { spawn } from "child_process";
import { createGenerationWatchdog } from "./generationWatchdog.js";

const MAX_STDOUT_BYTES = 1024 * 1024;
const STDERR_TAIL_BYTES = 16 * 1024;
const RUNTIME_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const PROGRESS_PREFIX = "[SAMI dubbing progress] ";
const ERROR_PREFIX = "[SAMI dubbing error] ";
const WATCHDOG_PREFIX = "[SAMI dubbing watchdog] ";

export function terminateDubbingProcessTree(child, platform = process.platform, spawnProcess = spawn) {
  if (!child.pid) return;
  if (platform === "win32") {
    // Killing cmd.exe alone leaves Python/CUDA alive on Windows.
    const killer = spawnProcess("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      shell: false, windowsHide: true, stdio: "ignore",
    });
    killer.once("error", error => console.error("Impossible d'interrompre l'arbre du runtime de doublage :", error));
    killer.once("close", code => { if (code !== 0) console.error(`Arrêt de l'arbre du runtime non confirmé (taskkill ${code}).`); });
  } else {
    try { process.kill(-child.pid, "SIGKILL"); }
    catch (error) { if (error.code !== "ESRCH") throw error; }
  }
}

export const runAiDubbingCommand = (command, args, { cwd, onProgress, signal: abortSignal, timeoutMs = RUNTIME_TIMEOUT_MS }) => new Promise((resolve, reject) => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > RUNTIME_TIMEOUT_MS) {
    reject(new Error("Délai du runtime invalide."));
    return;
  }
  let stderrBuffer = "";
  let stderrTail = "";
  let stdout = "";
  let progressUpdates = Promise.resolve();
  let structuredFailure = null;
  let settled = false;
  let deadlineFailure = null;
  const queueProgress = (event) => {
    if (typeof onProgress !== "function") return;
    progressUpdates = progressUpdates.then(() => onProgress(event))
      .catch(error => console.warn("Progression du doublage IA non enregistrée :", error));
  };
  const windowsCommandScript = process.platform === "win32" && /\.(?:cmd|bat)$/i.test(command);
  const executable = windowsCommandScript ? (process.env.ComSpec || "cmd.exe") : command;
  const commandArgs = windowsCommandScript
    ? ["/d", "/c", "call", command, ...args]
    : args;
  const child = spawn(executable, commandArgs, {
    cwd,
    shell: false,
    windowsHide: true,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      // Redirected Python streams otherwise inherit cp1252 on Windows. Keep the
      // protocol UTF-8 regardless of the terminal's code page or parent setting.
      PYTHONIOENCODING: "utf-8",
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      HF_HUB_DISABLE_TELEMETRY: "1",
      PYANNOTE_METRICS_ENABLED: "0",
      SAMI_DUBBING_WATCHDOG_PROTOCOL: "1",
    },
  });
  // Decode across chunk boundaries: a Japanese character can span two buffers.
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  const stop = () => terminateDubbingProcessTree(child);
  const watchdog = createGenerationWatchdog({ onProgress: queueProgress, onTimeout: error => {
    deadlineFailure = error;
    console.error(error.message);
    queueProgress({ stage: "VOICE_TIMEOUT" });
    stop();
  } });
  const timeout = setTimeout(() => {
    deadlineFailure = Object.assign(new Error(`Délai global du runtime dépassé (${Math.round(timeoutMs / 1000)} s).`), { code: "AI_DUBBING_RUNTIME_TIMEOUT", retryable: false });
    stop();
  }, timeoutMs);
  const abort = stop;
  if (abortSignal?.aborted) abort();
  else abortSignal?.addEventListener("abort", abort, { once: true });
  const cleanup = () => { watchdog.clear(); abortSignal?.removeEventListener?.("abort", abort); };
  child.stdout?.on("data", (chunk) => {
    stdout = `${stdout}${String(chunk || "")}`.slice(-MAX_STDOUT_BYTES);
  });
  child.stderr?.on("data", (chunk) => {
    const text = String(chunk || "");
    stderrTail = `${stderrTail}${text}`.slice(-STDERR_TAIL_BYTES);
    stderrBuffer += text;
    const lines = stderrBuffer.split(/[\r\n]+/);
    stderrBuffer = lines.pop() || "";
    for (const line of lines) {
      const watchdogMarker = line.indexOf(WATCHDOG_PREFIX);
      if (watchdogMarker >= 0 && !deadlineFailure) {
        try { watchdog.handle(JSON.parse(line.slice(watchdogMarker + WATCHDOG_PREFIX.length))); }
        catch (error) { console.warn("Événement du superviseur vocal illisible :", error.message); }
      }
      const errorMarker = line.indexOf(ERROR_PREFIX);
      if (errorMarker >= 0) {
        try {
          structuredFailure = JSON.parse(line.slice(errorMarker + ERROR_PREFIX.length));
        } catch {
          // Le message texte final reste disponible dans la queue stderr.
        }
      }
      const marker = line.indexOf(PROGRESS_PREFIX);
      if (marker < 0 || typeof onProgress !== "function") continue;
      try {
        const event = JSON.parse(line.slice(marker + PROGRESS_PREFIX.length));
        queueProgress(event);
      } catch {
        // Le flux stderr peut contenir les barres de progression propres au modèle.
      }
    }
  });
  child.once("error", (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    cleanup();
    reject(error);
  });
  child.once("close", (code, signal) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    cleanup();
    progressUpdates.finally(() => {
      if (deadlineFailure) { reject(deadlineFailure); return; }
      if (code !== 0) {
        const failure = new Error(
          structuredFailure?.message
            ? String(structuredFailure.message)
            : `La commande de doublage a échoué (${signal ? `signal ${signal}` : `code ${code}`})${stderrTail ? ` : ${stderrTail.slice(-3000)}` : ""}`
        );
        if (structuredFailure?.code) failure.code = String(structuredFailure.code);
        if (structuredFailure?.retryable === false) failure.retryable = false;
        reject(failure);
        return;
      }
      resolve(stdout);
    });
  });
});
