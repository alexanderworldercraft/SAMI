const LIMITS = Object.freeze({ sample: 180, cue: 600, watermark: 60 });
const OBSERVED = Object.freeze({ quality: ["VC", "QC"], fitting: ["VC", "FIT"], assembly: ["VF", "ASM"], mixing: ["VF", "MIX"], finalWatermark: ["VF", "WM"] });

// A live heartbeat is not proof that a CUDA generation is making progress.
// Its deadline starts once and is never extended by progress/duplicate events.
export function createGenerationWatchdog({ onProgress, onTimeout, log = console.info }) {
  let active = null, deadline = null, ticker = null;
  const clear = () => { clearTimeout(deadline); clearInterval(ticker); active = null; };
  const emit = () => {
    if (!active) return;
    const seconds = Math.floor((performance.now() - active.started) / 1000);
    const [prefix, step] = OBSERVED[active.kind] || [active.kind === "cue" ? "VC" : "VS", active.kind === "watermark" ? "WM" : "SYN"];
    const position = active.cueIndex ? `_${active.cueIndex}_${active.cueCount}_${active.attempt}` : "";
    const stage = `${prefix}_${active.speaker.slice(8)}_${step}_${seconds}${position}`;
    onProgress?.({ progress: active.progress, stage });
    log(`[SAMI doublage] ${active.speaker} · ${active.kind}${active.cueIndex ? ` · réplique ${active.cueIndex}/${active.cueCount} · tentative ${active.attempt}/3` : ""} · ${seconds}${LIMITS[active.kind] ? `/${LIMITS[active.kind]}` : ""} s · source ${active.sourceStart.toFixed(2)} s (temps écoulé, pas progression GPU).`);
  };
  return {
    clear,
    handle(event) {
      if (event?.state === "end") {
        if (active?.id === event.id) clear();
        return;
      }
      const observed = event?.state === "observe" && Object.hasOwn(OBSERVED, event.kind);
      if ((!observed && event?.state !== "start") || !/^[a-f0-9]{32}$/.test(event.id)
          || !/^SPEAKER_\d{2}$/.test(event.speaker) || !(observed || Object.hasOwn(LIMITS, event.kind))
          || !Number.isFinite(event.sourceStart) || !Number.isFinite(event.progress)) return;
      if (active) return;
      active = { ...event, progress: Math.max(0, Math.min(90, event.progress)), started: performance.now() };
      if (!(Number.isInteger(event.cueIndex) && Number.isInteger(event.cueCount)
          && event.cueIndex >= 1 && event.cueIndex <= event.cueCount && event.cueCount <= 99999)) {
        active.cueIndex = null;
      }
      active.attempt = Math.max(1, Math.min(3, Math.trunc(Number(event.attempt) || 1)));
      emit();
      ticker = setInterval(emit, 15_000);
      if (observed) return;
      deadline = setTimeout(() => {
        const current = active;
        clear();
        const error = Object.assign(new Error(
          `Délai vocal dépassé : ${current.speaker}, ${current.kind === "watermark" ? "marquage" : "synthèse"}, source ${current.sourceStart.toFixed(2)}s, limite ${LIMITS[current.kind]}s. Génération interrompue sans validation ni relance automatique ; diagnostic conservé.`
        ), { code: "AI_DUBBING_GENERATION_TIMEOUT", retryable: false });
        onTimeout(error);
      }, LIMITS[event.kind] * 1000);
    },
  };
}
