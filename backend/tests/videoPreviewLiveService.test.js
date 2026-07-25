import { describe, expect, it } from "vitest";

import {
  PREVIEW_LIVE_FRAMES_PER_SPRITE,
  buildPreviewLiveWebVtt,
} from "../services/video/videoPreviewLiveService.js";

describe("videoPreviewLiveService", () => {
  it("limite chaque spritesheet à 50 images", () => {
    const vtt = buildPreviewLiveWebVtt({
      frameCount: PREVIEW_LIVE_FRAMES_PER_SPRITE + 1,
      duration: 204,
    });

    expect(vtt.match(/sprite-001\.jpg/g)).toHaveLength(50);
    expect(vtt.match(/sprite-002\.jpg/g)).toHaveLength(1);
    expect(vtt).toContain("00:03:20.000 --> 00:03:24.000");
    expect(vtt).toContain("sprite-002.jpg#xywh=0,0,160,90");
  });

  it("prolonge la dernière vignette jusqu'à la fin de la vidéo", () => {
    const vtt = buildPreviewLiveWebVtt({
      frameCount: 3,
      duration: 13,
    });

    expect(vtt).toContain("00:00:08.000 --> 00:00:13.000");
  });
});
