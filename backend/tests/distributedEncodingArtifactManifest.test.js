import fs from "fs";
import os from "os";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import {
  buildDistributedArtifactManifest,
  validateDistributedArtifactManifest,
} from "../services/distributedEncoding/artifactManifest.js";
import { sha256String } from "../services/videoTransferSecurity.js";

const JOB_ID = "550e8400-e29b-41d4-a716-446655440000";
const TASK_ID = "550e8400-e29b-41d4-a716-446655440001";
const ATTEMPT_ID = "550e8400-e29b-41d4-a716-446655440002";
const SOURCE_HASH = "a".repeat(64);
const PLAN_HASH = "b".repeat(64);
const temporaryRoots = [];

const manifest = (overrides = {}) => ({
  version: 1,
  jobId: JOB_ID,
  taskId: TASK_ID,
  attemptId: ATTEMPT_ID,
  taskKey: "video-720p",
  leaseGeneration: 1,
  sourceSha256: SOURCE_HASH,
  planHash: PLAN_HASH,
  files: [
    {
      relativePath: "hls/720p/playlist.m3u8",
      size: "24",
      sha256: sha256String("#EXTM3U\n#EXT-X-ENDLIST\n"),
    },
    {
      relativePath: "hls/720p/segment_00000.ts",
      size: "7",
      sha256: sha256String("segment"),
    },
  ],
  ...overrides,
});

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) =>
      fs.promises.rm(root, { recursive: true, force: true })
    )
  );
});

describe("manifestes des artefacts distribués", () => {
  it("normalise un manifeste limité à la résolution attribuée", () => {
    const result = validateDistributedArtifactManifest(manifest(), {
      expectedJobId: JOB_ID,
      expectedTaskId: TASK_ID,
      expectedAttemptId: ATTEMPT_ID,
      expectedTaskKey: "video-720p",
      expectedLeaseGeneration: 1,
      expectedSourceSha256: SOURCE_HASH,
      expectedPlanHash: PLAN_HASH,
    });

    expect(result.totalBytes).toBe("31");
    expect(result.files).toHaveLength(2);
  });

  it("refuse un artefact provenant d'une autre résolution", () => {
    expect(() =>
      validateDistributedArtifactManifest(
        manifest({
          files: [
            {
              relativePath: "hls/1080p/playlist.m3u8",
              size: "1",
              sha256: "c".repeat(64),
            },
          ],
        })
      )
    ).toThrowError(/sort du périmètre/i);
  });

  it("refuse un manifeste d'une ancienne génération de lease", () => {
    expect(() =>
      validateDistributedArtifactManifest(manifest(), {
        expectedLeaseGeneration: 2,
      })
    ).toThrowError(/leaseGeneration/i);
  });

  it("construit un manifeste reproductible depuis un workspace", async () => {
    const root = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "sami-distributed-artifacts-")
    );
    temporaryRoots.push(root);
    const profileRoot = path.join(root, "hls", "720p");
    await fs.promises.mkdir(profileRoot, { recursive: true });
    await fs.promises.writeFile(
      path.join(profileRoot, "playlist.m3u8"),
      "#EXTM3U\n#EXTINF:4,\nsegment_00000.ts\n#EXT-X-ENDLIST\n"
    );
    await fs.promises.writeFile(
      path.join(profileRoot, "segment_00000.ts"),
      "segment"
    );

    const result = await buildDistributedArtifactManifest({
      root,
      jobId: JOB_ID,
      taskId: TASK_ID,
      attemptId: ATTEMPT_ID,
      taskKey: "video-720p",
      leaseGeneration: 1,
      sourceSha256: SOURCE_HASH,
      planHash: PLAN_HASH,
    });

    expect(result.manifest.files.map((file) => file.relativePath)).toEqual([
      "hls/720p/playlist.m3u8",
      "hls/720p/segment_00000.ts",
    ]);
    expect(result.manifestHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
