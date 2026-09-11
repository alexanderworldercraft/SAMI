import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DIAGNOSTIC_AUDIO_NAMES, validateDiagnosticAudio } from "./diagnosticAudio.js";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FAILURES = 10;
const ARCHIVE_NAME = /^failure-[a-f0-9-]{36}$/;
const FILES = [
  ["runtime/voice-profile/manifest.json", "manifest.json"],
  ["input/profile/manifest.json", "input-profile.json"],
  ["input/previous-profile/manifest.json", "previous-profile.json"],
  ["runtime/quality-failure.json", "quality-failure.json"],
  ["runtime/generation-attempt.json", "generation-attempt.json"],
  ["runtime/diarization.json", "diarization.json"],
  ["runtime/sortformer.json", "sortformer.json"],
  ...DIAGNOSTIC_AUDIO_NAMES.map(name => [`runtime/${name}`, name]),
];

// Diagnostic privé borné : JSON et trois courts rejets PCM, jamais les médias source.
export async function preserveAiDubbingFailure({ config, claim, error, phase, progress }) {
  if (!/^[a-zA-Z0-9-]+$/.test(claim.job.id) || !["preview", "full"].includes(claim.job.phase)) {
    throw new Error("Identifiant de diagnostic invalide.");
  }
  const archiveRoot = path.join(config.root, "diagnostics");
  await fs.mkdir(archiveRoot, { recursive: true, mode: 0o700 });
  const destination = path.join(archiveRoot, `failure-${crypto.randomUUID()}`);
  await fs.mkdir(destination, { mode: 0o700 });
  const sourceRoot = path.join(config.workRoot, claim.job.id, claim.job.phase);
  const realSourceRoot = await fs.realpath(sourceRoot).catch(() => null);
  const files = [];
  for (const [relative, name] of FILES) {
    try {
      const source = path.join(sourceRoot, relative);
      const stat = await fs.lstat(source);
      const realSource = await fs.realpath(source);
      const inside = realSourceRoot && path.relative(realSourceRoot, realSource);
      if (!stat.isFile() || stat.isSymbolicLink() || !inside || inside.startsWith("..") || path.isAbsolute(inside)) {
        files.push({ name, skipped: "unsafe-path" });
        continue;
      }
      if (stat.size > MAX_FILE_BYTES) {
        files.push({ name, skipped: "size-limit" });
        continue;
      }
      const content = await fs.readFile(source);
      if (DIAGNOSTIC_AUDIO_NAMES.includes(name)) validateDiagnosticAudio(content);
      await fs.writeFile(path.join(destination, name), content, { mode: 0o600, flag: "wx" });
      files.push({ name, size: stat.size });
    } catch (copyError) {
      files.push({ name, skipped: copyError.code === "ENOENT" ? "absent" : "copy-failed" });
    }
  }
  let message = String(error?.message || error);
  for (const secret of [config.sharedSecret, claim.leaseToken]) {
    if (secret) message = message.replaceAll(String(secret), "[redacted]");
  }
  await fs.writeFile(path.join(destination, "error.json"), JSON.stringify({
    schemaVersion: 1, createdAt: new Date().toISOString(),
    jobId: claim.job.id, videoId: claim.job.videoId, jobPhase: claim.job.phase,
    pipelineVersion: config.pipelineVersion, generationConfigHash: config.generationConfigHash,
    phase, progress, code: error?.code || null, retryable: error?.retryable !== false,
    message: message.slice(-12000), files,
  }, null, 2), { mode: 0o600, flag: "wx" });

  const archives = [];
  for (const entry of await fs.readdir(archiveRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !ARCHIVE_NAME.test(entry.name)) continue;
    const absolute = path.join(archiveRoot, entry.name);
    archives.push({ absolute, time: (await fs.stat(absolute)).mtimeMs });
  }
  // Conserver le diagnostic courant même en cas d'horloge reculée.
  archives.sort((a, b) => (a.absolute === destination ? -1 : b.absolute === destination ? 1 : b.time - a.time));
  for (const archive of archives.slice(MAX_FAILURES)) {
    await fs.rm(archive.absolute, { recursive: true, force: true });
  }
  return destination;
}
