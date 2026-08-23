import fs from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  "prisma",
  "migrations",
  "20260822120000_add_ai_subtitles",
  "migration.sql"
);
const adminActionsMigrationPath = path.resolve(
  "prisma",
  "migrations",
  "20260823120000_add_ai_subtitle_admin_actions",
  "migration.sql"
);

describe("migration des workers de sous-titrage IA", () => {
  it("conserve la collation binaire du registre d'encodage distribué", () => {
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toContain(
      "`AiSubtitleWorkerID` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL"
    );
    expect(sql).toContain(
      "`AssignedWorkerID` VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL"
    );
  });

  it("ajoute les actions d'audit de modification, suppression et recréation", () => {
    const sql = fs.readFileSync(adminActionsMigrationPath, "utf8");
    expect(sql).toContain("ai_subtitle_updated");
    expect(sql).toContain("ai_subtitle_deleted");
    expect(sql).toContain("ai_subtitle_recreated");
  });
});
