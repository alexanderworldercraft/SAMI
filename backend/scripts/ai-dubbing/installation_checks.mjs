// Keep platform/dependency errors ahead of any pip mutation or model download.
export function dubbingInstallationIssues({ platform, voiceEngine, soxAvailable, installedEngines = [] }) {
  const issues = [];
  if (!["qwen3-tts", "chatterbox"].includes(voiceEngine)) {
    issues.push(`Moteur vocal non pris en charge : ${voiceEngine}.`);
    return issues;
  }
  if (voiceEngine === "qwen3-tts" && !soxAvailable) {
    issues.push(platform === "darwin"
      ? "SoX est absent du PATH (commande macOS : brew install sox)."
      : "SoX est absent du PATH. Installez l'exécutable système sox avant de relancer l'installation Qwen3-TTS.");
  }
  const opposite = voiceEngine === "qwen3-tts" ? "chatterbox-tts" : "qwen-tts";
  if (installedEngines.includes(opposite)) {
    issues.push(`L'environnement contient déjà ${opposite}. Qwen et Chatterbox imposent des versions incompatibles de transformers. Choisissez un répertoire SAMI_AI_DUBBING_ROOT distinct pour ce moteur ; les fichiers existants sont conservés.`);
  }
  return issues;
}

export function installedComponentsReady(result, requiredComponents) {
  return requiredComponents.every(name => result.components?.[name]?.ready === true);
}
