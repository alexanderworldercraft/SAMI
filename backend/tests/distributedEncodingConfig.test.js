import path from "path";
import { describe, expect, it } from "vitest";
import {
  DISTRIBUTED_ENCODING_CACHE_MAX_BYTES,
  DISTRIBUTED_ENCODING_CACHE_ROOT,
  DISTRIBUTED_ENCODING_FAILED_CACHE_TTL_MS,
  DISTRIBUTED_ENCODING_SIGNATURE_DOMAIN,
  DISTRIBUTED_ENCODING_SOURCE_ROOT,
  DISTRIBUTED_ENCODING_STAGING_ROOT,
  assertDistributedPrimaryConfig,
  assertDistributedWorkerConfig,
  getDistributedEncodingConfig,
  isDistributedEncodingEnvironmentEnabled,
} from "../services/distributedEncoding/config.js";

const secret = "0123456789abcdef0123456789abcdef";

const primaryEnv = (overrides = {}) => ({
  NODE_ENV: "test",
  SAMI_INSTANCE_ROLE: "primary",
  SAMI_INSTANCE_ID: "primary-test",
  SAMI_TRANSFER_SHARED_SECRET: secret,
  SAMI_DISTRIBUTED_ENCODING_ENABLED: "true",
  ...overrides,
});

describe("configuration de l'encodage distribué", () => {
  it("expose le contrat V1 et des répertoires privés distincts", () => {
    const config = getDistributedEncodingConfig(primaryEnv());

    expect(DISTRIBUTED_ENCODING_SIGNATURE_DOMAIN)
      .toBe("SAMI-DISTRIBUTED-ENCODING-V1");
    expect(config).toMatchObject({
      enabled: true,
      role: "PRIMARY",
      heartbeatIntervalMs: 15_000,
      offlineAfterMs: 45_000,
      leaseDurationMs: 120_000,
      leaseRenewIntervalMs: 30_000,
      primaryFallbackAfterMs: 300_000,
      primaryMaxNominalHeight: 360,
      maxSlots: 1,
      cacheMaxBytes: 50 * 1024 * 1024 * 1024,
      artifactRetentionDays: 1,
      jobRetentionDays: 30,
      failedCacheTtlMs: 24 * 60 * 60 * 1000,
      retryBackoffMs: [15_000, 60_000, 300_000],
    });
    expect(DISTRIBUTED_ENCODING_CACHE_MAX_BYTES).toBe(50 * 1024 ** 3);
    expect(DISTRIBUTED_ENCODING_FAILED_CACHE_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(DISTRIBUTED_ENCODING_SOURCE_ROOT).toBe(
      path.resolve("var/video-encoding/sources")
    );
    expect(DISTRIBUTED_ENCODING_CACHE_ROOT).toBe(
      path.resolve("var/video-encoding-cache")
    );
    expect(DISTRIBUTED_ENCODING_STAGING_ROOT).toBe(
      path.resolve("uploads/video/.encoding")
    );
  });

  it("réutilise l'identité, l'URL principale et le secret du transfert V1", () => {
    const config = assertDistributedWorkerConfig(primaryEnv({
      SAMI_INSTANCE_ROLE: "clone",
      SAMI_INSTANCE_ID: "clone-01",
      SAMI_PRIMARY_BASE_URL: "https://primary.test",
    }));

    expect(config.instanceId).toBe("clone-01");
    expect(config.sharedSecret).toBe(secret);
    expect(config.primaryBaseUrl).toBeInstanceOf(URL);
    expect(config.primaryBaseUrl.origin).toBe("https://primary.test");
  });

  it("valide et expose les deux durées de rétention BDD", () => {
    const config = getDistributedEncodingConfig(primaryEnv({
      SAMI_DISTRIBUTED_ENCODING_ARTIFACT_RETENTION_DAYS: "2",
      SAMI_DISTRIBUTED_ENCODING_JOB_RETENTION_DAYS: "45",
    }));

    expect(config.artifactRetentionDays).toBe(2);
    expect(config.jobRetentionDays).toBe(45);
    expect(() => getDistributedEncodingConfig(primaryEnv({
      SAMI_DISTRIBUTED_ENCODING_ARTIFACT_RETENTION_DAYS: "0",
    }))).toThrow(/ARTIFACT_RETENTION_DAYS/);
    expect(() => getDistributedEncodingConfig(primaryEnv({
      SAMI_DISTRIBUTED_ENCODING_JOB_RETENTION_DAYS: "1.5",
    }))).toThrow(/JOB_RETENTION_DAYS/);
  });

  it("refuse les assertions si l'expérimentation est désactivée ou le rôle faux", () => {
    expect(isDistributedEncodingEnvironmentEnabled(primaryEnv({
      SAMI_DISTRIBUTED_ENCODING_ENABLED: "off",
    }))).toBe(false);
    expect(() => assertDistributedPrimaryConfig(primaryEnv({
      SAMI_DISTRIBUTED_ENCODING_ENABLED: "false",
    }))).toThrow(/désactivé/);
    expect(() => assertDistributedPrimaryConfig(primaryEnv({
      SAMI_INSTANCE_ROLE: "clone",
      SAMI_INSTANCE_ID: "clone-01",
      SAMI_PRIMARY_BASE_URL: "https://primary.test",
    }))).toThrow(/serveur principal/);
  });
});
