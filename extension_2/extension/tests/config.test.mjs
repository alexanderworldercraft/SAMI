import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("le modèle de configuration ne contient aucun secret", () => {
  const source = fs.readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  assert.match(source, /EXTENSION_APP_NAME/);
  assert.match(source, /EXTENSION_API_BASE_URL/);
  assert.doesNotMatch(source, /SECRET|PASSWORD|TOKEN/);
});
