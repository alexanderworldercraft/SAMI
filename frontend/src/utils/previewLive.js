const parseTimestamp = (value) => {
  const parts = String(value || "").trim().split(":");
  if (parts.length !== 3) return null;

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const seconds = Number(parts[2]);
  const timestamp = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(timestamp) ? timestamp : null;
};

export const toAbsoluteAssetUrl = (assetPath) => {
  if (!assetPath) return "";
  if (/^https?:\/\//i.test(assetPath)) return assetPath;

  const configuredBase = process.env.REACT_APP_URL_LOCAL;
  const base = configuredBase
    || (typeof window !== "undefined" ? window.location.origin : "");

  if (!base) return assetPath;
  return `${base.replace(/\/+$/, "")}/${String(assetPath).replace(/^\/+/, "")}`;
};

export const parsePreviewLiveVtt = (content, vttUrl) => {
  const blocks = String(content || "").replace(/\r/g, "").split(/\n{2,}/);
  const cues = [];

  blocks.forEach((block) => {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex === -1 || !lines[timingIndex + 1]) return;

    const [rawStart, rawEnd] = lines[timingIndex].split("-->").map((value) => value.trim());
    const start = parseTimestamp(rawStart);
    const end = parseTimestamp(rawEnd.split(/\s+/)[0]);
    const imageMatch = lines[timingIndex + 1].match(
      /^(.*)#xywh=(\d+),(\d+),(\d+),(\d+)$/
    );

    if (start === null || end === null || !imageMatch) return;

    let imageUrl = imageMatch[1];
    try {
      imageUrl = new URL(imageUrl, vttUrl).toString();
    } catch (_) {
      // Conserve la référence telle quelle si l'URL de base n'est pas disponible.
    }

    cues.push({
      start,
      end,
      imageUrl,
      x: Number(imageMatch[2]),
      y: Number(imageMatch[3]),
      width: Number(imageMatch[4]),
      height: Number(imageMatch[5]),
    });
  });

  return cues;
};
