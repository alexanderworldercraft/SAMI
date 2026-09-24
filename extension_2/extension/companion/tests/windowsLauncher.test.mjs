import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { probeNative } from "../src/nativeProbe.mjs";

test("Windows : le lanceur compilé transmet un petit ping avant EOF", { skip: process.platform !== "win32", timeout: 30000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sami-launcher-test-"));
  try {
    const windows = process.env.WINDIR || "C:\\Windows";
    const compiler = ["Framework64", "Framework"].map((folder) => path.join(windows, "Microsoft.NET", folder, "v4.0.30319", "csc.exe")).find(fs.existsSync);
    assert.ok(compiler, "Le compilateur .NET Framework est requis par le lanceur.");
    const executable = path.join(directory, "sami-companion-host.exe");
    execFileSync(compiler, ["/nologo", "/target:exe", "/out:" + executable, fileURLToPath(new URL("../windows-launcher/Program.cs", import.meta.url))], { windowsHide: true });
    fs.writeFileSync(path.join(directory, "node-path.txt"), process.execPath);
    fs.mkdirSync(path.join(directory, "src"));
    const protocol = new URL("../src/nativeProtocol.mjs", import.meta.url).href;
    fs.writeFileSync(path.join(directory, "src", "companion.mjs"),
      `import {NativeDecoder,encodeMessage} from ${JSON.stringify(protocol)};
const decoder = new NativeDecoder(() => process.stdout.write(encodeMessage({ok:true,version:"fixture"})));
process.stdin.on("data", chunk => decoder.push(chunk));`);
    assert.equal((await probeNative(executable)).version, "fixture");
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
