import fs from "fs";
import path from "path";

import {
  buildMasterPlaylist,
  buildMultiAudioMasterPlaylist,
} from "../../video/videoImportHelpers.js";
import { validateHlsMasterPlaylist } from "./hlsValidation.js";

export async function assembleMasterPlaylist({
  outputDir,
  playlists,
  audioTracks = [],
  multiAudio = false,
  audioBitrateKbps = 192,
}) {
  if (!Array.isArray(playlists) || playlists.length === 0) {
    throw new TypeError("Au moins une playlist vidéo est requise.");
  }
  if (multiAudio) {
    if (audioTracks.length < 2) {
      throw new TypeError("Plusieurs playlists audio sont requises en mode multi-audio.");
    }
    if (audioTracks.filter((track) => track.isDefault).length !== 1) {
      throw new TypeError("Une seule piste audio doit être déclarée par défaut.");
    }
  }

  const masterPlaylistPath = path.join(outputDir, "master.m3u8");
  const masterPlaylist = multiAudio
    ? buildMultiAudioMasterPlaylist(playlists, audioTracks, audioBitrateKbps)
    : buildMasterPlaylist(playlists);
  await fs.promises.writeFile(masterPlaylistPath, masterPlaylist, "utf8");
  await validateHlsMasterPlaylist({ masterPlaylistPath, outputDir });

  return { masterPlaylistPath, masterPlaylist };
}
