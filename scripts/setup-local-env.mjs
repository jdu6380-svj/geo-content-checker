import { randomBytes } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const targetPath = resolve(process.cwd(), ".env.local");
const secret = () => randomBytes(32).toString("hex");
const content = `OPENAI_BASE_URL=https://api.deepseek.com/v1
OPENAI_API_KEY=
OPENAI_MODEL=deepseek-chat

RATE_LIMIT_SALT=${secret()}
ANALYSIS_TOKEN_SECRET=${secret()}

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

REDIS_QUOTA_FAIL_OPEN=false
`;

try {
  await writeFile(targetPath, content, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  await chmod(targetPath, 0o600);
  console.log("Created .env.local with generated security secrets.");
  console.log("Add DeepSeek and Upstash credentials directly in that local file.");
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
    console.error(".env.local already exists; no files were changed.");
    process.exitCode = 1;
  } else {
    throw error;
  }
}
