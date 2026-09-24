import { describe, expect, it } from "vitest";
import { normalizeExtensionClient } from "../services/extensionAuthService.js";

describe("extensionAuthService", () => {
  const clientId = "abcdefghijklmnopabcdefghijklmnop";
  const redirectUri = `https://${clientId}.chromiumapp.org/sami-auth`;

  it("accepte uniquement le retour Chromium correspondant au client", () => {
    expect(normalizeExtensionClient({ clientId, redirectUri })).toEqual({ clientId, redirectUri });
  });

  it("refuse une redirection externe", () => {
    expect(() => normalizeExtensionClient({ clientId, redirectUri: "https://evil.example/callback" }))
      .toThrow("Adresse de retour");
  });

  it("refuse un identifiant arbitraire", () => {
    expect(() => normalizeExtensionClient({ clientId: "not-an-extension", redirectUri }))
      .toThrow("Identifiant d'extension");
  });
});
