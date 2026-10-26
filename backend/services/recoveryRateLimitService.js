import crypto from "node:crypto";
import { prisma } from "./db.js";

// MySQL's upsert takes the bucket lock. Read the counter in the same transaction
// so concurrent processes cannot reset a window twice or lose increments.
export async function consumeRecoveryLimit(key, { max, windowMs, database = prisma, now = new Date() }) {
  const KeyHash = crypto.createHash("sha256").update(key).digest("hex");
  const resetAt = new Date(now.getTime() + windowMs);
  return database.$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO SecurityRateLimit (KeyHash, Count, ResetAt)
      VALUES (${KeyHash}, 1, ${resetAt})
      ON DUPLICATE KEY UPDATE
        Count = IF(ResetAt <= ${now}, 1, LEAST(Count + 1, 2147483647)),
        ResetAt = IF(ResetAt <= ${now}, ${resetAt}, ResetAt)`;
    const row = await tx.securityRateLimit.findUnique({ where: { KeyHash } });
    return row.Count <= max;
  });
}
