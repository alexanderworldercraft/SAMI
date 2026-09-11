import { afterEach, describe, expect, it, vi } from "vitest";
import { createGenerationWatchdog } from "../services/aiDubbing/generationWatchdog.js";

const event = { id: "a".repeat(32), state: "start", kind: "sample", speaker: "SPEAKER_01", sourceStart: 164.04, progress: 51 };
afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "performance"] });
  const onTimeout = vi.fn(), onProgress = vi.fn(), log = vi.fn();
  return { onTimeout, onProgress, log, watchdog: createGenerationWatchdog({ onTimeout, onProgress, log }) };
}
describe("limites indépendantes de la synthèse Python/CUDA", () => {
  it("affiche la réplique et la tentative sans changer le délai de synthèse", () => {
    const f = fixture();
    f.watchdog.handle({ ...event, kind: "cue", cueIndex: 63, cueCount: 80, attempt: 3 });
    vi.advanceTimersByTime(30_000);
    expect(f.onProgress).toHaveBeenLastCalledWith({ progress: 51, stage: "VC_01_SYN_30_63_80_3" });
    expect(f.log.mock.calls.at(-1)[0]).toContain("réplique 63/80 · tentative 3/3");
    f.watchdog.clear();
  });
  it("observe le contrôle et les opérations finales sans leur inventer de limite GPU", () => {
    const f = fixture();
    f.watchdog.handle({ ...event, state: "observe", kind: "quality", cueIndex: 63, cueCount: 80, attempt: 3 });
    vi.advanceTimersByTime(30_000);
    expect(f.onProgress).toHaveBeenLastCalledWith({ progress: 51, stage: "VC_01_QC_30_63_80_3" });
    f.watchdog.handle({ id: event.id, state: "end" });
    f.watchdog.handle({ ...event, state: "observe", kind: "mixing" });
    vi.advanceTimersByTime(600_000);
    expect(f.onProgress).toHaveBeenLastCalledWith({ progress: 51, stage: "VF_01_MIX_600" });
    expect(f.onTimeout).not.toHaveBeenCalled();
    f.watchdog.clear();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("borne un échantillon à 180 s même avec événements dupliqués et heartbeat actif", () => {
    const f = fixture(); f.watchdog.handle(event);
    vi.advanceTimersByTime(15_000);
    expect(f.onProgress).toHaveBeenLastCalledWith({ progress: 51, stage: "VS_01_SYN_15" });
    f.watchdog.handle(event);
    f.watchdog.handle({ ...event, id: "b".repeat(32) });
    vi.advanceTimersByTime(165_000);
    expect(f.onTimeout).toHaveBeenCalledTimes(1);
    expect(f.onTimeout.mock.calls[0][0]).toMatchObject({ code: "AI_DUBBING_GENERATION_TIMEOUT", retryable: false });
    expect(f.onTimeout.mock.calls[0][0].message).toContain("164.04s");
    vi.advanceTimersByTime(600_000);
    expect(f.onTimeout).toHaveBeenCalledTimes(1);
  });
  it("annule le délai à la fin correspondante et distingue le marquage", () => {
    const f = fixture(); f.watchdog.handle(event);
    f.watchdog.handle({ id: event.id, state: "end" });
    vi.advanceTimersByTime(180_000);
    expect(f.onTimeout).not.toHaveBeenCalled();
    f.watchdog.handle({ ...event, kind: "watermark" });
    expect(f.onProgress).toHaveBeenLastCalledWith({ progress: 51, stage: "VS_01_WM_0" });
    vi.advanceTimersByTime(60_000);
    expect(f.onTimeout).toHaveBeenCalledOnce();
  });
  it("donne 600 s aux répliques complètes, ignore les fins étrangères et nettoie les timers", () => {
    const f = fixture(); f.watchdog.handle({ ...event, kind: "cue" });
    f.watchdog.handle({ id: "b".repeat(32), state: "end" });
    vi.advanceTimersByTime(599_000);
    expect(f.onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(f.onTimeout).toHaveBeenCalledOnce();
    f.watchdog.handle(event); f.watchdog.clear();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("refuse les événements invalides sans accepter de délais fournis par le runtime", () => {
    const f = fixture();
    f.watchdog.handle({ ...event, speaker: "arbitrary" });
    f.watchdog.handle({ ...event, kind: "arbitrary" });
    expect(f.onProgress).not.toHaveBeenCalled();
    f.watchdog.handle({ ...event, timeoutSeconds: 86400 });
    vi.advanceTimersByTime(180_000);
    expect(f.onTimeout).toHaveBeenCalledOnce();
  });
});
