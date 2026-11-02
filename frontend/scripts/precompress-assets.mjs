import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

// Seuls les fichiers publics du build sont traités ; aucun média ni HTML de session.
export async function precompressAssets(staticRoot) {
  const totals = { files: 0, originalBytes: 0, gzipBytes: 0, brotliBytes: 0 };
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(filename);
      } else if (entry.isFile() && /\.(?:js|css)$/.test(entry.name)) {
        const source = await fs.readFile(filename);
        if (source.length < 1024) {
          await Promise.all(["br", "gz"].map((extension) => fs.rm(`${filename}.${extension}`, { force: true })));
          continue;
        }
        const variants = [
          ["gz", gzipSync(source, { level: 9 }), "gzipBytes"],
          ["br", brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 5, [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT } }), "brotliBytes"],
        ];
        totals.files += 1;
        totals.originalBytes += source.length;
        for (const [extension, compressed, key] of variants) {
          const target = `${filename}.${extension}`;
          if (compressed.length >= source.length) {
            await fs.rm(target, { force: true });
            totals[key] += source.length;
            continue;
          }
          // Le serveur ne doit jamais lire une représentation partiellement écrite.
          const temporary = `${target}.tmp-${process.pid}`;
          await fs.writeFile(temporary, compressed);
          await fs.rename(temporary, target);
          totals[key] += compressed.length;
        }
      }
    }
  }
  await visit(staticRoot);
  return totals;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const staticRoot = fileURLToPath(new URL("../build/static", import.meta.url));
  console.log("Public JS/CSS precompression:", await precompressAssets(staticRoot));
}
