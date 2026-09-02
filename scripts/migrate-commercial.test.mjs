import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  applyMigration,
  splitMigrationSql,
  validateMigrationEnvironment,
} from "./migrate-commercial.mjs";

const script = fileURLToPath(new URL("./migrate-commercial.mjs", import.meta.url));

test("requires explicit postgres URL and one-shot confirmation", () => {
  assert.deepEqual(validateMigrationEnvironment({}), {
    ok: false,
    code: "DATABASE_URL_REQUIRED",
  });
  assert.deepEqual(validateMigrationEnvironment({ DATABASE_URL: "https://db.test" }), {
    ok: false,
    code: "DATABASE_URL_INVALID",
  });
  assert.deepEqual(validateMigrationEnvironment({ DATABASE_URL: "postgresql://db.test/db" }), {
    ok: false,
    code: "MIGRATION_CONFIRM_REQUIRED",
  });
  assert.equal(validateMigrationEnvironment({
    DATABASE_URL: "postgresql://db.test/db",
    COMMERCIAL_MIGRATION_CONFIRM: "true",
  }).ok, true);
});

test("splits SQL without splitting quoted semicolons", () => {
  const statements = splitMigrationSql("select ';'; -- comment;\nselect $$a;b$$; select 3;");
  assert.deepEqual(statements, ["select ';'", "-- comment;\nselect $$a;b$$", "select 3"]);
});

test("applies through an injected executor and rolls back on failure", async () => {
  const calls = [];
  const applied = await applyMigration({
    source: "create table one (id int); create table two (id int);",
    execute: async (statement) => calls.push(statement),
  });
  assert.equal(applied, 2);
  assert.deepEqual(calls, ["begin", "create table one (id int)", "create table two (id int)", "commit"]);

  const failedCalls = [];
  await assert.rejects(
    applyMigration({
      source: "create table one (id int); create table two (id int);",
      execute: async (statement) => {
        failedCalls.push(statement);
        if (statement.includes("two")) throw new Error("hidden driver detail");
      },
    }),
    (error) => error.code === "MIGRATION_FAILED" && error.applied === 1,
  );
  assert.equal(failedCalls.at(-1), "rollback");
});

test("keeps the migration transaction on one connected client", async () => {
  const source = await (await import("node:fs/promises")).readFile(
    new URL("../db/migrations/0001_commercial_core.sql", import.meta.url),
    "utf8",
  );
  assert.ok(source.includes("create table if not exists workspaces"));
  const scriptSource = await (await import("node:fs/promises")).readFile(
    new URL("./migrate-commercial.mjs", import.meta.url),
    "utf8",
  );
  assert.match(scriptSource, /await pool\.connect\(\)/);
  assert.match(scriptSource, /client\.query\(statement\)/);
  assert.match(scriptSource, /client\.release\(\)/);
});

test("CLI fails closed without confirmation and never prints the database URL", () => {
  const result = spawnSync(process.execPath, [script], {
    env: { DATABASE_URL: "postgresql://private.example/db" },
    encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /COMMERCIAL MIGRATION BLOCKED MIGRATION_CONFIRM_REQUIRED/);
  assert.doesNotMatch(result.stdout + result.stderr, /private\.example|postgresql/);
});
