import { randomBytes } from "node:crypto";
import { appendFile, chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const targetPath = resolve(process.cwd(), ".env.local");
const templatePath = resolve(process.cwd(), ".env.example");
const secret = () => randomBytes(32).toString("hex");
const generatedSecrets = new Set([
  "RATE_LIMIT_SALT",
  "ANALYSIS_TOKEN_SECRET",
  "BETA_EVENT_HMAC_SECRET",
]);

const template = await readFile(templatePath, "utf8");
const entries = template
  .split(/\r?\n/)
  .map((line) => /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line))
  .filter(Boolean)
  .map((match) => ({ name: match[1], defaultValue: match[2] }));

function valueFor({ name, defaultValue }) {
  return generatedSecrets.has(name) ? secret() : defaultValue;
}

function renderTemplate() {
  return template.replace(/^([A-Z][A-Z0-9_]*)=(.*)$/gm, (line, name, defaultValue) => {
    if (!generatedSecrets.has(name)) return line;
    return `${name}=${valueFor({ name, defaultValue })}`;
  });
}

try {
  const existing = await readFile(targetPath, "utf8");
  const existingNames = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
      .filter(Boolean),
  );
  const missing = entries.filter(({ name }) => !existingNames.has(name));

  if (missing.length === 0) {
    console.log(".env.local already contains every variable from .env.example.");
  } else {
    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    const additions = missing
      .map((entry) => `${entry.name}=${valueFor(entry)}`)
      .join("\n");
    await appendFile(
      targetPath,
      `${separator}# Added by npm run setup:env\n${additions}\n`,
      "utf8",
    );
    console.log(`Added missing variables: ${missing.map(({ name }) => name).join(", ")}`);
  }
  await chmod(targetPath, 0o600);
} catch (error) {
  if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) {
    throw error;
  }

  await writeFile(targetPath, renderTemplate(), {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await chmod(targetPath, 0o600);
  console.log("Created .env.local from .env.example with generated security secrets.");
}
