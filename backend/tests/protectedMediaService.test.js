import { describe, expect, it } from "vitest";

import {
  isPrivateAiDubbingArtifact,
  protectedVideoFilePath,
  resolveProtectedVideoFile,
  rewriteProtectedPlaylist,
} from "../services/protectedMediaService.js";

describe("protectedMediaService", () => {
  it("garde les profils et extraits de validation hors de la route média générique", () => {
    expect(isPrivateAiDubbingArtifact("audio/ai/fr/job-1/profile/references/SPEAKER_00.wav"))
      .toBe(true);
    expect(isPrivateAiDubbingArtifact("audio/ai/fr/job-1/preview/voices/SPEAKER_00.wav"))
      .toBe(true);
    expect(isPrivateAiDubbingArtifact("hls/audio/ai/fr/job-1/playlist.m3u8"))
      .toBe(false);
  });

  it("réécrit les playlists et retire une piste audio IA après refus", () => {
    const content = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Original",DEFAULT=YES,URI="audio/0/playlist.m3u8"
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Français - IA",DEFAULT=NO,URI="audio/ai/fr/playlist.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=900000,AUDIO="audio"
720p/playlist.m3u8
`;
    const audioTracks = [
      {
        VideoID: 42,
        Origin: "IMPORTED",
        CheminPlaylist: "uploads/video/42/hls/audio/0/playlist.m3u8",
      },
      {
        VideoID: 42,
        Origin: "AI_DUB",
        CheminPlaylist: "uploads/video/42/hls/audio/ai/fr/playlist.m3u8",
      },
    ];

    const refused = rewriteProtectedPlaylist({
      videoId: 42,
      playlistRelativePath: "hls/master.m3u8",
      content,
      audioTracks,
      aiFeaturesAccepted: false,
    });
    expect(refused).toContain(protectedVideoFilePath(42, "hls/audio/0/playlist.m3u8"));
    expect(refused).not.toContain("Français - IA");
    expect(refused).toContain(protectedVideoFilePath(42, "hls/720p/playlist.m3u8"));

    const accepted = rewriteProtectedPlaylist({
      videoId: 42,
      playlistRelativePath: "hls/master.m3u8",
      content,
      audioTracks,
      aiFeaturesAccepted: true,
    });
    expect(accepted).toContain("Français - IA");
    expect(accepted).toContain(protectedVideoFilePath(42, "hls/audio/ai/fr/playlist.m3u8"));
  });

  it("refuse tout chemin qui sort du dossier de la vidéo", () => {
    expect(resolveProtectedVideoFile({ videoId: 42, relativePath: "../43/hls/master.m3u8" })).toBeNull();
    expect(resolveProtectedVideoFile({ videoId: 42, relativePath: "hls//segment.ts" })).toBeNull();
    expect(resolveProtectedVideoFile({ videoId: 42, relativePath: "hls/segment.ts" })).toMatchObject({
      relativePath: "hls/segment.ts",
    });
  });

  it("ajoute au manifeste une piste IA publiée sans modifier le fichier maître stocké", () => {
    const rewritten = rewriteProtectedPlaylist({
      videoId: 42,
      playlistRelativePath: "hls/master.m3u8",
      content: "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=900000\n720p/playlist.m3u8\n",
      aiFeaturesAccepted: true,
      audioTracks: [{
        VideoID: 42,
        Label: "Français — doublage IA",
        Language: "fr",
        Origin: "AI_DUB",
        CheminPlaylist: "uploads/video/42/hls/audio/ai/fr/job/playlist.m3u8",
      }],
    });
    expect(rewritten).toContain('NAME="Original",DEFAULT=YES');
    expect(rewritten).toContain('NAME="Français — doublage IA"');
    expect(rewritten).toContain(',AUDIO="sami-audio"');
    expect(rewritten).toContain(protectedVideoFilePath(42, "hls/audio/ai/fr/job/playlist.m3u8"));
  });
});
