const invalid = message => Object.assign(new Error(message), { statusCode: 400, code: "AI_DUBBING_MANUAL_REFERENCES_INVALID" });

export function normalizeManualVoiceReferences(value, expectedSpeakerCount) {
  if (value == null) return null;
  if (!Number.isInteger(expectedSpeakerCount) || expectedSpeakerCount < 1 || expectedSpeakerCount > 30
      || !Array.isArray(value) || value.length !== expectedSpeakerCount) {
    throw invalid("Un groupe de passages est requis pour chaque intervenant annoncé.");
  }
  const all = [];
  const normalized = value.map((entry, index) => {
    if (!entry || !Array.isArray(entry.ranges) || entry.ranges.length < 1 || entry.ranges.length > 5) {
      throw invalid("Sélectionnez entre un et cinq passages par intervenant.");
    }
    const speaker = `SPEAKER_${String(index).padStart(2, "0")}`;
    const ranges = entry.ranges.map(range => {
      if (typeof range?.start !== "number" || typeof range?.end !== "number"
          || !Number.isFinite(range.start) || !Number.isFinite(range.end)
          || range.start < 0 || range.end > 604800 || range.end - range.start < 2 || range.end - range.start > 12) {
        throw invalid("Chaque passage doit durer entre 2 et 12 secondes, avec des bornes valides.");
      }
      const result = { start: range.start, end: range.end };
      all.push({ ...result, speaker });
      return result;
    });
    return { speaker, ranges };
  });
  all.sort((a, b) => a.start - b.start);
  for (let index = 1; index < all.length; index++) {
    if (all[index].start < all[index - 1].end) throw invalid("Les passages de référence ne doivent pas se chevaucher.");
  }
  return normalized;
}

export function assertManualVoiceReferenceManifest(manifest, selected) {
  if (!selected) return;
  const received = manifest?.manualVoiceReferences;
  if (!Array.isArray(received) || received.length !== selected.length
      || Object.keys(manifest.references || {}).length !== selected.length) {
    throw new Error("Le profil retourné ne conserve pas les références guidées du job.");
  }
  for (const [index, group] of selected.entries()) {
    const actual = received[index];
    if (actual?.speaker !== group.speaker || !Array.isArray(actual.ranges)
        || actual.ranges.length !== group.ranges.length
        || group.ranges.some((range, ri) => actual.ranges[ri]?.start !== range.start || actual.ranges[ri]?.end !== range.end)) {
      throw new Error("Les passages guidés ont été modifiés par le moteur.");
    }
    const reference = manifest.references[group.speaker];
    if (!Number.isFinite(reference?.sourceStart) || !Number.isFinite(reference?.sourceEnd)
        || reference.sourceEnd - reference.sourceStart < 1.999
        || !group.ranges.some(range => reference.sourceStart >= range.start - 0.001 && reference.sourceEnd <= range.end + 0.001)) {
      throw new Error(`La référence ${group.speaker} sort des passages autorisés.`);
    }
  }
}
