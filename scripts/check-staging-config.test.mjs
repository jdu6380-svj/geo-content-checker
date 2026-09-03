import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./check-staging-config.mjs", import.meta.url));

const validEnv = {
  NODE_ENV: "test",
  OPENAI_BASE_URL: "https://provider.test",
  OPENAI_API_KEY: "openai-test-key",
  OPENAI_MODEL: "model-test",
  UPSTASH_REDIS_REST_URL: "https://redis.test",
  UPSTASH_REDIS_REST_TOKEN: "redis-test-token",
  REDIS_QUOTA_FAIL_OPEN: "false",
  NEXT_PUBLIC_SENTRY_DSN: "https://sentry.test/1",
  SENTRY_ORG: "org-test",
  SENTRY_PROJECT: "project-test",
  SENTRY_AUTH_TOKEN: "sentry-test-token",
  NEXT_PUBLIC_FEEDBACK_URL: "https://feedback.test",
  NEXT_PUBLIC_APP_URL: "https://app.test",
  RATE_LIMIT_SALT: "rate-limit-secret-012345678901234567890",
  ANALYSIS_TOKEN_SECRET: "analysis-token-secret-012345678901234567890",
  BETA_EVENT_HMAC_SECRET: "beta-hmac-secret-012345678901234567890",
  COMMERCIAL_AUTH_ADAPTER: "clerk",
  COMMERCIAL_DATA_ADAPTER: "neon",
  COMMERCIAL_WORKSPACE_BOOTSTRAP: "clerk-org",
  COMMERCIAL_STORAGE_ADAPTER: "vercel-blob",
  COMMERCIAL_PAYMENT_EVENT_STORE: "neon",
  COMMERCIAL_EXECUTOR: "openai-compatible",
  COMMERCIAL_TELEMETRY: "",
  COMMERCIAL_RUN_LIMIT: "",
  DATABASE_URL: "postgresql://staging.test/db",
  CLERK_SECRET_KEY: "sk_test_clerk_key",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_clerk_key",
  COMMERCIAL_CLERK_ORG_WORKSPACE_MAP: "org_test=workspace_test",
  COMMERCIAL_PAYMENT_PROVIDER: "alipay",
  NEXT_PUBLIC_COMMERCIAL_PAYMENT_PROVIDER: "alipay",
  ALIPAY_FIRST_PURCHASE_PLAN: "new_user",
  ALIPAY_APP_ID: "app-test",
  ALIPAY_PRIVATE_KEY: "private-key-placeholder",
  ALIPAY_PUBLIC_KEY: "public-key-placeholder",
  ALIPAY_GATEWAY_URL: "https://openapi-sandbox.dl.alipaydev.com/gateway.do",
  ALIPAY_NOTIFY_URL: "https://app.test/api/alipay/notify",
  ALIPAY_RETURN_URL: "https://app.test/api/alipay/return",
  ALIPAY_PLAN_AMOUNT_MAP: "new_user=9.90,growth=29.90",
  ALIPAY_PLAN_RUN_LIMIT_MAP: "new_user=2,growth=8",
  BLOB_READ_WRITE_TOKEN: "blob-test-token",
  STRIPE_PRICE_ID_ALLOWLIST: "",
  STRIPE_PRICE_ID_RUN_LIMITS: "",
  STRIPE_PLAN_PRICE_MAP: "",
};

function run(env) {
  return spawnSync(process.execPath, [script], { env: { ...env }, encoding: "utf8" });
}

test("accepts a complete staging shape without printing values", () => {
  const result = run(validEnv);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /STAGING CONFIG VALID/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /sk_test_clerk_key|postgresql:\/\//);
});

test("rejects unsafe adapter defaults and inconsistent Alipay mappings", () => {
  const result = run({ ...validEnv,
    COMMERCIAL_DATA_ADAPTER: "memory",
    COMMERCIAL_WORKSPACE_BOOTSTRAP: "memory",
    COMMERCIAL_PAYMENT_EVENT_STORE: "memory",
    COMMERCIAL_EXECUTOR: "deterministic",
    COMMERCIAL_RUN_LIMIT: "60",
    COMMERCIAL_PROVISION_CONFIRM: "true",
    COMMERCIAL_CLERK_ORG_WORKSPACE_MAP: "org_test=workspace_test,org_other=workspace_test",
    ALIPAY_PLAN_RUN_LIMIT_MAP: "basic=5",
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /COMMERCIAL_DATA_ADAPTER invalid_mode/);
  assert.match(result.stdout, /COMMERCIAL_WORKSPACE_BOOTSTRAP invalid_mode/);
  assert.match(result.stdout, /COMMERCIAL_PAYMENT_EVENT_STORE invalid_mode/);
  assert.match(result.stdout, /COMMERCIAL_EXECUTOR invalid_mode/);
  assert.match(result.stdout, /COMMERCIAL_RUN_LIMIT global_quota_forbidden/);
  assert.match(result.stdout, /COMMERCIAL_PROVISION_CONFIRM operator_input_must_not_persist/);
  assert.match(result.stdout, /COMMERCIAL_CLERK_ORG_WORKSPACE_MAP invalid_or_duplicate_mapping/);
  assert.match(result.stdout, /ALIPAY_PLAN_RUN_LIMIT_MAP must_match_amount_map/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /sk_test_clerk_key|postgresql:\/\//);
});

test("accepts Vercel Upstash integration aliases", () => {
  const environment = { ...validEnv };
  delete environment.UPSTASH_REDIS_REST_URL;
  delete environment.UPSTASH_REDIS_REST_TOKEN;
  environment.UPSTASH_REDIS_REST_KV_REST_API_URL = "https://redis.test";
  environment.UPSTASH_REDIS_REST_KV_REST_API_TOKEN = "redis-test-token";
  const result = run(environment);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /UPSTASH_REDIS_REST_URL https/);
  assert.match(result.stdout, /UPSTASH_REDIS_REST_TOKEN shape_ok/);
});

test("recognizes Vercel sensitive placeholders without treating absent keys as configured", () => {
  const environment = { ...validEnv };
  environment.DATABASE_URL = "[SENSITIVE]";
  environment.RATE_LIMIT_SALT = "[SENSITIVE]";
  environment.ANALYSIS_TOKEN_SECRET = "[SENSITIVE]";
  environment.BETA_EVENT_HMAC_SECRET = "[SENSITIVE]";
  const accepted = run(environment);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /DATABASE_URL provider_managed_unverified/);
  assert.match(accepted.stdout, /SECURITY_SECRET_SET provider_managed_unverified/);

  const rejected = run({ ...environment, CLERK_SECRET_KEY: "" });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stdout, /CLERK_SECRET_KEY missing/);
});

test("allows a fully unconfigured payment provider only when it remains fail-closed", () => {
  const paymentNames = [
    "COMMERCIAL_PAYMENT_PROVIDER",
    "NEXT_PUBLIC_COMMERCIAL_PAYMENT_PROVIDER",
    "ALIPAY_FIRST_PURCHASE_PLAN",
    "ALIPAY_APP_ID",
    "ALIPAY_PRIVATE_KEY",
    "ALIPAY_PUBLIC_KEY",
    "ALIPAY_GATEWAY_URL",
    "ALIPAY_NOTIFY_URL",
    "ALIPAY_RETURN_URL",
    "ALIPAY_PLAN_AMOUNT_MAP",
    "ALIPAY_PLAN_RUN_LIMIT_MAP",
  ];
  const disabled = { ...validEnv };
  for (const name of paymentNames) disabled[name] = "";
  const accepted = run(disabled);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /COMMERCIAL_PAYMENT_PROVIDER fail_closed_unconfigured/);

  const partial = run({ ...disabled, ALIPAY_APP_ID: "partial" });
  assert.equal(partial.status, 1);
  assert.match(partial.stdout, /COMMERCIAL_PAYMENT_PROVIDER invalid_mode/);
  assert.match(partial.stdout, /ALIPAY_PRIVATE_KEY missing/);
});

test("requires an explicit operator allowlist for invite-only Beta mode", () => {
  const missing = run({ ...validEnv, NEXT_PUBLIC_EVIDRA_BETA_MODE: "true", EVIDRA_BETA_OPERATOR_SUBJECTS: "" });
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /EVIDRA_BETA_OPERATOR_SUBJECTS missing/);

  const accepted = run({ ...validEnv, NEXT_PUBLIC_EVIDRA_BETA_MODE: "true", EVIDRA_BETA_OPERATOR_SUBJECTS: "user_operator" });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /NEXT_PUBLIC_EVIDRA_BETA_MODE invite_only/);
});

test("rejects a persistent migration confirmation input", () => {
  const result = run({ ...validEnv, COMMERCIAL_MIGRATION_CONFIRM: "true" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /COMMERCIAL_MIGRATION_CONFIRM operator_input_must_not_persist/);
});

test("requires the first-purchase plan to be present in the server plan map", () => {
  const result = run({ ...validEnv, ALIPAY_FIRST_PURCHASE_PLAN: "missing" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /ALIPAY_FIRST_PURCHASE_PLAN invalid_mode/);
  assert.match(result.stdout, /ALIPAY_FIRST_PURCHASE_PLAN not_in_server_plan_map/);
});

test("does not interpolate process.env values into the checker output", () => {
  const source = readFileSync(script, "utf8");
  assert.doesNotMatch(source, /console\.(log|error)\([^\n]*process\.env/);
});

test("rejects unknown commercial telemetry modes", () => {
  const result = run({ ...validEnv, COMMERCIAL_TELEMETRY: "provider-debug" });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /COMMERCIAL_TELEMETRY invalid_mode/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /provider-debug/);
});

test("validates confirmed smoke inputs without printing ephemeral credentials", () => {
  const accepted = run({
    ...validEnv,
    STAGING_SMOKE_CONFIRM: "true",
    STAGING_BASE_URL: "https://staging.test",
    STAGING_SMOKE_PLAN: "growth",
    STAGING_SMOKE_MAX_POLLS: "6",
    STAGING_SMOKE_POLL_MS: "0",
    STAGING_SMOKE_COOKIE: "session=private-cookie",
  });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /STAGING_SMOKE_PLAN mapped/);
  assert.doesNotMatch(`${accepted.stdout}${accepted.stderr}`, /private-cookie|staging\.test/);

  const rejected = run({
    ...validEnv,
    STAGING_SMOKE_CONFIRM: "true",
    STAGING_BASE_URL: "http://staging.test",
    STAGING_SMOKE_PLAN: "unknown",
    STAGING_SMOKE_MAX_POLLS: "21",
  });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stdout, /STAGING_BASE_URL invalid_https/);
  assert.match(rejected.stdout, /STAGING_SMOKE_CREDENTIAL require_exactly_one_ephemeral_credential/);
  assert.match(rejected.stdout, /STAGING_SMOKE_PLAN not_in_server_plan_map/);
  assert.match(rejected.stdout, /STAGING_SMOKE_MAX_POLLS invalid_range/);
});

test("uses a plan present in the checked-in server mapping when no smoke plan is provided", () => {
  const result = run({
    ...validEnv,
    STAGING_SMOKE_CONFIRM: "true",
    STAGING_BASE_URL: "https://staging.test",
    STAGING_SMOKE_COOKIE: "ephemeral-cookie",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /STAGING_SMOKE_PLAN mapped/);
  assert.match(result.stdout, /STAGING CONFIG VALID/);
});
