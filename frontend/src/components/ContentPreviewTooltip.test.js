import { PREVIEW_FRAME_INTERVAL_MS } from "./ContentPreviewTooltip";

jest.mock("../services/api", () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

describe("ContentPreviewTooltip", () => {
  test("laisse chaque image visible pendant 1,2 seconde", () => {
    expect(PREVIEW_FRAME_INTERVAL_MS).toBe(1200);
  });
});
