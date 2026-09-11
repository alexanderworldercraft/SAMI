import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/aiDubbing/commandRunner.js", () => ({ runAiDubbingCommand: vi.fn() }));
import { runAiDubbingCommand } from "../services/aiDubbing/commandRunner.js";
import { main } from "../scripts/ai-dubbing/compareJapanese.mjs";

const roots = [];
afterEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks(); process.exitCode = 0;
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});
function inputs() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sami-comparison-test-")); roots.push(root);
  const failure = path.join(root, "failure"); fs.mkdirSync(failure);
  for (const name of ["quality-failure.json", "generation-attempt.json", "input-profile.json"]) fs.writeFileSync(path.join(failure, name), "{}");
  const reference = path.join(root, "reference.wav"); fs.writeFileSync(reference, "reference");
  fs.writeFileSync(path.join(root, "install.json"), JSON.stringify({ pythonPath: process.execPath }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  return { root, args: ["--root", root, "--failure", failure, "--reference", reference] };
}
describe("comparaison japonaise isolée", () => {
  it("isole le comparatif anglais en deux variantes sans modifier les profils", async () => {
    const { root, args } = inputs(); runAiDubbingCommand.mockResolvedValue("{}");
    await main(args, { language: "en" });
    expect(runAiDubbingCommand).toHaveBeenCalledTimes(3);
    for (const call of runAiDubbingCommand.mock.calls) expect(call[1][0]).toMatch(/compare_english\.py$/);
    expect(runAiDubbingCommand.mock.calls[1][1]).toContain("reference-text");
    expect(runAiDubbingCommand.mock.calls[2][1]).toContain("speaker-identity");
    const parent = path.join(root, "diagnostics", "comparisons");
    expect(fs.readdirSync(parent)[0]).toMatch(/^english-/);
  });
  it("prépare une référence portable anglaise sans GPU et refuse les variantes JP", async () => {
    const { root, args } = inputs(); runAiDubbingCommand.mockResolvedValue("{}");
    await main([...args, "--prepare-only"], { language: "en" });
    expect(fs.readdirSync(path.join(root, "diagnostics", "comparisons"))[0]).toMatch(/^input-english-/);
    expect(runAiDubbingCommand).toHaveBeenCalledTimes(1);
    await expect(main([...args, "--variant", "bounded-identity"], { language: "en" })).rejects.toThrow("Variante inconnue");
  });
  it("permet de tester R5-R3 seule sans relancer la variante qui a expiré", async () => {
    const { args } = inputs(); runAiDubbingCommand.mockResolvedValue("{}");
    await main([...args, "--variant", "bounded-identity"]);
    expect(runAiDubbingCommand).toHaveBeenCalledTimes(2);
    expect(runAiDubbingCommand.mock.calls[1][1]).toContain("bounded-identity");
  });
  it("prépare aussi un timeout sans quality-failure.json", async () => {
    const { root, args } = inputs(); runAiDubbingCommand.mockResolvedValue("{}");
    fs.unlinkSync(path.join(root, "failure", "quality-failure.json"));
    fs.writeFileSync(path.join(root, "failure", "error.json"), JSON.stringify({ code: "AI_DUBBING_GENERATION_TIMEOUT" }));
    await main([...args, "--prepare-only"]);
    const parent = path.join(root, "diagnostics", "comparisons");
    const bundle = path.join(parent, fs.readdirSync(parent)[0]);
    expect(fs.existsSync(path.join(bundle, "error.json"))).toBe(true);
    expect(fs.existsSync(path.join(bundle, "quality-failure.json"))).toBe(false);
  });
  it("ne lance que la vérification avec --check-only", async () => {
    const { root, args } = inputs(); runAiDubbingCommand.mockResolvedValue("{}");
    await main([...args, "--check-only"]);
    expect(runAiDubbingCommand).toHaveBeenCalledTimes(1);
    expect(runAiDubbingCommand.mock.calls[0][1]).toContain("--check-only");
    expect(fs.existsSync(path.join(root, "diagnostics"))).toBe(false);
  });
  it("prépare une copie portable sans lancer de synthèse", async () => {
    const { root, args } = inputs(); runAiDubbingCommand.mockResolvedValue("{}");
    await main([...args, "--prepare-only"]);
    const parent = path.join(root, "diagnostics", "comparisons");
    const bundle = path.join(parent, fs.readdirSync(parent)[0]);
    expect(fs.readdirSync(bundle).sort()).toEqual(["generation-attempt.json", "input-profile.json", "quality-failure.json", "reference.wav"]);
    expect(fs.readFileSync(path.join(bundle, "reference.wav"), "utf8")).toBe("reference");
    expect(runAiDubbingCommand).toHaveBeenCalledTimes(1);
  });
  it("continue vers la seconde variante après fermeture de la première en échec", async () => {
    const { root, args } = inputs(); vi.spyOn(console, "error").mockImplementation(() => {});
    runAiDubbingCommand.mockResolvedValueOnce("{}").mockRejectedValueOnce(new Error("Qwen échec")).mockResolvedValueOnce("{}");
    await main(args);
    expect(runAiDubbingCommand).toHaveBeenCalledTimes(3);
    expect(runAiDubbingCommand.mock.calls[2][1]).toContain("speaker-identity");
    expect(runAiDubbingCommand.mock.calls[2][2].timeoutMs).toBe(20 * 60_000);
    const parent = path.join(root, "diagnostics", "comparisons");
    const summary = JSON.parse(fs.readFileSync(path.join(parent, fs.readdirSync(parent)[0], "summary.json")));
    expect(summary.variants.map(v => v.state)).toEqual(["failed", "completed"]);
    expect(summary.requiresListening).toBe(true);
  });
});
