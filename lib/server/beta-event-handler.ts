import type { BetaEvent } from "../schemas/beta-event.ts";
import type { AnalysisIdentity } from "./analysis-identity.ts";
import {
  AnalysisRateLimitUnavailableError,
  type BetaEventRateLimitResult,
} from "./analysis-rate-limit.ts";
import type { RecordBetaEventResult } from "./beta-metrics.ts";

export type BetaEventHandlerDependencies = {
  resolveBetaAnonymousId: (request: Request) => string;
  resolveAnalysisIdentity: (request: Request) => AnalysisIdentity;
  checkBetaEventRateLimit: (
    identity: AnalysisIdentity,
  ) => Promise<BetaEventRateLimitResult>;
  verifyAnalysisSession: (request: Request) => Promise<{ runId: string }>;
  recordBetaEvent: (
    event: BetaEvent,
    anonymousId: string,
  ) => Promise<RecordBetaEventResult>;
};

export async function handleBetaEvent(
  request: Request,
  event: BetaEvent,
  dependencies: BetaEventHandlerDependencies,
): Promise<Response> {
  try {
    let anonymousId: string;
    if ("runId" in event) {
      const claims = await dependencies.verifyAnalysisSession(request);
      if (claims.runId !== event.runId) {
        return Response.json(
          { error: "RUN_ID_MISMATCH", message: "分析事件与当前会话不匹配。" },
          { status: 403 },
        );
      }
      anonymousId = dependencies.resolveBetaAnonymousId(request);
    } else {
      anonymousId = dependencies.resolveBetaAnonymousId(request);
      const identity = dependencies.resolveAnalysisIdentity(request);
      const rateLimit = await dependencies.checkBetaEventRateLimit(identity);
      if (!rateLimit.allowed) {
        return Response.json(
          {
            error: "RATE_LIMITED",
            message: "匿名 Beta 事件过于频繁，请稍后再试。",
            reason: rateLimit.reason,
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(rateLimit.retryAfter),
              "X-GEO-RateLimit-Mode": rateLimit.mode,
            },
          },
        );
      }
    }

    const result = await dependencies.recordBetaEvent(event, anonymousId);
    return Response.json(result, {
      status: result.duplicate ? 200 : 202,
      headers: { "X-GEO-Metrics-Mode": result.mode },
    });
  } catch (error) {
    if (error instanceof AnalysisRateLimitUnavailableError) {
      return Response.json(
        { error: "METRICS_UNAVAILABLE", message: "统计服务暂时不可用。" },
        { status: 503 },
      );
    }
    throw error;
  }
}
