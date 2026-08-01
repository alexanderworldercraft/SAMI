const asNonNegativeInteger = (value, fieldName) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new TypeError(`${fieldName} doit être un entier positif ou nul.`);
  }
  return number;
};

const asPositiveNumber = (value, fieldName) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new TypeError(`${fieldName} doit être un nombre strictement positif.`);
  }
  return number;
};

export function buildVideoProfileArguments({
  videoPath,
  playlistPath,
  segmentPattern,
  profile,
  videoStreamIndex,
  audioStreamIndex,
  includeAudio,
  audioBitrateKbps,
  segmentDurationSeconds,
}) {
  const duration = asPositiveNumber(segmentDurationSeconds, "segmentDurationSeconds");
  const args = ["-hide_banner", "-nostdin"];
  if (!includeAudio) args.push("-copyts", "-start_at_zero");
  args.push(
    "-i", String(videoPath),
    "-map", `0:${asNonNegativeInteger(videoStreamIndex, "videoStreamIndex")}`,
    "-vf", `scale=w=${asPositiveNumber(profile?.width, "profile.width")}:h=-2`,
    "-c:v", "libx264",
    "-crf", "23",
    "-maxrate", `${asPositiveNumber(profile?.bitrate, "profile.bitrate")}k`,
    "-bufsize", "2M",
    "-preset", "veryfast",
    "-profile:v", "high",
    "-pix_fmt", "yuv420p",
    "-force_key_frames", `expr:gte(t,n_forced*${duration})`,
    "-sc_threshold", "0"
  );

  if (includeAudio) {
    args.push(
      "-map", `0:${asNonNegativeInteger(audioStreamIndex, "audioStreamIndex")}`,
      "-c:a", "aac",
      "-ac", "2",
      "-ar", "48000",
      "-b:a", `${asPositiveNumber(audioBitrateKbps, "audioBitrateKbps")}k`
    );
  } else {
    args.push("-an");
  }

  args.push(
    "-f", "hls",
    "-hls_time", String(duration),
    "-hls_playlist_type", "vod",
    "-hls_segment_type", "mpegts",
    "-hls_flags", "independent_segments",
    "-start_number", "0",
    "-hls_segment_filename", String(segmentPattern),
    "-progress", "pipe:1",
    "-nostats",
    String(playlistPath)
  );
  return args;
}

export function buildAudioRenditionArguments({
  videoPath,
  playlistPath,
  segmentPattern,
  sourceIndex,
  audioBitrateKbps,
  segmentDurationSeconds,
}) {
  const duration = asPositiveNumber(segmentDurationSeconds, "segmentDurationSeconds");
  return [
    "-hide_banner",
    "-nostdin",
    "-copyts",
    "-start_at_zero",
    "-i", String(videoPath),
    "-map", `0:${asNonNegativeInteger(sourceIndex, "sourceIndex")}`,
    "-vn",
    "-c:a", "aac",
    "-ac", "2",
    "-ar", "48000",
    "-b:a", `${asPositiveNumber(audioBitrateKbps, "audioBitrateKbps")}k`,
    "-f", "hls",
    "-hls_time", String(duration),
    "-hls_playlist_type", "vod",
    "-hls_segment_type", "mpegts",
    "-start_number", "0",
    "-hls_segment_filename", String(segmentPattern),
    "-progress", "pipe:1",
    "-nostats",
    String(playlistPath),
  ];
}
