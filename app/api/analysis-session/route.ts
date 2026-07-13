import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import {
  AnalysisIdentityConfigurationError,
  InvalidAnalysisClientIdError,
  resolveAnalysisIdentity,
} from "@/lib/server/analysis-identity";
import {
  AnalysisRateLimitUnavailableError,
  checkAnalysisRateLimit,
  type AnalysisRateLimitMode,
} from "@/lib/server/analysis-rate-limit";
import {
  ANALYSIS_OPERATION_LIMITS,
  AnalysisTokenConfigurationError,
  issueAnalysisToken,
} from "@/lib/server/analysis-token";
import { withGeoRequestLogging } from "@/lib/server/geo-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AnalysisSessionResponse {
  token: string;
  runId: string;
  expiresAt: string;
  operations: typeof ANALYSIS_OPERATION_LIMITS;
  rateLimitMode: AnalysisRateLimitMode;
}

function responseHeaders(requestId: string, mode?: string): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "X-Request-ID": requestId,
    ...(mode ? { "X-GEO-RateLimit-Mode": mode } : {}),
  };
}

async function handlePost(request: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  try {
    const identity = resolveAnalysisIdentity(request);
    const rateLimit = await checkAnalysisRateLimit({
      deviceHash: identity.deviceHash,
      ipHash: identity.ipHash,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: "RATE_LIMITED",
          message: "体检次数已达到当前时段上限，请稍后再试。",
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

    const issued = await issueAnalysisToken(identity);
    const response: AnalysisSessionResponse = {
      token: issued.token,
      runId: issued.runId,
      expiresAt: issued.expiresAt,
      operations: issued.operations,
      rateLimitMode: rateLimit.mode,
    };

    return NextResponse.json(response, {
      headers: responseHeaders(requestId, rateLimit.mode),
    });
  } catch (error) {
    if (error instanceof InvalidAnalysisClientIdError) {
      return NextResponse.json(
        {
          error: "INVALID_CLIENT_ID",
          message: "X-GEO-Client-ID 必须是有效的 UUID。",
        },
        { status: 400, headers: responseHeaders(requestId) },
      );
    }

    if (
      error instanceof AnalysisIdentityConfigurationError ||
      error instanceof AnalysisTokenConfigurationError ||
      error instanceof AnalysisRateLimitUnavailableError
    ) {
      return NextResponse.json(
        {
          error: "SERVICE_UNAVAILABLE",
          message: "分析服务暂时不可用，请稍后重试。",
        },
        { status: 503, headers: responseHeaders(requestId, "fallback") },
      );
    }

    return NextResponse.json(
      {
        error: "INTERNAL_ERROR",
        message: "无法创建分析会话，请稍后重试。",
      },
      { status: 500, headers: responseHeaders(requestId, "fallback") },
    );
  }
}

export const POST = withGeoRequestLogging("/api/analysis-session", handlePost);
