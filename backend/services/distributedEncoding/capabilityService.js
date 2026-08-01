import { execFile } from "child_process";
import fs from "fs";
import os from "os";

import {
  getFfmpegExecutable,
  getFfprobeExecutable,
} from "./ffmpeg/index.js";
import { distributedEncodingError } from "./error.js";

const DEFAULT_MAX_NOMINAL_HEIGHT = 4_320;
const MAX_ERROR_LENGTH = 4_000;

const errorMessage = (error) => String(
  error?.message || error || "Erreur de détection inconnue."
).slice(0, MAX_ERROR_LENGTH);

const runExecFile = (execFileImpl, executable, args) => new Promise(
  (resolve, reject) => {
    execFileImpl(
      executable,
      args,
      {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        timeout: 20_000,
        windowsHide: true,
        shell: false,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve(String(stdout || ""));
      }
    );
  }
);

const diskFreeBytes = async (root, fsModule = fs) => {
  if (typeof fsModule.promises.statfs !== "function") return null;
  try {
    await fsModule.promises.mkdir(root, { recursive: true });
    const stats = await fsModule.promises.statfs(root);
    const availableBlocks = stats.bavail ?? stats.bfree;
    if (availableBlocks === undefined || stats.bsize === undefined) return null;
    return (BigInt(availableBlocks) * BigInt(stats.bsize)).toString();
  } catch {
    return null;
  }
};

const fulfilledValue = (result) =>
  result.status === "fulfilled" ? result.value : "";

/**
 * Sonde les outils réellement utilisés par le pipeline. FFprobe est facultatif
 * sur un clone, mais obligatoire sur le primary qui valide les artefacts reçus.
 */
export async function collectDistributedEncodingWorkerCapabilities({
  config,
  execFileImpl = execFile,
  fsModule = fs,
  osModule = os,
  ffmpegPath = getFfmpegExecutable(),
  ffprobePath = getFfprobeExecutable(),
  requireFfprobe = false,
  maxNominalHeight = DEFAULT_MAX_NOMINAL_HEIGHT,
} = {}) {
  const probes = await Promise.allSettled([
    runExecFile(execFileImpl, ffmpegPath, ["-version"]),
    runExecFile(execFileImpl, ffmpegPath, ["-hide_banner", "-encoders"]),
    ...(requireFfprobe
      ? [runExecFile(execFileImpl, ffprobePath, ["-version"])]
      : []),
  ]);
  const versionOutput = fulfilledValue(probes[0]);
  const encodersOutput = fulfilledValue(probes[1]);
  const ffprobeOutput = requireFfprobe ? fulfilledValue(probes[2]) : "";
  const firstVersionLine = versionOutput.split(/\r?\n/).find(Boolean) || null;
  const firstFfprobeLine = ffprobeOutput.split(/\r?\n/).find(Boolean) || null;
  const supportsH264 = /(?:^|\s)libx264(?:\s|$)/m.test(encodersOutput);
  const supportsAac = /(?:^|\s)aac(?:\s|$)/m.test(encodersOutput);
  const errors = [];
  if (probes[0].status === "rejected") {
    errors.push(`FFmpeg indisponible: ${errorMessage(probes[0].reason)}`);
  } else if (probes[1].status === "rejected") {
    errors.push(`Encodeurs FFmpeg indétectables: ${errorMessage(probes[1].reason)}`);
  }
  if (requireFfprobe && probes[2].status === "rejected") {
    errors.push(`FFprobe indisponible: ${errorMessage(probes[2].reason)}`);
  }

  const cpuCount = Math.max(1, osModule.cpus?.().length || 1);
  const [cacheFreeBytes, stagingFreeBytes] = await Promise.all([
    diskFreeBytes(config.cacheRoot, fsModule),
    diskFreeBytes(config.stagingRoot, fsModule),
  ]);
  const ffmpegAvailable = Boolean(firstVersionLine);
  const ffprobeAvailable = requireFfprobe ? Boolean(firstFfprobeLine) : null;

  return {
    platform: osModule.platform?.() || process.platform,
    architecture: osModule.arch?.() || process.arch,
    ffmpegVersion: firstVersionLine?.slice(0, 191) || null,
    ffprobeVersion: firstFfprobeLine?.slice(0, 191) || null,
    ffmpegAvailable,
    ffprobeAvailable,
    maxNominalHeight: supportsH264 ? Number(maxNominalHeight) : 0,
    supportsH264,
    supportsAac,
    performanceScore: cpuCount,
    probeError: errors.join(" ") || null,
    ready: ffmpegAvailable
      && supportsH264
      && supportsAac
      && (!requireFfprobe || ffprobeAvailable),
    capabilities: {
      ffmpeg: {
        executable: ffmpegPath,
        available: ffmpegAvailable,
        libx264: supportsH264,
        aac: supportsAac,
      },
      ...(requireFfprobe
        ? {
            ffprobe: {
              executable: ffprobePath,
              available: ffprobeAvailable,
              version: firstFfprobeLine?.slice(0, 191) || null,
            },
          }
        : {}),
      os: {
        hostname: osModule.hostname?.() || null,
        release: osModule.release?.() || null,
        cpuCount,
        nodeVersion: process.version,
      },
      disk: {
        cacheRootFreeBytes: cacheFreeBytes,
        stagingRootFreeBytes: stagingFreeBytes,
      },
    },
  };
}

export function assertPrimaryEncodingCapabilities(capabilities) {
  const missing = [];
  if (!capabilities?.ffmpegAvailable) missing.push("FFmpeg");
  if (!capabilities?.supportsH264) missing.push("encodeur libx264");
  if (!capabilities?.supportsAac) missing.push("encodeur AAC");
  if (!capabilities?.ffprobeAvailable) missing.push("FFprobe");
  if (missing.length === 0) return capabilities;

  throw distributedEncodingError(
    `Le primary ne peut pas encoder ou valider les artefacts: ${missing.join(", ")}.`
      + (capabilities?.probeError ? ` ${capabilities.probeError}` : ""),
    "DISTRIBUTED_PRIMARY_MEDIA_TOOLS_UNAVAILABLE",
    500
  );
}
