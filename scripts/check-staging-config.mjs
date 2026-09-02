// Local-only staging preflight. It validates configuration shape and never calls a provider.
const failures = [];

function value(name) {
  return process.env[name]?.trim() || "";
}

function isSensitivePlaceholder(candidate) {
  return candidate === "[SENSITIVE]";
}

function pass(name, status = "configured") {
  console.log(`PASS ${name} ${status}`);
}

function fail(name, status) {
  console.log(`FAIL ${name} ${status}`);
  failures.push(name);
}

function required(name) {
  if (value(name)) pass(name);
  else fail(name, "missing");
}

function httpsUrl(name) {
  if (isSensitivePlaceholder(value(name))) {
    pass(name, "provider_managed_unverified");
    return;
  }
  try {
    if (!value(name) || new URL(value(name)).protocol !== "https:") throw new Error();
    pass(name, "https");
  } catch {
    fail(name, "invalid_https");
  }
}

function firstValue(...names) {
  return names.map(value).find(Boolean) || "";
}

function httpsUrlFrom(name, ...names) {
  if (names.map(value).some(isSensitivePlaceholder)) {
    pass(name, "provider_managed_unverified");
    return;
  }
  try {
    if (new URL(firstValue(...names)).protocol !== "https:") throw new Error();
    pass(name, "https");
  } catch {
    fail(name, "invalid_https");
  }
}

function secretShapeFrom(name, names, pattern = null) {
  const candidate = firstValue(...names);
  if (isSensitivePlaceholder(candidate)) {
    pass(name, "provider_managed_unverified");
    return;
  }
  if (!candidate) {
    fail(name, "missing");
    return;
  }
  if (pattern && !pattern.test(candidate)) {
    fail(name, "invalid_shape");
    return;
  }
  pass(name, "shape_ok");
}

function exact(name, expected) {
  if (value(name) === expected) pass(name, "allowed");
  else fail(name, "invalid_mode");
}

function secretShape(name, pattern = null) {
  const candidate = value(name);
  if (isSensitivePlaceholder(candidate)) {
    pass(name, "provider_managed_unverified");
    return;
  }
  if (!candidate) {
    fail(name, "missing");
    return;
  }
  if (pattern && !pattern.test(candidate)) {
    fail(name, "invalid_shape");
    return;
  }
  pass(name, "shape_ok");
}

function distinctSecrets(names) {
  const present = names.map(value).filter(Boolean);
  if (present.some(isSensitivePlaceholder)) {
    pass("SECURITY_SECRET_SET", "provider_managed_unverified");
    return;
  }
  if (present.length !== names.length || new Set(present).size !== present.length) {
    fail("SECURITY_SECRET_SET", "missing_or_not_distinct");
    return;
  }
  pass("SECURITY_SECRET_SET", "distinct");
}

function csv(name) {
  return value(name).split(",").map((entry) => entry.trim()).filter(Boolean);
}

function alipayMappings() {
  const amounts = csv("ALIPAY_PLAN_AMOUNT_MAP");
  const limits = csv("ALIPAY_PLAN_RUN_LIMIT_MAP");
  const amountPlans = amounts.map((entry) => entry.slice(0, entry.indexOf("=")));
  const limitPlans = limits.map((entry) => entry.slice(0, entry.indexOf("=")));
  if (!amounts.length || amounts.some((entry) => !/^[A-Za-z0-9_-]+=(?:0|[1-9]\d*)\.\d{2}$/.test(entry)) || new Set(amountPlans).size !== amountPlans.length) fail("ALIPAY_PLAN_AMOUNT_MAP", "invalid_shape");
  else pass("ALIPAY_PLAN_AMOUNT_MAP", "shape_ok");
  if (!limits.length || limits.some((entry) => !/^[A-Za-z0-9_-]+=[1-9]\d*$/.test(entry)) || new Set(limitPlans).size !== limitPlans.length || amountPlans.length !== limitPlans.length || amountPlans.some((plan) => !limitPlans.includes(plan))) fail("ALIPAY_PLAN_RUN_LIMIT_MAP", "must_match_amount_map");
  else pass("ALIPAY_PLAN_RUN_LIMIT_MAP", "matches_amount_map");
  if (!amountPlans.includes(value("ALIPAY_FIRST_PURCHASE_PLAN"))) fail("ALIPAY_FIRST_PURCHASE_PLAN", "not_in_server_plan_map");
}

function paymentConfiguration() {
  const names = [
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
  if (!names.some((name) => value(name))) {
    for (const name of names) pass(name, "fail_closed_unconfigured");
    return;
  }
  exact("COMMERCIAL_PAYMENT_PROVIDER", "alipay");
  exact("NEXT_PUBLIC_COMMERCIAL_PAYMENT_PROVIDER", "alipay");
  exact("ALIPAY_FIRST_PURCHASE_PLAN", "new_user");
  required("ALIPAY_APP_ID");
  secretShape("ALIPAY_PRIVATE_KEY");
  secretShape("ALIPAY_PUBLIC_KEY");
  httpsUrl("ALIPAY_GATEWAY_URL");
  httpsUrl("ALIPAY_NOTIFY_URL");
  httpsUrl("ALIPAY_RETURN_URL");
  alipayMappings();
}

function clerkMappings() {
  const mappings = csv("COMMERCIAL_CLERK_ORG_WORKSPACE_MAP");
  if (!mappings.length) {
    pass("COMMERCIAL_CLERK_ORG_WORKSPACE_MAP", "optional_with_clerk_org_bootstrap");
    return;
  }
  const orgs = mappings.map((entry) => entry.slice(0, entry.indexOf("=")));
  const workspaces = mappings.map((entry) => entry.slice(entry.indexOf("=") + 1));
  if (!mappings.length || mappings.some((entry) => !/^[A-Za-z0-9][A-Za-z0-9_-]*=[A-Za-z0-9][A-Za-z0-9_-]*$/.test(entry)) ||
      new Set(orgs).size !== orgs.length || new Set(workspaces).size !== workspaces.length) {
    fail("COMMERCIAL_CLERK_ORG_WORKSPACE_MAP", "invalid_or_duplicate_mapping");
  } else {
    pass("COMMERCIAL_CLERK_ORG_WORKSPACE_MAP", "shape_ok");
  }
}

function stagingSmokeInputs() {
  const confirm = value("STAGING_SMOKE_CONFIRM");
  const companionNames = [
    "STAGING_BASE_URL",
    "STAGING_SMOKE_PLAN",
    "STAGING_SMOKE_MAX_POLLS",
    "STAGING_SMOKE_POLL_MS",
    "STAGING_SMOKE_AUTHORIZATION",
    "STAGING_SMOKE_COOKIE",
  ];
  if (!confirm) {
    if (companionNames.some((name) => value(name))) fail("STAGING_SMOKE_INPUT_SET", "orphaned_without_confirmation");
    else pass("STAGING_SMOKE_CONFIRM", "unset");
    return;
  }
  if (confirm !== "true") {
    fail("STAGING_SMOKE_CONFIRM", "invalid_confirmation");
    return;
  }
  pass("STAGING_SMOKE_CONFIRM", "confirmed");
  httpsUrl("STAGING_BASE_URL");
  const credentialCount = Number(Boolean(value("STAGING_SMOKE_AUTHORIZATION"))) + Number(Boolean(value("STAGING_SMOKE_COOKIE")));
  if (credentialCount !== 1) fail("STAGING_SMOKE_CREDENTIAL", "require_exactly_one_ephemeral_credential");
  else pass("STAGING_SMOKE_CREDENTIAL", "configured");
  const plan = value("STAGING_SMOKE_PLAN") || "growth";
  const planKeys = csv("ALIPAY_PLAN_AMOUNT_MAP").map((entry) => entry.slice(0, entry.indexOf("=")));
  if (!planKeys.includes(plan)) fail("STAGING_SMOKE_PLAN", "not_in_server_plan_map");
  else pass("STAGING_SMOKE_PLAN", "mapped");
  for (const [name, fallback, minimum, maximum] of [
    ["STAGING_SMOKE_MAX_POLLS", "6", 1, 20],
    ["STAGING_SMOKE_POLL_MS", "250", 0, 60_000],
  ]) {
    const candidate = value(name) || fallback;
    const parsed = Number(candidate);
    if (!/^\d+$/.test(candidate) || !Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) fail(name, "invalid_range");
    else pass(name, "valid_range");
  }
}

function derivedUrlChecks() {
  const appUrl = value("NEXT_PUBLIC_APP_URL");
  for (const [name, path] of [
    ["CHECKOUT_SUCCESS_URL", "/dashboard?billing=success"],
    ["CHECKOUT_CANCEL_URL", "/dashboard?billing=cancelled"],
    ["PORTAL_RETURN_URL", "/dashboard?billing=portal-return"],
  ]) {
    try {
      const url = new URL(path, appUrl);
      if (url.protocol !== "https:") throw new Error();
      pass(name, "https_derived");
    } catch {
      fail(name, "invalid_https_derivation");
    }
  }
}

httpsUrl("OPENAI_BASE_URL");
secretShape("OPENAI_API_KEY");
required("OPENAI_MODEL");
httpsUrlFrom("UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_KV_REST_API_URL");
secretShapeFrom("UPSTASH_REDIS_REST_TOKEN", ["UPSTASH_REDIS_REST_TOKEN", "UPSTASH_REDIS_REST_KV_REST_API_TOKEN"]);
exact("REDIS_QUOTA_FAIL_OPEN", "false");
httpsUrl("NEXT_PUBLIC_SENTRY_DSN");
required("SENTRY_ORG");
required("SENTRY_PROJECT");
secretShape("SENTRY_AUTH_TOKEN");
httpsUrl("NEXT_PUBLIC_FEEDBACK_URL");
httpsUrl("NEXT_PUBLIC_APP_URL");
secretShape("RATE_LIMIT_SALT", /^.{32,}$/s);
secretShape("ANALYSIS_TOKEN_SECRET", /^.{32,}$/s);
secretShape("BETA_EVENT_HMAC_SECRET", /^.{32,}$/s);
distinctSecrets(["RATE_LIMIT_SALT", "ANALYSIS_TOKEN_SECRET", "BETA_EVENT_HMAC_SECRET"]);

exact("COMMERCIAL_AUTH_ADAPTER", "clerk");
exact("COMMERCIAL_DATA_ADAPTER", "neon");
exact("COMMERCIAL_WORKSPACE_BOOTSTRAP", "clerk-org");
exact("COMMERCIAL_STORAGE_ADAPTER", "vercel-blob");
exact("COMMERCIAL_PAYMENT_EVENT_STORE", "neon");
exact("COMMERCIAL_EXECUTOR", "openai-compatible");
if (value("COMMERCIAL_TELEMETRY") && value("COMMERCIAL_TELEMETRY") !== "console") fail("COMMERCIAL_TELEMETRY", "invalid_mode");
else pass("COMMERCIAL_TELEMETRY", value("COMMERCIAL_TELEMETRY") ? "console" : "no_op");
if (value("COMMERCIAL_RUN_LIMIT")) fail("COMMERCIAL_RUN_LIMIT", "global_quota_forbidden");
else pass("COMMERCIAL_RUN_LIMIT", "unset");
for (const name of [
  "COMMERCIAL_MIGRATION_CONFIRM",
  "COMMERCIAL_PROVISION_CONFIRM",
  "COMMERCIAL_PROVISION_WORKSPACE_ID",
  "COMMERCIAL_PROVISION_OWNER_SUBJECT_ID",
  "COMMERCIAL_PROVISION_RUN_LIMIT",
]) {
  if (value(name)) fail(name, "operator_input_must_not_persist");
  else pass(name, "unset");
}

secretShape("DATABASE_URL", /^(postgres|postgresql):\/\//);
secretShape("CLERK_SECRET_KEY", /^sk_(test|live)_[A-Za-z0-9_]+$/);
secretShape("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", /^pk_(test|live)_[A-Za-z0-9_]+$/);
clerkMappings();
paymentConfiguration();
for (const name of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_ID_ALLOWLIST", "STRIPE_PRICE_ID_RUN_LIMITS", "STRIPE_PLAN_PRICE_MAP"]) {
  if (value(name)) fail(name, "mixed_provider_forbidden"); else pass(name, "unset");
}
secretShape("BLOB_READ_WRITE_TOKEN");
derivedUrlChecks();
stagingSmokeInputs();

if (failures.length) {
  console.error(`STAGING CONFIG INVALID (${failures.length} checks)`);
  process.exit(1);
}
console.log("STAGING CONFIG VALID");
