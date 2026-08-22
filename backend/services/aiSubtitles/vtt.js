const timestamp = (seconds) => {
  const milliseconds = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":")
    + `.${String(ms).padStart(3, "0")}`;
};

export const normalizeAiSegments = (segments) => {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new TypeError("Le moteur IA n'a retourné aucun segment.");
  }
  return segments.map((segment, index) => {
    const start = Number(segment?.start);
    const end = Number(segment?.end);
    const text = String(segment?.text || "").replace(/\s+/g, " ").trim();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) {
      throw new TypeError(`Le segment IA ${index + 1} est invalide.`);
    }
    return { start, end, text };
  });
};

export const buildWebVtt = (segments) => {
  const normalized = normalizeAiSegments(segments);
  const cues = normalized.map((segment, index) => [
    String(index + 1),
    `${timestamp(segment.start)} --> ${timestamp(segment.end)}`,
    segment.text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;"),
  ].join("\n"));
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
};
