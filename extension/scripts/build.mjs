import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const parseEnv = (source) => Object.fromEntries(
  source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => {
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
    return [key, value];
  })
);

const envPath = fs.existsSync(path.join(root, ".env"))
  ? path.join(root, ".env")
  : path.join(root, ".env.example");
const env = parseEnv(fs.readFileSync(envPath, "utf8"));
const appName = env.EXTENSION_APP_NAME || "SAMI";
const apiBaseUrl = String(env.EXTENSION_API_BASE_URL || "").replace(/\/+$/, "");
const instance = new URL(apiBaseUrl);
if (!["http:", "https:"].includes(instance.protocol) || instance.username || instance.password || instance.search || instance.hash) throw new Error("EXTENSION_API_BASE_URL doit être l’URL HTTP(S) de l’application, sans identifiants, requête ni fragment.");

const output = path.join(root, "dist");
const firefoxOutput = path.join(root, "dist-firefox");
const baseManifest = {
  manifest_version: 3,
  name: `${appName} - Import vidéo`,
  version: env.EXTENSION_VERSION || "0.1.4",
  description: `Télécharge une vidéo directe ou prépare son import dans ${appName}.`,
  permissions: ["activeTab", "identity", "nativeMessaging", "scripting", "storage", "webRequest", "webNavigation"],
  host_permissions: ["<all_urls>"],
  background: { service_worker: "background.js", type: "module" },
  action: { default_popup: "popup.html", default_title: `${appName} - Import vidéo` },
  content_scripts: [{
    matches: ["http://*/*", "https://*/*"],
    js: ["content.js"],
    all_frames: true,
    match_about_blank: true,
    run_at: "document_start"
  }]
};
const buildTarget = (directory, manifest) => {
  fs.rmSync(directory, { recursive: true, force: true });
  fs.mkdirSync(directory, { recursive: true });
  fs.cpSync(path.join(root, "src"), directory, { recursive: true });
  for (const filename of ["content.js", "popup.html"]) {
    const target = path.join(directory, filename);
    fs.writeFileSync(target, fs.readFileSync(target, "utf8").replaceAll("__APP_NAME__", appName));
  }
  fs.writeFileSync(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(directory, "config.js"), `export const CONFIG = ${JSON.stringify({
  appName,
  apiBaseUrl,
  companionHost: env.EXTENSION_COMPANION_HOST || "fr.sami.media_companion",
  }, null, 2)};\n`);
};
buildTarget(output, baseManifest);
buildTarget(firefoxOutput, {
  ...baseManifest,
  background: { scripts: ["background.js"], type: "module" },
  browser_specific_settings: { gecko: { id: env.EXTENSION_FIREFOX_ID || "sami-import@worldercraft.fr", strict_min_version: "121.0" } },
});
console.log(`Extension ${appName} générée dans ${output} et ${firefoxOutput}`);
