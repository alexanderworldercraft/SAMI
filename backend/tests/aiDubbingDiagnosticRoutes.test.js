import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ config: {}, enabled: true }));
vi.mock("../services/aiDubbing/config.js", async importOriginal => ({
  ...await importOriginal(), assertAiDubbingConfig: () => state.config,
}));
vi.mock("../services/distributedEncoding/persistence.js", async importOriginal => ({
  ...await importOriginal(),
  getEncodingWorker: vi.fn(async () => ({ Enabled: state.enabled, Role: "CLONE", VideoEncodingWorkerID: "clone-test" })),
  consumeEncodingRequestNonce: vi.fn(async () => {}),
}));
import routes from "../routes/internalAiDubbingRoutes.js";
import { buildTransferHeaders, sha256String, stableStringify } from "../services/videoTransferSecurity.js";
import { AI_DUBBING_SIGNATURE_DOMAIN } from "../services/aiDubbing/constants.js";

const roots = [];
afterEach(async () => { state.enabled = true; await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))); });
describe("route de diagnostic authentifiée", () => {
  it("refuse absence de signature, altération et clone désactivé ; accepte le corps signé", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "sami-diagnostic-route-")); roots.push(root);
    state.config = { root, role: "PRIMARY", sharedSecret: "test-shared-secret-at-least-32-bytes-long" };
    const app = Fastify();
    await app.register(routes, { prefix: "/api/internal/ai-dubbing" });
    const url = "/api/internal/ai-dubbing/diagnostics";
    const body = { id: `failure-${crypto.randomUUID()}`, files: [{ name: "error.json", content: "{}", sha256: sha256String("{}") }] };
    const headers = () => buildTransferHeaders({ secret: state.config.sharedSecret,
      signatureDomain: AI_DUBBING_SIGNATURE_DOMAIN, method: "POST", path: url,
      sourceInstanceId: "clone-test", bodySha256: sha256String(stableStringify(body)),
    });
    try {
      expect((await app.inject({ method: "POST", url, payload: body })).statusCode).toBe(401);
      expect((await app.inject({ method: "POST", url, headers: headers(), payload: { ...body, id: `failure-${crypto.randomUUID()}` } })).statusCode).toBe(401);
      state.enabled = false;
      expect((await app.inject({ method: "POST", url, headers: headers(), payload: body })).statusCode).toBe(403);
      state.enabled = true;
      const accepted = await app.inject({ method: "POST", url, headers: headers(), payload: body });
      expect(accepted.statusCode).toBe(200);
      expect(accepted.json()).toMatchObject({ id: body.id, received: true });
    } finally { await app.close(); }
  });
});
