import {
  completeEncodingArtifacts,
  getActiveEncodingLease,
  receiveEncodingArtifact,
  registerEncodingArtifactManifest,
} from "../services/distributedEncoding/artifactService.js";
import {
  distributedEncodingError,
  toDistributedEncodingHttpError,
} from "../services/distributedEncoding/error.js";
import { advanceDistributedEncodingJob } from "../services/distributedEncoding/finalizationService.js";
import {
  failEncodingTaskLease,
  heartbeatEncodingWorker,
  listPurgeableEncodingSourceHashesForWorker,
  releaseEncodingTaskLease,
  renewEncodingTaskLease,
} from "../services/distributedEncoding/persistence.js";
import { claimNextEncodingTask } from "../services/distributedEncoding/scheduler.js";
import {
  serializeEncodingAttempt,
  serializeEncodingJob,
  serializeEncodingTask,
  serializeEncodingWorker,
} from "../services/distributedEncoding/serializer.js";
import { openDistributedSource } from "../services/distributedEncoding/sourceService.js";

const LEASE_TOKEN_HEADER = "x-sami-encoding-lease";
const LEASE_GENERATION_HEADER = "x-sami-encoding-lease-generation";
const LEASE_TASK_ID_HEADER = "x-sami-encoding-task-id";

const statusForKnownInternalError = (error) => {
  if (Number.isInteger(Number(error?.statusCode))) return error;
  if (error?.code === "ENCODING_LEASE_LOST") {
    error.statusCode = 409;
  } else if (error?.code === "ENCODING_WORKER_NOT_ENABLED") {
    error.statusCode = 403;
  } else if (error?.code === "ENCODING_ATTEMPT_NOT_FOUND") {
    error.statusCode = 409;
  }
  return error;
};

const sendError = (reply, error, fallbackMessage) =>
  toDistributedEncodingHttpError(
    reply,
    statusForKnownInternalError(error),
    fallbackMessage
  );

const workerIdFrom = (request) => {
  const workerId = String(request.encodingAuth?.sourceInstanceId || "").trim();
  if (!workerId) {
    throw distributedEncodingError(
      "L'identifiant du worker authentifié est absent.",
      "DISTRIBUTED_ENCODING_WORKER_ID_MISSING",
      401
    );
  }
  return workerId;
};

const scalarHeader = (request, name) => {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
};

const positiveLeaseGeneration = (value) => {
  const generation = Number(value);
  if (!Number.isSafeInteger(generation) || generation <= 0) {
    throw distributedEncodingError(
      "La génération du lease est invalide.",
      "INVALID_ENCODING_LEASE_GENERATION"
    );
  }
  return generation;
};

const leaseToken = (value) => {
  const token = String(value || "");
  if (token.length < 32) {
    throw distributedEncodingError(
      "Le jeton du lease est invalide.",
      "INVALID_ENCODING_LEASE_TOKEN"
    );
  }
  return token;
};

const leaseFromBody = (request) => ({
  taskId: request.params?.taskId,
  workerId: workerIdFrom(request),
  leaseToken: leaseToken(request.body?.leaseToken),
  leaseGeneration: positiveLeaseGeneration(
    request.body?.leaseGeneration ?? request.body?.manifest?.leaseGeneration
  ),
});

const leaseFromHeaders = (request) => ({
  taskId: request.params?.taskId,
  workerId: workerIdFrom(request),
  leaseToken: leaseToken(scalarHeader(request, LEASE_TOKEN_HEADER)),
  leaseGeneration: positiveLeaseGeneration(
    scalarHeader(request, LEASE_GENERATION_HEADER)
  ),
});

const serializeClaim = (claim) => {
  if (!claim) return null;
  const task = claim.serializedTask || serializeEncodingTask(claim.task);
  const job = claim.serializedJob || serializeEncodingJob(claim.job);
  const attempt = claim.serializedAttempt
    || serializeEncodingAttempt(claim.attempt);
  return {
    task,
    job,
    attempt,
    leaseToken: claim.leaseToken,
    leaseGeneration: claim.leaseGeneration,
    leaseExpiresAt: claim.leaseExpiresAt,
    renewAfterMs: claim.renewAfterMs,
    source: {
      jobId: job.id,
      sha256: job.sourceSha256,
      size: job.sourceSize,
      originalName: job.sourceOriginalName,
    },
  };
};

export const heartbeatInternalVideoEncodingWorker = async (request, reply) => {
  try {
    const workerId = workerIdFrom(request);
    const worker = await heartbeatEncodingWorker(
      workerId,
      request.body || {}
    );
    return reply.send({
      worker: serializeEncodingWorker(worker),
      serverTime: new Date().toISOString(),
      purgeSourceSha256:
        await listPurgeableEncodingSourceHashesForWorker(workerId),
    });
  } catch (error) {
    return sendError(reply, error, "Impossible d'enregistrer le heartbeat du worker.");
  }
};

export const claimInternalVideoEncodingTask = async (request, reply) => {
  try {
    const claim = await claimNextEncodingTask({
      instanceId: workerIdFrom(request),
    });
    return reply.send({ lease: serializeClaim(claim) });
  } catch (error) {
    return sendError(reply, error, "Impossible d'attribuer une tâche au worker.");
  }
};

export const renewInternalVideoEncodingTask = async (request, reply) => {
  try {
    const task = await renewEncodingTaskLease({
      ...leaseFromBody(request),
      progress: request.body?.progress,
      phase: request.body?.phase,
    });
    return reply.send({ task: serializeEncodingTask(task) });
  } catch (error) {
    return sendError(reply, error, "Impossible de renouveler le lease d'encodage.");
  }
};

export const failInternalVideoEncodingTask = async (request, reply) => {
  try {
    const task = await failEncodingTaskLease({
      ...leaseFromBody(request),
      errorMessage:
        request.body?.error
        || request.body?.errorMessage
        || "Le worker a signalé un échec d'encodage.",
    });
    await advanceDistributedEncodingJob(task.VideoEncodingJobID);
    return reply.send({ task: serializeEncodingTask(task) });
  } catch (error) {
    return sendError(reply, error, "Impossible de signaler l'échec de la tâche.");
  }
};

export const releaseInternalVideoEncodingTask = async (request, reply) => {
  try {
    const task = await releaseEncodingTaskLease({
      ...leaseFromBody(request),
      reason:
        request.body?.reason
        || request.body?.error
        || "Le worker a libéré la tâche.",
    });
    await advanceDistributedEncodingJob(task.VideoEncodingJobID);
    return reply.send({ task: serializeEncodingTask(task) });
  } catch (error) {
    return sendError(reply, error, "Impossible de libérer la tâche d'encodage.");
  }
};

export const getInternalVideoEncodingSource = async (request, reply) => {
  try {
    const taskId = String(
      scalarHeader(request, LEASE_TASK_ID_HEADER) || ""
    ).trim();
    if (!taskId) {
      throw distributedEncodingError(
        "L'identifiant de tâche du lease est absent.",
        "DISTRIBUTED_ENCODING_TASK_ID_MISSING"
      );
    }

    const lease = await getActiveEncodingLease({
      taskId,
      workerId: workerIdFrom(request),
      leaseToken: leaseToken(scalarHeader(request, LEASE_TOKEN_HEADER)),
      leaseGeneration: positiveLeaseGeneration(
        scalarHeader(request, LEASE_GENERATION_HEADER)
      ),
    });
    const job = lease.task?.Job;
    if (
      !job
      || String(job.VideoEncodingJobID) !== String(request.params?.jobId)
    ) {
      throw distributedEncodingError(
        "La source demandée ne correspond pas au lease actif.",
        "DISTRIBUTED_ENCODING_SOURCE_LEASE_MISMATCH",
        409
      );
    }

    const source = await openDistributedSource({
      relativePath: job.SourceRelativePath,
      offset: request.query?.offset ?? 0,
    });
    const statusCode = source.offset > 0 ? 206 : 200;
    reply.header("etag", `"${job.SourceSha256}"`);
    reply.header("x-sami-source-size", String(source.size));
    reply.header("accept-ranges", "bytes");
    reply.header("content-type", "application/octet-stream");
    reply.header("content-length", String(source.length));
    if (statusCode === 206) {
      reply.header(
        "content-range",
        source.length > 0
          ? `bytes ${source.offset}-${source.size - 1}/${source.size}`
          : `bytes */${source.size}`
      );
    }
    return reply.status(statusCode).send(source.stream);
  } catch (error) {
    return sendError(reply, error, "Impossible d'ouvrir la source d'encodage.");
  }
};

export const registerInternalVideoEncodingArtifacts = async (request, reply) => {
  try {
    const result = await registerEncodingArtifactManifest({
      ...leaseFromBody(request),
      manifest: request.body?.manifest,
      manifestHash: request.body?.manifestHash,
    });
    return reply.send(result);
  } catch (error) {
    return sendError(reply, error, "Impossible d'enregistrer le manifeste d'artefacts.");
  }
};

export const uploadInternalVideoEncodingArtifact = async (request, reply) => {
  try {
    const contentLength = Number(request.headers?.["content-length"]);
    if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
      throw distributedEncodingError(
        "Content-Length est requis pour envoyer un artefact.",
        "DISTRIBUTED_ARTIFACT_CONTENT_LENGTH_REQUIRED",
        411
      );
    }
    const result = await receiveEncodingArtifact({
      ...leaseFromHeaders(request),
      fileId: request.params?.fileId,
      stream: request.raw,
      declaredBodySha256: request.encodingAuth?.bodySha256,
      declaredContentLength: contentLength,
    });
    return reply.send(result);
  } catch (error) {
    request.raw?.resume?.();
    return sendError(reply, error, "Impossible de recevoir l'artefact d'encodage.");
  }
};

export const completeInternalVideoEncodingTask = async (request, reply) => {
  try {
    const task = await completeEncodingArtifacts(leaseFromBody(request));
    const job = await advanceDistributedEncodingJob(task.VideoEncodingJobID);
    return reply.send({
      task: serializeEncodingTask(task),
      purgeSource: ["COMPLETED", "CANCELLED"].includes(job?.Status),
    });
  } catch (error) {
    return sendError(reply, error, "Impossible de finaliser les artefacts d'encodage.");
  }
};
