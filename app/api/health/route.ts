import { NextRequest, NextResponse } from "next/server";

import { withGeoRequestLogging } from "@/lib/server/geo-observability";
import {
  areDistinctSecuritySecrets,
  isHttpsUrl,
} from "@/lib/server/security-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface HealthResponse {
  status: "ok" | "degraded";
  checks: {
    modelConfigured: boolean;
    redisConfigured: boolean;
    securityConfigured: boolean;
  };
  timestamp: string;
}

function isConfigured(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

async function handleGet(_request: NextRequest): Promise<Response> {
  const checks = {
    modelConfigured:
      isHttpsUrl(process.env.OPENAI_BASE_URL) &&
      isConfigured("OPENAI_API_KEY") &&
      isConfigured("OPENAI_MODEL"),
    redisConfigured:
      isHttpsUrl(process.env.UPSTASH_REDIS_REST_URL) &&
      isConfigured("UPSTASH_REDIS_REST_TOKEN"),
    securityConfigured: areDistinctSecuritySecrets(
      process.env.RATE_LIMIT_SALT,
      process.env.ANALYSIS_TOKEN_SECRET,
    ),
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
