import { createLog } from "./logController.js";
import { ensureSuperAdmin } from "../services/authz.js";
import {
  createDistributedVideoJob,
  deleteDistributedEncodingWorker,
  getDistributedEncodingPublicConfig,
  getDistributedEncodingRetentionSnapshot,
  getDistributedVideoJob,
  listDistributedEncodingWorkers,
  listDistributedVideoJobs,
  patchDistributedEncodingWorker,
  registerDistributedEncodingWorker,
  requestDistributedVideoJobCancellation,
  resumeDistributedVideoJob,
  updateDistributedEncodingPublicConfig,
} from "../services/distributedEncoding/jobService.js";
import { toDistributedEncodingHttpError } from "../services/distributedEncoding/error.js";
import { serializeEncodingJob } from "../services/distributedEncoding/serializer.js";

const sendError = (reply, error, fallbackMessage) =>
  toDistributedEncodingHttpError(reply, error, fallbackMessage);

const requireSuperAdmin = async (request, reply) =>
  ensureSuperAdmin(request, reply);

const serializeCreatedJob = (job) =>
  job?.VideoEncodingJobID ? serializeEncodingJob(job) : job;

const boundedLimit = (value, fallback = 20) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(100, parsed)
    : fallback;
};

const boundedPage = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
};

const isTruthyQueryValue = (value) => ["1", "true", "yes", "on"].includes(
  String(value || "").trim().toLowerCase()
);

export const getVideoEncodingConfig = async (request, reply) => {
  try {
    if (!(await requireSuperAdmin(request, reply))) return;
    return reply.send(await getDistributedEncodingPublicConfig());
  } catch (error) {
    return sendError(
      reply,
      error,
      "Impossible de lire la configuration d'encodage multi-server."
    );
  }
};

export const updateVideoEncodingConfig = async (request, reply) => {
  try {
    const admin = await requireSuperAdmin(request, reply);
    if (!admin) return;

    const { enabled } = request.body || {};
    if (typeof enabled !== "boolean") {
      return reply.status(400).send({
        error: "enabled doit être un booléen.",
        code: "INVALID_DISTRIBUTED_ENCODING_SETTING",
      });
    }

    const previous = await getDistributedEncodingPublicConfig();
    const config = await updateDistributedEncodingPublicConfig(enabled);
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "distributed_encoding_toggle",
      Champ: "distributed_encoding",
      AncienneValeur: String(Boolean(previous?.enabled)),
      NouvelleValeur: String(Boolean(config?.enabled)),
      Meta: {
        instanceId: config?.instanceId || null,
        operational: Boolean(config?.operational),
      },
    });
    return reply.send(config);
  } catch (error) {
    return sendError(
      reply,
      error,
      "Impossible de modifier la configuration d'encodage multi-server."
    );
  }
};

export const getVideoEncodingWorkers = async (request, reply) => {
  try {
    if (!(await requireSuperAdmin(request, reply))) return;
    return reply.send({ workers: await listDistributedEncodingWorkers() });
  } catch (error) {
    return sendError(reply, error, "Impossible de récupérer les workers d'encodage.");
  }
};

export const createVideoEncodingWorker = async (request, reply) => {
  try {
    const admin = await requireSuperAdmin(request, reply);
    if (!admin) return;
    const worker = await registerDistributedEncodingWorker(request.body || {});
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "distributed_encoding_worker_updated",
      Champ: "distributed_encoding_worker",
      NouvelleValeur: worker?.id || request.body?.instanceId || null,
      Meta: { operation: "created", worker },
    });
    return reply.status(201).send({ worker });
  } catch (error) {
    return sendError(reply, error, "Impossible d'enregistrer le worker d'encodage.");
  }
};

export const updateVideoEncodingWorker = async (request, reply) => {
  try {
    const admin = await requireSuperAdmin(request, reply);
    if (!admin) return;
    const worker = await patchDistributedEncodingWorker(
      request.params?.workerId,
      request.body || {}
    );
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "distributed_encoding_worker_updated",
      Champ: "distributed_encoding_worker",
      NouvelleValeur: worker?.id || request.params?.workerId || null,
      Meta: { operation: "updated", changes: request.body || {}, worker },
    });
    return reply.send({ worker });
  } catch (error) {
    return sendError(reply, error, "Impossible de modifier le worker d'encodage.");
  }
};

export const removeVideoEncodingWorker = async (request, reply) => {
  try {
    const admin = await requireSuperAdmin(request, reply);
    if (!admin) return;
    const result = await deleteDistributedEncodingWorker(request.params?.workerId);
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "distributed_encoding_worker_updated",
      Champ: "distributed_encoding_worker",
      NouvelleValeur: request.params?.workerId || null,
      Meta: {
        operation: result?.deleted ? "deleted" : "disabled",
        result,
      },
    });
    return reply.send(result);
  } catch (error) {
    return sendError(reply, error, "Impossible de supprimer le worker d'encodage.");
  }
};

export const createVideoEncodingJob = async (request, reply) => {
  try {
    const admin = await requireSuperAdmin(request, reply);
    if (!admin) return;

    const rawJob = await createDistributedVideoJob({
      request,
      adminUserId: admin.userId,
    });
    const job = serializeCreatedJob(rawJob);
    const videoId = Number(job?.videoId);
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "distributed_encoding_job_started",
      VideoID: Number.isSafeInteger(videoId) && videoId > 0
        ? videoId
        : null,
      Champ: "distributed_encoding_job",
      NouvelleValeur: job?.id || null,
      Meta: {
        jobId: job?.id || null,
        sourceOriginalName: job?.sourceOriginalName || null,
      },
    });
    return reply.status(202).send({ job });
  } catch (error) {
    return sendError(reply, error, "Impossible de créer le job d'encodage multi-server.");
  }
};

export const getVideoEncodingJobs = async (request, reply) => {
  try {
    if (!(await requireSuperAdmin(request, reply))) return;
    const query = request.query || {};
    const includeRetention = isTruthyQueryValue(query.includeRetention);
    const [result, retention] = await Promise.all([
      listDistributedVideoJobs({
        active: String(query.scope || "").toLowerCase() === "active",
        page: boundedPage(query.page),
        limit: boundedLimit(query.limit),
      }),
      includeRetention
        ? getDistributedEncodingRetentionSnapshot()
        : Promise.resolve(null),
    ]);
    return reply.send({
      ...result,
      ...(retention ? { retention } : {}),
    });
  } catch (error) {
    return sendError(reply, error, "Impossible de récupérer les jobs d'encodage.");
  }
};

export const getVideoEncodingJob = async (request, reply) => {
  try {
    if (!(await requireSuperAdmin(request, reply))) return;
    const job = await getDistributedVideoJob(request.params?.jobId);
    if (!job) {
      return reply.status(404).send({
        error: "Job d'encodage introuvable.",
        code: "VIDEO_ENCODING_JOB_NOT_FOUND",
      });
    }
    return reply.send({ job });
  } catch (error) {
    return sendError(reply, error, "Impossible de récupérer le job d'encodage.");
  }
};

export const resumeVideoEncodingJob = async (request, reply) => {
  try {
    const admin = await requireSuperAdmin(request, reply);
    if (!admin) return;
    const job = await resumeDistributedVideoJob(request.params?.jobId);
    const videoId = Number(job?.videoId ?? job?.VideoID);
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "distributed_encoding_job_resumed",
      VideoID: Number.isSafeInteger(videoId) && videoId > 0 ? videoId : null,
      Champ: "distributed_encoding_job",
      NouvelleValeur: job?.id || job?.VideoEncodingJobID || request.params?.jobId || null,
      Meta: { status: job?.status || job?.Status || null },
    });
    return reply.status(202).send({ job });
  } catch (error) {
    return sendError(reply, error, "Impossible de reprendre le job d'encodage.");
  }
};

export const cancelVideoEncodingJob = async (request, reply) => {
  try {
    const admin = await requireSuperAdmin(request, reply);
    if (!admin) return;
    const job = await requestDistributedVideoJobCancellation(
      request.params?.jobId
    );
    const videoId = Number(job?.videoId ?? job?.VideoID);
    await createLog({
      request,
      UtilisateurID: admin.userId,
      ActionNom: "distributed_encoding_job_cancel_requested",
      VideoID: Number.isSafeInteger(videoId) && videoId > 0 ? videoId : null,
      Champ: "distributed_encoding_job",
      NouvelleValeur: job?.id || job?.VideoEncodingJobID || request.params?.jobId || null,
      Meta: { status: job?.status || job?.Status || null },
    });
    return reply.status(202).send({ job });
  } catch (error) {
    return sendError(reply, error, "Impossible d'annuler le job d'encodage.");
  }
};
