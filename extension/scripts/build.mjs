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
const apiBaseUrl = String(env.EXTENSION_API_BASE_URL || "").replace(/\/$/, "");
if (!/^https?:\/\/[^/]+/.test(apiBaseUrl)) throw new Error("EXTENSION_API_BASE_URL est invalide.");

const output = path.join(root, "dist");
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.cpSync(path.join(root, "src"), output, { recursive: true });

for (const filename of ["content.js", "popup.html"]) {
  const target = path.join(output, filename);
  fs.writeFileSync(target, fs.readFileSync(target, "utf8").replaceAll("__APP_NAME__", appName));
}

const manifest = {
  manifest_version: 3,
  name: `${appName} - Import vidéo`,
  version: env.EXTENSION_VERSION || "0.1.0",
  description: `Télécharge une vidéo directe ou prépare son import dans ${appName}.`,
  permissions: ["activeTab", "downloads", "identity", "nativeMessaging", "scripting", "storage", "webRequest"],
  host_permissions: ["<all_urls>"],
  background: { service_worker: "background.js", type: "module" },
  action: { default_popup: "popup.html", default_title: `${appName} - Import vidéo` },
  content_scripts: [{
    matches: [
      "https://www.youtube.com/*",
      "https://youtu.be/*",
      "https://senpai-stream.space/*",
      "https://animes-sama.fr/*",
      "https://fr.pornhub.com/*"
    ],
    js: ["content.js"],
    css: ["content.css"],
    run_at: "document_idle"
  }]
};
fs.writeFileSync(path.join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(output, "config.js"), `export const CONFIG = ${JSON.stringify({
  appName,
  apiBaseUrl,
  downloadFolder: env.EXTENSION_DOWNLOAD_FOLDER || appName,
  companionHost: env.EXTENSION_COMPANION_HOST || "fr.sami.media_companion",
}, null, 2)};\n`);
console.log(`Extension ${appName} générée dans ${output}`);
