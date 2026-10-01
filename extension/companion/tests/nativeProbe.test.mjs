import test from "node:test";
import assert from "node:assert/strict";
import { probeNative } from "../src/nativeProbe.mjs";
const encoder = new URL("../src/nativeProtocol.mjs", import.meta.url).href;
test("le diagnostic reçoit les petits messages sans fermeture préalable de stdin", async () => {
  const script = `import {encodeMessage} from ${JSON.stringify(encoder)}; process.stdin.once("data", () => process.stdout.write(encodeMessage({ok:true,version:"test"})));`;
  const result = await probeNative(process.execPath, ["--input-type=module", "-e", script], { timeoutMs: 3000 });
  assert.equal(result.version, "test");
});
test("le diagnostic distingue une sortie prématurée et conserve stderr", async () => {
  await assert.rejects(probeNative(process.execPath, ["-e", 'process.stderr.write("missing dependency"); process.exitCode=2;']), /missing dependency/);
});
test("le diagnostic arrête un processus qui attend la fermeture du flux", async () => {
  await assert.rejects(probeNative(process.execPath, ["-e", 'process.stdin.resume();'], { timeoutMs: 200 }), /Aucune réponse/);
});
