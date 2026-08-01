import { spawn } from "child_process";
import path from "path";

const MAX_STDERR_LENGTH = 64 * 1024;
const FORCE_KILL_DELAY_MS = 5000;

export const getFfmpegExecutable = (env = process.env) =>
  String(env.FFMPEG_PATH || "ffmpeg").trim() || "ffmpeg";

export const getFfprobeExecutable = (env = process.env) => {
  const configured = String(env.FFPROBE_PATH || "").trim();
  if (configured) return configured;

  const ffmpegPath = String(env.FFMPEG_PATH || "").trim();
  if (!ffmpegPath) return "ffprobe";
  const pathApi = /^[A-Za-z]:[\\/]/.test(ffmpegPath) || ffmpegPath.includes("\\")
    ? path.win32
    : path;
  const directory = pathApi.dirname(ffmpegPath);
  const extension = pathApi.extname(ffmpegPath).toLowerCase() === ".exe"
    ? ".exe"
    : "";
  const executable = `ffprobe${extension}`;
  return directory && directory !== "."
    ? pathApi.join(directory, executable)
    : executable;
};

const createAbortError = () => {
  const error = new Error("L'encodage FFmpeg a été annulé.");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  return error;
};

const timemarkToSeconds = (timemark) => {
  const parts = String(timemark || "").split(":");
  const seconds = Number.parseFloat(parts.pop() || "0");
  const minutes = Number.parseInt(parts.pop() || "0", 10);
  const hours = Number.parseInt(parts.pop() || "0", 10);
  const total = seconds + minutes * 60 + hours * 3600;
  return Number.isFinite(total) ? total : 0;
};

const createProgressReader = ({ durationSeconds, onProgress }) => {
  let buffered = "";

  const consumeLine = (line) => {
    const separator = line.indexOf("=");
    if (separator <= 0) return;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    let elapsedSeconds = null;

    if (key === "out_time_us" || key === "out_time_ms") {
      const microseconds = Number(value);
      if (Number.isFinite(microseconds)) elapsedSeconds = microseconds / 1_000_000;
    } else if (key === "out_time") {
      elapsedSeconds = timemarkToSeconds(value);
    }

    if (elapsedSeconds === null || !onProgress) return;
    const percent = durationSeconds > 0
      ? Math.max(0, Math.min(99, Math.round((elapsedSeconds / durationSeconds) * 100)))
      : 0;
    onProgress(percent);
  };

  return {
    push(chunk) {
      buffered += chunk.toString("utf8");
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() || "";
      lines.forEach(consumeLine);
    },
    flush() {
      if (buffered) consumeLine(buffered);
      buffered = "";
    },
  };
};

export function runFfmpeg({
  args,
  durationSeconds = 0,
  onProgress,
  signal,
  ffmpegPath = getFfmpegExecutable(),
  spawnImpl = spawn,
}) {
  if (!Array.isArray(args) || args.some((argument) => typeof argument !== "string")) {
    return Promise.reject(new TypeError("Les arguments FFmpeg doivent être un tableau de chaînes."));
  }
  if (signal?.aborted) return Promise.reject(createAbortError());

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(ffmpegPath, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      reject(error);
      return;
    }

    let settled = false;
    let aborted = false;
    let stderr = "";
    let forceKillTimer = null;
    const progressReader = createProgressReader({ durationSeconds, onProgress });

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      if (forceKillTimer) clearTimeout(forceKillTimer);
      signal?.removeEventListener?.("abort", abort);
      callback(value);
    };

    const abort = () => {
      if (settled || aborted) return;
      aborted = true;
      child.kill?.("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (!settled) child.kill?.("SIGKILL");
      }, FORCE_KILL_DELAY_MS);
      forceKillTimer.unref?.();
    };

    signal?.addEventListener?.("abort", abort, { once: true });
    child.stdout?.on("data", (chunk) => progressReader.push(chunk));
    child.stderr?.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-MAX_STDERR_LENGTH);
    });
    child.on("error", (error) => settle(reject, error));
    child.on("close", (code, closeSignal) => {
      progressReader.flush();
      if (aborted) {
        settle(reject, createAbortError());
        return;
      }
      if (code === 0) {
        settle(resolve, { code, signal: closeSignal, stderr });
        return;
      }

      const message = stderr.trim()
        || `FFmpeg s'est terminé avec le code ${code ?? "N/A"}.`;
      const error = new Error(message);
      error.code = code;
      error.signal = closeSignal;
      settle(reject, error);
    });
  });
}
