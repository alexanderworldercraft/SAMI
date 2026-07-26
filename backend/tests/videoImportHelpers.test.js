import { describe, expect, it } from "vitest";

import {
  buildAudioTrackPlans,
  buildMasterPlaylist,
  buildMultiAudioMasterPlaylist,
  getAudioStreams,
  getAutoLanguageGenreNames,
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

  it("conserve toutes les pistes audio et marque la piste préférée sans les réordonner", () => {
    const metadata = {
      streams: [
        {
          index: 7,
          codec_type: "audio",
          codec_name: "aac",
          channels: 6,
          tags: { language: "fra", title: "VFF" },
        },
        {
          index: 9,
          codec_type: "audio",
          codec_name: "aac",
          channels: 2,
          tags: { language: "jpn" },
        },
      ],
    };

    const streams = getAudioStreams(metadata);
    const preferred = selectPreferredAudioStream(metadata);
    const tracks = buildAudioTrackPlans(streams, preferred);

    expect(tracks.map((track) => track.sourceIndex)).toEqual([7, 9]);
    expect(tracks.map((track) => track.isDefault)).toEqual([false, true]);
    expect(tracks.map((track) => track.language)).toEqual(["fr", "ja"]);
    expect(tracks[0].label).toContain("VFF");
    expect(tracks[1].label).toBe("Japonais");
  });

  it("ajoute le genre MultiAudio uniquement quand plusieurs pistes sont conservées", () => {
    const audioStream = {
      codec_type: "audio",
      tags: { language: "jpn" },
    };

    expect(getAutoLanguageGenreNames({
      audioStream,
      subtitleStreams: [],
      multiAudio: true,
    })).toEqual(["JP", "MultiAudio"]);

    expect(getAutoLanguageGenreNames({
      audioStream,
      subtitleStreams: [],
      multiAudio: false,
    })).toEqual(["JP"]);
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

  it("construit un manifest HLS avec un groupe audio et un seul défaut", () => {
    const manifest = buildMultiAudioMasterPlaylist(
      [{
        resolutionPlaylist: "720p/playlist.m3u8",
        bitrate: 4500,
        width: 1280,
        height: 720,
      }],
      [
        {
          label: "Français",
          language: "fr",
          relativePlaylist: "audio/0/playlist.m3u8",
          isDefault: false,
          outputChannels: 2,
        },
        {
          label: "Japonais",
          language: "ja",
          relativePlaylist: "audio/1/playlist.m3u8",
          isDefault: true,
          outputChannels: 2,
        },
      ]
    );

    expect(manifest).toContain('TYPE=AUDIO,GROUP-ID="sami-audio"');
    expect(manifest).toContain('NAME="Japonais",LANGUAGE="ja"');
    expect(manifest).toContain('AUDIO="sami-audio"');
    expect(manifest.match(/DEFAULT=YES/g)).toHaveLength(1);
  });
});
