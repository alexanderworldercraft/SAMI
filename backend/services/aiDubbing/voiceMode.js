export const normalizeVoiceMode = (value = "faithful", engine) => {
  if (!["natural", "faithful"].includes(value)) {
    throw Object.assign(new Error("Choisissez le mode vocal Naturelle ou Fidèle à l’original."), { statusCode: 400 });
  }
  if (value === "faithful" && engine !== "qwen3-tts") {
    throw Object.assign(new Error("Le mode Fidèle à l’original nécessite Qwen3-TTS."), { statusCode: 409 });
  }
  return value;
};

// Null identifies historical jobs whose prompt policy is owned by their profile.
export const workerSupportsVoiceMode = (worker, mode) => mode == null || worker.Capabilities?.voiceModes === 1;

export const assertVoiceMode = (expected, received) => {
  if (expected != null && expected !== received) {
    throw new Error("Le rendu ne confirme pas le mode vocal demandé.");
  }
};
