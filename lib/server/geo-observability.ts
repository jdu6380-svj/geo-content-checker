import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import * as Sentry from "@sentry/nextjs";
import type { NextRequest } from "next/server";

export type GeoResponseSource = "model" | "fallback" | "none";
export type GeoModelStatus =
  | "not-requested"
  | "requested"
  | "success"
  | "disabled"
  | "failed"
  | "invalid-output"
  | "rate-limited"
  | "timeout";

interface GeoRequestContext {
  requestId: string;
  route: string;
  startedAt: number;
  source: GeoResponseSource;
  modelStatus: GeoModelStatus;
  modelLatencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
}

type RouteHandler = (request: NextRequest) => Promise<Response>;

const requestStorage = new AsyncLocalStorage<GeoRequestContext>();

function writeRequestLog(context: GeoRequestContext, request: NextRequest, response: Response): void {
  const event = {
    event: "geo_api_request",
    requestId: context.requestId,
    route: context.route,
    method: request.method,
    status: response.status,
    durationMs: Math.max(0, Math.round(performance.now() - context.startedAt)),
    source: context.source,
    modelStatus: context.modelStatus,
    rateLimitMode: response.headers.get("X-GEO-RateLimit-Mode") ?? "none",
    ...(context.modelLatencyMs === undefined ? {} : { modelLatencyMs: context.modelLatencyMs }),
    ...(context.promptTokens === undefined ? {} : { promptTokens: context.promptTokens }),
    ...(context.completionTokens === undefined
      ? {}
      : { completionTokens: context.completionTokens }),
    ...(context.totalTokens === undefined ? {} : { totalTokens: context.totalTokens }),
    ...(context.estimatedCostUsd === undefined
      ? {}
      : { estimatedCostUsd: context.estimatedCostUsd }),
  };
  const serialized = JSON.stringify(event);

  if (response.status >= 500) {
    console.error(serialized);
  } else if (response.status >= 400) {
    console.warn(serialized);
  } else {
    console.info(serialized);
  }
}

export function markGeoRequestOutcome(params: {
  source?: GeoResponseSource;
  modelStatus?: GeoModelStatus;
  modelLatencyMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
}): void {
  const context = requestStorage.getStore();
  if (!context) return;
  if (params.source) context.source = params.source;
  if (params.modelStatus) context.modelStatus = params.modelStatus;
  if (params.modelLatencyMs !== undefined) context.modelLatencyMs = params.modelLatencyMs;
  if (params.promptTokens !== undefined) context.promptTokens = params.promptTokens;
  if (params.completionTokens !== undefined) context.completionTokens = params.completionTokens;
  if (params.totalTokens !== undefined) context.totalTokens = params.totalTokens;
  if (params.estimatedCostUsd !== undefined) context.estimatedCostUsd = params.estimatedCostUsd;
}

export function withGeoRequestLogging(route: string, handler: RouteHandler): RouteHandler {
  return async (request) => {
    const context: GeoRequestContext = {
      requestId: randomUUID(),
      route,
      startedAt: performance.now(),
      source: "none",
      modelStatus: "not-requested",
    };

    return requestStorage.run(context, async () => {
      let response: Response;
      try {
        response = await handler(request);
      } catch (error) {
        response = Response.json(
          { error: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试。" },
          { status: 500 },
        );
        context.modelStatus = context.modelStatus === "requested" ? "failed" : context.modelStatus;
        Sentry.captureException(error, {
          tags: { route },
          extra: { requestId: context.requestId },
        });
        console.error(
          JSON.stringify({
            event: "geo_api_unhandled_error",
            requestId: context.requestId,
            route,
            errorName: error instanceof Error ? error.name : "UnknownError",
          }),
        );
      }

      const existingRequestId = response.headers.get("X-Request-ID");
      if (existingRequestId) {
        context.requestId = existingRequestId;
      } else {
        response.headers.set("X-Request-ID", context.requestId);
      }
      response.headers.set("Cache-Control", "no-store");
      writeRequestLog(context, request, response);
      return response;
    });
  };
}
