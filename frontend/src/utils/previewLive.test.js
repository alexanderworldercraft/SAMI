import { parsePreviewLiveVtt } from "./previewLive";

describe("parsePreviewLiveVtt", () => {
  it("convertit les cues WebVTT et résout les sprites relatifs", () => {
    const cues = parsePreviewLiveVtt(
      `WEBVTT

00:00:00.000 --> 00:00:04.000
sprite-001.jpg#xywh=0,0,160,90

00:00:04.000 --> 00:00:08.000
sprite-001.jpg#xywh=160,0,160,90
`,
      "https://sami.test/uploads/video/12/preview-live/thumbnails.vtt"
    );

    expect(cues).toHaveLength(2);
    expect(cues[1]).toEqual({
      start: 4,
      end: 8,
      imageUrl: "https://sami.test/uploads/video/12/preview-live/sprite-001.jpg",
      x: 160,
      y: 0,
      width: 160,
      height: 90,
    });
  });
});
