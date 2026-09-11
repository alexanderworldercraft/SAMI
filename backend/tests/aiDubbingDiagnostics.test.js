import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { preserveAiDubbingFailure } from "../services/aiDubbing/diagnostics.js";
import { startAiDubbingWorkerRuntime } from "../services/aiDubbing/workerRuntime.js";

const roots = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sami-dubbing-diagnostic-"));
  roots.push(root);
  const config = { root, workRoot: path.join(root, "work"), sharedSecret: "test-shared-secret", pipelineVersion: "sami-dubbing-v5-aligned-quality" };
  const claim = { job: { id: "test-job", phase: "preview", videoId: 13 }, leaseToken: "private-lease-token" };
  const workspace = path.join(config.workRoot, claim.job.id, "preview", "runtime");
  await fs.mkdir(path.join(workspace, "voice-profile"), { recursive: true });
  await fs.writeFile(path.join(workspace, "voice-profile", "manifest.json"), '{"dialogueUnits":[]}');
  await fs.writeFile(path.join(workspace, "quality-failure.json"), '{"targetDuration":0.033}');
  await fs.writeFile(path.join(workspace, "input.json"), '{"secret":"not-for-export"}');
  await fs.writeFile(path.join(workspace, "source.wav"), "media");
  const error = Object.assign(new Error("quality test-shared-secret private-lease-token"), { code: "AI_DUBBING_INPUT_QUALITY_BLOCKED", retryable: false });
  return { config, claim, workspace, error, phase: "SYNTHESIZING", progress: 59 };
}
describe("diagnostics privés du doublage IA", () => {
  it("conserve seulement les diagnostics autorisés, sans les secrets ni médias", async () => {
    const input = await fixture();
    const destination = await preserveAiDubbingFailure(input);
    expect((await fs.readdir(destination)).sort()).toEqual(["error.json", "manifest.json", "quality-failure.json"]);
    const report = JSON.parse(await fs.readFile(path.join(destination, "error.json"), "utf8"));
    expect(report).toMatchObject({ videoId: 13, retryable: false, message: "quality [redacted] [redacted]" });
    expect(report).not.toHaveProperty("leaseToken");
  });
  it("ignore les liens symboliques et les fichiers trop volumineux", async () => {
    const input = await fixture();
    await fs.symlink(path.join(input.workspace, "input.json"), path.join(input.workspace, "diarization.json"));
    const large = path.join(input.workspace, "sortformer.json");
    await fs.writeFile(large, "{}");
    await fs.truncate(large, 8 * 1024 * 1024 + 1);
    const destination = await preserveAiDubbingFailure(input);
    const report = JSON.parse(await fs.readFile(path.join(destination, "error.json"), "utf8"));
    expect(report.files).toEqual(expect.arrayContaining([
      { name: "diarization.json", skipped: "unsafe-path" },
      { name: "sortformer.json", skipped: "size-limit" },
    ]));
  });
  it("conserve le diagnostic préalable même quand aucun audio n'a été produit", async () => {
    const input = await fixture();
    await fs.writeFile(path.join(input.workspace, "generation-attempt.json"), JSON.stringify({ state: "running", speaker: "SPEAKER_01", text: "短い文です。" }));
    input.error = Object.assign(new Error("deadline"), { code: "AI_DUBBING_GENERATION_TIMEOUT", retryable: false });
    const destination = await preserveAiDubbingFailure(input);
    expect(JSON.parse(await fs.readFile(path.join(destination, "generation-attempt.json"), "utf8"))).toMatchObject({ speaker: "SPEAKER_01", state: "running" });
    expect(JSON.parse(await fs.readFile(path.join(destination, "error.json"), "utf8"))).toMatchObject({ code: "AI_DUBBING_GENERATION_TIMEOUT", retryable: false });
  });
  it("limite les archives à dix sans supprimer les autres dossiers", async () => {
    const input = await fixture();
    const unrelated = path.join(input.config.root, "diagnostics", "manual-copy");
    await fs.mkdir(unrelated, { recursive: true });
    for (let i = 0; i < 12; i++) await preserveAiDubbingFailure(input);
    const entries = await fs.readdir(path.dirname(unrelated));
    expect(entries.filter(name => name.startsWith("failure-"))).toHaveLength(10);
    expect(entries).toContain("manual-copy");
  });
  it("archive avant nettoyage et signale le blocage non relançable au primary", async () => {
    const input = await fixture();
    const fail = vi.fn().mockResolvedValue({});
    const runtime = await startAiDubbingWorkerRuntime({
      config: { ...input.config, role: "CLONE", workerEnabled: true, heartbeatIntervalMs: 60_000, claimIntervalMs: 60_000, leaseRenewIntervalMs: 60_000 },
      capabilities: { ready: true }, logger: null,
      dependencies: {
        heartbeat: vi.fn().mockResolvedValue({}),
        claim: vi.fn().mockResolvedValueOnce({ lease: input.claim }).mockResolvedValue(null),
        renew: vi.fn().mockRejectedValue(input.error), fail,
      },
    });
    try {
      await vi.waitFor(() => expect(fail).toHaveBeenCalled());
      expect(fail.mock.calls[0][0].retryable).toBe(false);
    } finally { await runtime.stop(); }
    await expect(fs.stat(input.workspace)).rejects.toMatchObject({ code: "ENOENT" });
    const [archive] = await fs.readdir(path.join(input.config.root, "diagnostics"));
    expect(await fs.readFile(path.join(input.config.root, "diagnostics", archive, "manifest.json"), "utf8")).toContain("dialogueUnits");
  });
});
