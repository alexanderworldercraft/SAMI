import { internalAiDubbingRawAuth, internalAiDubbingBodyIntegrity } from "../middlewares/internalAiDubbingAuth.js";
import { claimVoice, finishVoice, renewVoice } from "../services/voices/leases.js";

export default async function internalVoiceRoutes(app) {
  app.addHook("onRequest", internalAiDubbingRawAuth);
  app.addHook("preHandler", internalAiDubbingBodyIntegrity);
  app.post("/claim", async req => ({ lease: await claimVoice(req.aiDubbingAuth.sourceInstanceId) }));
  app.post("/:id/renew", async req => renewVoice(req.aiDubbingAuth.sourceInstanceId, req.params.id, req.body?.token));
  app.post("/:id/finish", { bodyLimit: 22 * 1024 * 1024 }, async req => finishVoice(req.aiDubbingAuth.sourceInstanceId, req.params.id, req.body || {}));
}
