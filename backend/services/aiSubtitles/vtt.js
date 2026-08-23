const timestamp = (seconds) => {
  const milliseconds = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const ms = milliseconds % 1000;
  return [hours, minutes, secs].map((value) => String(value).padStart(2, "0")).join(":")
    + `.${String(ms).padStart(3, "0")}`;
};

const parseTimestamp = (value) => {
  const parts = String(value || "").trim().replace(",", ".").split(":");
  if (parts.length < 2 || parts.length > 3) return Number.NaN;
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length ? Number(parts.pop()) : 0;
  if (
    !Number.isFinite(hours)
    || !Number.isFinite(minutes)
    || !Number.isFinite(seconds)
    || hours < 0
    || minutes < 0
    || minutes >= 60
    || seconds < 0
    || seconds >= 60
  ) return Number.NaN;
  return (hours * 3600) + (minutes * 60) + seconds;
};

const decodeVttText = (value) => String(value || "")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&")
  .replace(/&nbsp;/g, " ");

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

export const normalizeEditedAiSegments = (segments) => {
  if (!Array.isArray(segments) || segments.length > 20_000) {
    throw new TypeError("La liste des segments de sous-titres est invalide.");
  }
  const normalized = normalizeAiSegments(segments);
  normalized.forEach((segment, index) => {
    if (segment.text.length > 4_000) {
      throw new TypeError(`Le texte du segment ${index + 1} est trop long.`);
    }
    if (index > 0 && segment.start < normalized[index - 1].end) {
      throw new TypeError(`Le segment ${index + 1} chevauche le segment précédent.`);
    }
  });
  return normalized;
};

export const parseWebVtt = (content) => {
  const source = String(content || "").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!/^WEBVTT(?:\s|$)/.test(source)) {
    throw new TypeError("Le fichier de sous-titres n'est pas un WebVTT valide.");
  }
  const blocks = source.split(/\n{2,}/).slice(1);
  const segments = [];
  blocks.forEach((block) => {
    const lines = block.split("\n").map((line) => line.trimEnd());
    if (!lines.length || /^(NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0])) return;
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) return;
    const match = lines[timingIndex].match(
      /^([^\s]+)\s+-->\s+([^\s]+)(?:\s+.*)?$/
    );
    if (!match) throw new TypeError(`Horodatage WebVTT invalide : ${lines[timingIndex]}`);
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    const text = decodeVttText(lines.slice(timingIndex + 1).join(" ")).trim();
    segments.push({ start, end, text });
  });
  return normalizeEditedAiSegments(segments);
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
