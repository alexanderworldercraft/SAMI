import { describe, expect, it } from "vitest";
import { dubbingInstallationIssues, installedComponentsReady } from "../scripts/ai-dubbing/installation_checks.mjs";

const baseline = { platform: "linux", voiceEngine: "qwen3-tts", pipelineVersion: "sami-dubbing-v6-clean-phrases-r9-r1", soxAvailable: true };
describe("prérequis d'installation du doublage", () => {
  it("distingue une installation partielle réussie d'un clone prêt", () => {
    const result = { ready: false, components: { voice: { ready: true }, quality: { ready: true }, sortformer: { ready: false } } };
    expect(installedComponentsReady(result, ["voice", "quality"])).toBe(true);
    expect(installedComponentsReady(result, ["sortformer"])).toBe(false);
    expect(result.ready).toBe(false);
  });
  it("explique les dépendances manquantes et incompatibles du journal Mac avant pip", () => {
    const issues = dubbingInstallationIssues({ ...baseline, platform: "darwin", soxAvailable: false, installedEngines: ["chatterbox-tts", "qwen-tts"] });
    expect(issues.join("\n")).toMatch(/brew install sox/);
    expect(issues.join("\n")).toMatch(/versions incompatibles de transformers/);
  });
  it("autorise l'installation Qwen Metal sur Mac sans changer le profil R9", () => {
    expect(dubbingInstallationIssues({ ...baseline, platform: "darwin" })).toEqual([]);
  });
  it("ne mélange pas les moteurs lors d'un changement inverse", () => {
    expect(dubbingInstallationIssues({ ...baseline, voiceEngine: "chatterbox", installedEngines: ["qwen-tts"] }).join()).toMatch(/répertoire SAMI_AI_DUBBING_ROOT distinct/);
  });
  it("laisse passer un environnement séparé sur une plateforme compatible", () => {
    expect(dubbingInstallationIssues(baseline)).toEqual([]);
    expect(dubbingInstallationIssues({ ...baseline, platform: "darwin", voiceEngine: "chatterbox", pipelineVersion: "sami-dubbing-v5-aligned-quality", soxAvailable: false })).toEqual([]);
  });
});
