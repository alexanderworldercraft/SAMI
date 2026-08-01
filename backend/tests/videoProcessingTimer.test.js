import { describe, expect, it, vi } from "vitest";

import { createVideoProcessingTimer } from "../services/video/videoProcessingTimer.js";

describe("videoProcessingTimer", () => {
  it("conserve le démarrage backend et mesure la durée totale", () => {
    const now = vi.fn()
      .mockReturnValueOnce(Date.parse("2026-08-01T10:00:00.000Z"))
      .mockReturnValueOnce(Date.parse("2026-08-01T10:01:05.250Z"))
      .mockReturnValueOnce(Date.parse("2026-08-01T10:02:10.500Z"));
    const timer = createVideoProcessingTimer({ now });

    expect(timer.snapshot()).toEqual({
      processingStartedAt: "2026-08-01T10:00:00.000Z",
      processingElapsedMs: 65_250,
    });
    expect(timer.snapshot({ completed: true })).toEqual({
      processingStartedAt: "2026-08-01T10:00:00.000Z",
      processingElapsedMs: 130_500,
      processingCompletedAt: "2026-08-01T10:02:10.500Z",
    });
  });
});
