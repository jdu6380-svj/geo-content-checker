import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { callOpenAICompatibleModel } from "@/lib/ai/openai-compatible";
import { WARMUP_STATUS } from "@/lib/constants/analysis-contract";
import {
  AnalysisIdentityConfigurationError,
  InvalidAnalysisClientIdError,
  resolveAnalysisIdentity,
} from "@/lib/server/analysis-identity";
import {
  AnalysisRateLimitUnavailableError,
  checkWarmupRateLimit,
} from "@/lib/server/analysis-rate-limit";
import {
  markGeoRequestOutcome,
  withGeoRequestLogging,
} from "@/lib/server/geo-observability";
import { anonymousAnalysisMigrationResponse, shouldMigrateAnonymousAnalysis } from "@/lib/server/anonymous-analysis-migration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 5;

function responseHeaders(requestId: string, mode?: string): HeadersInit {
  return {
    "Cache-Control": "no-store",
    Deprecation: "true",
    "X-Request-ID": requestId,
    "X-GEO-Warmup-Status": WARMUP_STATUS,
    ...(mode ? { "X-GEO-RateLimit-Mode": mode } : {}),
  };
}

async function handlePost(request: NextRequest): Promise<Response> {
  if (shouldMigrateAnonymousAnalysis()) return anonymousAnalysisMigrationResponse();

  const requestId = randomUUID();
  console.warn(
    JSON.stringify({
      event: "geo_api_deprecation_warning",
      requestId,
      route: "/api/warmup",
      status: WARMUP_STATUS,
    }),
  );

  try {
    const identity = resolveAnalysisIdentity(request);
    const rateLimit = await checkWarmupRateLimit({
      deviceHash: identity.deviceHash,
      ipHash: identity.ipHash,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          message: "预热请求过于频繁，请稍后再试。",
          reason: rateLimit.reason,
        },
        {
          status: 429,
          headers: {
            ...responseHeaders(requestId, rateLimit.mode),
            "Retry-After": String(rateLimit.retryAfter),
          },
        },
      );
    }

    let warmed = false;
    try {
      await callOpenAICompatibleModel({
        messages: [
          { role: "system", content: "Return one minimal JSON object and no other text." },
          { role: "user", content: "Return {\"ok\":true}." },
        ],
        temperature: 0,
        timeoutMs: 4_000,
        maxTokens: 16,
        rateLimitMode: rateLimit.mode,
      });
      warmed = true;
    } catch {
      warmed = false;
    }
    markGeoRequestOutcome({ source: warmed ? "model" : "fallback" });

    return NextResponse.json(
      { warmed, rateLimitMode: rateLimit.mode, status: WARMUP_STATUS },
      { headers: responseHeaders(requestId, rateLimit.mode) },
    );
  } catch (error) {
    if (error instanceof InvalidAnalysisClientIdError) {
      return NextResponse.json(
        { error: "INVALID_CLIENT_ID", message: "X-GEO-Client-ID 必须是有效的 UUID。" },
        { status: 400, headers: responseHeaders(requestId) },
      );
    }

    if (
      error instanceof AnalysisIdentityConfigurationError ||
      error instanceof AnalysisRateLimitUnavailableError
    ) {
      return NextResponse.json(
        { error: "SERVICE_UNAVAILABLE", message: "预热服务暂时不可用。" },
        { status: 503, headers: responseHeaders(requestId, "fallback") },
      );
    }

    return NextResponse.json(
      { error: "INTERNAL_ERROR", message: "预热请求失败。" },
      { status: 500, headers: responseHeaders(requestId, "fallback") },
    );
  }
}

export const POST = withGeoRequestLogging("/api/warmup", handlePost);
