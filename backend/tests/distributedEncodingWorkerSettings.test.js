import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn() }));
vi.mock("../services/db.js", () => ({ prisma: {
  videoEncodingWorker: { findUnique: mocks.find, update: mocks.update },
} }));
vi.mock("../services/distributedEncoding/config.js", async (importOriginal) => ({
  ...await importOriginal(),
  assertDistributedPrimaryConfig: () => ({ instanceId: "primary", pipelineVersion: "encoding-v1", protocolVersion: 1 }),
}));
import { patchDistributedEncodingWorker } from "../services/distributedEncoding/jobService.js";

describe("réglages administrateur des serveurs d’encodage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.find.mockResolvedValue({ VideoEncodingWorkerID: "primary", Role: "PRIMARY" });
    mocks.update.mockImplementation(async ({ where, data }) => ({ ...where, Role: "PRIMARY", ...data }));
  });
  it("enregistre Pas d’encodage, les slots et le nom sur le primary", async () => {
    await patchDistributedEncodingWorker("primary", { displayName: "Mon primary", maxNominalHeight: 0, maxSlots: 4, performanceScore: 10 });
    expect(mocks.update).toHaveBeenCalledWith({ where: { VideoEncodingWorkerID: "primary" },
      data: { DisplayName: "Mon primary", MaxNominalHeight: 0, MaxSlots: 4, PerformanceScore: 10 } });
  });
  it("refuse Pas d’encodage sur un clone", async () => {
    mocks.find.mockResolvedValue({ VideoEncodingWorkerID: "clone", Role: "CLONE" });
    await expect(patchDistributedEncodingWorker("clone", { maxNominalHeight: 0 })).rejects.toMatchObject({ code: "INVALID_ENCODING_WORKER_MAX_HEIGHT" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 33, "x"])("refuse un nombre de slots invalide : %s", async (maxSlots) => {
    await expect(patchDistributedEncodingWorker("primary", { maxSlots })).rejects.toMatchObject({ code: "INVALID_ENCODING_WORKER_SLOTS" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
