import crypto from "crypto";
import { runAiSubtitleEngine } from "../aiSubtitles/engineProcess.js";
import fs from "fs";
import path from "path";
import { signedFetch } from "../aiDubbing/workerClient.js";
import { runAiDubbingCommand } from "../aiDubbing/commandRunner.js";

export const isDirectVoiceOutput = (workspace, audioPath, paths = path) => (
  paths.relative(paths.resolve(workspace), paths.dirname(paths.resolve(audioPath))) === ""
);

export async function runVoiceLease({ config, signal }) {
  const { lease } = await signedFetch({ method: "POST", path: "/api/internal/voices/claim", body: {}, signal });
  if (!lease) return;
  if (!/^[a-f0-9-]{36}$/.test(lease.id)) throw new Error("Identifiant vocal invalide.");
  const workspace = path.join(config.workRoot, "voices", lease.id);
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
  const request = (suffix, body) => signedFetch({ method: "POST", path: `/api/internal/voices/${lease.id}/${suffix}`, body: { token: lease.token, ...body }, signal: controller.signal });
  let renewing = false;
  const timer = setInterval(async () => {
    if (renewing) return;
    renewing = true;
    try { await request("renew", {}); } catch (error) { controller.abort(error); } finally { renewing = false; }
  }, 30000);
  try {
    await fs.promises.mkdir(workspace, { recursive: true, mode: 0o700 });
    const reference = Buffer.from(lease.reference, "base64");
    if (crypto.createHash("sha256").update(reference).digest("hex") !== lease.referenceSha256) throw new Error("Empreinte de la voix originale invalide.");
    const referencePath = path.join(workspace, "reference.wav");
    await fs.promises.writeFile(referencePath, reference, { mode: 0o600 });
    if (lease.kind === "ORIGINAL") {
      const result = await runAiSubtitleEngine({ jobId: `voice-${lease.id}`, audioPath: referencePath, targetLanguage: lease.language, transcriptionOnly: true, signal: controller.signal });
      const text = (result.sourceSegments || []).map(segment => String(segment.text || "").trim()).filter(Boolean).join(" ");
      await request("finish", { text, sourceLanguage: result.sourceLanguage, transcriptionModel: result.transcriptionModel });
      return;
    }
    const inputPath = path.join(workspace, "input.json");
    const outputPath = path.join(workspace, "output.json");
    await fs.promises.writeFile(inputPath, JSON.stringify({ ...lease, reference: undefined, referencePath }), { mode: 0o600 });
    await runAiDubbingCommand(config.command, ["--phase", "voice", "--input", inputPath, "--output", outputPath], { cwd: workspace, signal: controller.signal, timeoutMs: 100 * 60 * 1000 });
    const result = JSON.parse(await fs.promises.readFile(outputPath, "utf8"));
    const audioPath = path.resolve(result.audioPath);
    // Python resolves junctions and may normalize the drive letter on Windows.
    // Compare canonical paths with platform semantics, not literal strings.
    const [realWorkspace, realAudioPath, audioInfo] = await Promise.all([
      fs.promises.realpath(workspace), fs.promises.realpath(audioPath), fs.promises.lstat(audioPath),
    ]);
    if (!isDirectVoiceOutput(realWorkspace, realAudioPath) || audioInfo.isSymbolicLink() || !audioInfo.isFile()) throw new Error("Sortie vocale hors du dossier autorisé.");
    if ((await fs.promises.stat(audioPath)).size > 15 * 1024 * 1024) throw new Error("Réplique trop volumineuse.");
    await request("finish", { audio: (await fs.promises.readFile(audioPath)).toString("base64"), watermarked: result.watermarked, watermarkConfidence: result.watermarkConfidence });
  } catch (error) {
    if (!controller.signal.aborted) await request("finish", { error: String(error.message).slice(0, 4000) }).catch(() => {});
    throw error;
  } finally {
    clearInterval(timer);
    signal?.removeEventListener("abort", abort);
    await fs.promises.rm(workspace, { recursive: true, force: true });
  }
}
