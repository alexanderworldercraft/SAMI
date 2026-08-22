import { describe, expect, it } from "vitest";

import { buildAiSubtitleProcessEnvironment } from "../services/aiSubtitles/processEnvironment.js";

describe("environnement du moteur de sous-titrage IA", () => {
  it("ajoute les bibliothèques CUDA du venv au LD_LIBRARY_PATH sous Linux", () => {
    const env = buildAiSubtitleProcessEnvironment({
      install: { cudaLibraryPaths: ["/venv/cublas", "/venv/cudnn"] },
      env: { LD_LIBRARY_PATH: "/system/lib" },
      platform: "linux",
    });

    expect(env.LD_LIBRARY_PATH).toBe("/venv/cublas:/venv/cudnn:/system/lib");
    expect(env.PYTHONUNBUFFERED).toBe("1");
  });

  it("évite les doublons et utilise PATH sous Windows", () => {
    const env = buildAiSubtitleProcessEnvironment({
      install: { cudaLibraryPaths: ["C:\\venv\\cublas", "C:\\venv\\cublas"] },
      env: { PATH: "C:\\Windows" },
      platform: "win32",
    });

    expect(env.PATH).toBe("C:\\venv\\cublas;C:\\Windows");
  });

  it("conserve l'environnement lorsque le manifeste ne déclare aucun chemin CUDA", () => {
    const env = buildAiSubtitleProcessEnvironment({
      install: null,
      env: { PATH: "/usr/bin" },
      platform: "linux",
    });

    expect(env).toEqual({ PATH: "/usr/bin", PYTHONUNBUFFERED: "1" });
  });
});
