import { NextRequest, NextResponse } from "next/server";

import { withGeoRequestLogging } from "@/lib/server/geo-observability";
import {
  areDistinctSecuritySecrets,
  isHttpsUrl,
  isStrongSecuritySecret,
} from "@/lib/server/security-config";
import { getUpstashRedisRestConfig } from "@/lib/server/redis-config.ts";
import { getCommercialDatabaseUrl } from "@/lib/server/commercial/neon-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HealthResponse {
  status: "ok" | "degraded";
  checks: {
    appConfigured: boolean;
    modelConfigured: boolean;
    redisConfigured: boolean;
    securityConfigured: boolean;
    feedbackConfigured: boolean;
    sentryConfigured: boolean;
    paymentConfigured: boolean;
    clerkConfigured: boolean;
    dataConfigured: boolean;
    storageConfigured: boolean;
    paymentEventStoreConfigured: boolean;
    executorConfigured: boolean;
    operatorInputsClear: boolean;
    commercialConfigured: boolean;
  };
  timestamp: string;
}

function isConfigured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function hasMatchingAlipayPlanMappings(): boolean {
  const amounts = (process.env.ALIPAY_PLAN_AMOUNT_MAP ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const limits = (process.env.ALIPAY_PLAN_RUN_LIMIT_MAP ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const amountPattern = /^[A-Za-z0-9_-]+=(?:0|[1-9]\d*)\.\d{2}$/;
  const limitPattern = /^[A-Za-z0-9_-]+=[1-9]\d*$/;
  const amountPlans = amounts.map((entry) => entry.slice(0, entry.indexOf("=")));
  const limitPlans = limits.map((entry) => entry.slice(0, entry.indexOf("=")));
  return amounts.length > 0 &&
    limits.length > 0 &&
    amounts.every((entry) => amountPattern.test(entry)) &&
    limits.every((entry) => limitPattern.test(entry)) &&
    new Set(amountPlans).size === amountPlans.length &&
    new Set(limitPlans).size === limitPlans.length &&
    amountPlans.length === limitPlans.length &&
    amountPlans.every((plan) => limitPlans.includes(plan));
}

async function handleGet(_request: NextRequest): Promise<Response> {
  const betaEventSecret = process.env.BETA_EVENT_HMAC_SECRET?.trim();
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";
  const redis = getUpstashRedisRestConfig();
  const appConfigured = isHttpsUrl(process.env.NEXT_PUBLIC_APP_URL);
  const clerkConfigured =
    process.env.COMMERCIAL_AUTH_ADAPTER === "clerk" &&
    isConfigured("CLERK_SECRET_KEY") &&
    isConfigured("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  const dataConfigured =
    process.env.COMMERCIAL_DATA_ADAPTER === "neon" &&
    /^(postgres|postgresql):\/\//.test(getCommercialDatabaseUrl() ?? "");
  const storageConfigured =
    process.env.COMMERCIAL_STORAGE_ADAPTER === "vercel-blob" &&
    isConfigured("BLOB_READ_WRITE_TOKEN");
  const paymentEventStoreConfigured =
    process.env.COMMERCIAL_PAYMENT_EVENT_STORE === "neon" && dataConfigured;
  const executorConfigured =
    process.env.COMMERCIAL_EXECUTOR === "openai-compatible" &&
    isHttpsUrl(process.env.OPENAI_BASE_URL) &&
    isConfigured("OPENAI_API_KEY") &&
    isConfigured("OPENAI_MODEL");
  const workspaceBootstrapConfigured = process.env.COMMERCIAL_WORKSPACE_BOOTSTRAP === "clerk-org";
  const betaMode = process.env.NEXT_PUBLIC_EVIDRA_BETA_MODE?.trim() === "true";
  const mixedStripeConfiguration = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_ID_ALLOWLIST",
    "STRIPE_PRICE_ID_RUN_LIMITS",
    "STRIPE_PLAN_PRICE_MAP",
  ].some(isConfigured);
  const operatorInputsClear = [
    "COMMERCIAL_MIGRATION_CONFIRM",
    "COMMERCIAL_PROVISION_CONFIRM",
    "COMMERCIAL_PROVISION_WORKSPACE_ID",
    "COMMERCIAL_PROVISION_OWNER_SUBJECT_ID",
    "COMMERCIAL_PROVISION_RUN_LIMIT",
  ].every((name) => !isConfigured(name));
  const checks = {
    appConfigured,
    modelConfigured:
      isHttpsUrl(process.env.OPENAI_BASE_URL) &&
      isConfigured("OPENAI_API_KEY") &&
      isConfigured("OPENAI_MODEL"),
    redisConfigured:
      isHttpsUrl(redis.url) && Boolean(redis.token),
    securityConfigured: areDistinctSecuritySecrets(
      process.env.RATE_LIMIT_SALT,
      process.env.ANALYSIS_TOKEN_SECRET,
    ) &&
      isStrongSecuritySecret(betaEventSecret) &&
      betaEventSecret !== process.env.RATE_LIMIT_SALT?.trim() &&
      betaEventSecret !== process.env.ANALYSIS_TOKEN_SECRET?.trim(),
    feedbackConfigured:
      isHttpsUrl(process.env.NEXT_PUBLIC_FEEDBACK_URL) &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail),
    sentryConfigured: isHttpsUrl(process.env.NEXT_PUBLIC_SENTRY_DSN),
    paymentConfigured: betaMode ? isConfigured("EVIDRA_BETA_OPERATOR_SUBJECTS") && !mixedStripeConfiguration :
      process.env.COMMERCIAL_PAYMENT_PROVIDER === "alipay" &&
      process.env.NEXT_PUBLIC_COMMERCIAL_PAYMENT_PROVIDER === "alipay" &&
      process.env.ALIPAY_FIRST_PURCHASE_PLAN === "new_user" &&
      isConfigured("ALIPAY_APP_ID") && isConfigured("ALIPAY_PRIVATE_KEY") && isConfigured("ALIPAY_PUBLIC_KEY") &&
      isHttpsUrl(process.env.ALIPAY_GATEWAY_URL) && isHttpsUrl(process.env.ALIPAY_NOTIFY_URL) && isHttpsUrl(process.env.ALIPAY_RETURN_URL) &&
      hasMatchingAlipayPlanMappings() &&
      !mixedStripeConfiguration,
    clerkConfigured,
    dataConfigured,
    storageConfigured,
    paymentEventStoreConfigured,
    executorConfigured,
    operatorInputsClear,
    commercialConfigured: appConfigured && clerkConfigured && dataConfigured && storageConfigured && paymentEventStoreConfigured && executorConfigured && workspaceBootstrapConfigured && operatorInputsClear,
  };
  const ready = Object.values(checks).every(Boolean);
  const body: HealthResponse = {
    status: ready ? "ok" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(body, { status: ready ? 200 : 503 });
}

export const GET = withGeoRequestLogging("/api/health", handleGet);
