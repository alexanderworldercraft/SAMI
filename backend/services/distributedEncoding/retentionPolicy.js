import {
  ENCODING_JOB_STATUS,
  INCOMPLETE_ENCODING_EXPIRED_STEP,
} from "./constants.js";

export const buildDistributedEncodingTerminalHistoryWhere = (cutoff) => ({
  CompletedAt: { lte: cutoff },
  OR: [
    { Status: ENCODING_JOB_STATUS.COMPLETED },
    { Status: ENCODING_JOB_STATUS.CANCELLED },
    {
      Status: ENCODING_JOB_STATUS.FAILED,
      CurrentStep: { in: ["expired", INCOMPLETE_ENCODING_EXPIRED_STEP] },
    },
  ],
});
