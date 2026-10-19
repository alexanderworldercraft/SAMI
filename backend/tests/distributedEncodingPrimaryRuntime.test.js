import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ claim: vi.fn() }));
vi.mock("../services/distributedEncoding/config.js", async (importOriginal) => ({
  ...await importOriginal(),
  isDistributedEncodingEnvironmentEnabled: () => true,
  assertDistributedPrimaryConfig: () => ({ instanceId: "primary", heartbeatIntervalMs: 15_000 }),
}));
vi.mock("../services/distributedEncoding/jobService.js", () => ({
  ensurePrimaryEncodingWorkerRegistered: async () => ({ MaxSlots: 2 }),
  getPrimaryEncodingCapabilities: async () => ({}),
}));
vi.mock("../services/distributedEncoding/scheduler.js", async (importOriginal) => ({
  ...await importOriginal(), claimNextEncodingTask: mocks.claim,
}));
import { startPrimaryDistributedEncodingRuntime } from "../services/distributedEncoding/primaryRuntime.js";
import { getEncodingCapacityState, setEncodingMaxSlots } from "../services/distributedEncoding/capacity.js";

afterEach(() => { setEncodingMaxSlots(1); vi.clearAllMocks(); });

describe("slots du runtime primary", () => {
  it("ouvre deux claims concurrents et libère la capacité à l’arrêt", async () => {
    const pending = [];
    mocks.claim.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const runtime = await startPrimaryDistributedEncodingRuntime();
    await vi.waitFor(() => expect(mocks.claim).toHaveBeenCalledTimes(2));
    expect(getEncodingCapacityState().active).toBe(2);
    for (const resolve of pending) resolve(null);
    await runtime.stop();
    expect(getEncodingCapacityState().active).toBe(0);
  });
});
