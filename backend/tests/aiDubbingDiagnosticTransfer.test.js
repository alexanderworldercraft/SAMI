import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { flushAiDubbingDiagnostics, receiveAiDubbingDiagnostic } from "../services/aiDubbing/diagnosticTransfer.js";
import { preserveAiDubbingFailure } from "../services/aiDubbing/diagnostics.js";
import { validateDiagnosticAudio } from "../services/aiDubbing/diagnosticAudio.js";

function pcm(seconds = 1) {
  const size = seconds * 48000;
  const buffer = Buffer.alloc(44 + size);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(24000, 24); buffer.writeUInt32LE(48000, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36); buffer.writeUInt32LE(size, 40);
  return buffer;
}

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sami-diagnostic-transfer-")); roots.push(root);
  const clone = { root: path.join(root, "clone"), workRoot: path.join(root, "work"), primaryBaseUrl: new URL("https://primary.test") };
  const primary = { root: path.join(root, "primary"), role: "PRIMARY" };
  const directory = await preserveAiDubbingFailure({ config: clone,
    claim: { job: { id: "deleted-job", phase: "preview", videoId: 13 } },
    error: Object.assign(new Error("quality"), { retryable: false }), phase: "SYNTHESIZING", progress: 59 });
  const send = vi.fn(payload => receiveAiDubbingDiagnostic({ config: primary, workerId: "clone-3090", payload }));
  return { clone, primary, directory, send };
}
describe("transfert privé des diagnostics", () => {
  it("archive puis transfère un rejet PCM privé sans altérer ses octets", async () => {
    const f = await fixture();
    const audio = pcm(15);
    const source = path.join(f.clone.workRoot, "audio-job", "full", "runtime");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "quality-attempt-1.wav"), audio);
    const archive = await preserveAiDubbingFailure({ config: f.clone,
      claim: { job: { id: "audio-job", phase: "full", videoId: 13 } }, error: new Error("CER") });
    expect(await fs.readFile(path.join(archive, "quality-attempt-1.wav"))).toEqual(audio);
    expect((await flushAiDubbingDiagnostics({ config: f.clone, send: f.send })).errors).toEqual([]);
    const payload = f.send.mock.calls.map(call => call[0]).find(p => p.id === path.basename(archive));
    expect(payload.files.find(file => file.name.endsWith(".wav")).encoding).toBe("base64");
    const worker = crypto.createHash("sha256").update("clone-3090").digest("hex");
    expect(await fs.readFile(path.join(f.primary.root, "diagnostics", "clones", worker, payload.id, "quality-attempt-1.wav"))).toEqual(audio);
    const corrupted = structuredClone(payload);
    corrupted.files.find(file => file.name.endsWith(".wav")).sha256 = "bad";
    await expect(f.send(corrupted)).rejects.toMatchObject({ statusCode: 400 });
    const wronglyEncoded = structuredClone(payload);
    delete wronglyEncoded.files.find(file => file.name.endsWith(".wav")).encoding;
    await expect(f.send(wronglyEncoded)).rejects.toMatchObject({ statusCode: 400 });
  });
  it("refuse les faux WAV, formats inattendus, durées excessives et chunks tronqués", () => {
    expect(() => validateDiagnosticAudio(Buffer.from("not an audio"))).toThrow();
    expect(() => validateDiagnosticAudio(pcm(16))).toThrow();
    const stereo = pcm(); stereo.writeUInt16LE(2, 22);
    expect(() => validateDiagnosticAudio(stereo)).toThrow();
    const truncated = pcm(); truncated.writeUInt32LE(999999, 40);
    expect(() => validateDiagnosticAudio(truncated)).toThrow();
    expect(validateDiagnosticAudio(pcm(15))).toHaveLength(720044);
  });
  it("reprend après panne sans génération et ne renvoie plus après accusé de réception", async () => {
    const f = await fixture();
    const unavailable = vi.fn().mockRejectedValue(new Error("offline"));
    const failed = await flushAiDubbingDiagnostics({ config: f.clone, send: unavailable });
    expect(failed.errors).toHaveLength(1);
    await expect(fs.stat(path.join(f.directory, "error.json"))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(f.directory, ".transferred.json"))).rejects.toMatchObject({ code: "ENOENT" });
    expect((await flushAiDubbingDiagnostics({ config: f.clone, send: f.send })).errors).toEqual([]);
    expect(f.send).toHaveBeenCalledTimes(1);
    await flushAiDubbingDiagnostics({ config: f.clone, send: f.send });
    expect(f.send).toHaveBeenCalledTimes(1);
    const namespaces = await fs.readdir(path.join(f.primary.root, "diagnostics", "clones"));
    const received = JSON.parse(await fs.readFile(path.join(f.primary.root, "diagnostics", "clones", namespaces[0], path.basename(f.directory), "error.json"), "utf8"));
    expect(received.jobId).toBe("deleted-job");
    expect(received.retryable).toBe(false);
  });
  it("transfère le contexte préalable d'une synthèse sans WAV", async () => {
    const f = await fixture();
    await fs.writeFile(path.join(f.directory, "generation-attempt.json"), JSON.stringify({ speaker: "SPEAKER_01", language: "ja", state: "running" }));
    expect((await flushAiDubbingDiagnostics({ config: f.clone, send: f.send })).errors).toEqual([]);
    const namespaces = await fs.readdir(path.join(f.primary.root, "diagnostics", "clones"));
    const received = JSON.parse(await fs.readFile(path.join(f.primary.root, "diagnostics", "clones", namespaces[0], path.basename(f.directory), "generation-attempt.json"), "utf8"));
    expect(received).toMatchObject({ speaker: "SPEAKER_01", language: "ja", state: "running" });
  });
  it("réception idempotente, empreintes vérifiées et chemins confinés", async () => {
    const f = await fixture();
    await flushAiDubbingDiagnostics({ config: f.clone, send: f.send });
    const payload = f.send.mock.calls[0][0];
    await expect(f.send(payload)).resolves.toMatchObject({ received: true });
    const changed = structuredClone(payload);
    changed.files[0].content = "{}";
    await expect(f.send(changed)).rejects.toMatchObject({ statusCode: 400 });
    changed.files[0].sha256 = crypto.createHash("sha256").update("{}").digest("hex");
    await expect(f.send(changed)).rejects.toMatchObject({ statusCode: 409 });
    await expect(f.send({ ...payload, id: "../../outside" })).rejects.toMatchObject({ statusCode: 400 });
    await expect(f.send({ ...payload, files: [{ ...payload.files[0], name: "../../.env" }] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(f.send({ ...payload, files: [payload.files[0], payload.files[0]] })).rejects.toMatchObject({ statusCode: 400 });
    await expect(receiveAiDubbingDiagnostic({ config: f.primary, workerId: null, payload })).rejects.toMatchObject({ statusCode: 403 });
  });
  it("ne marque pas envoyé sur un accusé invalide et ne suit pas les liens", async () => {
    const f = await fixture();
    expect((await flushAiDubbingDiagnostics({ config: f.clone, send: vi.fn().mockResolvedValue({ received: true }) })).errors).toHaveLength(1);
    await fs.symlink(path.join(f.directory, "error.json"), path.join(f.directory, "manifest.json"));
    const result = await flushAiDubbingDiagnostics({ config: f.clone, send: f.send });
    expect(result.errors).toHaveLength(1);
    expect(f.send).not.toHaveBeenCalled();
  });
  it("refuse les archives trop grosses et isole les clones", async () => {
    const f = await fixture();
    await flushAiDubbingDiagnostics({ config: f.clone, send: f.send });
    const payload = f.send.mock.calls[0][0];
    await receiveAiDubbingDiagnostic({ config: f.primary, workerId: "second-clone", payload });
    expect(await fs.readdir(path.join(f.primary.root, "diagnostics", "clones"))).toHaveLength(2);
    const content = JSON.stringify("x".repeat(8 * 1024 * 1024));
    await expect(f.send({ ...payload, files: [{ name: "error.json", content, sha256: crypto.createHash("sha256").update(content).digest("hex") }] })).rejects.toMatchObject({ statusCode: 400 });
  });
});
