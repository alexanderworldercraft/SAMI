import {
  claimNextAiDubbingJob,
  completeAiDubbingLease,
  failAiDubbingLease,
  getAiDubbingLeaseAsset,
  heartbeatAiDubbingWorker,
  registerAiDubbingArtifactManifest,
  renewAiDubbingLease,
  serializeAiDubbingLease,
  serializeAiDubbingWorker,
  uploadAiDubbingArtifact,
} from "../services/aiDubbing/leaseService.js";
import { serializeAiDubbingJob } from "../services/aiDubbing/jobService.js";
import { assertAiDubbingConfig } from "../services/aiDubbing/config.js";
import { receiveAiDubbingDiagnostic } from "../services/aiDubbing/diagnosticTransfer.js";

const workerId = (request) => request.aiDubbingAuth?.sourceInstanceId;
const scalarHeader = (request, name) => {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
};
const leaseBody = (request) => ({
  jobId: request.params?.jobId,
  workerId: workerId(request),
  leaseToken: request.body?.leaseToken,
  leaseGeneration: request.body?.leaseGeneration,
});
const leaseHeaders = (request) => ({
  jobId: request.params?.jobId,
  workerId: workerId(request),
  leaseToken: scalarHeader(request, "x-sami-ai-dubbing-lease"),
  leaseGeneration: scalarHeader(request, "x-sami-ai-dubbing-lease-generation"),
});
const sendError = (reply, error, fallback) => {
  const parsed = Number(error?.statusCode);
  const statusCode = Number.isInteger(parsed) && parsed >= 400 && parsed <= 599 ? parsed : 500;
  if (statusCode >= 500) console.error("[internal-ai-dubbing]", error);
  return reply.status(statusCode).send({
    error: error?.message || fallback,
    ...(error?.code ? { code: error.code } : {}),
  });
};

export const receiveInternalAiDubbingDiagnostic = async (request, reply) => {
  try {
    return reply.send(await receiveAiDubbingDiagnostic({
      config: assertAiDubbingConfig(), workerId: workerId(request), payload: request.body,
    }));
  } catch (error) { return sendError(reply, error, "Réception du diagnostic impossible."); }
};

export const heartbeatInternalAiDubbingWorker = async (request, reply) => {
  try {
    const worker = await heartbeatAiDubbingWorker(workerId(request), request.body || {});
    return reply.send({ worker: serializeAiDubbingWorker(worker), serverTime: new Date().toISOString() });
  } catch (error) {
    return sendError(reply, error, "Heartbeat de doublage impossible.");
  }
};

export const claimInternalAiDubbingJob = async (request, reply) => {
  try {
    const claim = await claimNextAiDubbingJob({ workerId: workerId(request) });
    return reply.send({ lease: serializeAiDubbingLease(claim) });
  } catch (error) {
    return sendError(reply, error, "Attribution du doublage impossible.");
  }
};

export const renewInternalAiDubbingJob = async (request, reply) => {
  try {
    const job = await renewAiDubbingLease({
      ...leaseBody(request),
      progress: request.body?.progress,
      phase: request.body?.phase,
    });
    return reply.send({ job: serializeAiDubbingJob(job) });
  } catch (error) {
    return sendError(reply, error, "Renouvellement du doublage impossible.");
  }
};

export const failInternalAiDubbingJob = async (request, reply) => {
  try {
    const job = await failAiDubbingLease({
      ...leaseBody(request),
      errorMessage: request.body?.errorMessage || request.body?.error,
      retryable: request.body?.retryable !== false,
    });
    return reply.send({ job: serializeAiDubbingJob(job) });
  } catch (error) {
    return sendError(reply, error, "Signalement du doublage impossible.");
  }
};

export const getInternalAiDubbingAsset = async (request, reply) => {
  try {
    const asset = await getAiDubbingLeaseAsset({
      ...leaseHeaders(request),
      fileId: request.params?.fileId,
      offset: request.query?.offset,
    });
    reply.header("etag", `"${asset.entry.sha256}"`);
    reply.header("x-sami-source-size", String(asset.size));
    reply.header("accept-ranges", "bytes");
    reply.header("content-type", "application/octet-stream");
    reply.header("content-length", String(asset.length));
    if (asset.offset > 0) {
      reply.header("content-range", `bytes ${asset.offset}-${asset.size - 1}/${asset.size}`);
    }
    return reply.status(asset.offset > 0 ? 206 : 200).send(asset.stream);
  } catch (error) {
    return sendError(reply, error, "Ouverture de l'entrée de doublage impossible.");
  }
};

export const registerInternalAiDubbingArtifacts = async (request, reply) => {
  try {
    const job = await registerAiDubbingArtifactManifest({
      ...leaseBody(request),
      manifest: request.body?.manifest,
      manifestHash: request.body?.manifestHash,
    });
    return reply.send({ job: serializeAiDubbingJob(job) });
  } catch (error) {
    return sendError(reply, error, "Enregistrement des sorties de doublage impossible.");
  }
};

export const uploadInternalAiDubbingArtifact = async (request, reply) => {
  try {
    const contentLength = Number(request.headers?.["content-length"]);
    if (!Number.isSafeInteger(contentLength) || contentLength <= 0) {
      const error = new Error("Content-Length est requis pour envoyer une sortie de doublage.");
      error.statusCode = 411;
      throw error;
    }
    const result = await uploadAiDubbingArtifact({
      ...leaseHeaders(request),
      fileId: request.params?.fileId,
      stream: request.raw,
      declaredBodySha256: request.aiDubbingAuth?.bodySha256,
      declaredContentLength: contentLength,
    });
    return reply.send(result);
  } catch (error) {
    request.raw?.resume?.();
    return sendError(reply, error, "Réception de la sortie de doublage impossible.");
  }
};

export const completeInternalAiDubbingJob = async (request, reply) => {
  try {
    const job = await completeAiDubbingLease({
      ...leaseBody(request),
      result: request.body?.result,
    });
    return reply.send({ job: serializeAiDubbingJob(job) });
  } catch (error) {
    return sendError(reply, error, "Finalisation du doublage impossible.");
  }
};
