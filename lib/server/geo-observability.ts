import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import * as Sentry from "@sentry/nextjs";
import type { NextRequest } from "next/server";

import { createSentryErrorContext } from "../sentry-scrub.ts";

import {
  JSON_BOUNDARY_CHARACTER_TYPES,
  JSON_ERROR_CATEGORIES,
  JSON_LAST_CHARACTER_CATEGORIES,
  JSON_PARSER_ERROR_NAMES,
  SCHEMA_FAILURE_CATEGORIES,
  VALIDATION_EXPECTED_TYPES,
  VALIDATION_ISSUE_CODES,
  VALIDATION_RECEIVED_TYPES,
  type JsonBoundaryCharacterType,
  type JsonErrorCategory,
  type JsonLastCharacterCategory,
  type JsonParseFailureTelemetry,
  type JsonParserErrorName,
  type SchemaFailureCategory,
  type SchemaValidationFailureTelemetry,
  type ValidationExpectedType,
  type ValidationIssueCode,
  type ValidationReceivedType,
} from "../ai/json.ts";

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

export const GEO_REQUEST_STAGES = [
  "request_started",
  "validation_completed",
  "adapter_called",
  "provider_request_sent",
  "provider_response_received",
  "parser_started",
  "parser_completed",
  "parser_failed",
  "fallback_triggered",
  "response_returned",
] as const;

export type GeoRequestStage = (typeof GEO_REQUEST_STAGES)[number];

export const GEO_MODEL_ERROR_CATEGORIES = [
  "configuration",
  "budget",
  "provider_http",
  "provider_timeout",
  "provider_network",
  "provider_response_parse",
  "provider_invalid_output",
  "unknown",
] as const;

export type GeoModelErrorCategory = (typeof GEO_MODEL_ERROR_CATEGORIES)[number];

export function classifyGeoProviderResponseReadError(
  error: unknown,
): "provider_timeout" | "provider_response_parse" {
  return error instanceof Error && error.name === "AbortError"
    ? "provider_timeout"
    : "provider_response_parse";
}

export const GEO_PROVIDER_RESPONSE_CONTENT_TYPES = [
  "missing",
  "application/json",
  "json-compatible",
  "text/plain",
  "text/html",
  "other",
] as const;

export type GeoProviderResponseContentType =
  (typeof GEO_PROVIDER_RESPONSE_CONTENT_TYPES)[number];

export const GEO_PROVIDER_RESPONSE_JSON_PARSE_ERROR_CATEGORIES = [
  "empty_body",
  "truncated_json",
  "non_json_content",
  "invalid_json",
  "unknown",
] as const;

export type GeoProviderResponseJsonParseErrorCategory =
  (typeof GEO_PROVIDER_RESPONSE_JSON_PARSE_ERROR_CATEGORIES)[number];

export const GEO_PROVIDER_RESPONSE_PARSE_FAILURE_STAGES = [
  "body_read",
  "json_parse",
] as const;

export type GeoProviderResponseParseFailureStage =
  (typeof GEO_PROVIDER_RESPONSE_PARSE_FAILURE_STAGES)[number];

export interface GeoProviderResponseParseTelemetry {
  responseBodyPresent: boolean;
  responseBodyLength: number;
  responseContentType: GeoProviderResponseContentType;
  responseJsonParseErrorCategory: GeoProviderResponseJsonParseErrorCategory;
  responseParseFailureStage: GeoProviderResponseParseFailureStage;
}

export interface GeoProviderResponseParseTelemetryInput {
  responseBody?: unknown;
  responseContentType?: unknown;
  parseError?: unknown;
  responseParseFailureStage: unknown;
}

export interface DiagnosisSlowRequestTelemetry {
  providerFirstByteDurationMs?: number;
  responseBodyReadDurationMs?: number;
  reasoningDurationMs?: number;
  completionDurationMs?: number;
}

export interface DiagnosisSlowRequestTelemetryInput {
  providerFirstByteDurationMs?: unknown;
  responseBodyReadDurationMs?: unknown;
  serverTiming?: unknown;
}

export const GEO_FALLBACK_REASONS = [
  "model_disabled",
  "model_unavailable",
  "provider_error",
  "parse_error",
  "missing_content",
  "invalid_response",
  "unexpected_format",
] as const;

export type GeoFallbackReason = (typeof GEO_FALLBACK_REASONS)[number];

export const GEO_PROVIDER_FIELD_TYPES = [
  "missing",
  "null",
  "string",
  "number",
  "boolean",
  "array",
  "object",
] as const;

export type GeoProviderFieldType = (typeof GEO_PROVIDER_FIELD_TYPES)[number];

export interface ModelProviderTelemetry {
  messagePresent: boolean;
  contentFieldPresent: boolean;
  contentType: GeoProviderFieldType;
  contentBlank: boolean;
  reasoningContentPresent: boolean;
  reasoningContentType: GeoProviderFieldType;
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

export type GeoValidationProfile =
  | "scoring"
  | "questions"
  | "diagnostic"
  | "patch_advice"
  | "patch_content";

/** Code-owned contract for every top-level key emitted by geo_api_request. */
export const GEO_API_REQUEST_FIELDS = [
  "event",
  "requestId",
  "route",
  "method",
  "status",
  "durationMs",
  "source",
  "modelStatus",
  "rateLimitMode",
  "modelLatencyMs",
  "modelBudgetLimit",
  "modelBudgetRemaining",
  "modelBudgetRetryAfter",
  "providerRequestStartAt",
  "providerHttpStatus",
  "modelErrorCategory",
  "fallbackReason",
  "firstByteAt",
  "firstTokenAt",
  "responseCompletedAt",
  "abortedAt",
  "streamDurationMs",
  "providerFirstByteDurationMs",
  "responseBodyReadDurationMs",
  "reasoningDurationMs",
  "completionDurationMs",
  "responseBodyPresent",
  "responseBodyLength",
  "responseContentType",
  "responseJsonParseErrorCategory",
  "responseParseFailureStage",
  "messagePresent",
  "contentFieldPresent",
  "contentType",
  "contentBlank",
  "reasoningContentPresent",
  "reasoningContentType",
  "contentPresent",
  "contentLength",
  "finishReason",
  "promptTokens",
  "completionTokens",
  "reasoningTokens",
  "reasoningRatio",
  "budgetNearLimit",
  "totalTokens",
  "estimatedCostUsd",
  "evidenceStatus",
  "evidenceCount",
  "paragraphIdMatchCount",
  "validEvidenceCount",
  "invalidEvidenceCount",
  "validationStage",
  "validationIssueCount",
  "validationFailureClassification",
  "validationFieldPaths",
  "validationActionTypes",
  "validationReceivedType",
  "validationExpectedType",
  "validationIssueCode",
  "expectedType",
  "receivedType",
  "requiredFieldMissing",
  "schemaFailureCategory",
  "responseLength",
  "trimmedLength",
  "firstCharType",
  "lastCharType",
  "startsWithCodeFence",
  "endsWithCodeFence",
  "parserErrorName",
  "parserErrorPosition",
  "jsonErrorCategory",
  "parserErrorCategory",
  "lastCharacterCategory",
  "containsMultipleTopLevelValues",
  "hasLeadingNonWhitespaceText",
  "hasTrailingNonWhitespaceText",
] as const;

export type GeoApiRequestField = (typeof GEO_API_REQUEST_FIELDS)[number];

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

export const GEO_EVIDENCE_STATUSES = ["valid", "missing", "invalid"] as const;

export type GeoEvidenceStatus = (typeof GEO_EVIDENCE_STATUSES)[number];

export interface GeoEvidenceValidationTelemetryInput {
  evidenceStatus: unknown;
  evidenceCount: unknown;
  paragraphIdMatchCount: unknown;
  validEvidenceCount: unknown;
  invalidEvidenceCount: unknown;
}

export interface GeoEvidenceValidationTelemetry {
  evidenceStatus: GeoEvidenceStatus;
  evidenceCount: number;
  paragraphIdMatchCount: number;
  validEvidenceCount: number;
  invalidEvidenceCount: number;
}

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

export interface GeoValidationTelemetryInput
  extends Partial<JsonParseFailureTelemetry>,
    Partial<SchemaValidationFailureTelemetry> {
  stage: GeoValidationStage;
  profile: GeoValidationProfile;
  issueCount: number;
  failureClassification?: GeoValidationFailureClassification;
  fieldPaths?: readonly (readonly (string | number)[])[];
  actionTypes?: readonly unknown[];
  expectedType?: ValidationExpectedType;
  receivedType?: ValidationReceivedType;
  requiredFieldMissing?: boolean;
  schemaFailureCategory?: SchemaFailureCategory;
}

export interface GeoValidationTelemetry {
  validationStage: GeoValidationStage;
  validationIssueCount: number;
  validationFailureClassification: GeoValidationFailureClassification | null;
  validationFieldPaths: string[];
  validationActionTypes: GeoValidationActionType[];
  validationReceivedType?: ValidationReceivedType;
  validationExpectedType?: ValidationExpectedType;
  validationIssueCode?: ValidationIssueCode;
  expectedType?: ValidationExpectedType;
  receivedType?: ValidationReceivedType;
  requiredFieldMissing?: boolean;
  schemaFailureCategory?: SchemaFailureCategory;
  responseLength?: number;
  trimmedLength?: number;
  firstCharType?: JsonBoundaryCharacterType;
  lastCharType?: JsonBoundaryCharacterType;
  startsWithCodeFence?: boolean;
  endsWithCodeFence?: boolean;
  parserErrorName?: JsonParserErrorName;
  parserErrorPosition?: number | null;
  jsonErrorCategory?: JsonErrorCategory;
  parserErrorCategory?: JsonErrorCategory;
  lastCharacterCategory?: JsonLastCharacterCategory;
  containsMultipleTopLevelValues?: boolean;
  hasLeadingNonWhitespaceText?: boolean;
  hasTrailingNonWhitespaceText?: boolean;
}

interface GeoRequestContext {
  requestId: string;
  route: string;
  startedAt: number;
  stage: GeoRequestStage;
  source: GeoResponseSource;
  modelStatus: GeoModelStatus;
  modelLatencyMs?: number;
  modelBudgetLimit?: number;
  modelBudgetRemaining?: number;
  modelBudgetRetryAfter?: number;
  providerRequestStartAt?: number;
  providerHttpStatus?: number;
  modelErrorCategory?: GeoModelErrorCategory;
  fallbackReason?: GeoFallbackReason;
  firstByteAt?: number;
  firstTokenAt?: number;
  responseCompletedAt?: number;
  abortedAt?: number;
  streamDurationMs?: number;
  providerFirstByteDurationMs?: number;
  responseBodyReadDurationMs?: number;
  reasoningDurationMs?: number;
  completionDurationMs?: number;
  responseBodyPresent?: boolean;
  responseBodyLength?: number;
  responseContentType?: GeoProviderResponseContentType;
  responseJsonParseErrorCategory?: GeoProviderResponseJsonParseErrorCategory;
  responseParseFailureStage?: GeoProviderResponseParseFailureStage;
  messagePresent?: boolean;
  contentFieldPresent?: boolean;
  contentType?: GeoProviderFieldType;
  contentBlank?: boolean;
  reasoningContentPresent?: boolean;
  reasoningContentType?: GeoProviderFieldType;
  contentPresent?: boolean;
  contentLength?: number;
  finishReason?: GeoModelFinishReason;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  modelOutputTokenLimit?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  validationStage?: GeoValidationStage;
  validationIssueCount?: number;
  validationFailureClassification?: GeoValidationFailureClassification;
  validationFieldPaths?: string[];
  validationActionTypes?: GeoValidationActionType[];
  validationReceivedType?: ValidationReceivedType;
  validationExpectedType?: ValidationExpectedType;
  validationIssueCode?: ValidationIssueCode;
  expectedType?: ValidationExpectedType;
  receivedType?: ValidationReceivedType;
  requiredFieldMissing?: boolean;
  schemaFailureCategory?: SchemaFailureCategory;
  evidenceStatus?: GeoEvidenceStatus;
  evidenceCount?: number;
  paragraphIdMatchCount?: number;
  validEvidenceCount?: number;
  invalidEvidenceCount?: number;
  responseLength?: number;
  trimmedLength?: number;
  firstCharType?: JsonBoundaryCharacterType;
  lastCharType?: JsonBoundaryCharacterType;
  startsWithCodeFence?: boolean;
  endsWithCodeFence?: boolean;
  parserErrorName?: JsonParserErrorName;
  parserErrorPosition?: number | null;
  jsonErrorCategory?: JsonErrorCategory;
  parserErrorCategory?: JsonErrorCategory;
  lastCharacterCategory?: JsonLastCharacterCategory;
  containsMultipleTopLevelValues?: boolean;
  hasLeadingNonWhitespaceText?: boolean;
  hasTrailingNonWhitespaceText?: boolean;
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

function providerFieldType(
  value: unknown,
  fieldPresent: boolean,
): GeoProviderFieldType {
  if (!fieldPresent || value === undefined) return "missing";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (isRecord(value)) return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "missing";
}

function normalizeProviderFieldType(
  value: unknown,
): GeoProviderFieldType | undefined {
  return GEO_PROVIDER_FIELD_TYPES.includes(value as GeoProviderFieldType)
    ? (value as GeoProviderFieldType)
    : undefined;
}

function modelOutputBudgetTelemetry(context: GeoRequestContext): {
  reasoningRatio?: number;
  budgetNearLimit?: boolean;
} {
  const completionTokens = normalizeProviderTokenCount(context.completionTokens);
  const reasoningTokens = normalizeProviderTokenCount(context.reasoningTokens);
  const modelOutputTokenLimit = normalizeProviderTokenCount(
    context.modelOutputTokenLimit,
  );
  const reasoningRatio =
    completionTokens !== undefined &&
    completionTokens > 0 &&
    reasoningTokens !== undefined &&
    reasoningTokens <= completionTokens
      ? Number((reasoningTokens / completionTokens).toFixed(4))
      : undefined;
  const budgetNearLimit =
    completionTokens !== undefined &&
    modelOutputTokenLimit !== undefined &&
    modelOutputTokenLimit > 0
      ? completionTokens >= Math.ceil(modelOutputTokenLimit * 0.9)
      : undefined;

  return {
    ...(reasoningRatio === undefined ? {} : { reasoningRatio }),
    ...(budgetNearLimit === undefined ? {} : { budgetNearLimit }),
  };
}

function normalizeDiagnosticLength(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

function normalizeProviderHttpStatus(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 100 && value <= 599
    ? value
    : undefined;
}

function normalizeDurationMs(value: unknown): number | undefined {
  return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 300_000
    ? Math.round(value)
    : undefined;
}

function serverTimingDurationMs(
  value: unknown,
  metricNames: readonly string[],
): number | undefined {
  if (typeof value !== "string" || value.length > 2_048) return undefined;
  for (const metric of value.split(",").slice(0, 20)) {
    const [rawName, ...parameters] = metric.split(";");
    const name = rawName?.trim().toLowerCase();
    if (!name || !metricNames.includes(name)) continue;
    for (const parameter of parameters) {
      const match = parameter.trim().match(/^dur\s*=\s*"?(\d+(?:\.\d+)?)"?$/i);
      if (!match) continue;
      const durationMs = normalizeDurationMs(Number(match[1]));
      if (durationMs !== undefined) return durationMs;
    }
  }
  return undefined;
}

export function sanitizeDiagnosisSlowRequestTelemetry(
  input: unknown,
): DiagnosisSlowRequestTelemetry | null {
  try {
    if (!isRecord(input)) return null;
    const providerFirstByteDurationMs = normalizeDurationMs(
      input.providerFirstByteDurationMs,
    );
    const responseBodyReadDurationMs = normalizeDurationMs(
      input.responseBodyReadDurationMs,
    );
    const reasoningDurationMs = serverTimingDurationMs(input.serverTiming, [
      "reasoning",
      "reasoning-time",
      "reasoning_time",
    ]);
    const completionDurationMs = serverTimingDurationMs(input.serverTiming, [
      "completion",
      "completion-time",
      "completion_time",
    ]);
    const telemetry: DiagnosisSlowRequestTelemetry = {
      ...(providerFirstByteDurationMs === undefined
        ? {}
        : { providerFirstByteDurationMs }),
      ...(responseBodyReadDurationMs === undefined
        ? {}
        : { responseBodyReadDurationMs }),
      ...(reasoningDurationMs === undefined ? {} : { reasoningDurationMs }),
      ...(completionDurationMs === undefined
        ? {}
        : { completionDurationMs }),
    };
    return Object.keys(telemetry).length > 0 ? telemetry : null;
  } catch {
    return null;
  }
}

function normalizeProviderResponseContentType(
  value: unknown,
): GeoProviderResponseContentType {
  if (typeof value !== "string") return "missing";
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  if (!mediaType) return "missing";
  if (mediaType === "application/json") return "application/json";
  if (mediaType.includes("/") && mediaType.endsWith("+json")) {
    return "json-compatible";
  }
  if (mediaType === "text/plain") return "text/plain";
  if (mediaType === "text/html" || mediaType === "application/xhtml+xml") {
    return "text/html";
  }
  return "other";
}

function classifyProviderResponseJsonParseError(
  responseBody: unknown,
  parseError: unknown,
  failureStage: GeoProviderResponseParseFailureStage,
): GeoProviderResponseJsonParseErrorCategory {
  if (failureStage !== "json_parse" || typeof responseBody !== "string") {
    return "unknown";
  }

  const trimmedBody = responseBody.trim();
  if (trimmedBody.length === 0) return "empty_body";

  const firstCharacter = trimmedBody[0];
  if (firstCharacter !== "{" && firstCharacter !== "[") {
    return "non_json_content";
  }

  const errorMessage = parseError instanceof Error
    ? parseError.message.toLowerCase()
    : "";
  const expectedLastCharacter = firstCharacter === "{" ? "}" : "]";
  if (
    /unexpected end|end of json|unterminated/.test(errorMessage) ||
    trimmedBody.at(-1) !== expectedLastCharacter
  ) {
    return "truncated_json";
  }

  return parseError instanceof SyntaxError ? "invalid_json" : "unknown";
}

export function sanitizeGeoProviderResponseParseTelemetry(
  input: unknown,
): GeoProviderResponseParseTelemetry | null {
  try {
    if (!isRecord(input)) return null;
    if (
      !GEO_PROVIDER_RESPONSE_PARSE_FAILURE_STAGES.includes(
        input.responseParseFailureStage as GeoProviderResponseParseFailureStage,
      )
    ) {
      return null;
    }

    const responseParseFailureStage =
      input.responseParseFailureStage as GeoProviderResponseParseFailureStage;
    const responseBody =
      typeof input.responseBody === "string" ? input.responseBody : undefined;

    return {
      responseBodyPresent:
        responseBody !== undefined && responseBody.length > 0,
      responseBodyLength: responseBody?.length ?? 0,
      responseContentType: normalizeProviderResponseContentType(
        input.responseContentType,
      ),
      responseJsonParseErrorCategory: classifyProviderResponseJsonParseError(
        responseBody,
        input.parseError,
        responseParseFailureStage,
      ),
      responseParseFailureStage,
    };
  } catch {
    return null;
  }
}

export function geoFallbackReasonForModelError(
  value: unknown,
): GeoFallbackReason {
  switch (value) {
    case "configuration":
    case "budget":
      return "model_unavailable";
    case "provider_http":
    case "provider_timeout":
    case "provider_network":
      return "provider_error";
    case "provider_response_parse":
      return "parse_error";
    case "provider_invalid_output":
      return "missing_content";
    default:
      return "unexpected_format";
  }
}

export function sanitizeModelProviderTelemetry(payload: unknown): ModelProviderTelemetry {
  try {
    const root = isRecord(payload) ? payload : {};
    const choice = Array.isArray(root.choices) && isRecord(root.choices[0])
      ? root.choices[0]
      : {};
    const messageValue = choice.message;
    const messagePresent = isRecord(messageValue);
    const message: Record<string, unknown> = messagePresent ? messageValue : {};
    const contentFieldPresent = Object.hasOwn(message, "content");
    const content = message.content;
    const reasoningContentPresent = Object.hasOwn(message, "reasoning_content");
    const reasoningContent = message.reasoning_content;
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

    const telemetry: ModelProviderTelemetry = {
      messagePresent,
      contentFieldPresent,
      contentType: providerFieldType(content, contentFieldPresent),
      contentBlank: typeof content === "string" && content.trim().length === 0,
      reasoningContentPresent,
      reasoningContentType: providerFieldType(
        reasoningContent,
        reasoningContentPresent,
      ),
      contentPresent: typeof content === "string" && content.trim().length > 0,
      contentLength: typeof content === "string" ? content.length : 0,
      finishReason: normalizeGeoModelFinishReason(choice.finish_reason),
      ...(promptTokens === undefined ? {} : { promptTokens }),
      ...(completionTokens === undefined ? {} : { completionTokens }),
      ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
      ...(totalTokens === undefined ? {} : { totalTokens }),
    };
    markDiagnosisProviderStructureTelemetry(telemetry);
    return telemetry;
  } catch {
    const telemetry: ModelProviderTelemetry = {
      messagePresent: false,
      contentFieldPresent: false,
      contentType: "missing",
      contentBlank: false,
      reasoningContentPresent: false,
      reasoningContentType: "missing",
      contentPresent: false,
      contentLength: 0,
      finishReason: "unknown",
    };
    markDiagnosisProviderStructureTelemetry(telemetry);
    return telemetry;
  }
}

function markDiagnosisProviderStructureTelemetry(
  telemetry: ModelProviderTelemetry,
): void {
  const context = requestStorage.getStore();
  if (context?.route !== "/api/qa-diagnostic") return;
  markGeoRequestOutcome({
    messagePresent: telemetry.messagePresent,
    contentFieldPresent: telemetry.contentFieldPresent,
    contentType: telemetry.contentType,
    contentBlank: telemetry.contentBlank,
    reasoningContentPresent: telemetry.reasoningContentPresent,
    reasoningContentType: telemetry.reasoningContentType,
  });
}

export function markScoringProviderResponseParseTelemetry(
  input: GeoProviderResponseParseTelemetryInput,
): void {
  try {
    const context = requestStorage.getStore();
    if (context?.route !== "/api/evaluate-scoring") return;
    const telemetry = sanitizeGeoProviderResponseParseTelemetry(input);
    if (!telemetry) return;
    context.responseBodyPresent = telemetry.responseBodyPresent;
    context.responseBodyLength = telemetry.responseBodyLength;
    context.responseContentType = telemetry.responseContentType;
    context.responseJsonParseErrorCategory =
      telemetry.responseJsonParseErrorCategory;
    context.responseParseFailureStage = telemetry.responseParseFailureStage;
  } catch {
    // Provider response telemetry must never affect the request path.
  }
}

export function markDiagnosisSlowRequestTelemetry(
  input: DiagnosisSlowRequestTelemetryInput,
): void {
  try {
    const context = requestStorage.getStore();
    if (context?.route !== "/api/qa-diagnostic") return;
    const telemetry = sanitizeDiagnosisSlowRequestTelemetry(input);
    if (!telemetry) return;
    if (telemetry.providerFirstByteDurationMs !== undefined) {
      context.providerFirstByteDurationMs =
        telemetry.providerFirstByteDurationMs;
    }
    if (telemetry.responseBodyReadDurationMs !== undefined) {
      context.responseBodyReadDurationMs = telemetry.responseBodyReadDurationMs;
    }
    if (telemetry.reasoningDurationMs !== undefined) {
      context.reasoningDurationMs = telemetry.reasoningDurationMs;
    }
    if (telemetry.completionDurationMs !== undefined) {
      context.completionDurationMs = telemetry.completionDurationMs;
    }
  } catch {
    // Slow-request telemetry must never affect the request path.
  }
}

function isSafeValidationIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isValidationPathAllowed(
  profile: GeoValidationProfile,
  path: readonly unknown[],
): boolean {
  if (path.length === 0) return true;
  const [first, second, third] = path;

  switch (profile) {
    case "scoring":
      return (
        (path.length === 1 && first === "totalScore") ||
        (path.length === 1 && first === "dimensions") ||
        (path.length === 2 && first === "dimensions" &&
          ["questionCoverage", "factCompleteness", "structureClarity", "freshness"].includes(
            second as string,
          )) ||
        (path.length === 3 && first === "dimensions" &&
          ["questionCoverage", "factCompleteness", "structureClarity", "freshness"].includes(
            second as string,
          ) &&
          ["score", "max", "reason"].includes(third as string))
      );
    case "questions":
      return (
        (path.length === 1 && first === "questions") ||
        (path.length === 2 && first === "questions" && isSafeValidationIndex(second))
      );
    case "diagnostic":
      return (
        (path.length === 1 &&
          [
            "question",
            "answerability",
            "riskLevel",
            "evidence",
            "missingInfo",
            "recommendation",
          ].includes(first as string)) ||
        (path.length === 2 && first === "evidence" && isSafeValidationIndex(second)) ||
        (path.length === 2 && first === "missingInfo" && isSafeValidationIndex(second)) ||
        (path.length === 3 && first === "evidence" && isSafeValidationIndex(second) &&
          ["paragraphId", "quote"].includes(third as string))
      );
    case "patch_advice":
      return (
        (path.length === 1 && first === "actions") ||
        (path.length === 2 && first === "actions" && isSafeValidationIndex(second)) ||
        (path.length === 3 && first === "actions" && isSafeValidationIndex(second) &&
          third === "type") ||
        (path.length === 3 && first === "actions" && isSafeValidationIndex(second) &&
          ["field", "reason", "relatedQuestion", "title", "instruction", "targetParagraphIds"].includes(
            third as string,
          )) ||
        (path.length === 4 && first === "actions" && isSafeValidationIndex(second) &&
          third === "targetParagraphIds" && isSafeValidationIndex(path[3]))
      );
    case "patch_content":
      return (
        (path.length === 1 && first === "actions") ||
        (path.length === 2 && first === "actions" && isSafeValidationIndex(second)) ||
        (path.length === 3 && first === "actions" && isSafeValidationIndex(second) &&
          ["type", "question", "answer", "label", "value", "evidence"].includes(
            third as string,
          )) ||
        (path.length === 4 && first === "actions" && isSafeValidationIndex(second) &&
          third === "evidence" && ["paragraphId", "quote"].includes(path[3] as string))
      );
  }
}

function sanitizeValidationPath(
  profile: GeoValidationProfile,
  value: unknown,
): string | null {
  if (!Array.isArray(value) || !isValidationPathAllowed(profile, value)) return null;
  if (value.length === 0) return "$";

  let path = "$";
  for (const segment of value) {
    if (isSafeValidationIndex(segment)) {
      path += `[${segment}]`;
    } else if (typeof segment === "string") {
      path += `.${segment}`;
    } else {
      return null;
    }
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
      ![
        "scoring",
        "questions",
        "diagnostic",
        "patch_advice",
        "patch_content",
      ].includes(value.profile as GeoValidationProfile) ||
      typeof value.issueCount !== "number" ||
      !Number.isSafeInteger(value.issueCount) ||
      value.issueCount < 1
    ) {
      return null;
    }

    const validationFieldPaths: string[] = [];
    if (Array.isArray(value.fieldPaths)) {
      for (const candidate of value.fieldPaths) {
        const path = sanitizeValidationPath(value.profile as GeoValidationProfile, candidate);
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
    const responseLength = normalizeDiagnosticLength(value.responseLength);
    const trimmedLength = normalizeDiagnosticLength(value.trimmedLength);
    const parserErrorPosition =
      value.parserErrorPosition === null
        ? null
        : normalizeDiagnosticLength(value.parserErrorPosition);
    const firstCharType = JSON_BOUNDARY_CHARACTER_TYPES.includes(
      value.firstCharType as JsonBoundaryCharacterType,
    )
      ? (value.firstCharType as JsonBoundaryCharacterType)
      : undefined;
    const lastCharType = JSON_BOUNDARY_CHARACTER_TYPES.includes(
      value.lastCharType as JsonBoundaryCharacterType,
    )
      ? (value.lastCharType as JsonBoundaryCharacterType)
      : undefined;
    const parserErrorName = JSON_PARSER_ERROR_NAMES.includes(
      value.parserErrorName as JsonParserErrorName,
    )
      ? (value.parserErrorName as JsonParserErrorName)
      : undefined;
    const jsonErrorCategory = JSON_ERROR_CATEGORIES.includes(
      value.jsonErrorCategory as JsonErrorCategory,
    )
      ? (value.jsonErrorCategory as JsonErrorCategory)
      : undefined;
    const parserErrorCategory = JSON_ERROR_CATEGORIES.includes(
      value.parserErrorCategory as JsonErrorCategory,
    )
      ? (value.parserErrorCategory as JsonErrorCategory)
      : undefined;
    const lastCharacterCategory = JSON_LAST_CHARACTER_CATEGORIES.includes(
      value.lastCharacterCategory as JsonLastCharacterCategory,
    )
      ? (value.lastCharacterCategory as JsonLastCharacterCategory)
      : undefined;
    const validationReceivedType = VALIDATION_RECEIVED_TYPES.includes(
      value.validationReceivedType as ValidationReceivedType,
    )
      ? (value.validationReceivedType as ValidationReceivedType)
      : undefined;
    const validationExpectedType = VALIDATION_EXPECTED_TYPES.includes(
      value.validationExpectedType as ValidationExpectedType,
    )
      ? (value.validationExpectedType as ValidationExpectedType)
      : undefined;
    const validationIssueCode = VALIDATION_ISSUE_CODES.includes(
      value.validationIssueCode as ValidationIssueCode,
    )
      ? (value.validationIssueCode as ValidationIssueCode)
      : undefined;
    const receivedType = VALIDATION_RECEIVED_TYPES.includes(
      value.receivedType as ValidationReceivedType,
    )
      ? (value.receivedType as ValidationReceivedType)
      : undefined;
    const expectedType = VALIDATION_EXPECTED_TYPES.includes(
      value.expectedType as ValidationExpectedType,
    )
      ? (value.expectedType as ValidationExpectedType)
      : undefined;
    const requiredFieldMissing =
      typeof value.requiredFieldMissing === "boolean"
        ? value.requiredFieldMissing
        : undefined;
    const schemaFailureCategory = SCHEMA_FAILURE_CATEGORIES.includes(
      value.schemaFailureCategory as SchemaFailureCategory,
    )
      ? (value.schemaFailureCategory as SchemaFailureCategory)
      : undefined;
    const hasJsonParseFailureTelemetry =
      value.stage === "json_parse" &&
      validationFailureClassification === "json_parse_failed";
    const hasSchemaValidationFailureTelemetry =
      value.stage === "schema_validation" &&
      (validationFailureClassification === "required_field_missing" ||
        validationFailureClassification === "schema_validation_failed");
    const hasDetailedSchemaValidationFailureTelemetry =
      hasSchemaValidationFailureTelemetry &&
      validationReceivedType !== undefined &&
      validationExpectedType !== undefined &&
      validationIssueCode !== undefined &&
      receivedType === validationReceivedType &&
      expectedType === validationExpectedType &&
      requiredFieldMissing !== undefined &&
      schemaFailureCategory !== undefined &&
      requiredFieldMissing ===
        (schemaFailureCategory === "required_field_missing") &&
      requiredFieldMissing ===
        (validationFailureClassification === "required_field_missing") &&
      (!requiredFieldMissing || receivedType === "missing");
    return {
      validationStage: value.stage as GeoValidationStage,
      validationIssueCount: value.issueCount,
      validationFailureClassification,
      validationFieldPaths,
      validationActionTypes,
      ...(!hasSchemaValidationFailureTelemetry || validationReceivedType === undefined
        ? {}
        : { validationReceivedType }),
      ...(!hasSchemaValidationFailureTelemetry || validationExpectedType === undefined
        ? {}
        : { validationExpectedType }),
      ...(!hasSchemaValidationFailureTelemetry || validationIssueCode === undefined
        ? {}
        : { validationIssueCode }),
      ...(!hasDetailedSchemaValidationFailureTelemetry
        ? {}
        : {
            expectedType,
            receivedType,
            requiredFieldMissing,
            schemaFailureCategory,
          }),
      ...(!hasJsonParseFailureTelemetry || responseLength === undefined
        ? {}
        : { responseLength }),
      ...(!hasJsonParseFailureTelemetry || trimmedLength === undefined
        ? {}
        : { trimmedLength }),
      ...(!hasJsonParseFailureTelemetry || firstCharType === undefined
        ? {}
        : { firstCharType }),
      ...(!hasJsonParseFailureTelemetry || lastCharType === undefined
        ? {}
        : { lastCharType }),
      ...(!hasJsonParseFailureTelemetry ||
      typeof value.startsWithCodeFence !== "boolean"
        ? {}
        : { startsWithCodeFence: value.startsWithCodeFence }),
      ...(!hasJsonParseFailureTelemetry ||
      typeof value.endsWithCodeFence !== "boolean"
        ? {}
        : { endsWithCodeFence: value.endsWithCodeFence }),
      ...(!hasJsonParseFailureTelemetry || parserErrorName === undefined
        ? {}
        : { parserErrorName }),
      ...(!hasJsonParseFailureTelemetry || parserErrorPosition === undefined
        ? {}
        : { parserErrorPosition }),
      ...(!hasJsonParseFailureTelemetry || jsonErrorCategory === undefined
        ? {}
        : { jsonErrorCategory }),
      ...(!hasJsonParseFailureTelemetry || parserErrorCategory === undefined
        ? {}
        : { parserErrorCategory }),
      ...(!hasJsonParseFailureTelemetry || lastCharacterCategory === undefined
        ? {}
        : { lastCharacterCategory }),
      ...(!hasJsonParseFailureTelemetry ||
      typeof value.containsMultipleTopLevelValues !== "boolean"
        ? {}
        : {
            containsMultipleTopLevelValues:
              value.containsMultipleTopLevelValues,
          }),
      ...(!hasJsonParseFailureTelemetry ||
      typeof value.hasLeadingNonWhitespaceText !== "boolean"
        ? {}
        : {
            hasLeadingNonWhitespaceText:
              value.hasLeadingNonWhitespaceText,
          }),
      ...(!hasJsonParseFailureTelemetry ||
      typeof value.hasTrailingNonWhitespaceText !== "boolean"
        ? {}
        : {
            hasTrailingNonWhitespaceText:
              value.hasTrailingNonWhitespaceText,
          }),
    };
  } catch {
    return null;
  }
}

export function sanitizeGeoEvidenceValidationTelemetry(
  input: unknown,
): GeoEvidenceValidationTelemetry | null {
  try {
    if (!isRecord(input)) return null;
    const evidenceStatus = GEO_EVIDENCE_STATUSES.includes(
      input.evidenceStatus as GeoEvidenceStatus,
    )
      ? (input.evidenceStatus as GeoEvidenceStatus)
      : undefined;
    const evidenceCount = normalizeDiagnosticLength(input.evidenceCount);
    const paragraphIdMatchCount = normalizeDiagnosticLength(input.paragraphIdMatchCount);
    const validEvidenceCount = normalizeDiagnosticLength(input.validEvidenceCount);
    const invalidEvidenceCount = normalizeDiagnosticLength(input.invalidEvidenceCount);
    if (
      evidenceStatus === undefined ||
      evidenceCount === undefined ||
      paragraphIdMatchCount === undefined ||
      validEvidenceCount === undefined ||
      invalidEvidenceCount === undefined ||
      paragraphIdMatchCount > evidenceCount ||
      validEvidenceCount > paragraphIdMatchCount ||
      invalidEvidenceCount !== evidenceCount - validEvidenceCount ||
      evidenceStatus !== (
        invalidEvidenceCount > 0
          ? "invalid"
          : validEvidenceCount > 0
            ? "valid"
            : "missing"
      )
    ) {
      return null;
    }

    return {
      evidenceStatus,
      evidenceCount,
      paragraphIdMatchCount,
      validEvidenceCount,
      invalidEvidenceCount,
    };
  } catch {
    return null;
  }
}

function writeRequestLog(context: GeoRequestContext, request: NextRequest, response: Response): void {
  const outputBudgetTelemetry = modelOutputBudgetTelemetry(context);
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
    ...(context.modelBudgetLimit === undefined
      ? {}
      : { modelBudgetLimit: context.modelBudgetLimit }),
    ...(context.modelBudgetRemaining === undefined
      ? {}
      : { modelBudgetRemaining: context.modelBudgetRemaining }),
    ...(context.modelBudgetRetryAfter === undefined
      ? {}
      : { modelBudgetRetryAfter: context.modelBudgetRetryAfter }),
    ...(context.providerRequestStartAt === undefined
      ? {}
      : { providerRequestStartAt: context.providerRequestStartAt }),
    ...(context.providerHttpStatus === undefined
      ? {}
      : { providerHttpStatus: context.providerHttpStatus }),
    ...(context.modelErrorCategory === undefined
      ? {}
      : { modelErrorCategory: context.modelErrorCategory }),
    ...(context.fallbackReason === undefined
      ? {}
      : { fallbackReason: context.fallbackReason }),
    ...(context.firstByteAt === undefined ? {} : { firstByteAt: context.firstByteAt }),
    ...(context.firstTokenAt === undefined ? {} : { firstTokenAt: context.firstTokenAt }),
    ...(context.responseCompletedAt === undefined
      ? {}
      : { responseCompletedAt: context.responseCompletedAt }),
    ...(context.abortedAt === undefined ? {} : { abortedAt: context.abortedAt }),
    ...(context.streamDurationMs === undefined
      ? {}
      : { streamDurationMs: context.streamDurationMs }),
    ...(context.providerFirstByteDurationMs === undefined
      ? {}
      : { providerFirstByteDurationMs: context.providerFirstByteDurationMs }),
    ...(context.responseBodyReadDurationMs === undefined
      ? {}
      : { responseBodyReadDurationMs: context.responseBodyReadDurationMs }),
    ...(context.reasoningDurationMs === undefined
      ? {}
      : { reasoningDurationMs: context.reasoningDurationMs }),
    ...(context.completionDurationMs === undefined
      ? {}
      : { completionDurationMs: context.completionDurationMs }),
    ...(context.responseBodyPresent === undefined
      ? {}
      : { responseBodyPresent: context.responseBodyPresent }),
    ...(context.responseBodyLength === undefined
      ? {}
      : { responseBodyLength: context.responseBodyLength }),
    ...(context.responseContentType === undefined
      ? {}
      : { responseContentType: context.responseContentType }),
    ...(context.responseJsonParseErrorCategory === undefined
      ? {}
      : {
          responseJsonParseErrorCategory:
            context.responseJsonParseErrorCategory,
        }),
    ...(context.responseParseFailureStage === undefined
      ? {}
      : { responseParseFailureStage: context.responseParseFailureStage }),
    ...(context.messagePresent === undefined
      ? {}
      : { messagePresent: context.messagePresent }),
    ...(context.contentFieldPresent === undefined
      ? {}
      : { contentFieldPresent: context.contentFieldPresent }),
    ...(context.contentType === undefined ? {} : { contentType: context.contentType }),
    ...(context.contentBlank === undefined ? {} : { contentBlank: context.contentBlank }),
    ...(context.reasoningContentPresent === undefined
      ? {}
      : { reasoningContentPresent: context.reasoningContentPresent }),
    ...(context.reasoningContentType === undefined
      ? {}
      : { reasoningContentType: context.reasoningContentType }),
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
    ...outputBudgetTelemetry,
    ...(context.totalTokens === undefined ? {} : { totalTokens: context.totalTokens }),
    ...(context.estimatedCostUsd === undefined
      ? {}
      : { estimatedCostUsd: context.estimatedCostUsd }),
    ...(context.evidenceStatus === undefined
      ? {}
      : { evidenceStatus: context.evidenceStatus }),
    ...(context.evidenceCount === undefined
      ? {}
      : { evidenceCount: context.evidenceCount }),
    ...(context.paragraphIdMatchCount === undefined
      ? {}
      : { paragraphIdMatchCount: context.paragraphIdMatchCount }),
    ...(context.validEvidenceCount === undefined
      ? {}
      : { validEvidenceCount: context.validEvidenceCount }),
    ...(context.invalidEvidenceCount === undefined
      ? {}
      : { invalidEvidenceCount: context.invalidEvidenceCount }),
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
          ...(context.validationReceivedType === undefined
            ? {}
            : { validationReceivedType: context.validationReceivedType }),
          ...(context.validationExpectedType === undefined
            ? {}
            : { validationExpectedType: context.validationExpectedType }),
          ...(context.validationIssueCode === undefined
            ? {}
            : { validationIssueCode: context.validationIssueCode }),
          ...(context.expectedType === undefined
            ? {}
            : { expectedType: context.expectedType }),
          ...(context.receivedType === undefined
            ? {}
            : { receivedType: context.receivedType }),
          ...(context.requiredFieldMissing === undefined
            ? {}
            : { requiredFieldMissing: context.requiredFieldMissing }),
          ...(context.schemaFailureCategory === undefined
            ? {}
            : { schemaFailureCategory: context.schemaFailureCategory }),
          ...(context.responseLength === undefined
            ? {}
            : { responseLength: context.responseLength }),
          ...(context.trimmedLength === undefined
            ? {}
            : { trimmedLength: context.trimmedLength }),
          ...(context.firstCharType === undefined
            ? {}
            : { firstCharType: context.firstCharType }),
          ...(context.lastCharType === undefined
            ? {}
            : { lastCharType: context.lastCharType }),
          ...(context.startsWithCodeFence === undefined
            ? {}
            : { startsWithCodeFence: context.startsWithCodeFence }),
          ...(context.endsWithCodeFence === undefined
            ? {}
            : { endsWithCodeFence: context.endsWithCodeFence }),
          ...(context.parserErrorName === undefined
            ? {}
            : { parserErrorName: context.parserErrorName }),
          ...(context.parserErrorPosition === undefined
            ? {}
            : { parserErrorPosition: context.parserErrorPosition }),
          ...(context.jsonErrorCategory === undefined
            ? {}
            : { jsonErrorCategory: context.jsonErrorCategory }),
          ...(context.parserErrorCategory === undefined
            ? {}
            : { parserErrorCategory: context.parserErrorCategory }),
          ...(context.lastCharacterCategory === undefined
            ? {}
            : { lastCharacterCategory: context.lastCharacterCategory }),
          ...(context.containsMultipleTopLevelValues === undefined
            ? {}
            : {
                containsMultipleTopLevelValues:
                  context.containsMultipleTopLevelValues,
              }),
          ...(context.hasLeadingNonWhitespaceText === undefined
            ? {}
            : {
                hasLeadingNonWhitespaceText:
                  context.hasLeadingNonWhitespaceText,
              }),
          ...(context.hasTrailingNonWhitespaceText === undefined
            ? {}
            : {
                hasTrailingNonWhitespaceText:
                  context.hasTrailingNonWhitespaceText,
              }),
        }),
  };
  const serialized = JSON.stringify(
    Object.fromEntries(
      Object.entries(event).filter(([key]) =>
        (GEO_API_REQUEST_FIELDS as readonly string[]).includes(key),
      ),
    ),
  );

  if (response.status >= 500) {
    console.error(serialized);
  } else if (response.status >= 400) {
    console.warn(serialized);
  } else {
    console.info(serialized);
  }
}

export function markGeoRequestStage(stage: GeoRequestStage): void {
  try {
    const context = requestStorage.getStore();
    if (!context || !GEO_REQUEST_STAGES.includes(stage)) return;
    context.stage = stage;
    console.info(
      JSON.stringify({
        event: "geo_api_stage",
        requestId: context.requestId,
        route: context.route,
        stage,
        timestamp: Date.now(),
        latency: Math.max(0, Math.round(performance.now() - context.startedAt)),
      }),
    );
  } catch {
    return;
  }
}

export function markGeoRequestOutcome(params: {
  source?: GeoResponseSource;
  modelStatus?: GeoModelStatus;
  modelLatencyMs?: number;
  modelBudgetLimit?: number;
  modelBudgetRemaining?: number;
  modelBudgetRetryAfter?: number;
  providerRequestStartAt?: number;
  providerHttpStatus?: number;
  modelErrorCategory?: GeoModelErrorCategory;
  firstByteAt?: number;
  firstTokenAt?: number;
  responseCompletedAt?: number;
  abortedAt?: number;
  streamDurationMs?: number;
  messagePresent?: boolean;
  contentFieldPresent?: boolean;
  contentType?: GeoProviderFieldType;
  contentBlank?: boolean;
  reasoningContentPresent?: boolean;
  reasoningContentType?: GeoProviderFieldType;
  contentPresent?: boolean;
  contentLength?: number;
  finishReason?: GeoModelFinishReason;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  modelOutputTokenLimit?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
}): void {
  const context = requestStorage.getStore();
  if (!context) return;
  if (params.source) context.source = params.source;
  if (params.modelStatus) context.modelStatus = params.modelStatus;
  if (params.modelLatencyMs !== undefined) context.modelLatencyMs = params.modelLatencyMs;
  const modelBudgetLimit = normalizeProviderTokenCount(params.modelBudgetLimit);
  if (modelBudgetLimit !== undefined) context.modelBudgetLimit = modelBudgetLimit;
  const modelBudgetRemaining = normalizeProviderTokenCount(
    params.modelBudgetRemaining,
  );
  if (modelBudgetRemaining !== undefined) {
    context.modelBudgetRemaining = modelBudgetRemaining;
  }
  const modelBudgetRetryAfter = normalizeProviderTokenCount(
    params.modelBudgetRetryAfter,
  );
  if (modelBudgetRetryAfter !== undefined) {
    context.modelBudgetRetryAfter = modelBudgetRetryAfter;
  }
  if (params.providerRequestStartAt !== undefined) {
    context.providerRequestStartAt = params.providerRequestStartAt;
  }
  const providerHttpStatus = normalizeProviderHttpStatus(params.providerHttpStatus);
  if (providerHttpStatus !== undefined) context.providerHttpStatus = providerHttpStatus;
  if (
    params.modelErrorCategory !== undefined &&
    GEO_MODEL_ERROR_CATEGORIES.includes(params.modelErrorCategory)
  ) {
    context.modelErrorCategory = params.modelErrorCategory;
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
  if (typeof params.messagePresent === "boolean") {
    context.messagePresent = params.messagePresent;
  }
  if (typeof params.contentFieldPresent === "boolean") {
    context.contentFieldPresent = params.contentFieldPresent;
  }
  const contentType = normalizeProviderFieldType(params.contentType);
  if (contentType !== undefined) context.contentType = contentType;
  if (typeof params.contentBlank === "boolean") {
    context.contentBlank = params.contentBlank;
  }
  if (typeof params.reasoningContentPresent === "boolean") {
    context.reasoningContentPresent = params.reasoningContentPresent;
  }
  const reasoningContentType = normalizeProviderFieldType(
    params.reasoningContentType,
  );
  if (reasoningContentType !== undefined) {
    context.reasoningContentType = reasoningContentType;
  }
  if (params.contentPresent !== undefined) context.contentPresent = params.contentPresent;
  if (params.contentLength !== undefined) context.contentLength = params.contentLength;
  if (params.finishReason !== undefined) context.finishReason = params.finishReason;
  if (params.promptTokens !== undefined) context.promptTokens = params.promptTokens;
  if (params.completionTokens !== undefined) context.completionTokens = params.completionTokens;
  if (params.reasoningTokens !== undefined) context.reasoningTokens = params.reasoningTokens;
  const modelOutputTokenLimit = normalizeProviderTokenCount(
    params.modelOutputTokenLimit,
  );
  if (modelOutputTokenLimit !== undefined && modelOutputTokenLimit > 0) {
    context.modelOutputTokenLimit = modelOutputTokenLimit;
  }
  if (params.totalTokens !== undefined) context.totalTokens = params.totalTokens;
  if (params.estimatedCostUsd !== undefined) context.estimatedCostUsd = params.estimatedCostUsd;
}

export function markGeoParserFailureTelemetry(
  modelErrorCategory?: GeoModelErrorCategory,
): void {
  try {
    const context = requestStorage.getStore();
    if (!context) return;
    if (
      context.stage === "provider_response_received" &&
      (modelErrorCategory === "provider_response_parse" ||
        modelErrorCategory === "provider_invalid_output")
    ) {
      markGeoRequestStage("parser_started");
    }
    if (context.stage === "parser_started") {
      markGeoRequestStage("parser_failed");
    }
  } catch {
    // Parser telemetry must never affect the request path.
  }
}

export function markGeoFallbackTelemetry(reason: GeoFallbackReason): void {
  try {
    const context = requestStorage.getStore();
    if (!context || !GEO_FALLBACK_REASONS.includes(reason)) return;
    context.fallbackReason = reason;
    markGeoRequestStage("fallback_triggered");
  } catch {
    // Fallback telemetry must never affect the request path.
  }
}

export function markGeoEvidenceValidationTelemetry(
  input: GeoEvidenceValidationTelemetryInput,
): void {
  try {
    const context = requestStorage.getStore();
    if (context?.route !== "/api/qa-diagnostic") return;
    const telemetry = sanitizeGeoEvidenceValidationTelemetry(input);
    if (!telemetry) return;
    context.evidenceStatus = telemetry.evidenceStatus;
    context.evidenceCount = telemetry.evidenceCount;
    context.paragraphIdMatchCount = telemetry.paragraphIdMatchCount;
    context.validEvidenceCount = telemetry.validEvidenceCount;
    context.invalidEvidenceCount = telemetry.invalidEvidenceCount;
  } catch {
    // Evidence telemetry must never affect the request path.
  }
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
    if (telemetry.validationReceivedType !== undefined) {
      context.validationReceivedType = telemetry.validationReceivedType;
    }
    if (telemetry.validationExpectedType !== undefined) {
      context.validationExpectedType = telemetry.validationExpectedType;
    }
    if (telemetry.validationIssueCode !== undefined) {
      context.validationIssueCode = telemetry.validationIssueCode;
    }
    if (telemetry.expectedType !== undefined) {
      context.expectedType = telemetry.expectedType;
    }
    if (telemetry.receivedType !== undefined) {
      context.receivedType = telemetry.receivedType;
    }
    if (telemetry.requiredFieldMissing !== undefined) {
      context.requiredFieldMissing = telemetry.requiredFieldMissing;
    }
    if (telemetry.schemaFailureCategory !== undefined) {
      context.schemaFailureCategory = telemetry.schemaFailureCategory;
    }
    if (telemetry.responseLength !== undefined) {
      context.responseLength = telemetry.responseLength;
    }
    if (telemetry.trimmedLength !== undefined) {
      context.trimmedLength = telemetry.trimmedLength;
    }
    if (telemetry.firstCharType !== undefined) {
      context.firstCharType = telemetry.firstCharType;
    }
    if (telemetry.lastCharType !== undefined) {
      context.lastCharType = telemetry.lastCharType;
    }
    if (telemetry.startsWithCodeFence !== undefined) {
      context.startsWithCodeFence = telemetry.startsWithCodeFence;
    }
    if (telemetry.endsWithCodeFence !== undefined) {
      context.endsWithCodeFence = telemetry.endsWithCodeFence;
    }
    if (telemetry.parserErrorName !== undefined) {
      context.parserErrorName = telemetry.parserErrorName;
    }
    if (telemetry.parserErrorPosition !== undefined) {
      context.parserErrorPosition = telemetry.parserErrorPosition;
    }
    if (telemetry.jsonErrorCategory !== undefined) {
      context.jsonErrorCategory = telemetry.jsonErrorCategory;
    }
    if (telemetry.parserErrorCategory !== undefined) {
      context.parserErrorCategory = telemetry.parserErrorCategory;
    }
    if (telemetry.lastCharacterCategory !== undefined) {
      context.lastCharacterCategory = telemetry.lastCharacterCategory;
    }
    if (telemetry.containsMultipleTopLevelValues !== undefined) {
      context.containsMultipleTopLevelValues =
        telemetry.containsMultipleTopLevelValues;
    }
    if (telemetry.hasLeadingNonWhitespaceText !== undefined) {
      context.hasLeadingNonWhitespaceText =
        telemetry.hasLeadingNonWhitespaceText;
    }
    if (telemetry.hasTrailingNonWhitespaceText !== undefined) {
      context.hasTrailingNonWhitespaceText =
        telemetry.hasTrailingNonWhitespaceText;
    }
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
      stage: "request_started",
      source: "none",
      modelStatus: "not-requested",
    };

    return requestStorage.run(context, async () => {
      markGeoRequestStage("request_started");
      let response: Response;
      try {
        response = await handler(request);
      } catch (error) {
        response = Response.json(
          { error: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试。" },
          { status: 500 },
        );
        context.modelStatus = context.modelStatus === "requested" ? "failed" : context.modelStatus;
        const sentryContext = createSentryErrorContext({
          requestId: context.requestId,
          route: context.route,
          stage: context.stage,
          latency: performance.now() - context.startedAt,
          errorCategory: context.modelErrorCategory ?? "application",
        });
        Sentry.captureException(error, {
          tags: {
            route: sentryContext.route,
            stage: sentryContext.stage,
            errorCategory: sentryContext.errorCategory,
          },
          extra: sentryContext,
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
      markGeoRequestStage("response_returned");
      writeRequestLog(context, request, response);
      return response;
    });
  };
}
