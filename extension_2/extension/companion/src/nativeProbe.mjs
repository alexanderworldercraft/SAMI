import { spawn } from "node:child_process";
import { NativeDecoder, encodeMessage } from "./nativeProtocol.mjs";

export function probeNative(command, args = [], { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let settled = false; let errors = "";
    const finish = (error, reply) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      child.stdin.destroy();
      if (error) {
        child.kill();
        reject(new Error(error.message + (errors.trim() ? "\n" + errors.trim() : "")));
      } else {
        const stopTimer = setTimeout(() => child.kill(), 2000);
        stopTimer.unref();
        child.once("close", () => { clearTimeout(stopTimer); resolve(reply); });
      }
    };
    const timer = setTimeout(() => finish(new Error("Aucune réponse Native Messaging après " + timeoutMs / 1000 + " secondes.")), timeoutMs);
    const decoder = new NativeDecoder((message) => {
      if (message.type === "progress") return;
      if (!message.ok) finish(new Error(message.error || "Ping refusé."));
      else finish(null, message);
    });
    child.stdout.on("data", (chunk) => {
      try { decoder.push(chunk); } catch (error) { finish(error); }
    });
    child.stderr.on("data", (chunk) => { errors = (errors + chunk).slice(-8000); });
    child.once("error", (error) => finish(error));
    child.stdin.on("error", (error) => finish(error));
    child.once("close", (code, signal) => finish(new Error("Processus fermé sans réponse (code " + code + ", signal " + signal + ").")));
    // Deliberately keep stdin open until the reply, exactly as the browser does.
    child.stdin.write(encodeMessage({ action: "ping" }));
  });
}
