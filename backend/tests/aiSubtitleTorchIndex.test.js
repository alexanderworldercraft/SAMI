import { describe, expect, it } from "vitest";

import {
  buildWindowsTorchIndex,
  selectWindowsTorchVariant,
} from "../scripts/ai/torch_index.mjs";

describe("sélection de la variante PyTorch CUDA sous Windows", () => {
  it.each([
    ["CUDA Version: 13.2", "cu130"],
    ["13.0", "cu130"],
    ["12.9", "cu128"],
    ["12.8", "cu128"],
    ["12.6", "cu126"],
    ["12.4", "cu124"],
    [null, "cu124"],
  ])("convertit %s vers %s", (version, expected) => {
    expect(selectWindowsTorchVariant(version)).toBe(expected);
  });

  it("construit l'index officiel CUDA 13.0 pour un pilote CUDA 13.2", () => {
    expect(buildWindowsTorchIndex("13.2"))
      .toBe("https://download.pytorch.org/whl/cu130");
  });
});
