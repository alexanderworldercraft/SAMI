import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_ADMIN_MESSAGE_DURATION_MS,
  deactivateExpiredAdminMessages,
  resolveAdminMessageExpiration,
} from "../services/adminMessageService.js";

describe("adminMessageService", () => {
  it("utilise une durée de 7 jours quand aucune échéance n'est fournie", () => {
    const now = new Date("2026-07-29T10:00:00.000Z");

    const expiration = resolveAdminMessageExpiration(undefined, now);

    expect(expiration.getTime() - now.getTime()).toBe(
      DEFAULT_ADMIN_MESSAGE_DURATION_MS
    );
  });

  it("accepte uniquement une échéance personnalisée future", () => {
    const now = new Date("2026-07-29T10:00:00.000Z");

    expect(
      resolveAdminMessageExpiration("2026-08-15T18:30:00.000Z", now)
    ).toEqual(new Date("2026-08-15T18:30:00.000Z"));
    expect(() => resolveAdminMessageExpiration("date-invalide", now)).toThrow(
      "invalide"
    );
    expect(() =>
      resolveAdminMessageExpiration("2026-07-29T09:59:59.000Z", now)
    ).toThrow("futur");
  });

  it("désactive en base les messages actifs dont l'échéance est passée", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const now = new Date("2026-08-05T10:00:00.000Z");

    const result = await deactivateExpiredAdminMessages({
      client: { adminMessage: { updateMany } },
      now,
    });

    expect(result).toEqual({ count: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        Actif: true,
        ExpiresAt: { lte: now },
      },
      data: {
        Actif: false,
      },
    });
  });
});
