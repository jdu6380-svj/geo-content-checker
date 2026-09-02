import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MIGRATION_PATH = resolve(process.cwd(), "db/migrations/0001_commercial_core.sql");

function stableError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function validateMigrationEnvironment(env = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim() || "";
  if (!databaseUrl) return { ok: false, code: "DATABASE_URL_REQUIRED" };
  try {
    const protocol = new URL(databaseUrl).protocol;
    if (protocol !== "postgres:" && protocol !== "postgresql:") {
      return { ok: false, code: "DATABASE_URL_INVALID" };
    }
  } catch {
    return { ok: false, code: "DATABASE_URL_INVALID" };
  }
  if (env.COMMERCIAL_MIGRATION_CONFIRM?.trim() !== "true") {
    return { ok: false, code: "MIGRATION_CONFIRM_REQUIRED" };
  }
  return { ok: true, databaseUrl };
}

export function splitMigrationSql(source) {
  const statements = [];
  let start = 0;
  let quote = null;
  let dollarTag = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (current === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (current === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        index += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }
    if (quote === "'") {
      if (current === "'" && next === "'") index += 1;
      else if (current === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (current === '"' && next === '"') index += 1;
      else if (current === '"') quote = null;
      continue;
    }
    if (current === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (current === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (current === "'") {
      quote = "'";
      continue;
    }
    if (current === '"') {
      quote = '"';
      continue;
    }
    const dollarMatch = current === "$" ? source.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/) : null;
    if (dollarMatch) {
      dollarTag = dollarMatch[0];
      index += dollarTag.length - 1;
      continue;
    }
    if (current === ";") {
      const statement = source.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }

  const finalStatement = source.slice(start).trim();
  if (finalStatement) statements.push(finalStatement);
  return statements;
}

export async function applyMigration({ source, execute }) {
  const statements = splitMigrationSql(source);
  if (!statements.length) throw stableError("MIGRATION_EMPTY");

  let applied = 0;
  await execute("begin");
  try {
    for (const statement of statements) {
      await execute(statement);
      applied += 1;
    }
    await execute("commit");
    return applied;
  } catch {
    try {
      await execute("rollback");
    } catch {
      // Preserve the stable migration failure below.
    }
    const error = stableError("MIGRATION_FAILED");
    error.applied = applied;
    throw error;
  }
}

async function createPool(databaseUrl) {
  let neonModule;
  try {
    neonModule = await import("@neondatabase/serverless");
  } catch {
    throw stableError("MIGRATION_DRIVER_UNAVAILABLE");
  }
  if (typeof neonModule.Pool !== "function") {
    throw stableError("MIGRATION_DRIVER_UNAVAILABLE");
  }
  return new neonModule.Pool({ connectionString: databaseUrl });
}

export async function main(env = process.env) {
  const config = validateMigrationEnvironment(env);
  if (!config.ok) {
    console.error(`COMMERCIAL MIGRATION BLOCKED ${config.code}`);
    return 1;
  }

  let source;
  try {
    source = await readFile(MIGRATION_PATH, "utf8");
  } catch {
    console.error("COMMERCIAL MIGRATION BLOCKED MIGRATION_FILE_UNAVAILABLE");
    return 1;
  }

  let pool;
  let client;
  try {
    pool = await createPool(config.databaseUrl);
    client = await pool.connect();
    const applied = await applyMigration({
      source,
      execute: (statement) => client.query(statement),
    });
    console.info(`COMMERCIAL MIGRATION APPLIED statements=${applied}`);
    return 0;
  } catch (error) {
    const code = error?.code === "MIGRATION_DRIVER_UNAVAILABLE"
      ? error.code
      : error?.code === "MIGRATION_FAILED"
        ? error.code
        : "MIGRATION_FAILED";
    console.error(`COMMERCIAL MIGRATION BLOCKED ${code}`);
    return 1;
  } finally {
    if (client) {
      try {
        client.release();
      } catch {
        // Do not expose driver details or change the stable result.
      }
    }
    if (pool) {
      try {
        await pool.end();
      } catch {
        // Do not expose driver details or change the stable result.
      }
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
