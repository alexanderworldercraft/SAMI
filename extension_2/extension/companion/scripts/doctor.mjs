import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkRuntime, getDownloadDirectory } from "../src/runtime.mjs";
import { probeNative } from "../src/nativeProbe.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configFile = path.join(root, "config.json");
const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, "utf8")) : {};
console.log(JSON.stringify({ node: process.version, ...checkRuntime(config), downloadDirectory: getDownloadDirectory(config) }, null, 2));
const savedNodePath = path.join(root, "node-path.txt");
const node = process.platform === "win32" && fs.existsSync(savedNodePath) ? fs.readFileSync(savedNodePath, "utf8").trim() : process.execPath;
let stage = "Node direct";
try {
  console.log("[1/2] Test Node direct : " + node);
  const direct = await probeNative(node, [path.join(root, "src", "companion.mjs")]);
  console.log("OK — Node répond, compagnon " + direct.version);
  stage = "lanceur natif";
  const launcher = process.platform === "win32" ? path.join(root, "sami-companion-host.exe")
    : process.platform === "darwin" ? path.join(root, "sami-companion-host-macos") : path.join(root, "launch.generated.sh");
  if (!fs.existsSync(launcher)) throw new Error("Lanceur non installé : lancez npm run install-host -- ID_EXTENSION.");
  console.log("[2/2] Test lanceur natif : " + launcher);
  const reply = await probeNative(launcher);
  if (reply.version !== direct.version) throw new Error("Le lanceur pointe vers une autre version du compagnon.");
  console.log("OK — Le lanceur relaie le ping sans fermer la connexion.");
  console.log(JSON.stringify(reply, null, 2));
} catch (error) {
  console.error("ÉCHEC [" + stage + "] : " + error.message);
  if (stage === "lanceur natif") console.error("Node fonctionne directement. Récupérez les sources corrigées du lanceur et relancez install-host depuis ce dossier.");
  process.exitCode = 1;
}
