import fs from "node:fs";
import { CompositeBuffer, UmpReader } from "googlevideo/ump";
import { MediaHeader, UMPPartId } from "googlevideo/protos";
import { fetchMedia } from "./network.mjs";

export const isUmp = (candidate) => new URL(candidate.url).searchParams.get("ump") === "1" || /vnd\.yt-ump/i.test(candidate.contentType || "");

export function decodeUmp(bytes, { start, length, itag }) {
  const reader = new UmpReader(new CompositeBuffer([bytes]));
  const headers = new Map(); const chunks = []; let count = 0;
  const partial = reader.read((part) => {
    if (part.type === UMPPartId.MEDIA_HEADER) {
      const header = MediaHeader.decode(Buffer.concat(part.data.chunks));
      if (header.compressionAlgorithm) throw new Error("Compression UMP non prise en charge.");
      if (itag && Number(header.itag || header.formatId?.itag) !== Number(itag)) throw new Error("YouTube a renvoyé une autre piste que celle sélectionnée.");
      if (Number(header.startRange) !== start + count) throw new Error("Plage UMP incohérente : téléchargement interrompu pour éviter un fichier incomplet.");
      if (headers.has(header.headerId) && !headers.get(header.headerId).ended) throw new Error("En-tête UMP dupliqué.");
      headers.set(header.headerId, { ended: false });
    } else if (part.type === UMPPartId.MEDIA || part.type === UMPPartId.MEDIA_END) {
      const [id, offset] = new UmpReader(part.data).readVarInt(0);
      const header = headers.get(id);
      if (!header || header.ended) throw new Error("Bloc UMP sans en-tête valide.");
      if (part.type === UMPPartId.MEDIA_END) { header.ended = true; return; }
      const payload = Buffer.concat(part.data.split(offset).remainingBuffer.chunks);
      count += payload.length;
      if (count > length) throw new Error("Le serveur YouTube n’a pas respecté la plage demandée.");
      chunks.push(payload);
    } else if ([UMPPartId.SABR_ERROR, UMPPartId.SABR_REDIRECT, UMPPartId.ONESIE_ENCRYPTED_MEDIA].includes(part.type)) {
      throw new Error("Flux YouTube SABR, chiffré ou refusé : choisissez un flux HLS/DASH ou une piste standard.");
    }
  });
  if (partial || count !== length || !headers.size || [...headers.values()].some((header) => !header.ended)) throw new Error("Réponse UMP incomplète : aucun fichier partiel ne sera conservé.");
  return Buffer.concat(chunks);
}

export async function downloadUmp(candidate, filename, { signal, onProgress, fetchImpl = fetch, chunkSize = 1024 * 1024 } = {}) {
  const original = new URL(candidate.url);
  const total = Number(original.searchParams.get("clen"));
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error("Flux YouTube sans taille connue (SABR/direct) : choisissez HLS/DASH ou une piste standard.");
  if ([original.searchParams.get("sparams"), original.searchParams.get("lsparams")].filter(Boolean).join(",").split(",").includes("range")) throw new Error("La plage de ce lien YouTube est signée : impossible d’en télécharger le fichier complet.");
  const query = original.search.slice(1).split("&").filter((field) => decodeURIComponent(field.split("=")[0]) !== "range").join("&");
  const file = fs.openSync(filename, "wx");
  try {
    for (let start = 0; start < total; start += chunkSize) {
      signal?.throwIfAborted();
      const length = Math.min(chunkSize, total - start);
      const target = original.origin + original.pathname + "?" + query + `&range=${start}-${start + length - 1}`;
      const { response } = await fetchMedia(target, candidate, { signal, fetchImpl });
      if (!/vnd\.yt-ump/i.test(response.headers.get("content-type") || "")) {
        await response.body?.cancel(); throw new Error("YouTube n’a pas renvoyé le transport UMP attendu.");
      }
      const pieces = []; let size = 0;
      for await (const chunk of response.body) {
        size += chunk.length;
        if (size > length + 1024 * 1024) throw new Error("Réponse UMP anormalement volumineuse.");
        pieces.push(chunk);
      }
      const data = decodeUmp(Buffer.concat(pieces), { start, length, itag: original.searchParams.get("itag") });
      fs.writeSync(file, data);
      onProgress?.({ stage: "assembly", receivedBytes: start + length, totalBytes: total });
    }
  } finally { fs.closeSync(file); }
  return filename;
}
