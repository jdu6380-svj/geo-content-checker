import { NextRequest, NextResponse } from "next/server";

import { betaEventSchema } from "@/lib/schemas/beta-event";
import {
  BetaIdentityConfigurationError,
  InvalidBetaClientIdError,
  resolveBetaAnonymousId,
} from "@/lib/server/beta-identity";
import {
  AnalysisIdentityConfigurationError,
  resolveAnalysisIdentity,
} from "@/lib/server/analysis-identity";
import {
  AnalysisRateLimitUnavailableError,
  checkBetaEventRateLimit,
} from "@/lib/server/analysis-rate-limit";
import {
  BetaMetricsUnavailableError,
  recordBetaEvent,
} from "@/lib/server/beta-metrics";
import {
  analysisOperationErrorResponse,
  verifyAnalysisSession,
} from "@/lib/server/analysis-operation";
import { handleBetaEvent } from "@/lib/server/beta-event-handler";
import { withGeoRequestLogging } from "@/lib/server/geo-observability";
import { GeoRequestBodyError, readGeoJsonBody } from "@/lib/server/geo-request-body";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handlePost(request: NextRequest): Promise<Response> {
  try {
    const body = await readGeoJsonBody(request);
    const input = betaEventSchema.safeParse(body);
    if (!input.success) {
      return NextResponse.json(
        { error: "INVALID_EVENT", message: "Beta 事件格式不正确。" },
        { status: 400 },
      );
    }

    return await handleBetaEvent(request, input.data, {
      resolveBetaAnonymousId,
      resolveAnalysisIdentity,
      checkBetaEventRateLimit,
      verifyAnalysisSession,
      recordBetaEvent,
    });
  } catch (error) {
    const authorizationError = analysisOperationErrorResponse(error);
    if (authorizationError) return authorizationError;
    if (error instanceof InvalidBetaClientIdError) {
      return NextResponse.json(
        { error: "INVALID_CLIENT_ID", message: "匿名设备标识无效。" },
        { status: 400 },
      );
    }
    if (error instanceof AnalysisIdentityConfigurationError || error instanceof AnalysisRateLimitUnavailableError) {
      return NextResponse.json(
        { error: "METRICS_UNAVAILABLE", message: "统计服务暂时不可用。" },
        { status: 503 },
      );
    }
    if (
      error instanceof BetaIdentityConfigurationError ||
      error instanceof BetaMetricsUnavailableError
    ) {
      return NextResponse.json(
        { error: "METRICS_UNAVAILABLE", message: "统计服务暂时不可用。" },
        { status: 503 },
      );
    }
    if (error instanceof GeoRequestBodyError) {
      return NextResponse.json(
        { error: error.code, message: error.publicMessage },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "INVALID_JSON", message: "请求内容不是有效的 JSON。" },
      { status: 400 },
    );
  }
}

export const POST = withGeoRequestLogging("/api/beta-event", handlePost);
