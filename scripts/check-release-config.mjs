const releaseEnvironment = process.env.VERCEL_ENV?.trim();
// Preview deployments intentionally exercise the fail-closed runtime before external
// billing credentials are available. Keep the full commercial-release gate for a
// deliberate release check or Production, while staging:check remains the explicit
// preflight for end-to-end staging readiness.
const mustValidate =
  Boolean(process.env.REQUIRE_RELEASE_CONFIG) || releaseEnvironment === "production";

if (!mustValidate) {
  process.exit(0);
}

const errors = [];

function read(name) {
  return process.env[name]?.trim() || "";
}

function requireValue(name) {
  if (!read(name)) errors.push(`${name} is required`);
}

function requireHttpsUrl(name) {
  const value = read(name);
  try {
    if (!value || new URL(value).protocol !== "https:") {
      errors.push(`${name} must be an HTTPS URL`);
    }
  } catch {
    errors.push(`${name} must be an HTTPS URL`);
  }
}

function requireSecret(name) {
  if (Buffer.byteLength(read(name), "utf8") < 32) {
    errors.push(`${name} must be at least 32 bytes`);
  }
}

function requireExactValue(name, expected) {
  if (read(name) !== expected) {
    errors.push(`${name} must be exactly ${expected}`);
  }
}

function validateAlipayPlanMappings() {
  const amounts = read("ALIPAY_PLAN_AMOUNT_MAP").split(",").map((entry) => entry.trim()).filter(Boolean);
  const limits = read("ALIPAY_PLAN_RUN_LIMIT_MAP").split(",").map((entry) => entry.trim()).filter(Boolean);
  const amountPattern = /^[A-Za-z0-9_-]+=(?:0|[1-9]\d*)\.\d{2}$/;
  const limitPattern = /^[A-Za-z0-9_-]+=[1-9]\d*$/;
  const amountPlans = amounts.map((entry) => entry.slice(0, entry.indexOf("=")));
  const limitPlans = limits.map((entry) => entry.slice(0, entry.indexOf("=")));
  if (!amounts.length || !limits.length ||
      amounts.some((entry) => !amountPattern.test(entry)) ||
      limits.some((entry) => !limitPattern.test(entry)) ||
      new Set(amountPlans).size !== amountPlans.length ||
      new Set(limitPlans).size !== limitPlans.length ||
      amountPlans.length !== limitPlans.length ||
      amountPlans.some((plan) => !limitPlans.includes(plan)) ||
      !amountPlans.includes(read("ALIPAY_FIRST_PURCHASE_PLAN"))) {
    errors.push("ALIPAY_PLAN_* mappings must be valid, matching, and include ALIPAY_FIRST_PURCHASE_PLAN");
  }
}

function validateOptionalClerkMappings() {
  const mappings = read("COMMERCIAL_CLERK_ORG_WORKSPACE_MAP").split(",").map((entry) => entry.trim()).filter(Boolean);
  const orgs = mappings.map((entry) => entry.slice(0, entry.indexOf("=")));
  const workspaces = mappings.map((entry) => entry.slice(entry.indexOf("=") + 1));
  if (mappings.some((entry) => !/^org_[A-Za-z0-9_-]+=[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entry)) ||
      new Set(orgs).size !== orgs.length || new Set(workspaces).size !== workspaces.length) {
    errors.push("COMMERCIAL_CLERK_ORG_WORKSPACE_MAP must contain unique valid mappings when set");
  }
}

requireHttpsUrl("OPENAI_BASE_URL");
requireValue("OPENAI_API_KEY");
requireValue("OPENAI_MODEL");
requireHttpsUrl("UPSTASH_REDIS_REST_URL");
requireValue("UPSTASH_REDIS_REST_TOKEN");
requireExactValue("REDIS_QUOTA_FAIL_OPEN", "false");
requireSecret("RATE_LIMIT_SALT");
requireSecret("ANALYSIS_TOKEN_SECRET");
requireSecret("BETA_EVENT_HMAC_SECRET");
requireHttpsUrl("NEXT_PUBLIC_SENTRY_DSN");
requireValue("SENTRY_ORG");
requireValue("SENTRY_PROJECT");
requireValue("SENTRY_AUTH_TOKEN");
requireHttpsUrl("NEXT_PUBLIC_FEEDBACK_URL");
requireHttpsUrl("NEXT_PUBLIC_APP_URL");
requireExactValue("COMMERCIAL_AUTH_ADAPTER", "clerk");
requireExactValue("COMMERCIAL_DATA_ADAPTER", "neon");
requireExactValue("COMMERCIAL_WORKSPACE_BOOTSTRAP", "clerk-org");
requireExactValue("COMMERCIAL_STORAGE_ADAPTER", "vercel-blob");
requireExactValue("COMMERCIAL_PAYMENT_EVENT_STORE", "neon");
requireExactValue("COMMERCIAL_EXECUTOR", "openai-compatible");
if (read("COMMERCIAL_TELEMETRY") && read("COMMERCIAL_TELEMETRY") !== "console") {
  errors.push("COMMERCIAL_TELEMETRY must be empty or console");
}
requireValue("DATABASE_URL");
requireValue("CLERK_SECRET_KEY");
requireValue("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
validateOptionalClerkMappings();
requireValue("BLOB_READ_WRITE_TOKEN");
if (read("COMMERCIAL_RUN_LIMIT")) errors.push("COMMERCIAL_RUN_LIMIT must be unset; use persisted workspace entitlement");

requireExactValue("COMMERCIAL_PAYMENT_PROVIDER", "alipay");
requireExactValue("NEXT_PUBLIC_COMMERCIAL_PAYMENT_PROVIDER", "alipay");
requireExactValue("ALIPAY_FIRST_PURCHASE_PLAN", "new_user");
for (const name of ["ALIPAY_APP_ID", "ALIPAY_PRIVATE_KEY", "ALIPAY_PUBLIC_KEY", "ALIPAY_PLAN_AMOUNT_MAP", "ALIPAY_PLAN_RUN_LIMIT_MAP"]) requireValue(name);
for (const name of ["ALIPAY_GATEWAY_URL", "ALIPAY_NOTIFY_URL", "ALIPAY_RETURN_URL"]) requireHttpsUrl(name);
validateAlipayPlanMappings();
for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID_ALLOWLIST", "STRIPE_PLAN_PRICE_MAP"]) {
  if (read(name)) errors.push(`${name} must be unset when COMMERCIAL_PAYMENT_PROVIDER=alipay`);
}
for (const name of ["COMMERCIAL_MIGRATION_CONFIRM", "COMMERCIAL_PROVISION_CONFIRM", "COMMERCIAL_PROVISION_WORKSPACE_ID", "COMMERCIAL_PROVISION_OWNER_SUBJECT_ID", "COMMERCIAL_PROVISION_RUN_LIMIT"]) {
  if (read(name)) errors.push(`${name} is one-shot and must be unset`);
}

const supportEmail = read("NEXT_PUBLIC_SUPPORT_EMAIL");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
  errors.push("NEXT_PUBLIC_SUPPORT_EMAIL must be a valid email address");
}

if (
  read("RATE_LIMIT_SALT") &&
  read("ANALYSIS_TOKEN_SECRET") &&
  read("RATE_LIMIT_SALT") === read("ANALYSIS_TOKEN_SECRET")
) {
  errors.push("RATE_LIMIT_SALT and ANALYSIS_TOKEN_SECRET must be distinct");
}

const securitySecrets = [
  read("RATE_LIMIT_SALT"),
  read("ANALYSIS_TOKEN_SECRET"),
  read("BETA_EVENT_HMAC_SECRET"),
].filter(Boolean);
if (new Set(securitySecrets).size !== securitySecrets.length) {
  errors.push("RATE_LIMIT_SALT, ANALYSIS_TOKEN_SECRET and BETA_EVENT_HMAC_SECRET must be distinct");
}

if (errors.length > 0) {
  console.error("Release configuration is incomplete:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.info(`Release configuration is valid for ${releaseEnvironment || "manual validation"}.`);
