import { describe, expect, it } from "vitest";

import {
  buildBackupCronExpression,
  parsePublicOrigins,
  parseServerPort,
} from "../server/serverConfig.js";

describe("serverConfig", () => {
  it("normalise la liste des origines publiques", () => {
    expect(parsePublicOrigins(" https://sami.test,https://admin.sami.test ")).toEqual([
      "https://sami.test",
      "https://admin.sami.test",
    ]);
    expect(parsePublicOrigins()).toEqual([]);
  });

  it("valide le port d'écoute", () => {
    expect(parseServerPort("3000")).toBe(3000);
    expect(() => parseServerPort("3000abc")).toThrow(/PORTS/);
    expect(() => parseServerPort("70000")).toThrow(/PORTS/);
  });

  it("construit uniquement des expressions cron de sauvegarde valides", () => {
    expect(buildBackupCronExpression("0", "00:00")).toBe("0 0 * * 0");
    expect(buildBackupCronExpression("5", "23:45")).toBe("45 23 * * 5");
    expect(() => buildBackupCronExpression("9", "12:00")).toThrow(/invalide/);
    expect(() => buildBackupCronExpression("1", "24:00")).toThrow(/invalide/);
  });
});
