import { describe, expect, it } from "vitest";

import {
  buildBackupCronExpression,
  formatServerStartupBanner,
  getServerStartupInfo,
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

  it("formate le récapitulatif de démarrage du serveur", () => {
    const info = getServerStartupInfo({
      appName: "SAMI",
      publicUrl: "https://sami.worldercraft.fr",
      port: 1926,
      listenHost: "127.0.0.1",
    });

    expect(formatServerStartupBanner(info)).toBe([
      "========================================",
      "Démarrage de SAMI",
      "URL publique : https://sami.worldercraft.fr",
      "Host public  : sami.worldercraft.fr",
      "Port local   : 1926",
      "========================================",
    ].join("\n"));
  });
});
