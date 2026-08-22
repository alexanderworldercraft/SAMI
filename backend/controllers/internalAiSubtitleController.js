import {
  claimNextAiSubtitleJob,
  completeAiSubtitleLease,
  failAiSubtitleLease,
  getAiSubtitleLeaseSource,
  heartbeatAiSubtitleWorker,
  renewAiSubtitleLease,
  serializeAiSubtitleClaim,
  serializeAiSubtitleJob,
  serializeAiSubtitleWorker,
} from "../services/aiSubtitles/jobService.js";
import { openAiSubtitleSource } from "../services/aiSubtitles/sourceService.js";
import { sendAiSubtitleError } from "../services/aiSubtitles/error.js";

const workerId = (request) => request.aiSubtitleAuth?.sourceInstanceId;
const header = (request, name) => {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
};
const leaseBody = (request) => ({
  jobId: request.params?.jobId,
  workerId: workerId(request),
  leaseToken: request.body?.leaseToken,
  leaseGeneration: request.body?.leaseGeneration,
});

export const heartbeatInternalAiSubtitleWorker = async (request, reply) => {
  try {
    const worker = await heartbeatAiSubtitleWorker(workerId(request), request.body || {});
    return reply.send({ worker: serializeAiSubtitleWorker(worker), serverTime: new Date().toISOString() });
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Heartbeat IA impossible.");
  }
};

export const claimInternalAiSubtitleJob = async (request, reply) => {
  try {
    const claim = await claimNextAiSubtitleJob({ workerId: workerId(request) });
    return reply.send({ lease: serializeAiSubtitleClaim(claim) });
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Attribution IA impossible.");
  }
};

export const renewInternalAiSubtitleJob = async (request, reply) => {
  try {
    const job = await renewAiSubtitleLease({
      ...leaseBody(request),
      progress: request.body?.progress,
      phase: request.body?.phase,
    });
    return reply.send({ job: serializeAiSubtitleJob(job) });
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Renouvellement du bail IA impossible.");
  }
};

export const failInternalAiSubtitleJob = async (request, reply) => {
  try {
    const job = await failAiSubtitleLease({
      ...leaseBody(request),
      errorMessage: request.body?.errorMessage || request.body?.error,
    });
    return reply.send({ job: serializeAiSubtitleJob(job) });
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Signalement de l'échec IA impossible.");
  }
};

export const completeInternalAiSubtitleJob = async (request, reply) => {
  try {
    const job = await completeAiSubtitleLease({
      ...leaseBody(request),
      result: request.body?.result,
    });
    return reply.send({ job: serializeAiSubtitleJob(job) });
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Publication du sous-titre IA impossible.");
  }
};

export const getInternalAiSubtitleSource = async (request, reply) => {
  try {
    const job = await getAiSubtitleLeaseSource({
      jobId: request.params?.jobId,
      workerId: workerId(request),
      leaseToken: header(request, "x-sami-ai-lease"),
      leaseGeneration: header(request, "x-sami-ai-lease-generation"),
    });
    const source = await openAiSubtitleSource({
      relativePath: job.SourceRelativePath,
      offset: request.query?.offset,
    });
    reply.header("etag", `"${job.SourceSha256}"`);
    reply.header("x-sami-source-size", String(source.size));
    reply.header("accept-ranges", "bytes");
    reply.header("content-type", "audio/wav");
    reply.header("content-length", String(source.length));
    if (source.offset > 0) {
      reply.header("content-range", `bytes ${source.offset}-${source.size - 1}/${source.size}`);
    }
    return reply.status(source.offset > 0 ? 206 : 200).send(source.stream);
  } catch (error) {
    return sendAiSubtitleError(reply, error, "Ouverture de la source audio IA impossible.");
  }
};
