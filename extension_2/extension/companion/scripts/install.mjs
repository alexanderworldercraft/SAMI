import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkRuntime } from "../src/runtime.mjs";
if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Installez Node.js 22+ avant d’enregistrer le compagnon.");
const extensionId = String(process.argv[2] || "").trim();
if (!/^[a-p]{32}$/.test(extensionId)) throw new Error("Usage : node scripts/install.mjs <ID_EXTENSION_CHROMIUM>");
const firefoxExtensionId = String(process.argv[3] || "sami-import@worldercraft.fr").trim();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, "..", ".env");
const extensionEnv = fs.readFileSync(fs.existsSync(envPath) ? envPath : path.join(root, "..", ".env.example"), "utf8");
const setting = (key, fallback) => extensionEnv.match(new RegExp(`^${key}\\s*=\\s*([^\\r\\n]+)`, "m"))?.[1].trim().replace(/^["']|["']$/g, "") || fallback;
const name = setting("EXTENSION_COMPANION_HOST", "fr.sami.media_companion");
if (!/^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/.test(name)) throw new Error("EXTENSION_COMPANION_HOST invalide.");
const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";
let launcher = path.resolve(root, isWindows ? "sami-companion-host.exe" : "launch.sh");
if (isWindows) {
  const candidates = [
    `${process.env.WINDIR || "C:\\Windows"}\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe`,
    `${process.env.WINDIR || "C:\\Windows"}\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe`,
  ];
  {
    const compiler = candidates.find((candidate) => fs.existsSync(candidate));
    if (!compiler) throw new Error("Compilateur C# Windows introuvable : installez .NET Framework 4.x.");
    execFileSync(compiler, ["/nologo", "/target:exe", `/out:${launcher}`, path.join(root, "windows-launcher", "Program.cs")], { stdio: "inherit" });
    fs.writeFileSync(path.join(root, "node-path.txt"), process.execPath, "utf8");
  }
}
if (isMac) {
  const sourcePath = path.join(root, "launcher.generated.c");
  const nodePath = process.execPath;
  const companionPath = path.join(root, "src", "companion.mjs");
  const logPath = path.join(root, "companion.log");
  launcher = path.join(root, "sami-companion-host-macos");
  const cString = (value) => JSON.stringify(value);
  fs.writeFileSync(sourcePath, `#include <errno.h>\n#include <fcntl.h>\n#include <stdio.h>\n#include <unistd.h>\n\nint main(void) {\n  int log_fd = open(${cString(logPath)}, O_WRONLY | O_CREAT | O_APPEND, 0600);\n  if (log_fd >= 0) {\n    dup2(log_fd, STDERR_FILENO);\n    close(log_fd);\n  }\n  char *const args[] = { ${cString(nodePath)}, ${cString(companionPath)}, NULL };\n  execv(${cString(nodePath)}, args);\n  perror("Impossible de lancer Node.js");\n  return errno ? errno : 127;\n}\n`);
  execFileSync("/usr/bin/clang", ["-O2", "-o", launcher, sourcePath], { stdio: "inherit" });
  fs.chmodSync(launcher, 0o755);
} else if (!isWindows) {
  const generatedLauncher = path.join(root, "launch.generated.sh");
  const nodePath = process.execPath.replaceAll("'", "'\\''");
  fs.writeFileSync(
    generatedLauncher,
    `#!/bin/sh\nSCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec '${nodePath}' "$SCRIPT_DIR/src/companion.mjs" 2>>"$SCRIPT_DIR/companion.log"\n`
  );
  fs.chmodSync(generatedLauncher, 0o755);
  launcher = generatedLauncher;
}
const manifest = { name, description: "Compagnon média SAMI", path: launcher, type: "stdio", allowed_origins: [`chrome-extension://${extensionId}/`] };
const configPath = path.join(root, "config.json");
let currentConfig = {};
try {
  if (fs.existsSync(configPath)) currentConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch {
  throw new Error("config.json est invalide. Corrigez-le ; l’installateur ne l’écrasera pas.");
}
const configuredFfmpeg = String(currentConfig.ffmpegPath || "").trim();
const foreignFfmpegPath = isWindows ? configuredFfmpeg.startsWith("/") : /^(?:[a-z]:[\\/]|\\\\)/i.test(configuredFfmpeg);
const missingAbsolutePath = configuredFfmpeg && (isWindows ? /^(?:[a-z]:[\\/]|\\\\)/i.test(configuredFfmpeg) : configuredFfmpeg.startsWith("/")) && !fs.existsSync(configuredFfmpeg);
if (!configuredFfmpeg || foreignFfmpegPath || missingAbsolutePath) {
  try {
    const lookupCommand = isWindows ? "where.exe" : "which";
    const ffmpegPath = execFileSync(lookupCommand, ["ffmpeg"], { encoding: "utf8" }).split(/\r?\n/).find(Boolean)?.trim();
    currentConfig.ffmpegPath = ffmpegPath || "ffmpeg";
  } catch {
    currentConfig.ffmpegPath = "ffmpeg";
    console.warn("FFmpeg n'a pas été détecté automatiquement. Configurez companion/config.json.");
  }
}
fs.writeFileSync(configPath, `${JSON.stringify({ downloadDirectory: "", allowUnauthorizedTls: false, ...currentConfig }, null, 2)}\n`);
const runtime = checkRuntime(currentConfig);
console.log(`FFmpeg vérifié : ${runtime.ffmpegPath}`);
if (isWindows) {
  const manifestPath = path.join(root, `${name}.json`); fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  for (const browser of ["Google\\Chrome", "Chromium", "Microsoft\\Edge", "BraveSoftware\\Brave-Browser"]) execFileSync("reg.exe", ["ADD", `HKCU\\Software\\${browser}\\NativeMessagingHosts\\${name}`, "/ve", "/t", "REG_SZ", "/d", manifestPath, "/f"], { stdio: "inherit" });
  const firefoxManifestPath = path.join(root, `${name}.firefox.json`);
  fs.writeFileSync(firefoxManifestPath, `${JSON.stringify({ ...manifest, allowed_origins: undefined, allowed_extensions: [firefoxExtensionId] }, null, 2)}\n`);
  execFileSync("reg.exe", ["ADD", `HKCU\\Software\\Mozilla\\NativeMessagingHosts\\${name}`, "/ve", "/t", "REG_SZ", "/d", firefoxManifestPath, "/f"], { stdio: "inherit" });
} else {
  const directories = process.platform === "darwin"
    ? ["Library/Application Support/Google/Chrome/NativeMessagingHosts", "Library/Application Support/Chromium/NativeMessagingHosts", "Library/Application Support/Microsoft Edge/NativeMessagingHosts", "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts"]
    : [".config/google-chrome/NativeMessagingHosts", ".config/chromium/NativeMessagingHosts", ".config/microsoft-edge/NativeMessagingHosts", ".config/BraveSoftware/Brave-Browser/NativeMessagingHosts"];
  for (const relativeDirectory of directories) {
    const directory = path.join(os.homedir(), relativeDirectory); fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${name}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  const firefoxDirectory = path.join(os.homedir(), isMac ? "Library/Application Support/Mozilla/NativeMessagingHosts" : ".mozilla/native-messaging-hosts");
  fs.mkdirSync(firefoxDirectory, { recursive: true });
  fs.writeFileSync(path.join(firefoxDirectory, `${name}.json`), `${JSON.stringify({ ...manifest, allowed_origins: undefined, allowed_extensions: [firefoxExtensionId] }, null, 2)}\n`);
}
console.log(`Compagnon enregistré pour l'extension ${extensionId}.`);
