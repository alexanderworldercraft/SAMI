import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CompositeBuffer, UmpWriter } from "googlevideo/ump";
import { MediaHeader, UMPPartId } from "googlevideo/protos";
import { decodeUmp, downloadUmp } from "../src/ump.mjs";

const wrap = (data, start, end = true) => {
  const buffer = new CompositeBuffer(); const writer = new UmpWriter(buffer);
  writer.write(UMPPartId.MEDIA_HEADER, MediaHeader.encode({ headerId: 0, itag: 140, startRange: String(start) }).finish());
  writer.write(UMPPartId.MEDIA, Buffer.concat([Buffer.from([0]), data]));
  if (end) writer.write(UMPPartId.MEDIA_END, Buffer.from([0]));
  return Buffer.concat(buffer.chunks);
};
test("UMP : plages successives, signature intacte et contenu exact", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sami-ump-test-"));
  try {
    const content = Buffer.from("abcdefghijk");
    const seen = [];
    const file = path.join(directory, "media.part");
    await downloadUmp({ kind: "audio", url: "https://cdn.test/v?ump=1&itag=140&clen=11&sig=a%20b&range=2-3" }, file, {
      chunkSize: 4, fetchImpl: async (url) => {
        seen.push(url); const range = new URL(url).searchParams.get("range").split("-").map(Number);
        return new Response(wrap(content.subarray(range[0], range[1] + 1), range[0]), { headers: { "content-type": "application/vnd.yt-ump" } });
      },
    });
    assert.equal(fs.readFileSync(file, "utf8"), "abcdefghijk");
    assert.equal(seen.length, 3); assert.ok(seen.every((url) => url.includes("sig=a%20b")));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test("UMP : refus d’une piste incorrecte, d’un fragment incomplet ou déplacé", () => {
  const bytes = Buffer.from("abcd");
  assert.throws(() => decodeUmp(wrap(bytes, 0), { start: 0, length: 4, itag: 399 }), /autre piste/);
  assert.throws(() => decodeUmp(wrap(bytes, 10), { start: 0, length: 4, itag: 140 }), /incohérente/);
  assert.throws(() => decodeUmp(wrap(bytes, 0, false), { start: 0, length: 4, itag: 140 }), /incomplète/);
});
