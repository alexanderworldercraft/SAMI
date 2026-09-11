import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { runAiDubbingCommand } from "../../services/aiDubbing/commandRunner.js";

export async function main(args = process.argv.slice(2), { language = "ja" } = {}) {
  if (!["ja", "en"].includes(language)) throw new Error("Langue de comparaison inconnue.");
  const english = language === "en";
  const label = english ? "english" : "japanese";
  const { values } = parseArgs({ args, options: {
    failure: { type: "string" }, reference: { type: "string" }, root: { type: "string" },
    "check-only": { type: "boolean", default: false }, help: { type: "boolean" },
    "prepare-only": { type: "boolean", default: false },
    variant: { type: "string" },
  } });
  if (values.help) {
    if (english) {
      console.log('Usage : node scripts/ai-dubbing/compareEnglish.mjs --failure "dossier failure-UUID" --reference "référence originale SPEAKER_XX.wav" [--root "var/ai-dubbing"] [--check-only | --prepare-only] [--variant reference-text|speaker-identity]\nArrêter le worker avant le test GPU. Par défaut : trois tentatives par mode, six WAV diagnostiques privés. Base R5-R3 inchangée, seul le prompt varie. Aucun job ni piste modifié.');
      return;
    }
    console.log('Usage : node scripts/ai-dubbing/compareJapanese.mjs --failure "dossier failure-UUID" --reference "référence originale SPEAKER_XX.wav" [--root "var/ai-dubbing"] [--check-only | --prepare-only] [--variant bounded-identity|speaker-identity|reference-text|identity-ab]\nArrêter le worker avant le test GPU. Trois tentatives par variante. Par défaut : R5-R1/R5-R2 ; bounded-identity : R5-R3 seule ; identity-ab : R5-R2/R5-R3. Aucun job ni piste modifié. --prepare-only copie un petit dossier portable, sans charger les modèles.');
    return;
  }
  if (!values.failure || !values.reference) throw new Error("--failure et --reference sont requis (voir --help).");
  const choices = { "reference-text": ["reference-text"], "speaker-identity": ["speaker-identity"],
    "bounded-identity": ["bounded-identity"], "identity-ab": ["speaker-identity", "bounded-identity"] };
  if (values.variant && (!choices[values.variant] || (english && !["reference-text", "speaker-identity"].includes(values.variant)))) throw new Error("Variante inconnue pour cette comparaison (voir --help).");
  const variants = choices[values.variant] || ["reference-text", "speaker-identity"];
  if (values["check-only"] && values["prepare-only"]) throw new Error("Choisir --check-only ou --prepare-only.");
  const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const root = path.resolve(values.root || path.join(backend, "var/ai-dubbing"));
  const install = JSON.parse(await fs.promises.readFile(path.join(root, "install.json"), "utf8"));
  if (!path.isAbsolute(install.pythonPath || "") || !fs.existsSync(install.pythonPath)) {
    throw new Error("Python local absent du manifeste d'installation du clone.");
  }
  const failure = path.resolve(values.failure), reference = path.resolve(values.reference);
  const script = path.join(backend, `scripts/ai-dubbing/compare_${label}.py`);
  const controller = new AbortController();
  let interrupted = false;
  const stop = () => { interrupted = true; controller.abort(); };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const execute = (variant, output, check = false) => runAiDubbingCommand(install.pythonPath, [
    script, "--root", root, "--failure", failure, "--reference", reference,
    "--output", output, "--variant", variant, ...(check ? ["--check-only"] : []),
  ], { cwd: backend, signal: controller.signal, timeoutMs: check ? 30_000 : 20 * 60_000 });
  try {
    // Validate the archive and exact WAV before making a directory or loading CUDA.
    await execute("reference-text", path.join(root, "unused-check-output"), true);
    if (values["check-only"]) {
      console.log("Diagnostic et référence concordants. Aucun modèle chargé, aucun calcul lancé.");
      return;
    }
    const parent = path.join(root, "diagnostics", "comparisons");
    await fs.promises.mkdir(parent, { recursive: true, mode: 0o700 });
    if (values["prepare-only"]) {
      const bundle = await fs.promises.mkdtemp(path.join(parent, `input-${label}-`));
      const names = ["quality-failure.json", "error.json", "generation-attempt.json", "input-profile.json",
        ...(english ? ["quality-attempt-1.wav", "quality-attempt-2.wav", "quality-attempt-3.wav"] : [])];
      for (const name of names.filter(name => fs.existsSync(path.join(failure, name)))) {
        await fs.promises.copyFile(path.join(failure, name), path.join(bundle, name));
        await fs.promises.chmod(path.join(bundle, name), 0o600);
      }
      await fs.promises.copyFile(reference, path.join(bundle, "reference.wav"));
      await fs.promises.chmod(path.join(bundle, "reference.wav"), 0o600);
      console.log(`Entrées privées prêtes à copier sur le clone : ${bundle}\nUtiliser ce dossier pour --failure et son fichier reference.wav pour --reference. Aucun calcul GPU lancé.`);
      return;
    }
    const output = await fs.promises.mkdtemp(path.join(parent, `${label}-`));
    console.log(`Diagnostics privés : ${output}`);
    const summary = { schemaVersion: 1, synthetic: true, diagnosticOnly: true, language, variants: [], requiresListening: true };
    let failed = false;
    for (const variant of variants) {
      if (interrupted) break;
      console.log(`Comparaison ${variant} : 3 tentatives sur une seule réplique.`);
      try {
        await execute(variant, path.join(output, variant));
        const reportPath = path.join(output, variant, "comparison.json");
        const report = fs.existsSync(reportPath) ? JSON.parse(await fs.promises.readFile(reportPath, "utf8")) : null;
        const rejected = report?.attempts?.filter(attempt => attempt.state === "rejected-before-decoding").length || 0;
        summary.variants.push({ variant, state: rejected ? "completed-with-rejections" : "completed",
          rejectedBeforeDecoding: rejected, report: `${variant}/comparison.json` });
        if (rejected) console.log(`${variant} : ${rejected}/3 tentative(s) refusée(s) avant décodage ; aucun WAV pour ces tentatives, détails dans comparison.json.`);
      } catch (error) {
        failed = true;
        summary.variants.push({ variant, state: "failed", message: error.message, code: error.code });
        console.error(error.message);
      }
      await fs.promises.writeFile(path.join(output, "summary.json"), JSON.stringify(summary, null, 2), { mode: 0o600 });
    }
    if (failed || interrupted) process.exitCode = 1;
    console.log(`Comparaison ${failed || interrupted ? "incomplète" : "terminée"}. Écouter les WAV AI-diagnostic et consulter comparison.json ; rien n'a été publié dans SAMI.`);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
