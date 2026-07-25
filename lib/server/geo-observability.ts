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

export const GEO_MODEL_FINISH_REASONS = [
  "stop",
  "length",
  "content_filter",
  "tool_calls",
  "function_call",
  "unknown",
] as const;

export type GeoModelFinishReason = (typeof GEO_MODEL_FINISH_REASONS)[number];

export interface ModelProviderTelemetry {
  contentPresent: boolean;
  contentLength: number;
  finishReason: GeoModelFinishReason;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
}

export const GEO_VALIDATION_STAGES = [
  "json_parse",
  "schema_validation",
  "semantic_validation",
  "reference_validation",
  "evidence_validation",
] as const;

export type GeoValidationStage = (typeof GEO_VALIDATION_STAGES)[number];

export const GEO_VALIDATION_FAILURE_CLASSIFICATIONS = [
  "json_parse_failed",
  "token_cap_truncation",
  "required_field_missing",
  "schema_validation_failed",
  "semantic_validation_failed",
  "reference_mismatch",
  "quote_mismatch",
] as const;

export type GeoValidationFailureClassification =
  (typeof GEO_VALIDATION_FAILURE_CLASSIFICATIONS)[number];

const GEO_VALIDATION_ACTION_TYPES = [
  "author_evidence",
  "structure_change",
  "faq",
  "fact_card",
] as const;

type GeoValidationActionType =
  | (typeof GEO_VALIDATION_ACTION_TYPES)[number]
  | "unknown"
  | "non-string";

export interface GeoValidationTelemetryInput {
  stage: GeoValidationStage;
  issueCount: number;
  failureClassification?: GeoValidationFailureClassification;
  fieldPaths?: readonly (readonly (string | number)[])[];
  actionTypes?: readonly unknown[];
}

export interface GeoValidationTelemetry {
  validationStage: GeoValidationStage;
  validationIssueCount: number;
  validationFailureClassification: GeoValidationFailureClassification | null;
  validationFieldPaths: string[];
  validationActionTypes: GeoValidationActionType[];
}

interface GeoRequestContext {
  requestId: string;
  route: string;
  startedAt: number;
  source: GeoResponseSource;
  modelStatus: GeoModelStatus;
  modelLatencyMs?: number;
  providerRequestStartAt?: number;
  firstByteAt?: number;
  firstTokenAt?: number;
  responseCompletedAt?: number;
  abortedAt?: number;
  streamDurationMs?: number;
  contentPresent?: boolean;
  contentLength?: number;
  finishReason?: GeoModelFinishReason;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  validationStage?: GeoValidationStage;
  validationIssueCount?: number;
  validationFailureClassification?: GeoValidationFailureClassification;
  validationFieldPaths?: string[];
  validationActionTypes?: GeoValidationActionType[];
}

type RouteHandler = (request: NextRequest) => Promise<Response>;

const requestStorage = new AsyncLocalStorage<GeoRequestContext>();

export function normalizeGeoModelFinishReason(value: unknown): GeoModelFinishReason {
  return GEO_MODEL_FINISH_REASONS.includes(value as GeoModelFinishReason)
    ? (value as GeoModelFinishReason)
    : "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProviderTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

export function sanitizeModelProviderTelemetry(payload: unknown): ModelProviderTelemetry {
  try {
    const root = isRecord(payload) ? payload : {};
    const choice = Array.isArray(root.choices) && isRecord(root.choices[0])
      ? root.choices[0]
      : {};
    const message = isRecord(choice.message) ? choice.message : {};
    const content = message.content;
    const usage = isRecord(root.usage) ? root.usage : {};
    const completionDetails = isRecord(usage.completion_tokens_details)
      ? usage.completion_tokens_details
      : {};
    const nestedReasoningTokens = normalizeProviderTokenCount(
      completionDetails.reasoning_tokens,
    );
    const directReasoningTokens = normalizeProviderTokenCount(usage.reasoning_tokens);
    const promptTokens = normalizeProviderTokenCount(usage.prompt_tokens);
    const completionTokens = normalizeProviderTokenCount(usage.completion_tokens);
    const reasoningTokens = nestedReasoningTokens ?? directReasoningTokens;
    const totalTokens = normalizeProviderTokenCount(usage.total_tokens);

    return {
      contentPresent: typeof content === "string" && content.trim().length > 0,
      contentLength: typeof content === "string" ? content.length : 0,
      finishReason: normalizeGeoModelFinishReason(choice.finish_reason),
      ...(promptTokens === undefined ? {} : { promptTokens }),
      ...(completionTokens === undefined ? {} : { completionTokens }),
      ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
      ...(totalTokens === undefined ? {} : { totalTokens }),
    };
  } catch {
    return {
      contentPresent: false,
      contentLength: 0,
      finishReason: "unknown",
    };
  }
}

function sanitizeValidationPath(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return "$";

  let path = "$";
  for (const segment of value) {
    if (typeof segment === "number" && Number.isSafeInteger(segment) && segment >= 0) {
      path += `[${segment}]`;
      continue;
    }
    if (
      typeof segment === "string" &&
      /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(segment)
    ) {
      path += `.${segment}`;
      continue;
    }
    return null;
  }
  return path.length <= 240 ? path : null;
}

export function sanitizeGeoValidationTelemetry(
  input: unknown,
): GeoValidationTelemetry | null {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
    const value = input as Record<string, unknown>;
    if (
      !GEO_VALIDATION_STAGES.includes(value.stage as GeoValidationStage) ||
      typeof value.issueCount !== "number" ||
      !Number.isSafeInteger(value.issueCount) ||
      value.issueCount < 1
    ) {
      return null;
    }

    const validationFieldPaths: string[] = [];
    if (Array.isArray(value.fieldPaths)) {
      for (const candidate of value.fieldPaths) {
        const path = sanitizeValidationPath(candidate);
        if (path && !validationFieldPaths.includes(path)) validationFieldPaths.push(path);
        if (validationFieldPaths.length === 20) break;
      }
    }

    const validationActionTypes: GeoValidationActionType[] = [];
    if (Array.isArray(value.actionTypes)) {
      for (const candidate of value.actionTypes.slice(0, 10)) {
        validationActionTypes.push(
          typeof candidate !== "string"
            ? "non-string"
            : GEO_VALIDATION_ACTION_TYPES.includes(
                  candidate as (typeof GEO_VALIDATION_ACTION_TYPES)[number],
                )
              ? (candidate as (typeof GEO_VALIDATION_ACTION_TYPES)[number])
              : "unknown",
        );
      }
    }

    const validationFailureClassification =
      value.failureClassification === undefined
        ? null
        : GEO_VALIDATION_FAILURE_CLASSIFICATIONS.includes(
              value.failureClassification as GeoValidationFailureClassification,
            )
          ? (value.failureClassification as GeoValidationFailureClassification)
          : null;

    return {
      validationStage: value.stage as GeoValidationStage,
      validationIssueCount: value.issueCount,
      validationFailureClassification,
      validationFieldPaths,
      validationActionTypes,
    };
  } catch {
    return null;
  }
}

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
    ...(context.providerRequestStartAt === undefined
      ? {}
      : { providerRequestStartAt: context.providerRequestStartAt }),
    ...(context.firstByteAt === undefined ? {} : { firstByteAt: context.firstByteAt }),
    ...(context.firstTokenAt === undefined ? {} : { firstTokenAt: context.firstTokenAt }),
    ...(context.responseCompletedAt === undefined
      ? {}
      : { responseCompletedAt: context.responseCompletedAt }),
    ...(context.abortedAt === undefined ? {} : { abortedAt: context.abortedAt }),
    ...(context.streamDurationMs === undefined
      ? {}
      : { streamDurationMs: context.streamDurationMs }),
    ...(context.contentPresent === undefined ? {} : { contentPresent: context.contentPresent }),
    ...(context.contentLength === undefined ? {} : { contentLength: context.contentLength }),
    ...(context.finishReason === undefined ? {} : { finishReason: context.finishReason }),
    ...(context.promptTokens === undefined ? {} : { promptTokens: context.promptTokens }),
    ...(context.completionTokens === undefined
      ? {}
      : { completionTokens: context.completionTokens }),
    ...(context.reasoningTokens === undefined
      ? {}
      : { reasoningTokens: context.reasoningTokens }),
    ...(context.totalTokens === undefined ? {} : { totalTokens: context.totalTokens }),
    ...(context.estimatedCostUsd === undefined
      ? {}
      : { estimatedCostUsd: context.estimatedCostUsd }),
    ...(context.validationStage === undefined
      ? {}
      : {
          validationStage: context.validationStage,
          validationIssueCount: context.validationIssueCount,
          ...(context.validationFailureClassification === undefined
            ? {}
            : {
                validationFailureClassification:
                  context.validationFailureClassification,
              }),
          validationFieldPaths: context.validationFieldPaths,
          validationActionTypes: context.validationActionTypes,
        }),
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
  providerRequestStartAt?: number;
  firstByteAt?: number;
  firstTokenAt?: number;
  responseCompletedAt?: number;
  abortedAt?: number;
  streamDurationMs?: number;
  contentPresent?: boolean;
  contentLength?: number;
  finishReason?: GeoModelFinishReason;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
}): void {
  const context = requestStorage.getStore();
  if (!context) return;
  if (params.source) context.source = params.source;
  if (params.modelStatus) context.modelStatus = params.modelStatus;
  if (params.modelLatencyMs !== undefined) context.modelLatencyMs = params.modelLatencyMs;
  if (params.providerRequestStartAt !== undefined) {
    context.providerRequestStartAt = params.providerRequestStartAt;
  }
  if (params.firstByteAt !== undefined) context.firstByteAt = params.firstByteAt;
  if (params.firstTokenAt !== undefined) context.firstTokenAt = params.firstTokenAt;
  if (params.responseCompletedAt !== undefined) {
    context.responseCompletedAt = params.responseCompletedAt;
  }
  if (params.abortedAt !== undefined) context.abortedAt = params.abortedAt;
  if (params.streamDurationMs !== undefined) {
    context.streamDurationMs = params.streamDurationMs;
  }
  if (params.contentPresent !== undefined) context.contentPresent = params.contentPresent;
  if (params.contentLength !== undefined) context.contentLength = params.contentLength;
  if (params.finishReason !== undefined) context.finishReason = params.finishReason;
  if (params.promptTokens !== undefined) context.promptTokens = params.promptTokens;
  if (params.completionTokens !== undefined) context.completionTokens = params.completionTokens;
  if (params.reasoningTokens !== undefined) context.reasoningTokens = params.reasoningTokens;
  if (params.totalTokens !== undefined) context.totalTokens = params.totalTokens;
  if (params.estimatedCostUsd !== undefined) context.estimatedCostUsd = params.estimatedCostUsd;
}

export function markGeoValidationTelemetry(params: GeoValidationTelemetryInput): void {
  try {
    const context = requestStorage.getStore();
    if (!context) return;
    const telemetry = sanitizeGeoValidationTelemetry(params);
    if (!telemetry) return;
    context.validationStage = telemetry.validationStage;
    context.validationIssueCount = telemetry.validationIssueCount;
    if (telemetry.validationFailureClassification !== null) {
      context.validationFailureClassification = telemetry.validationFailureClassification;
    }
    context.validationFieldPaths = telemetry.validationFieldPaths;
    context.validationActionTypes = telemetry.validationActionTypes;
  } catch {
    // Validation telemetry must never affect the request path.
  }
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
