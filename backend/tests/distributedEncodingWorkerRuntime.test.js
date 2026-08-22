import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  collectDistributedEncodingWorkerCapabilities,
  startDistributedEncodingWorkerRuntime,
} from "../services/distributedEncoding/workerRuntime.js";

const JOB_ID = "550e8400-e29b-41d4-a716-446655440000";
const TASK_ID = "550e8400-e29b-41d4-a716-446655440001";
const ATTEMPT_ID = "550e8400-e29b-41d4-a716-446655440002";
const SOURCE_HASH = "a".repeat(64);
const PLAN_HASH = "b".repeat(64);
const temporaryRoots = [];

const createTemporaryRoot = async () => {
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "sami-distributed-worker-")
  );
  temporaryRoots.push(root);
  return root;
};

const createConfig = (root, overrides = {}) => ({
  role: "CLONE",
  protocolVersion: 1,
  pipelineVersion: "sami-hls-libx264-aac-v1",
  cacheRoot: path.join(root, "cache"),
  stagingRoot: path.join(root, "staging"),
  heartbeatIntervalMs: 15_000,
  leaseRenewIntervalMs: 30_000,
  ...overrides,
});

const createVideoClaim = (overrides = {}) => ({
  task: {
    id: TASK_ID,
    key: "video-720p",
    kind: "VIDEO_PROFILE",
    profileLabel: "720p",
    spec: {
      profile: { label: "720p", width: 1280, height: 720, bitrate: 4500 },
      includeAudio: false,
      videoStreamIndex: 2,
      audioStreamIndex: 4,
      durationSeconds: 120,
      segmentDurationSeconds: 4,
      audioBitrateKbps: 192,
    },
  },
  job: {
    id: JOB_ID,
    sourceOriginalName: "source.mkv",
    sourceSize: 12_345,
    sourceSha256: SOURCE_HASH,
    encodingSpecHash: PLAN_HASH,
  },
  attempt: { id: ATTEMPT_ID },
  leaseToken: "lease-token",
  leaseGeneration: 3,
  renewAfterMs: 30_000,
  ...overrides,
});

const writeTaskOutput = async (outputDir, relativeRoot) => {
  const root = path.join(outputDir, ...relativeRoot.split("/"));
  await fs.promises.mkdir(root, { recursive: true });
  await fs.promises.writeFile(
    path.join(root, "playlist.m3u8"),
    "#EXTM3U\n#EXTINF:4,\nsegment_000000.ts\n#EXT-X-ENDLIST\n"
  );
  await fs.promises.writeFile(
    path.join(root, "segment_000000.ts"),
    "fake-mpeg-ts"
  );
};

const createDependencies = ({ claim, sourcePath, ...overrides }) => {
  const dependencies = {
    claimTask: vi.fn().mockResolvedValue(claim),
    renewTask: vi.fn().mockResolvedValue({ continue: true }),
    ensureSourceCached: vi.fn().mockResolvedValue({
      sourcePath,
      cacheHit: false,
    }),
    pinSource: vi.fn(),
    unpinSource: vi.fn(),
    purgeSource: vi.fn().mockResolvedValue(true),
    encodeVideo: vi.fn(),
    encodeAudio: vi.fn(),
    withCapacity: vi.fn(async (callback) => callback()),
    registerArtifacts: vi.fn(async ({ manifest }) => ({
      files: manifest.files.map((file, index) => ({
        id: `file-${index}`,
        ...file,
        status: "PENDING",
      })),
    })),
    uploadArtifact: vi.fn().mockResolvedValue({ verified: true }),
    completeTask: vi.fn().mockResolvedValue({ purgeSource: false }),
    failTask: vi.fn().mockResolvedValue({ failed: true }),
    releaseTask: vi.fn().mockResolvedValue({ released: true }),
    sendHeartbeat: vi.fn().mockResolvedValue({ online: true }),
    getFfmpegExecutable: vi.fn(() => "ffmpeg"),
    ...overrides,
  };
  return dependencies;
};

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.promises.rm(root, { recursive: true, force: true })
    )
  );
});

describe("runtime du worker d'encodage distribué", () => {
  it("encode, manifeste, transfère et termine un profil vidéo dans un workspace isolé", async () => {
    const root = await createTemporaryRoot();
    const sourcePath = path.join(root, "source.mkv");
    await fs.promises.writeFile(sourcePath, "fake-source");
    const claim = createVideoClaim();
    const dependencies = createDependencies({
      claim,
      sourcePath,
      encodeVideo: vi.fn(async ({ outputDir, onProgress, ...options }) => {
        expect(options).toMatchObject({
          videoPath: sourcePath,
          profile: claim.task.spec.profile,
          includeAudio: false,
          videoStreamIndex: 2,
          audioStreamIndex: 4,
        });
        onProgress(50);
        await writeTaskOutput(outputDir, "720p");
      }),
      uploadArtifact: vi.fn(async ({ absolutePath, size, sha256 }) => {
        const stats = await fs.promises.stat(absolutePath);
        expect(stats.size).toBe(size);
        expect(sha256).toMatch(/^[a-f0-9]{64}$/);
        return { verified: true };
      }),
      completeTask: vi.fn().mockResolvedValue({ purgeSource: true }),
    });
    const config = createConfig(root);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const runtime = startDistributedEncodingWorkerRuntime({
      autoStart: false,
      config,
      dependencies,
      logger,
    });

    const result = await runtime.runOneClaim();

    expect(result).toMatchObject({
      claimed: true,
      completed: true,
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      uploadedFiles: 2,
      purgeSource: true,
    });
    expect(dependencies.claimTask).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(dependencies.ensureSourceCached).toHaveBeenCalledWith({
      jobId: JOB_ID,
      taskId: TASK_ID,
      leaseToken: "lease-token",
      leaseGeneration: 3,
      sha256: SOURCE_HASH,
      size: 12_345,
      originalName: "source.mkv",
      signal: expect.any(AbortSignal),
    });
    expect(dependencies.pinSource).toHaveBeenCalledWith(SOURCE_HASH);
    expect(dependencies.unpinSource).toHaveBeenCalledWith(SOURCE_HASH);
    expect(dependencies.purgeSource).toHaveBeenCalledWith(SOURCE_HASH);
    expect(dependencies.withCapacity).toHaveBeenCalledOnce();
    expect(dependencies.uploadArtifact).toHaveBeenCalledTimes(2);
    expect(dependencies.completeTask).toHaveBeenCalledWith({
      taskId: TASK_ID,
      leaseToken: "lease-token",
      leaseGeneration: 3,
    }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(dependencies.renewTask.mock.calls.map(([payload]) => payload.phase)).toEqual([
      "DOWNLOADING",
      "ENCODING",
      "UPLOADING",
      "VERIFYING",
    ]);
    await expect(fs.promises.stat(path.join(
      config.stagingRoot,
      "worker-attempts",
      ATTEMPT_ID
    ))).rejects.toMatchObject({ code: "ENOENT" });
    expect(dependencies.failTask).not.toHaveBeenCalled();
    expect(dependencies.releaseTask).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      `[distributed-encoding-worker:${TASK_ID}] tâche attribuée au clone (VIDEO_PROFILE, video-720p, job ${JOB_ID}).`
    );
    await runtime.stop();
  });

  it("encode aussi une rendition audio autorisée sur clone", async () => {
    const root = await createTemporaryRoot();
    const sourcePath = path.join(root, "source.mkv");
    await fs.promises.writeFile(sourcePath, "fake-source");
    const track = {
      order: 0,
      label: "Français",
      language: "fr",
      isDefault: true,
      sourceIndex: 5,
    };
    const claim = createVideoClaim({
      task: {
        id: TASK_ID,
        key: "audio-0",
        kind: "AUDIO_RENDITION",
        spec: {
          track,
          primaryOnly: false,
          durationSeconds: 120,
          segmentDurationSeconds: 4,
          audioBitrateKbps: 192,
        },
      },
    });
    const wrappedClaim = {
      lease: {
        ...claim,
        job: {
          id: claim.job.id,
          encodingSpecHash: claim.job.encodingSpecHash,
        },
        source: {
          jobId: claim.job.id,
          originalName: claim.job.sourceOriginalName,
          size: claim.job.sourceSize,
          sha256: claim.job.sourceSha256,
        },
      },
    };
    const dependencies = createDependencies({
      claim: wrappedClaim,
      sourcePath,
      encodeAudio: vi.fn(async ({ outputDir, track: receivedTrack }) => {
        expect(receivedTrack).toEqual(track);
        await writeTaskOutput(outputDir, "audio/0");
      }),
    });
    const runtime = startDistributedEncodingWorkerRuntime({
      autoStart: false,
      config: createConfig(root),
      dependencies,
      logger: null,
    });

    await expect(runtime.runOneClaim()).resolves.toMatchObject({
      claimed: true,
      completed: true,
      uploadedFiles: 2,
    });
    expect(dependencies.encodeAudio).toHaveBeenCalledOnce();
    expect(dependencies.encodeVideo).not.toHaveBeenCalled();
    await runtime.stop();
  });

  it("marque un échec FFmpeg déterministe et libère un incident retentable", async () => {
    const root = await createTemporaryRoot();
    const sourcePath = path.join(root, "source.mkv");
    await fs.promises.writeFile(sourcePath, "fake-source");
    const deterministic = createDependencies({
      claim: createVideoClaim(),
      sourcePath,
      encodeVideo: vi.fn().mockRejectedValue(new Error("codec invalide")),
    });
    const firstRuntime = startDistributedEncodingWorkerRuntime({
      autoStart: false,
      config: createConfig(root),
      dependencies: deterministic,
      logger: null,
    });

    const failed = await firstRuntime.runOneClaim();
    expect(failed).toMatchObject({ completed: false, status: "FAILED" });
    expect(deterministic.failTask).toHaveBeenCalledWith(expect.objectContaining({
      taskId: TASK_ID,
      error: "codec invalide",
      retryable: false,
    }));
    expect(deterministic.releaseTask).not.toHaveBeenCalled();
    await firstRuntime.stop();

    const retryableError = Object.assign(new Error("primary indisponible"), {
      code: "DISTRIBUTED_PRIMARY_UNAVAILABLE",
      retryable: true,
    });
    const retryable = createDependencies({
      claim: createVideoClaim(),
      sourcePath,
      ensureSourceCached: vi.fn().mockRejectedValue(retryableError),
    });
    const secondRuntime = startDistributedEncodingWorkerRuntime({
      autoStart: false,
      config: createConfig(root),
      dependencies: retryable,
      logger: null,
    });

    const released = await secondRuntime.runOneClaim();
    expect(released).toMatchObject({ completed: false, status: "RELEASED" });
    expect(retryable.releaseTask).toHaveBeenCalledWith(expect.objectContaining({
      code: "DISTRIBUTED_PRIMARY_UNAVAILABLE",
      retryable: true,
    }));
    expect(retryable.failTask).not.toHaveBeenCalled();
    expect(retryable.unpinSource).toHaveBeenCalledWith(SOURCE_HASH);
    await secondRuntime.stop();
  });

  it("renouvelle le lease toutes les 30 secondes et annule FFmpeg à l'arrêt", async () => {
    vi.useFakeTimers();
    const root = await createTemporaryRoot();
    const sourcePath = path.join(root, "source.mkv");
    await fs.promises.writeFile(sourcePath, "fake-source");
    let encodingStarted;
    const started = new Promise((resolve) => {
      encodingStarted = resolve;
    });
    const dependencies = createDependencies({
      claim: createVideoClaim(),
      sourcePath,
      encodeVideo: vi.fn(({ signal }) => new Promise((resolve, reject) => {
        encodingStarted();
        const abort = () => {
          const error = new Error("annulé");
          error.name = "AbortError";
          error.code = "ABORT_ERR";
          reject(error);
        };
        signal.addEventListener("abort", abort, { once: true });
      })),
    });
    const runtime = startDistributedEncodingWorkerRuntime({
      autoStart: false,
      config: createConfig(root),
      dependencies,
      logger: null,
    });

    const execution = runtime.runOneClaim();
    await started;
    const renewalsBeforeInterval = dependencies.renewTask.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(dependencies.renewTask.mock.calls.length).toBeGreaterThan(
      renewalsBeforeInterval
    );

    await runtime.stop();
    await expect(execution).resolves.toMatchObject({
      completed: false,
      status: "RELEASED",
    });
    expect(dependencies.releaseTask).toHaveBeenCalledOnce();
  });

  it("publie un heartbeat FFmpeg/OS/disque toutes les 15 secondes avec un slot", async () => {
    vi.useFakeTimers();
    const root = await createTemporaryRoot();
    const capabilities = {
      platform: "darwin",
      architecture: "arm64",
      ffmpegVersion: "ffmpeg version test",
      maxNominalHeight: 4320,
      supportsH264: true,
      supportsAac: true,
      performanceScore: 8,
      capabilities: {
        ffmpeg: { available: true, libx264: true, aac: true },
        os: { cpuCount: 8 },
        disk: { cacheRootFreeBytes: "2048" },
      },
    };
    const dependencies = createDependencies({
      claim: null,
      sourcePath: null,
    });
    const runtime = startDistributedEncodingWorkerRuntime({
      config: createConfig(root),
      dependencies,
      capabilities,
      bootId: "boot-test",
      logger: null,
    });
    await runtime.ready;

    expect(dependencies.sendHeartbeat).toHaveBeenCalledWith(
      {
        protocolVersion: 1,
        pipelineVersion: "sami-hls-libx264-aac-v1",
        ...capabilities,
        maxSlots: 1,
        bootId: "boot-test",
        lastError: null,
      },
      { signal: expect.any(AbortSignal) }
    );
    await vi.advanceTimersByTimeAsync(15_000);
    expect(dependencies.sendHeartbeat).toHaveBeenCalledTimes(2);
    await runtime.stop();
  });

  it("purge au heartbeat les sources de jobs terminés signalées par le primary", async () => {
    const root = await createTemporaryRoot();
    const dependencies = createDependencies({
      claim: null,
      sourcePath: null,
      sendHeartbeat: vi.fn().mockResolvedValue({
        purgeSourceSha256: [SOURCE_HASH],
      }),
    });
    const runtime = startDistributedEncodingWorkerRuntime({
      config: createConfig(root),
      dependencies,
      capabilities: {
        supportsH264: true,
        supportsAac: true,
        capabilities: {},
      },
      logger: null,
    });

    await runtime.ready;

    expect(dependencies.purgeSource).toHaveBeenCalledWith(SOURCE_HASH);
    await runtime.stop();
  });
});

describe("détection des capacités du worker", () => {
  it("détecte libx264/AAC et sérialise l'espace disque sans BigInt", async () => {
    const execFileImpl = vi.fn((executable, args, options, callback) => {
      if (args.includes("-version")) {
        callback(null, "ffmpeg version 7.1 test\n", "");
        return;
      }
      callback(
        null,
        " V....D libx264 H.264 encoder\n A..... aac AAC encoder\n",
        ""
      );
    });
    const fsModule = {
      promises: {
        mkdir: vi.fn().mockResolvedValue(undefined),
        statfs: vi.fn().mockResolvedValue({ bavail: 2n, bsize: 1024n }),
      },
    };
    const osModule = {
      platform: () => "linux",
      arch: () => "x64",
      hostname: () => "clone-01",
      release: () => "test",
      cpus: () => Array.from({ length: 4 }, () => ({})),
    };

    const result = await collectDistributedEncodingWorkerCapabilities({
      config: { cacheRoot: "/cache", stagingRoot: "/staging" },
      execFileImpl,
      fsModule,
      osModule,
      ffmpegPath: "/opt/ffmpeg",
    });

    expect(result).toMatchObject({
      platform: "linux",
      architecture: "x64",
      ffmpegVersion: "ffmpeg version 7.1 test",
      maxNominalHeight: 4320,
      supportsH264: true,
      supportsAac: true,
      performanceScore: 4,
      probeError: null,
      capabilities: {
        ffmpeg: { executable: "/opt/ffmpeg", available: true },
        disk: {
          cacheRootFreeBytes: "2048",
          stagingRootFreeBytes: "2048",
        },
      },
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
