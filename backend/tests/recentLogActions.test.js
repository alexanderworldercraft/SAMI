import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RECENT_LOG_ACTIONS } from "../prisma/recentLogActions.js";
import { DISTRIBUTED_ENCODING_JOB_ACTIONS } from "../services/distributedEncoding/logReconciliation.js";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const listJavaScriptFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return listJavaScriptFiles(target);
    return entry.isFile() && entry.name.endsWith(".js") ? [target] : [];
  });

describe("actions de journalisation récentes", () => {
  it("déclare des noms uniques avec une criticité valide", () => {
    const names = RECENT_LOG_ACTIONS.map((action) => action.Nom);

    expect(new Set(names).size).toBe(names.length);
    expect(RECENT_LOG_ACTIONS.every((action) => (
      action.Description
      && Number.isInteger(action.Criticite)
      && action.Criticite >= 0
      && action.Criticite <= 3
    ))).toBe(true);
  });

  it("couvre toutes les actions terminales de l'encodage distribué", () => {
    const names = new Set(RECENT_LOG_ACTIONS.map((action) => action.Nom));

    for (const actionName of DISTRIBUTED_ENCODING_JOB_ACTIONS) {
      expect(names.has(actionName)).toBe(true);
    }
  });

  it("couvre les domaines ajoutés depuis la dernière mise à jour", () => {
    const names = new Set(RECENT_LOG_ACTIONS.map((action) => action.Nom));

    expect([...names]).toEqual(expect.arrayContaining([
      "universe_content_add",
      "universe_content_remove",
      "universe_items_reorder",
      "player_preferences_update",
      "person_bulk_link",
      "person_duplicate_review",
      "person_duplicate_merge",
    ]));
  });

  it("déclare chaque ActionNom statique utilisé par les contrôleurs et services", () => {
    const seedSource = fs.readFileSync(path.join(backendRoot, "prisma", "seed.js"), "utf8");
    const declaredNames = new Set([
      ...[...seedSource.matchAll(/Nom:\s*["']([^"']+)["']/g)].map((match) => match[1]),
      ...RECENT_LOG_ACTIONS.map((action) => action.Nom),
    ]);
    const usedNames = new Set(
      ["controllers", "services"]
        .flatMap((folder) => listJavaScriptFiles(path.join(backendRoot, folder)))
        .flatMap((file) => [...fs.readFileSync(file, "utf8").matchAll(/ActionNom:\s*["']([^"']+)["']/g)])
        .map((match) => match[1])
    );

    expect([...usedNames].filter((name) => !declaredNames.has(name))).toEqual([]);
  });

  it("maintient la migration des actions alignée sur le catalogue récent", () => {
    const migration = fs.readFileSync(path.join(
      backendRoot,
      "prisma",
      "migrations",
      "20260816170000_add_recent_log_actions",
      "migration.sql"
    ), "utf8");

    for (const action of RECENT_LOG_ACTIONS) {
      expect(migration).toContain(`('${action.Nom}'`);
    }
  });
});
