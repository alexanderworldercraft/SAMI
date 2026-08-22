import { createLog } from "../../controllers/logController.js";
import { prisma } from "../db.js";
import { ENCODING_JOB_STATUS } from "./constants.js";

export const DISTRIBUTED_ENCODING_JOB_ACTIONS = Object.freeze([
  "distributed_encoding_job_started",
  "distributed_encoding_job_completed",
  "distributed_encoding_job_failed",
  "distributed_encoding_job_cancelled",
]);

const logKey = ({ userId, actionName, jobId }) =>
  `${Number(userId)}|${String(actionName)}|${String(jobId)}`;

export const getExpectedDistributedEncodingJobActions = (job) => {
  const actions = ["distributed_encoding_job_started"];
  if (job.Status === ENCODING_JOB_STATUS.COMPLETED) {
    actions.push("distributed_encoding_job_completed");
  } else if (job.Status === ENCODING_JOB_STATUS.FAILED) {
    actions.push("distributed_encoding_job_failed");
  } else if (job.Status === ENCODING_JOB_STATUS.CANCELLED) {
    actions.push("distributed_encoding_job_cancelled");
  }
  return actions;
};

/**
 * VideoEncodingJob est la source de vérité. Cette passe recrée les jalons
 * d'audit qui auraient pu être perdus entre une transition persistée et le log.
 */
export async function reconcileDistributedEncodingLogs() {
  const [jobs, actions] = await Promise.all([
    prisma.videoEncodingJob.findMany({
      select: {
        VideoEncodingJobID: true,
        VideoID: true,
        InitiatedByUserID: true,
        Status: true,
        SourceOriginalName: true,
        ErrorMessage: true,
      },
    }),
    prisma.action.findMany({
      where: { Nom: { in: [...DISTRIBUTED_ENCODING_JOB_ACTIONS] } },
      select: { ActionID: true, Nom: true },
    }),
  ]);

  const actionNameById = new Map(
    actions.map((action) => [action.ActionID, action.Nom])
  );
  const actionIdByName = new Map(
    actions.map((action) => [action.Nom, action.ActionID])
  );
  const logs = actions.length
    ? await prisma.log.findMany({
        where: {
          ActionID: { in: actions.map((action) => action.ActionID) },
          Champ: "distributed_encoding_job",
        },
        select: {
          UtilisateurID: true,
          ActionID: true,
          NouvelleValeur: true,
        },
      })
    : [];
  const existingKeys = new Set(
    logs.map((log) => logKey({
      userId: log.UtilisateurID,
      actionName: actionNameById.get(log.ActionID),
      jobId: log.NouvelleValeur,
    }))
  );
  const referencedVideoIds = [...new Set(
    jobs
      .map((job) => Number(job.VideoID))
      .filter((videoId) => Number.isSafeInteger(videoId) && videoId > 0)
  )];
  const existingVideos = referencedVideoIds.length > 0
    ? await prisma.video.findMany({
        where: { VideoID: { in: referencedVideoIds } },
        select: { VideoID: true },
      })
    : [];
  const existingVideoIds = new Set(existingVideos.map((video) => video.VideoID));

  let created = 0;
  let existing = 0;
  let failed = 0;
  let skipped = 0;

  for (const job of jobs) {
    const userId = Number(job.InitiatedByUserID);
    const referencedVideoId = Number(job.VideoID);
    const videoId = Number.isSafeInteger(referencedVideoId)
      && referencedVideoId > 0
      && existingVideoIds.has(referencedVideoId)
      ? referencedVideoId
      : null;
    const expectedActions = getExpectedDistributedEncodingJobActions(job);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      skipped += expectedActions.length;
      continue;
    }

    for (const actionName of expectedActions) {
      if (!actionIdByName.has(actionName)) {
        failed += 1;
        continue;
      }
      const expectedKey = logKey({
        userId,
        actionName,
        jobId: job.VideoEncodingJobID,
      });
      if (existingKeys.has(expectedKey)) {
        existing += 1;
        continue;
      }

      const result = await createLog({
        request: null,
        UtilisateurID: userId,
        ActionNom: actionName,
        VideoID: videoId,
        Champ: "distributed_encoding_job",
        NouvelleValeur: job.VideoEncodingJobID,
        Meta: {
          reconciled: true,
          jobId: job.VideoEncodingJobID,
          status: job.Status,
          sourceOriginalName: job.SourceOriginalName,
          ...(referencedVideoId > 0 && videoId === null
            ? { deletedVideoId: referencedVideoId }
            : {}),
          ...(job.ErrorMessage ? { error: job.ErrorMessage } : {}),
        },
        DedupeMs: 365 * 24 * 60 * 60 * 1000,
      });
      if (result?.ok) {
        existingKeys.add(expectedKey);
        if (result.deduped) existing += 1;
        else created += 1;
      } else {
        failed += 1;
      }
    }
  }

  return { jobs: jobs.length, created, existing, failed, skipped };
}
