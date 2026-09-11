import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ignored = [
  ".env", "backend/.env", "backend/.env prod", "backend/.env.backup",
  "backend/.env.pcfixe", "frontend/.env.local", "backend/.env.exemple.old",
  "backend/ssl/private.key", "backend/ssl/private.key.old", "backend/ssl/certificate.crt.old",
  "backend/scripts/ai-dubbing/__pycache__/runtime.cpython-311.pyc",
  "backend/scripts/ai/worker.pyc", "backend/.venv/bin/python",
  "backend/var/ai-dubbing/models/model.safetensors",
  "backend/var/ai-dubbing/diagnostics/failure-uuid/reference.wav",
  "backend/input-english-example/reference.wav", "backend/input-japanese-example.zip",
  "backend/failure-example/quality-attempt-1.wav", "backend/failure-example.zip",
  "backend/uploads/13/audio/track.wav", "frontend/build/index.html",
  "backend/node_modules/package/index.js", "backup.sql.gz",
];
const included = [
  "backend/.env.exemple", "frontend/.env.exemple", "backend/.env.pcfixe.exemple",
  "backend/prisma/schema.prisma", "backend/prisma/migrations/example/migration.sql",
  "backend/scripts/ai-dubbing/runtime", "backend/scripts/ai-dubbing/runtime.cmd",
  "backend/scripts/ai-dubbing/runtime.py", "backend/scripts/ai-dubbing/requirements.txt",
  "backend/scripts/ai-dubbing/test_english_identity.py", "backend/services/aiDubbing/profiles.js",
  "frontend/src/assets/language-flags/france.svg", "frontend/src/tailwind.generated.css",
  "backend/package-lock.json", "frontend/package-lock.json",
];

describe("règles Git des données privées et artefacts locaux", () => {
  it.each([["exclut", ignored, 0], ["conserve", included, 1]])("%s les chemins attendus", (_, paths, status) => {
    const result = spawnSync("git", ["check-ignore", "--no-index", "--stdin"], {
      cwd: root, input: paths.join("\n") + "\n", encoding: "utf8",
    });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(status);
    expect(result.stdout.trim().split("\n").filter(Boolean)).toEqual(status === 0 ? paths : []);
  });
});
