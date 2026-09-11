export const DIAGNOSTIC_AUDIO_NAMES = [1, 2, 3].map(n => `quality-attempt-${n}.wav`);

// Seuls trois courts échantillons PCM sont autorisés, jamais un média arbitraire.
export function validateDiagnosticAudio(buffer) {
  const fail = () => { throw Object.assign(new Error("Audio diagnostic PCM invalide ou supérieur à 15 secondes."), { statusCode: 400 }); };
  if (buffer.length < 44 || buffer.length > 724096 || buffer.toString("ascii", 0, 4) !== "RIFF"
      || buffer.toString("ascii", 8, 12) !== "WAVE" || buffer.readUInt32LE(4) !== buffer.length - 8) fail();
  let offset = 12, format = false, data = false;
  while (offset + 8 <= buffer.length) {
    const name = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    offset += 8;
    if (offset + size > buffer.length) fail();
    if (name === "fmt ") {
      if (format || size < 16 || buffer.readUInt16LE(offset) !== 1
          || buffer.readUInt16LE(offset + 2) !== 1 || buffer.readUInt32LE(offset + 4) !== 24000
          || buffer.readUInt32LE(offset + 8) !== 48000 || buffer.readUInt16LE(offset + 12) !== 2
          || buffer.readUInt16LE(offset + 14) !== 16) fail();
      format = true;
    }
    if (name === "data") {
      if (data || !size || size > 720000 || size % 2) fail();
      data = true;
    }
    offset += size + size % 2;
  }
  if (!format || !data || offset !== buffer.length) fail();
  return buffer;
}
