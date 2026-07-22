import { describe, expect, it } from "vitest";

import {
  buildMasterPlaylist,
  getHlsProfiles,
  getVideoStream,
  parseOptionalPositiveInt,
  parseRequestedGenreIds,
  selectPreferredAudioStream,
  timemarkToSeconds,
} from "../services/video/videoImportHelpers.js";

describe("videoImportHelpers", () => {
  it("normalise les identifiants transmis par le formulaire", () => {
    expect(parseOptionalPositiveInt("12", "SaisonID")).toBe(12);
    expect(parseOptionalPositiveInt("", "SaisonID")).toBeNull();
    expect(() => parseOptionalPositiveInt("12abc", "SaisonID")).toThrow(/SaisonID/);
    expect(parseRequestedGenreIds('[1, "2", 2, -1, "x"]')).toEqual([1, 2]);
    expect(() => parseRequestedGenreIds("not-json")).toThrow(/genres/);
  });

  it("sélectionne les vrais index de flux avec les préférences audio", () => {
    const metadata = {
      streams: [
        { index: 3, codec_type: "data" },
        { index: 5, codec_type: "video", width: 1920, height: 800 },
        { index: 7, codec_type: "audio", tags: { language: "eng" } },
        { index: 9, codec_type: "audio", tags: { language: "jpn" } },
      ],
    };

    expect(getVideoStream(metadata)?.index).toBe(5);
    expect(selectPreferredAudioStream(metadata)?.index).toBe(9);
  });

  it("calcule des profils HLS sans annoncer un faux ratio 16:9", () => {
    const profiles = getHlsProfiles({ width: 1920, height: 800 });
    expect(profiles.at(-1)).toMatchObject({ label: "1080p", width: 1920, height: 800 });

    expect(getHlsProfiles({ width: 320, height: 240 })).toEqual([
      { label: "source", width: 320, height: 240, bitrate: 500 },
    ]);
  });

  it("construit les mesures de progression et la playlist maître", () => {
    expect(timemarkToSeconds("01:02:03.50")).toBe(3723.5);
    expect(buildMasterPlaylist([
      {
        resolutionPlaylist: "720p\\playlist.m3u8",
        bitrate: 4500,
        width: 1280,
        height: 720,
      },
    ])).toContain("720p/playlist.m3u8");
  });
});
