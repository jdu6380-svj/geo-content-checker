const releaseEnvironment = process.env.VERCEL_ENV?.trim();
const mustValidate = Boolean(process.env.REQUIRE_RELEASE_CONFIG) || Boolean(releaseEnvironment);

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

requireHttpsUrl("OPENAI_BASE_URL");
requireValue("OPENAI_API_KEY");
requireValue("OPENAI_MODEL");
requireHttpsUrl("UPSTASH_REDIS_REST_URL");
requireValue("UPSTASH_REDIS_REST_TOKEN");
requireSecret("RATE_LIMIT_SALT");
requireSecret("ANALYSIS_TOKEN_SECRET");
requireSecret("BETA_EVENT_HMAC_SECRET");
requireHttpsUrl("NEXT_PUBLIC_SENTRY_DSN");
requireValue("SENTRY_ORG");
requireValue("SENTRY_PROJECT");
requireValue("SENTRY_AUTH_TOKEN");

if (releaseEnvironment === "production" || process.env.REQUIRE_RELEASE_CONFIG) {
  requireHttpsUrl("NEXT_PUBLIC_FEEDBACK_URL");
  const supportEmail = read("NEXT_PUBLIC_SUPPORT_EMAIL");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) {
    errors.push("NEXT_PUBLIC_SUPPORT_EMAIL must be a valid email address");
  }
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
