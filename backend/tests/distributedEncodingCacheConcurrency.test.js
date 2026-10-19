import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { PassThrough, Readable } from "stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ root: "", open: vi.fn() }));
vi.mock("../services/distributedEncoding/config.js", async (importOriginal) => ({
  ...await importOriginal(),
  getDistributedEncodingConfig: () => ({ cacheRoot: mocks.root }),
}));
vi.mock("../services/distributedEncoding/workerClient.js", async (importOriginal) => ({
  ...await importOriginal(),
  openRemoteEncodingSource: mocks.open,
}));
import { ensureDistributedSourceCached, pinDistributedSource, unpinDistributedSource } from "../services/distributedEncoding/cacheService.js";
import { startDistributedEncodingWorkerRuntime } from "../services/distributedEncoding/workerRuntime.js";

const sourceRequest = (source, overrides = {}) => ({
  jobId: "job",
  taskId: "first",
  leaseToken: "token",
  leaseGeneration: 1,
  sha256: crypto.createHash("sha256").update(source).digest("hex"),
  originalName: "source.mkv",
  size: source.length,
  ...overrides,
});

afterEach(async () => {
  if (mocks.root) await fs.promises.rm(mocks.root, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("cache partagé entre slots d’un clone", () => {
  it("télécharge une seule fois la source de deux tâches simultanées", async () => {
    mocks.root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sami-cache-slots-"));
    const source = Buffer.from("source commune aux deux resolutions");
    const sha256 = crypto.createHash("sha256").update(source).digest("hex");
    mocks.open.mockImplementation(async () => ({ etag: sha256, totalSize: source.length, stream: Readable.from(source) }));
    const request = { jobId: "job", taskId: "first", leaseToken: "token", leaseGeneration: 1,
      sha256, originalName: "source.mkv", size: source.length };
    pinDistributedSource(sha256);
    try {
      const [first, second] = await Promise.all([
        ensureDistributedSourceCached(request),
        ensureDistributedSourceCached({ ...request, taskId: "second" }),
      ]);
      expect(mocks.open).toHaveBeenCalledOnce();
      expect(first.cacheHit).toBe(false);
      expect(second.cacheHit).toBe(true);
      expect(await fs.promises.readFile(first.sourcePath)).toEqual(source);
      expect(second.sourcePath).toBe(first.sourcePath);
    } finally { unpinDistributedSource(sha256); }
  });

  it("laisse télécharger deux vidéos différentes sans attendre la fin de la première", async () => {
    mocks.root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sami-cache-distinct-"));
    const firstSource = Buffer.from("premiere video encore en cours de telechargement");
    const secondSource = Buffer.from("autre video independante");
    const firstRequest = sourceRequest(firstSource);
    const secondRequest = sourceRequest(secondSource, { jobId: "other-job", taskId: "second" });
    const firstStream = new PassThrough();
    mocks.open.mockImplementation(async ({ jobId }) => ({
      etag: jobId === "job" ? firstRequest.sha256 : secondRequest.sha256,
      totalSize: jobId === "job" ? firstSource.length : secondSource.length,
      stream: jobId === "job" ? firstStream : Readable.from(secondSource),
    }));
    pinDistributedSource(firstRequest.sha256);
    pinDistributedSource(secondRequest.sha256);
    let firstFinished = false;
    const first = ensureDistributedSourceCached(firstRequest).then((result) => {
      firstFinished = true;
      return result;
    });
    let second;
    try {
      await vi.waitFor(() => expect(mocks.open).toHaveBeenCalledOnce());
      second = ensureDistributedSourceCached(secondRequest);
      const cachedSecond = await second;
      expect(firstFinished).toBe(false);
      expect(mocks.open).toHaveBeenCalledTimes(2);
      expect(await fs.promises.readFile(cachedSecond.sourcePath)).toEqual(secondSource);
      firstStream.end(firstSource);
      const cachedFirst = await first;
      expect(await fs.promises.readFile(cachedFirst.sourcePath)).toEqual(firstSource);
      const reused = await ensureDistributedSourceCached(secondRequest);
      expect(reused.cacheHit).toBe(true);
      expect(mocks.open).toHaveBeenCalledTimes(2);
    } finally {
      if (!firstStream.writableEnded) firstStream.end(firstSource);
      await Promise.allSettled([first, second]);
      unpinDistributedSource(firstRequest.sha256);
      unpinDistributedSource(secondRequest.sha256);
    }
  });

  it("fait attendre le second slot attribué pendant le téléchargement, en renouvelant son bail", async () => {
    mocks.root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "sami-cache-runtime-"));
    const source = Buffer.from("source video partagee entre deux slots du meme clone");
    const request = sourceRequest(source);
    const stream = new PassThrough();
    mocks.open.mockResolvedValue({ etag: request.sha256, totalSize: source.length, stream });
    const makeClaim = (suffix, profileLabel) => ({
      task: {
        id: `550e8400-e29b-41d4-a716-44665544000${suffix}`,
        key: `video-${profileLabel}`,
        kind: "VIDEO_PROFILE",
        profileLabel,
        spec: { profile: { label: profileLabel, width: 1280, height: 720 } },
      },
      job: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        sourceOriginalName: request.originalName,
        sourceSize: source.length,
        sourceSha256: request.sha256,
        encodingSpecHash: "b".repeat(64),
      },
      attempt: { id: `550e8400-e29b-41d4-a716-44665544001${suffix}` },
      leaseToken: `token-${suffix}`,
      leaseGeneration: 1,
      renewAfterMs: 250,
    });
    const firstClaim = makeClaim(1, "720p");
    const secondClaim = makeClaim(2, "480p");
    const dependencies = {
      sendHeartbeat: vi.fn().mockResolvedValue({ worker: { maxSlots: 2 } }),
      claimTask: vi.fn().mockResolvedValue(null),
      renewTask: vi.fn().mockResolvedValue({ continue: true }),
      ensureSourceCached: vi.fn(ensureDistributedSourceCached),
      encodeVideo: vi.fn(async ({ videoPath }) => {
        expect(await fs.promises.readFile(videoPath)).toEqual(source);
      }),
      buildArtifactManifest: vi.fn().mockResolvedValue({ manifest: { files: [] }, manifestHash: "c".repeat(64) }),
      registerArtifacts: vi.fn().mockResolvedValue({ files: [] }),
      completeTask: vi.fn().mockResolvedValue({ purgeSource: false }),
      failTask: vi.fn(),
      releaseTask: vi.fn(),
    };
    const runtime = startDistributedEncodingWorkerRuntime({
      config: {
        role: "CLONE",
        protocolVersion: 1,
        pipelineVersion: "sami-hls-libx264-aac-v1",
        stagingRoot: path.join(mocks.root, "staging"),
        leaseDurationMs: 120_000,
      },
      capabilities: { supportsH264: true, supportsAac: true },
      dependencies,
      logger: null,
    });
    const executions = [];
    try {
      await runtime.ready;
      await vi.waitFor(() => expect(dependencies.claimTask).toHaveBeenCalledTimes(2));
      dependencies.claimTask.mockResolvedValueOnce(firstClaim).mockResolvedValueOnce(secondClaim);
      executions.push(runtime.runOneClaim());
      await vi.waitFor(() => expect(mocks.open).toHaveBeenCalledOnce());
      stream.write(source.subarray(0, 10));
      await vi.waitFor(async () => {
        expect((await fs.promises.stat(path.join(mocks.root, request.sha256, "source.part"))).size).toBe(10);
      });

      // Attribution suivante : le premier slot possède toujours un fichier incomplet.
      executions.push(runtime.runOneClaim());
      await vi.waitFor(() => expect(dependencies.ensureSourceCached).toHaveBeenCalledTimes(2));
      await vi.waitFor(() => {
        const renewals = dependencies.renewTask.mock.calls.filter(([payload]) => payload.taskId === secondClaim.task.id);
        expect(renewals.length).toBeGreaterThanOrEqual(2);
        expect(renewals.every(([payload]) => payload.phase === "DOWNLOADING")).toBe(true);
      });
      expect(mocks.open).toHaveBeenCalledOnce();
      expect(dependencies.encodeVideo).not.toHaveBeenCalled();
      expect(await runtime.runOneClaim()).toMatchObject({ claimed: false, busy: true });

      stream.end(source.subarray(10));
      const results = await Promise.all(executions);
      expect(results).toEqual([
        expect.objectContaining({ completed: true, cacheHit: false }),
        expect.objectContaining({ completed: true, cacheHit: true }),
      ]);
      expect(dependencies.encodeVideo).toHaveBeenCalledTimes(2);
      expect(new Set(dependencies.encodeVideo.mock.calls.map(([options]) => options.videoPath)).size).toBe(1);
      expect(mocks.open).toHaveBeenCalledOnce();
      expect(dependencies.failTask).not.toHaveBeenCalled();
      expect(dependencies.releaseTask).not.toHaveBeenCalled();
    } finally {
      if (!stream.writableEnded) stream.end(source.subarray(10));
      await runtime.stop();
      await Promise.allSettled(executions);
    }
  });
});
