import { createHash, randomUUID } from "node:crypto";
import { readFile, mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import {
  JSON_BOUNDARY_CHARACTER_TYPES,
  JSON_ERROR_CATEGORIES,
  JSON_LAST_CHARACTER_CATEGORIES,
  JSON_PARSER_ERROR_NAMES,
  VALIDATION_EXPECTED_TYPES,
  VALIDATION_ISSUE_CODES,
  VALIDATION_RECEIVED_TYPES,
  type JsonBoundaryCharacterType,
  type JsonErrorCategory,
  type JsonLastCharacterCategory,
  type JsonParserErrorName,
  type ValidationExpectedType,
  type ValidationIssueCode,
  type ValidationReceivedType,
} from "../lib/ai/json.ts";
import {
  isVercelDeploymentProtectionRedirect,
  normalizePreviewUrl,
  resolveAutomationBypassSecret,
  validatePreviewDeploymentMetadata,
  withAutomationBypassRequestInit,
} from "./preview-automation.mjs";
import {
  assertB2ContentDraftArtifactInput,
  b2ContentDraftArtifactFilename,
  buildB2ContentDraftArtifact,
  writeB2ContentDraftArtifactAtomic,
} from "./b2-validation-artifacts.ts";

export const B1_QUESTION_TYPES = [
  "core",
  "method",
  "audience",
  "evidence",
  "limits",
] as const;

export const B1_PIPELINE_OPERATIONS = [
  "scoring",
  "question_prediction",
  "diagnose_1",
  "diagnose_2",
  "diagnose_3",
  "advice",
  "content_draft",
] as const;
const B1_CALL_OUTCOMES = [
  "model",
  "fallback",
  "success",
  "timeout",
  "rate-limited",
  "http-error",
  "network-error",
  "invalid-response",
  "invalid-source",
  "protection-blocked",
  "skipped",
] as const;

export const B1_MODEL_CALLS_PER_PIPELINE = B1_PIPELINE_OPERATIONS.length;
export const B1_STAGE_1_ARTICLE_COUNT = 10;
export const B1_STAGE_2_ARTICLE_COUNT = 9;
export const B1_DEFAULT_STAGE_2_ROUNDS = 2;
export const B1_TELEMETRY_SCHEMA_VERSION = "b1-v8";

const B1_MODEL_STATUSES = [
  "not-requested",
  "requested",
  "success",
  "disabled",
  "failed",
  "invalid-output",
  "rate-limited",
  "timeout",
] as const;
const B1_RESPONSE_SOURCES = ["model", "fallback", "none"] as const;
const B1_MODEL_FINISH_REASONS = [
  "stop",
  "length",
  "content_filter",
  "tool_calls",
  "function_call",
  "unknown",
] as const;
const B1_MODEL_ERROR_CATEGORIES = [
  "configuration",
  "budget",
  "provider_http",
  "provider_timeout",
  "provider_network",
  "provider_response_parse",
  "provider_invalid_output",
  "unknown",
] as const;
export const B1_REQUEST_STAGES = [
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
export const B1_FALLBACK_REASONS = [
  "model_disabled",
  "model_unavailable",
  "provider_error",
  "parse_error",
  "missing_content",
  "invalid_response",
  "unexpected_format",
] as const;
const B1_RUNTIME_LOG_STATUSES = [
  "matched",
  "delayed-ingestion",
  "true-missing",
  "collector-unavailable",
  "not-applicable",
] as const;
const B1_RUNTIME_LOG_DISCONNECT_REASONS = [
  "stream-ended",
  "stream-error",
  "network-error",
  "http-error",
  "invalid-response",
  "config-unavailable",
  "wait-failed",
  "unknown",
] as const;
const B1_VALIDATION_STAGES = [
  "json_parse",
  "schema_validation",
  "semantic_validation",
  "reference_validation",
  "evidence_validation",
] as const;
const B1_VALIDATION_FAILURE_CLASSIFICATIONS = [
  "json_parse_failed",
  "token_cap_truncation",
  "required_field_missing",
  "schema_validation_failed",
  "semantic_validation_failed",
  "reference_mismatch",
  "quote_mismatch",
] as const;
const B1_VALIDATION_ACTION_TYPES = [
  "author_evidence",
  "structure_change",
  "faq",
  "fact_card",
  "unknown",
  "non-string",
] as const;
const B1_ANSWERABILITY_VALUES = ["可以完全回答", "信息不足", "有风险"] as const;
const B1_ERROR_CLASSIFICATIONS = [
  "fallback",
  "timeout",
  "invalid-output",
  "429",
  "http-error",
  "network-error",
  "invalid-response",
  "invalid-source",
  "protection-blocked",
  "skipped",
  "runtime-log-missing",
  "runtime-log-incomplete",
  "model-failed",
] as const;
const ARTICLE_CATEGORIES = ["public_account", "blog_longform", "ai_generated"] as const;
const QUALITY_LEVELS = ["high", "medium", "low"] as const;
const LENGTH_LEVELS = ["short", "medium", "long"] as const;
const PERMISSION_LEVELS = ["public", "authorized"] as const;
const DIMENSION_KEYS = [
  "questionCoverage",
  "factCompleteness",
  "structureClarity",
  "freshness",
] as const;
const HEALTH_CHECK_KEYS = [
  "modelConfigured",
  "redisConfigured",
  "securityConfigured",
  "feedbackConfigured",
  "sentryConfigured",
] as const;

type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];
type QualityLevel = (typeof QUALITY_LEVELS)[number];
type LengthLevel = (typeof LENGTH_LEVELS)[number];
type PermissionLevel = (typeof PERMISSION_LEVELS)[number];
export type B1QuestionType = (typeof B1_QUESTION_TYPES)[number];
type DimensionKey = (typeof DIMENSION_KEYS)[number];
type B1PipelineOperation = (typeof B1_PIPELINE_OPERATIONS)[number];
type B1ModelStatus = (typeof B1_MODEL_STATUSES)[number];
type B1ResponseSource = (typeof B1_RESPONSE_SOURCES)[number];
type B1ModelFinishReason = (typeof B1_MODEL_FINISH_REASONS)[number];
type B1ModelErrorCategory = (typeof B1_MODEL_ERROR_CATEGORIES)[number];
export type B1RequestStage = (typeof B1_REQUEST_STAGES)[number];
export type B1FallbackReason = (typeof B1_FALLBACK_REASONS)[number];
export type B1RuntimeLogStatus = (typeof B1_RUNTIME_LOG_STATUSES)[number];
export type B1RuntimeLogDisconnectReason =
  (typeof B1_RUNTIME_LOG_DISCONNECT_REASONS)[number];
export type B1RuntimeLogCollectorMode = "live" | "degraded" | "unavailable";
export type B1RuntimeLogMatchResult =
  | "matched"
  | "collector-unavailable"
  | "timeout"
  | "not-applicable";
type B1ValidationStage = (typeof B1_VALIDATION_STAGES)[number];
type B1ValidationFailureClassification =
  (typeof B1_VALIDATION_FAILURE_CLASSIFICATIONS)[number];
type B1ValidationActionType = (typeof B1_VALIDATION_ACTION_TYPES)[number];
type B1Answerability = (typeof B1_ANSWERABILITY_VALUES)[number];
type B1ErrorClassification = (typeof B1_ERROR_CLASSIFICATIONS)[number];
type B1Stage = 1 | 2;
type B1Round = 1 | 2 | 3;

const B1_OPERATION_ROUTES: Record<B1PipelineOperation, string> = {
  scoring: "/api/evaluate-scoring",
  question_prediction: "/api/predict-questions",
  diagnose_1: "/api/qa-diagnostic",
  diagnose_2: "/api/qa-diagnostic",
  diagnose_3: "/api/qa-diagnostic",
  advice: "/api/generate-patches",
  content_draft: "/api/generate-patches",
};

type JsonRecord = Record<string, unknown>;

export interface B1CorpusArticle {
  id: string;
  sourceIndex: number;
  category: ArticleCategory;
  quality: QualityLevel;
  length: LengthLevel;
  permission: PermissionLevel;
  title: string;
  content: string;
  publishedAt: string;
}

export interface B1Paragraph {
  id: string;
  text: string;
}

export interface B1DiagnosticQuestion {
  type: B1QuestionType;
  sourceIndex: number;
  question: string;
}

export type B1CallOutcome = (typeof B1_CALL_OUTCOMES)[number];

export interface B1CallRecord {
  operation: B1PipelineOperation;
  route: string;
  outcome: B1CallOutcome;
  status: number | null;
  source: Exclude<B1ResponseSource, "none"> | null;
  modelStatus: B1ModelStatus | null;
  modelLatencyMs: number | null;
  providerRequestStartAt?: number | null;
  firstByteAt?: number | null;
  firstTokenAt?: number | null;
  responseCompletedAt?: number | null;
  abortedAt?: number | null;
  streamDurationMs?: number | null;
  contentPresent?: boolean | null;
  contentLength?: number | null;
  finishReason?: B1ModelFinishReason | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  reasoningTokens?: number | null;
  totalTokens?: number | null;
  durationMs: number;
  requestId: string | null;
  runtimeLogStatus?: B1RuntimeLogStatus;
  validationStage?: B1ValidationStage | null;
  validationIssueCount?: number | null;
  validationFailureClassification?: B1ValidationFailureClassification | null;
  validationFieldPaths?: string[];
  validationActionTypes?: B1ValidationActionType[];
  validationReceivedType?: ValidationReceivedType | null;
  validationExpectedType?: ValidationExpectedType | null;
  validationIssueCode?: ValidationIssueCode | null;
  responseLength?: number | null;
  trimmedLength?: number | null;
  firstCharType?: JsonBoundaryCharacterType | null;
  lastCharType?: JsonBoundaryCharacterType | null;
  startsWithCodeFence?: boolean | null;
  endsWithCodeFence?: boolean | null;
  parserErrorName?: JsonParserErrorName | null;
  parserErrorPosition?: number | null;
  jsonErrorCategory?: JsonErrorCategory | null;
  parserErrorCategory?: JsonErrorCategory | null;
  lastCharacterCategory?: JsonLastCharacterCategory | null;
  containsMultipleTopLevelValues?: boolean | null;
  hasLeadingNonWhitespaceText?: boolean | null;
  hasTrailingNonWhitespaceText?: boolean | null;
}

export interface B1PipelineRecord {
  articleId: string;
  stage: B1Stage;
  round: B1Round;
  questionTypes: B1QuestionType[];
  calls: B1CallRecord[];
  totalScore?: number;
  normalizedDimensions?: Partial<Record<DimensionKey, number>>;
  diagnosticAnswerability: B1Answerability[];
  evidenceLiteralChecks: number;
  evidenceLiteralPasses: number;
  evidenceLiteralValid: boolean;
  contentDraftFactsPreserved: boolean | null;
  contentDraftStructurePreserved: boolean | null;
}

export interface B1StabilityObservation {
  articleId: string;
  round: 1 | 2;
  callOutcomes: B1CallOutcome[];
  callDurationsMs: number[];
  totalScore?: number;
  normalizedDimensions?: Partial<Record<DimensionKey, number>>;
  diagnosticAnswerability?: string[];
}

export interface B1ThirdRoundDecision {
  required: boolean;
  reasons: string[];
  metrics: {
    maxScoreRange: number | null;
    maxNormalizedDimensionRange: number | null;
    answerabilityConsistency: number | null;
    requestLatencyP95Ms: number | null;
  };
}

interface RequestResult {
  record: Omit<B1CallRecord, "operation">;
  payload: unknown;
}

interface B1PersistedCallRecord {
  requestId: string | null;
  route: string;
  httpStatus: number | null;
  source: Exclude<B1ResponseSource, "none"> | null;
  modelStatus: B1ModelStatus | null;
  modelLatencyMs: number | null;
  providerRequestStartAt: number | null;
  firstByteAt: number | null;
  firstTokenAt: number | null;
  responseCompletedAt: number | null;
  abortedAt: number | null;
  streamDurationMs: number | null;
  contentPresent: boolean | null;
  contentLength: number | null;
  finishReason: B1ModelFinishReason | null;
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
  durationMs: number;
  errorClassification: B1ErrorClassification | null;
  runtimeLogStatus: B1RuntimeLogStatus;
  validationStage: B1ValidationStage | null;
  validationIssueCount: number | null;
  validationFailureClassification: B1ValidationFailureClassification | null;
  validationFieldPaths: string[];
  validationActionTypes: B1ValidationActionType[];
  validationReceivedType: ValidationReceivedType | null;
  validationExpectedType: ValidationExpectedType | null;
  validationIssueCode: ValidationIssueCode | null;
  responseLength: number | null;
  trimmedLength: number | null;
  firstCharType: JsonBoundaryCharacterType | null;
  lastCharType: JsonBoundaryCharacterType | null;
  startsWithCodeFence: boolean | null;
  endsWithCodeFence: boolean | null;
  parserErrorName: JsonParserErrorName | null;
  parserErrorPosition: number | null;
  jsonErrorCategory: JsonErrorCategory | null;
  parserErrorCategory: JsonErrorCategory | null;
  lastCharacterCategory: JsonLastCharacterCategory | null;
  containsMultipleTopLevelValues: boolean | null;
  hasLeadingNonWhitespaceText: boolean | null;
  hasTrailingNonWhitespaceText: boolean | null;
}

interface B1PersistedPipelineRecord {
  sampleId: string;
  requests: B1PersistedCallRecord[];
  aggregate: {
    questionTypes: B1QuestionType[];
    totalScore: number | null;
    normalizedDimensions: Partial<Record<DimensionKey, number>>;
    diagnosticAnswerability: B1Answerability[];
    evidenceLiteralChecks: number;
    evidenceLiteralPasses: number;
    evidenceLiteralValid: boolean;
    contentDraftFactsPreserved: boolean | null;
    contentDraftStructurePreserved: boolean | null;
  };
}

export interface B1RuntimeLogRecord {
  requestId: string;
  route: string;
  status: number;
  source: B1ResponseSource;
  modelStatus: B1ModelStatus;
  modelLatencyMs: number | null;
  providerRequestStartAt?: number | null;
  providerHttpStatus?: number | null;
  modelErrorCategory?: B1ModelErrorCategory | null;
  fallbackReason?: B1FallbackReason;
  firstByteAt?: number | null;
  firstTokenAt?: number | null;
  responseCompletedAt?: number | null;
  abortedAt?: number | null;
  streamDurationMs?: number | null;
  contentPresent?: boolean | null;
  contentLength?: number | null;
  finishReason: B1ModelFinishReason | null;
  promptTokens?: number | null;
  completionTokens: number | null;
  reasoningTokens?: number | null;
  totalTokens?: number | null;
  durationMs: number;
  validationStage: B1ValidationStage | null;
  validationIssueCount: number | null;
  validationFailureClassification: B1ValidationFailureClassification | null;
  validationFieldPaths: string[];
  validationActionTypes: B1ValidationActionType[];
  validationReceivedType?: ValidationReceivedType | null;
  validationExpectedType?: ValidationExpectedType | null;
  validationIssueCode?: ValidationIssueCode | null;
  responseLength?: number | null;
  trimmedLength?: number | null;
  firstCharType?: JsonBoundaryCharacterType | null;
  lastCharType?: JsonBoundaryCharacterType | null;
  startsWithCodeFence?: boolean | null;
  endsWithCodeFence?: boolean | null;
  parserErrorName?: JsonParserErrorName | null;
  parserErrorPosition?: number | null;
  jsonErrorCategory?: JsonErrorCategory | null;
  parserErrorCategory?: JsonErrorCategory | null;
  lastCharacterCategory?: JsonLastCharacterCategory | null;
  containsMultipleTopLevelValues?: boolean | null;
  hasLeadingNonWhitespaceText?: boolean | null;
  hasTrailingNonWhitespaceText?: boolean | null;
}

export interface B1RuntimeStageRecord {
  requestId: string;
  route: string;
  stage: B1RequestStage;
  timestamp: number;
  latency: number;
}

export interface B1RuntimeLogConfig {
  deploymentId: string;
  projectId: string;
  teamId: string;
  token: string;
}

interface B1RuntimeLogCollectorOptions {
  maxDrainMs?: number;
  reconnectDelayMs?: number;
  readinessStabilityMs?: number;
  recordPoll?: B1RuntimeLogPoll;
  recordPollIntervalMs?: number;
  recordPollRequestTimeoutMs?: number;
  recordPollStartDelayMs?: number;
  stream?: B1RuntimeLogStream;
  history?: B1RuntimeLogHistory;
  historyTimeoutMs?: number;
  historyPollIntervalMs?: number;
  historyPollWindowMs?: number;
  historyStablePollCount?: number;
  historyStabilityMs?: number;
  wait?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

type B1RuntimeLogStream = (
  config: B1RuntimeLogConfig,
  signal: AbortSignal,
  handlers: {
    connected: () => void;
    record: (record: B1RuntimeLogRecord, generatedAtMs?: number | null) => void;
  },
) => Promise<void>;

export interface B1RuntimeLogPollQuery {
  requestId: string;
  route: string;
  sinceMs: number;
  untilMs: number;
}

export interface B1RuntimeLogPollRecord {
  record: B1RuntimeLogRecord;
  generatedAtMs: number | null;
}

type B1RuntimeLogPoll = (
  config: B1RuntimeLogConfig,
  query: B1RuntimeLogPollQuery,
  signal: AbortSignal,
) => Promise<B1RuntimeLogPollRecord[]>;

type B1RuntimeLogHistory = (
  config: B1RuntimeLogConfig,
  range: { sinceMs: number; untilMs: number },
  signal: AbortSignal,
) => Promise<B1RuntimeLogRecord[]>;

export interface B1RuntimeLogCollectorState {
  collectorMode: B1RuntimeLogCollectorMode;
  liveConnectionAttempts: number;
  liveSuccessfulConnections: number;
  liveInterruptions: number;
  boundedPollAttempts: number;
  boundedPollFailures: number;
  boundedPollMatches: number;
  historicalBackfill: "not-needed" | "complete" | "unavailable";
  collectorReadyAt: number | null;
  collectorDisconnectedAt: number | null;
  disconnectReason: B1RuntimeLogDisconnectReason | null;
  matchedCount: number;
  unmatchedCount: number;
}

export interface B1RuntimeLogTiming {
  requestCompletedAtMs: number;
  runtimeLogGeneratedAtMs: number | null;
  collectorReceivedAtMs: number;
  requestIdMatchedAtMs: number;
  generationLatencyMs: number | null;
  deliveryLatencyMs: number | null;
  matchLatencyMs: number;
}

export interface B1RuntimeLogCollectionResult {
  records: Map<string, B1RuntimeLogRecord>;
  statuses: Map<string, B1RuntimeLogStatus>;
  timings?: Map<string, B1RuntimeLogTiming>;
  collectorState: B1RuntimeLogCollectorState;
}

export interface B1RuntimeLogCollector {
  register(call: B1CallRecord): void;
  waitForLiveConnection(timeoutMs?: number): Promise<"connected" | "unavailable" | "timeout">;
  waitForRecord(call: B1CallRecord, timeoutMs?: number): Promise<B1RuntimeLogMatchResult>;
  finish(batchCompletedAt?: number): Promise<B1RuntimeLogCollectionResult>;
  close(): void;
}

export async function requireB1RuntimeLogCollectorReady(
  collector: B1RuntimeLogCollector,
  timeoutMs = 15_000,
): Promise<void> {
  const readiness = await collector.waitForLiveConnection(timeoutMs);
  if (readiness !== "connected") {
    throw new Error(`B.1 Runtime Log collector readiness failed: ${readiness}.`);
  }
}

interface B1Arguments {
  help: boolean;
  corpusPath?: string;
  stage?: B1Stage;
  round?: B1Round;
  resume: boolean;
  saveContentDraftArtifacts: boolean;
}

export interface B1Checkpoint {
  stage: B1Stage;
  round: B1Round;
  complete: boolean;
  records: B1PipelineRecord[];
}

interface B1CheckpointArtifact {
  telemetrySchemaVersion: typeof B1_TELEMETRY_SCHEMA_VERSION;
  stage: B1Stage;
  round: B1Round;
  complete: boolean;
  records: B1PersistedPipelineRecord[];
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isOneOf<T extends readonly string[]>(value: unknown, allowed: T): value is T[number] {
  return typeof value === "string" && allowed.includes(value);
}

function normalizeRequestId(value: unknown): string | null {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
    ? value.toLowerCase()
    : null;
}

function normalizeHttpStatus(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : null;
}

function normalizeDuration(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
}

function normalizeSource(value: unknown): Exclude<B1ResponseSource, "none"> | null {
  return value === "model" || value === "fallback" ? value : null;
}

function normalizeModelStatus(value: unknown): B1ModelStatus | null {
  return isOneOf(value, B1_MODEL_STATUSES) ? value : null;
}

function normalizeModelFinishReason(value: unknown): B1ModelFinishReason | null {
  return isOneOf(value, B1_MODEL_FINISH_REASONS) ? value : null;
}

function normalizeModelErrorCategory(value: unknown): B1ModelErrorCategory | null {
  return isOneOf(value, B1_MODEL_ERROR_CATEGORIES) ? value : null;
}

function normalizeFallbackReason(value: unknown): B1FallbackReason | null {
  return isOneOf(value, B1_FALLBACK_REASONS) ? value : null;
}

function normalizeTokenCount(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
    ? value
    : null;
}

function normalizeTelemetryBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function normalizeJsonBoundaryCharacterType(
  value: unknown,
): JsonBoundaryCharacterType | null {
  return isOneOf(value, JSON_BOUNDARY_CHARACTER_TYPES) ? value : null;
}

function normalizeJsonParserErrorName(
  value: unknown,
): JsonParserErrorName | null {
  return isOneOf(value, JSON_PARSER_ERROR_NAMES) ? value : null;
}

function normalizeJsonErrorCategory(value: unknown): JsonErrorCategory | null {
  return isOneOf(value, JSON_ERROR_CATEGORIES) ? value : null;
}

function normalizeJsonLastCharacterCategory(
  value: unknown,
): JsonLastCharacterCategory | null {
  return isOneOf(value, JSON_LAST_CHARACTER_CATEGORIES) ? value : null;
}

function normalizeValidationReceivedType(
  value: unknown,
): ValidationReceivedType | null {
  return isOneOf(value, VALIDATION_RECEIVED_TYPES) ? value : null;
}

function normalizeValidationExpectedType(
  value: unknown,
): ValidationExpectedType | null {
  return isOneOf(value, VALIDATION_EXPECTED_TYPES) ? value : null;
}

function normalizeValidationIssueCode(value: unknown): ValidationIssueCode | null {
  return isOneOf(value, VALIDATION_ISSUE_CODES) ? value : null;
}

function normalizeRuntimeLogStatus(value: unknown): B1RuntimeLogStatus | null {
  return isOneOf(value, B1_RUNTIME_LOG_STATUSES) ? value : null;
}

function normalizeValidationStage(value: unknown): B1ValidationStage | null {
  return isOneOf(value, B1_VALIDATION_STAGES) ? value : null;
}

function normalizeValidationFailureClassification(
  value: unknown,
): B1ValidationFailureClassification | null {
  return isOneOf(value, B1_VALIDATION_FAILURE_CLASSIFICATIONS) ? value : null;
}

function normalizeValidationIssueCount(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1
    ? value
    : null;
}

function normalizeValidationFieldPaths(value: unknown): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length > 20 ||
    !value.every(
      (path) =>
        typeof path === "string" &&
        path.length <= 240 &&
        /^\$(?:\.[A-Za-z][A-Za-z0-9_]{0,63}|\[\d+\])*$/.test(path),
    )
  ) {
    return null;
  }
  return [...new Set(value)];
}

function normalizeValidationActionTypes(value: unknown): B1ValidationActionType[] | null {
  if (
    !Array.isArray(value) ||
    value.length > 10 ||
    !value.every((actionType) => isOneOf(actionType, B1_VALIDATION_ACTION_TYPES))
  ) {
    return null;
  }
  return value;
}

function normalizeAnswerability(value: unknown): B1Answerability | null {
  return isOneOf(value, B1_ANSWERABILITY_VALUES) ? value : null;
}

function exactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length &&
    actual.every((key, index) => key === [...keys].sort()[index]);
}

function parseEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new Error(`${label} must be one of: ${allowed.join(", ")}.`);
  }
  return value as T[number];
}

function requiredString(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new Error(`${label} exceeds ${maximum} characters.`);
  }
  return normalized;
}

function assertDistribution<T extends string>(
  articles: B1CorpusArticle[],
  field: "category" | "quality" | "length",
  expected: Record<T, number>,
): void {
  const actual = Object.fromEntries(
    Object.keys(expected).map((key) => [
      key,
      articles.filter((article) => article[field] === key).length,
    ]),
  ) as Record<T, number>;

  for (const [key, count] of Object.entries(expected)) {
    if (actual[key as T] !== count) {
      throw new Error(
        `Corpus ${field} distribution requires ${key}=${count}; received ${actual[key as T]}.`,
      );
    }
  }
}

export function createNumberedParagraphs(content: string): B1Paragraph[] {
  const normalized = content
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .trim();
  const blocks = normalized
    .split(/\n{2,}|\n(?=#{1,6}\s)|\n(?=[一二三四五六七八九十]+[、.．])|\n(?=\d+[、.．])/)
    .map((block) => block.trim())
    .filter(Boolean);
  const chunks: string[] = [];

  for (const block of blocks.length ? blocks : [normalized]) {
    if (block.length <= 700) {
      chunks.push(block);
      continue;
    }

    const sentences = block.split(/(?<=[。！？!?；;])\s*/).filter(Boolean);
    let current = "";
    for (const sentence of sentences.length ? sentences : [block]) {
      if (current && current.length + sentence.length > 700) {
        chunks.push(current);
        current = "";
      }
      if (sentence.length > 700) {
        for (let index = 0; index < sentence.length; index += 700) {
          chunks.push(sentence.slice(index, index + 700));
        }
      } else {
        current += sentence;
      }
    }
    if (current) chunks.push(current);
  }

  return chunks.map((text, index) => ({ id: `Para-${index + 1}`, text }));
}

export function validateB1Corpus(input: unknown): B1CorpusArticle[] {
  if (!Array.isArray(input) || input.length !== B1_STAGE_1_ARTICLE_COUNT) {
    throw new Error(`B.1 corpus must contain exactly ${B1_STAGE_1_ARTICLE_COUNT} articles.`);
  }

  const articles = input.map((value, sourceIndex) => {
    if (!isRecord(value)) {
      throw new Error(`Corpus article ${sourceIndex + 1} must be an object.`);
    }
    const title = requiredString(value.title, `article ${sourceIndex + 1} title`, 120);
    const content = requiredString(value.content, `article ${sourceIndex + 1} content`, 12_000);
    if (
      value.publishedAt !== undefined &&
      value.publishedAt !== null &&
      typeof value.publishedAt !== "string"
    ) {
      throw new Error(`article ${sourceIndex + 1} publishedAt must be a string.`);
    }
    const publishedAt =
      typeof value.publishedAt === "string" ? value.publishedAt.trim() : "";
    if (publishedAt.length > 32) {
      throw new Error(`article ${sourceIndex + 1} publishedAt exceeds 32 characters.`);
    }
    const paragraphs = createNumberedParagraphs(content);
    if (!paragraphs.length || paragraphs.length > 80) {
      throw new Error(`Corpus article ${sourceIndex + 1} must contain 1 to 80 paragraphs.`);
    }

    return {
      id: `B1-A${String(sourceIndex + 1).padStart(2, "0")}`,
      sourceIndex,
      category: parseEnum(
        value.category,
        ARTICLE_CATEGORIES,
        `article ${sourceIndex + 1} category`,
      ),
      quality: parseEnum(value.quality, QUALITY_LEVELS, `article ${sourceIndex + 1} quality`),
      length: parseEnum(value.length, LENGTH_LEVELS, `article ${sourceIndex + 1} length`),
      permission: parseEnum(
        value.permission,
        PERMISSION_LEVELS,
        `article ${sourceIndex + 1} permission`,
      ),
      title,
      content,
      publishedAt,
    } satisfies B1CorpusArticle;
  });

  assertDistribution(articles, "category", {
    public_account: 4,
    blog_longform: 3,
    ai_generated: 3,
  });
  assertDistribution(articles, "quality", { high: 3, medium: 4, low: 3 });
  assertDistribution(articles, "length", { short: 3, medium: 4, long: 3 });

  return articles;
}

export function selectStage2Articles(articles: B1CorpusArticle[]): B1CorpusArticle[] {
  const mediumIds = new Set(
    articles
      .filter((article) => article.quality === "medium")
      .slice(0, 3)
      .map((article) => article.id),
  );
  const selected = articles.filter(
    (article) => article.quality !== "medium" || mediumIds.has(article.id),
  );

  if (
    selected.length !== B1_STAGE_2_ARTICLE_COUNT ||
    selected.filter((article) => article.quality === "high").length !== 3 ||
    selected.filter((article) => article.quality === "medium").length !== 3 ||
    selected.filter((article) => article.quality === "low").length !== 3
  ) {
    throw new Error("Stage 2 selection must contain three high, three medium, and three low articles.");
  }
  return selected;
}

export function selectDiagnosticQuestions(
  questions: unknown,
  articleIndex: number,
): B1DiagnosticQuestion[] {
  if (
    !Array.isArray(questions) ||
    questions.length !== B1_QUESTION_TYPES.length ||
    questions.some((question) => typeof question !== "string" || !question.trim())
  ) {
    throw new Error("Question prediction must contain exactly five non-empty questions.");
  }

  return [0, 1, 2].map((offset) => {
    const sourceIndex = (articleIndex + offset) % B1_QUESTION_TYPES.length;
    return {
      type: B1_QUESTION_TYPES[sourceIndex],
      sourceIndex,
      question: (questions[sourceIndex] as string).trim(),
    };
  });
}

function paragraphMap(paragraphs: B1Paragraph[]): Map<string, string> {
  return new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph.text]));
}

function evidenceIsLiteral(value: unknown, paragraphs: B1Paragraph[]): boolean {
  if (!isRecord(value)) return false;
  const paragraphId = value.paragraphId;
  const quote = value.quote;
  return (
    typeof paragraphId === "string" &&
    typeof quote === "string" &&
    Boolean(paragraphMap(paragraphs).get(paragraphId)?.includes(quote))
  );
}

export function diagnosticEvidenceIsLiteral(
  diagnostics: unknown[],
  paragraphs: B1Paragraph[],
): boolean {
  return diagnostics.every((diagnostic) => {
    if (!isRecord(diagnostic) || !Array.isArray(diagnostic.evidence)) return false;
    return diagnostic.evidence.every((evidence) => evidenceIsLiteral(evidence, paragraphs));
  });
}

function literalEvidenceSummary(
  diagnostics: unknown[],
  contentDraft: unknown,
  paragraphs: B1Paragraph[],
): { checks: number; passes: number } {
  const evidenceItems: unknown[] = [];
  for (const diagnostic of diagnostics) {
    if (isRecord(diagnostic) && Array.isArray(diagnostic.evidence)) {
      evidenceItems.push(...diagnostic.evidence);
    }
  }
  if (isRecord(contentDraft) && Array.isArray(contentDraft.actions)) {
    for (const action of contentDraft.actions) {
      if (isRecord(action) && action.evidence !== undefined) {
        evidenceItems.push(action.evidence);
      }
    }
  }
  return {
    checks: evidenceItems.length,
    passes: evidenceItems.filter((evidence) => evidenceIsLiteral(evidence, paragraphs)).length,
  };
}

export function contentDraftFactsArePreserved(
  payload: unknown,
  paragraphs: B1Paragraph[],
): boolean {
  if (!isRecord(payload) || !Array.isArray(payload.actions) || !payload.actions.length) return false;
  return payload.actions.every((action) => {
    if (!isRecord(action) || !evidenceIsLiteral(action.evidence, paragraphs)) return false;
    const evidence = action.evidence as JsonRecord;
    if (action.type === "faq") return action.answer === evidence.quote;
    if (action.type === "fact_card") return action.value === evidence.quote;
    return false;
  });
}

export function contentDraftStructureIsPreserved(
  payload: unknown,
  paragraphs: B1Paragraph[],
): boolean {
  if (!isRecord(payload) || !Array.isArray(payload.actions) || !payload.actions.length) return false;
  const beforeHash = sha256(JSON.stringify(paragraphs));
  const additiveOnly = payload.actions.every((action) => {
    if (
      !isRecord(action) ||
      (action.type !== "faq" && action.type !== "fact_card") ||
      !isRecord(action.evidence) ||
      typeof action.evidence.paragraphId !== "string"
    ) {
      return false;
    }
    const paragraphId = action.evidence.paragraphId;
    return paragraphs.some((paragraph) => paragraph.id === paragraphId);
  });
  const afterHash = sha256(JSON.stringify(paragraphs));
  return additiveOnly && beforeHash === afterHash;
}

export function resolveB1CampaignDirectory(
  cwd: string,
  corpusSha256: string,
  baseUrl: string,
  stage: B1Stage = 1,
): string {
  if (!/^[0-9a-f]{64}$/.test(corpusSha256)) {
    throw new Error("Corpus SHA-256 must be a lowercase hexadecimal digest.");
  }
  const normalizedUrl = normalizePreviewUrl(baseUrl);
  const root = resolve(cwd, "outputs", "b1", `stage${stage}`);
  const directory = resolve(
    root,
    `${corpusSha256.slice(0, 12)}-${sha256(normalizedUrl).slice(0, 8)}`,
  );
  const pathFromRoot = relative(root, directory);
  if (!pathFromRoot || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new Error(`B.1 Stage ${stage} output directory must remain inside outputs/b1/stage${stage}.`);
  }
  return directory;
}

export function parseB1Arguments(argv: string[]): B1Arguments {
  const result: B1Arguments = {
    help: false,
    resume: false,
    saveContentDraftArtifacts: false,
  };
  for (const argument of argv) {
    if (argument === "--help" || argument === "-h") {
      result.help = true;
    } else if (argument === "--resume") {
      result.resume = true;
    } else if (argument === "--save-content-draft-artifacts") {
      result.saveContentDraftArtifacts = true;
    } else if (argument.startsWith("--corpus=")) {
      result.corpusPath = argument.slice("--corpus=".length);
    } else if (argument.startsWith("--stage=")) {
      const stage = Number(argument.slice("--stage=".length));
      if (stage !== 1 && stage !== 2) throw new Error("--stage must be 1 or 2.");
      result.stage = stage;
    } else if (argument.startsWith("--round=")) {
      const round = Number(argument.slice("--round=".length));
      if (round !== 1 && round !== 2 && round !== 3) {
        throw new Error("--round must be 1, 2, or 3.");
      }
      result.round = round;
    } else {
      throw new Error(`Unknown B.1 argument: ${argument}`);
    }
  }

  if (result.help) return result;
  if (!result.corpusPath) throw new Error("--corpus is required.");
  if (!result.stage) throw new Error("--stage is required.");
  if (result.stage === 1 && result.round && result.round !== 1) {
    throw new Error("Stage 1 only supports round 1.");
  }
  if (result.stage === 2 && !result.round) {
    throw new Error("Stage 2 requires an explicit --round=1, --round=2, or --round=3.");
  }
  result.round ??= 1;
  return result;
}

function percentile(values: number[], percentileValue: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1),
  );
  return sorted[index];
}

function scoreRange(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

export function evaluateThirdRoundRequirement(
  observations: B1StabilityObservation[],
): B1ThirdRoundDecision {
  const reasons = new Set<string>();
  const expectedRounds = new Set(observations.map((observation) => observation.round));
  if (!expectedRounds.has(1) || !expectedRounds.has(2)) {
    throw new Error("Third-round evaluation requires completed Stage 2 rounds 1 and 2.");
  }

  for (const observation of observations) {
    if (observation.callOutcomes.some((outcome) => outcome !== "model")) {
      reasons.add("non-model outcome");
    }
  }

  const durations = observations.flatMap((observation) => observation.callDurationsMs);
  const requestLatencyP95Ms = percentile(durations, 95);
  if (requestLatencyP95Ms !== null && requestLatencyP95Ms > 45_000) {
    reasons.add("request latency p95 exceeded 45 seconds");
  }

  const grouped = new Map<string, B1StabilityObservation[]>();
  for (const observation of observations) {
    const values = grouped.get(observation.articleId) ?? [];
    values.push(observation);
    grouped.set(observation.articleId, values);
  }

  let maxScoreRange: number | null = null;
  let maxNormalizedDimensionRange: number | null = null;
  let answerabilityComparisons = 0;
  let answerabilityMatches = 0;

  for (const values of grouped.values()) {
    const roundOne = values.find((value) => value.round === 1);
    const roundTwo = values.find((value) => value.round === 2);
    if (!roundOne || !roundTwo) {
      reasons.add("incomplete article rounds");
      continue;
    }

    if (roundOne.totalScore !== undefined && roundTwo.totalScore !== undefined) {
      const range = Math.abs(roundOne.totalScore - roundTwo.totalScore);
      maxScoreRange = Math.max(maxScoreRange ?? 0, range);
      if (range > 10) reasons.add("score range exceeded 10");
    } else {
      reasons.add("missing scoring output");
    }

    for (const key of DIMENSION_KEYS) {
      const first = roundOne.normalizedDimensions?.[key];
      const second = roundTwo.normalizedDimensions?.[key];
      if (first === undefined || second === undefined) {
        reasons.add("missing scoring dimension");
        continue;
      }
      const range = Math.abs(first - second);
      maxNormalizedDimensionRange = Math.max(maxNormalizedDimensionRange ?? 0, range);
      if (range > 15) reasons.add("normalized dimension range exceeded 15");
    }

    const firstAnswers = roundOne.diagnosticAnswerability;
    const secondAnswers = roundTwo.diagnosticAnswerability;
    if (!firstAnswers || !secondAnswers || firstAnswers.length !== 3 || secondAnswers.length !== 3) {
      reasons.add("missing diagnostic answerability");
      continue;
    }
    for (let index = 0; index < 3; index += 1) {
      answerabilityComparisons += 1;
      if (firstAnswers[index] === secondAnswers[index]) answerabilityMatches += 1;
    }
  }

  const answerabilityConsistency = answerabilityComparisons
    ? answerabilityMatches / answerabilityComparisons
    : null;
  if (answerabilityConsistency === null || answerabilityConsistency < 0.8) {
    reasons.add("diagnostic answerability consistency below 80%");
  }

  return {
    required: reasons.size > 0,
    reasons: [...reasons].sort(),
    metrics: {
      maxScoreRange,
      maxNormalizedDimensionRange,
      answerabilityConsistency,
      requestLatencyP95Ms,
    },
  };
}

function normalizedScoring(payload: unknown): {
  totalScore?: number;
  normalizedDimensions?: Partial<Record<DimensionKey, number>>;
} {
  if (!isRecord(payload)) return {};
  const totalScore = typeof payload.totalScore === "number" ? payload.totalScore : undefined;
  if (!isRecord(payload.dimensions)) return { totalScore };

  const normalizedDimensions: Partial<Record<DimensionKey, number>> = {};
  for (const key of DIMENSION_KEYS) {
    const dimension = payload.dimensions[key];
    if (
      isRecord(dimension) &&
      typeof dimension.score === "number" &&
      typeof dimension.max === "number" &&
      dimension.max > 0
    ) {
      normalizedDimensions[key] = (dimension.score / dimension.max) * 100;
    }
  }
  return { totalScore, normalizedDimensions };
}

export function pipelineRecordToStabilityObservation(
  record: B1PipelineRecord,
): B1StabilityObservation {
  if (record.round !== 1 && record.round !== 2) {
    throw new Error("Stability observations only support Stage 2 rounds 1 and 2.");
  }
  return {
    articleId: record.articleId,
    round: record.round,
    callOutcomes: record.calls.map((call) => call.outcome),
    callDurationsMs: record.calls.map((call) => call.durationMs),
    ...(record.totalScore === undefined ? {} : { totalScore: record.totalScore }),
    ...(record.normalizedDimensions === undefined
      ? {}
      : { normalizedDimensions: record.normalizedDimensions }),
    diagnosticAnswerability: record.diagnosticAnswerability,
  };
}

function distribution<T extends string>(
  values: T[],
  allowed: readonly T[],
): Record<T, number> {
  return Object.fromEntries(
    allowed.map((value) => [value, values.filter((candidate) => candidate === value).length]),
  ) as Record<T, number>;
}

function countedValues(values: string[]): Record<string, number> {
  return Object.fromEntries(
    [...new Set(values)]
      .sort()
      .map((value) => [value, values.filter((candidate) => candidate === value).length]),
  );
}

function classifyCallError(
  record: B1CallRecord,
  persisted: Omit<B1PersistedCallRecord, "errorClassification">,
): B1ErrorClassification | null {
  if (
    record.outcome === "rate-limited" ||
    persisted.httpStatus === 429 ||
    persisted.modelStatus === "rate-limited"
  ) {
    return "429";
  }
  if (record.outcome === "timeout" || persisted.modelStatus === "timeout") return "timeout";
  if (persisted.modelStatus === "invalid-output") return "invalid-output";
  if (record.outcome === "fallback" || persisted.source === "fallback") return "fallback";
  if (record.outcome === "model" || persisted.source === "model") {
    if (persisted.modelStatus === null) {
      return persisted.runtimeLogStatus === "true-missing" ? "runtime-log-missing" : null;
    }
    if (persisted.modelStatus === "requested") return "runtime-log-incomplete";
    if (persisted.modelStatus !== "success") return "model-failed";
    return null;
  }
  if (record.outcome === "success") return null;
  switch (record.outcome) {
    case "http-error":
    case "network-error":
    case "invalid-response":
    case "invalid-source":
    case "protection-blocked":
    case "skipped":
      return record.outcome;
  }
}

function persistedCallRecord(record: B1CallRecord): B1PersistedCallRecord {
  const requestId = normalizeRequestId(record.requestId);
  const validationStage = normalizeValidationStage(record.validationStage);
  const validationIssueCount = normalizeValidationIssueCount(record.validationIssueCount);
  const validationFailureClassification = normalizeValidationFailureClassification(
    record.validationFailureClassification,
  );
  const validationFieldPaths =
    normalizeValidationFieldPaths(record.validationFieldPaths ?? []) ?? [];
  const validationActionTypes =
    normalizeValidationActionTypes(record.validationActionTypes ?? []) ?? [];
  const hasValidationTelemetry = validationStage !== null && validationIssueCount !== null;
  const persisted: Omit<B1PersistedCallRecord, "errorClassification"> = {
    requestId,
    route: B1_OPERATION_ROUTES[record.operation],
    httpStatus: normalizeHttpStatus(record.status),
    source: normalizeSource(record.source),
    modelStatus: normalizeModelStatus(record.modelStatus),
    modelLatencyMs: normalizeDuration(record.modelLatencyMs),
    providerRequestStartAt: normalizeDuration(record.providerRequestStartAt),
    firstByteAt: normalizeDuration(record.firstByteAt),
    firstTokenAt: normalizeDuration(record.firstTokenAt),
    responseCompletedAt: normalizeDuration(record.responseCompletedAt),
    abortedAt: normalizeDuration(record.abortedAt),
    streamDurationMs: normalizeDuration(record.streamDurationMs),
    contentPresent: normalizeTelemetryBoolean(record.contentPresent),
    contentLength: normalizeTokenCount(record.contentLength),
    finishReason: normalizeModelFinishReason(record.finishReason),
    promptTokens: normalizeTokenCount(record.promptTokens),
    completionTokens: normalizeTokenCount(record.completionTokens),
    reasoningTokens: normalizeTokenCount(record.reasoningTokens),
    totalTokens: normalizeTokenCount(record.totalTokens),
    durationMs: normalizeDuration(record.durationMs) ?? 0,
    runtimeLogStatus:
      normalizeRuntimeLogStatus(record.runtimeLogStatus) ??
      (requestId ? "collector-unavailable" : "not-applicable"),
    validationStage: hasValidationTelemetry ? validationStage : null,
    validationIssueCount: hasValidationTelemetry ? validationIssueCount : null,
    validationFailureClassification: hasValidationTelemetry
      ? validationFailureClassification
      : null,
    validationFieldPaths: hasValidationTelemetry ? validationFieldPaths : [],
    validationActionTypes: hasValidationTelemetry ? validationActionTypes : [],
    validationReceivedType: hasValidationTelemetry
      ? normalizeValidationReceivedType(record.validationReceivedType)
      : null,
    validationExpectedType: hasValidationTelemetry
      ? normalizeValidationExpectedType(record.validationExpectedType)
      : null,
    validationIssueCode: hasValidationTelemetry
      ? normalizeValidationIssueCode(record.validationIssueCode)
      : null,
    responseLength: hasValidationTelemetry
      ? normalizeTokenCount(record.responseLength)
      : null,
    trimmedLength: hasValidationTelemetry
      ? normalizeTokenCount(record.trimmedLength)
      : null,
    firstCharType: hasValidationTelemetry
      ? normalizeJsonBoundaryCharacterType(record.firstCharType)
      : null,
    lastCharType: hasValidationTelemetry
      ? normalizeJsonBoundaryCharacterType(record.lastCharType)
      : null,
    startsWithCodeFence: hasValidationTelemetry
      ? normalizeTelemetryBoolean(record.startsWithCodeFence)
      : null,
    endsWithCodeFence: hasValidationTelemetry
      ? normalizeTelemetryBoolean(record.endsWithCodeFence)
      : null,
    parserErrorName: hasValidationTelemetry
      ? normalizeJsonParserErrorName(record.parserErrorName)
      : null,
    parserErrorPosition: hasValidationTelemetry
      ? normalizeTokenCount(record.parserErrorPosition)
      : null,
    jsonErrorCategory: hasValidationTelemetry
      ? normalizeJsonErrorCategory(record.jsonErrorCategory)
      : null,
    parserErrorCategory: hasValidationTelemetry
      ? normalizeJsonErrorCategory(record.parserErrorCategory)
      : null,
    lastCharacterCategory: hasValidationTelemetry
      ? normalizeJsonLastCharacterCategory(record.lastCharacterCategory)
      : null,
    containsMultipleTopLevelValues: hasValidationTelemetry
      ? normalizeTelemetryBoolean(record.containsMultipleTopLevelValues)
      : null,
    hasLeadingNonWhitespaceText: hasValidationTelemetry
      ? normalizeTelemetryBoolean(record.hasLeadingNonWhitespaceText)
      : null,
    hasTrailingNonWhitespaceText: hasValidationTelemetry
      ? normalizeTelemetryBoolean(record.hasTrailingNonWhitespaceText)
      : null,
  };
  return {
    ...persisted,
    errorClassification: classifyCallError(record, persisted),
  };
}

function persistedDimensions(
  value: Partial<Record<DimensionKey, number>> | undefined,
): Partial<Record<DimensionKey, number>> {
  const result: Partial<Record<DimensionKey, number>> = {};
  for (const key of DIMENSION_KEYS) {
    const candidate = value?.[key];
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      result[key] = candidate;
    }
  }
  return result;
}

export function buildB1CheckpointArtifact(
  checkpoint: B1Checkpoint,
): B1CheckpointArtifact {
  const { stage, round, complete, records } = checkpoint;
  const expectedRecordCount =
    stage === 1 ? B1_STAGE_1_ARTICLE_COUNT : B1_STAGE_2_ARTICLE_COUNT;
  if (
    records.length > expectedRecordCount ||
    (complete && records.length !== expectedRecordCount) ||
    records.some((record) => record.stage !== stage || record.round !== round)
  ) {
    throw new Error("B.1 checkpoint stage metadata is invalid.");
  }

  const persistedRecords = records.map((record) => {
    if (!/^B1-A(?:0[1-9]|10)$/.test(record.articleId)) {
      throw new Error("B.1 checkpoint sample ID is invalid.");
    }
    if (
      record.calls.length !== B1_MODEL_CALLS_PER_PIPELINE ||
      record.calls.some(
        (call, index) =>
          call.operation !== B1_PIPELINE_OPERATIONS[index] ||
          call.route !== B1_OPERATION_ROUTES[call.operation] ||
          !isOneOf(call.outcome, B1_CALL_OUTCOMES),
      )
    ) {
      throw new Error("B.1 checkpoint requests do not match the fixed seven-call contract.");
    }
    if (
      !record.questionTypes.every((value) => isOneOf(value, B1_QUESTION_TYPES)) ||
      !record.diagnosticAnswerability.every((value) =>
        isOneOf(value, B1_ANSWERABILITY_VALUES),
      )
    ) {
      throw new Error("B.1 checkpoint aggregate contains an invalid enum value.");
    }
    if (
      !Number.isInteger(record.evidenceLiteralChecks) ||
      record.evidenceLiteralChecks < 0 ||
      !Number.isInteger(record.evidenceLiteralPasses) ||
      record.evidenceLiteralPasses < 0 ||
      typeof record.evidenceLiteralValid !== "boolean" ||
      (record.contentDraftFactsPreserved !== null &&
        typeof record.contentDraftFactsPreserved !== "boolean") ||
      (record.contentDraftStructurePreserved !== null &&
        typeof record.contentDraftStructurePreserved !== "boolean")
    ) {
      throw new Error("B.1 checkpoint aggregate contains an invalid evidence count.");
    }

    return {
      sampleId: record.articleId,
      requests: record.calls.map(persistedCallRecord),
      aggregate: {
        questionTypes: [...record.questionTypes],
        totalScore:
          typeof record.totalScore === "number" && Number.isFinite(record.totalScore)
            ? record.totalScore
            : null,
        normalizedDimensions: persistedDimensions(record.normalizedDimensions),
        diagnosticAnswerability: [...record.diagnosticAnswerability],
        evidenceLiteralChecks: record.evidenceLiteralChecks,
        evidenceLiteralPasses: record.evidenceLiteralPasses,
        evidenceLiteralValid: record.evidenceLiteralValid,
        contentDraftFactsPreserved: record.contentDraftFactsPreserved,
        contentDraftStructurePreserved: record.contentDraftStructurePreserved,
      },
    };
  });

  return {
    telemetrySchemaVersion: B1_TELEMETRY_SCHEMA_VERSION,
    stage,
    round,
    complete,
    records: persistedRecords,
  };
}

export function serializeB1CheckpointArtifact(checkpoint: B1Checkpoint): string {
  return `${JSON.stringify(buildB1CheckpointArtifact(checkpoint), null, 2)}\n`;
}

export function buildAnonymousB1Report(
  articles: B1CorpusArticle[],
  records: B1PipelineRecord[],
  collectorState: B1RuntimeLogCollectorState | null = null,
): JsonRecord {
  const calls = records.flatMap((record) => record.calls);
  const persistedCalls = calls.map(persistedCallRecord);
  const successfulModelCalls = calls.filter((call) => call.outcome === "model").length;
  const stageOneRecords = records.filter((record) => record.stage === 1);
  const stageTwoRoundOne = records.filter((record) => record.stage === 2 && record.round === 1);
  const stageTwoRoundTwo = records.filter((record) => record.stage === 2 && record.round === 2);
  const questionTypes = stageOneRecords.flatMap((record) =>
    record.questionTypes,
  );
  const completedDrafts = records.filter(
    (record) => record.contentDraftStructurePreserved !== null,
  );
  const structurePasses = completedDrafts.filter(
    (record) => record.contentDraftStructurePreserved,
  ).length;
  const factPasses = completedDrafts.filter(
    (record) => record.contentDraftFactsPreserved,
  ).length;

  let thirdRound: B1ThirdRoundDecision | { required: null; reasons: string[] };
  if (
    stageTwoRoundOne.length === B1_STAGE_2_ARTICLE_COUNT &&
    stageTwoRoundTwo.length === B1_STAGE_2_ARTICLE_COUNT
  ) {
    thirdRound = evaluateThirdRoundRequirement(
      [...stageTwoRoundOne, ...stageTwoRoundTwo].map(pipelineRecordToStabilityObservation),
    );
  } else {
    thirdRound = { required: null, reasons: ["Stage 2 rounds 1 and 2 are incomplete."] };
  }

  const routeLatency = Object.fromEntries(
    [...new Set(calls.map((call) => call.route))].sort().map((route) => {
      const routeCalls = calls.filter((call) => call.route === route);
      const modelLatencies = routeCalls
        .map((call) => call.modelLatencyMs)
        .filter((value): value is number => value !== null);
      return [
        route,
        {
          requests: routeCalls.length,
          durationMs: {
            p50: percentile(routeCalls.map((call) => call.durationMs), 50),
            p95: percentile(routeCalls.map((call) => call.durationMs), 95),
          },
          modelLatencyMs: {
            p50: percentile(modelLatencies, 50),
            p95: percentile(modelLatencies, 95),
          },
        },
      ];
    }),
  );
  const errorClassifications = persistedCalls
    .map((call) => call.errorClassification)
    .filter((value): value is B1ErrorClassification => value !== null);
  const validationCalls = persistedCalls.filter(
    (call): call is B1PersistedCallRecord & {
      validationStage: B1ValidationStage;
      validationIssueCount: number;
    } => call.validationStage !== null && call.validationIssueCount !== null,
  );
  const validationRoutes = Object.fromEntries(
    [...new Set(validationCalls.map((call) => call.route))].sort().map((route) => {
      const routeCalls = validationCalls.filter((call) => call.route === route);
      return [
        route,
        {
          observations: routeCalls.length,
          issueCount: routeCalls.reduce(
            (sum, call) => sum + call.validationIssueCount,
            0,
          ),
          stages: distribution(
            routeCalls.map((call) => call.validationStage),
            B1_VALIDATION_STAGES,
          ),
          failureClassifications: distribution(
            routeCalls
              .map((call) => call.validationFailureClassification)
              .filter(
                (value): value is B1ValidationFailureClassification => value !== null,
              ),
            B1_VALIDATION_FAILURE_CLASSIFICATIONS,
          ),
          fieldPaths: countedValues(
            routeCalls.flatMap((call) => call.validationFieldPaths),
          ),
          actionTypes: distribution(
            routeCalls.flatMap((call) => call.validationActionTypes),
            B1_VALIDATION_ACTION_TYPES,
          ),
        },
      ];
    }),
  );

  return {
    telemetrySchemaVersion: B1_TELEMETRY_SCHEMA_VERSION,
    corpus: {
      articles: articles.length,
      categoryDistribution: distribution(
        articles.map((article) => article.category),
        ARTICLE_CATEGORIES,
      ),
      qualityDistribution: distribution(
        articles.map((article) => article.quality),
        QUALITY_LEVELS,
      ),
      lengthDistribution: distribution(
        articles.map((article) => article.length),
        LENGTH_LEVELS,
      ),
    },
    execution: {
      completedPipelines: records.length,
      plannedModelCalls: records.length * B1_MODEL_CALLS_PER_PIPELINE,
      modelSourceSuccessRate: calls.length
        ? Number((successfulModelCalls / calls.length).toFixed(4))
        : null,
      modelStatuses: distribution(
        calls
          .map((call) => call.modelStatus)
          .filter((value): value is B1ModelStatus => value !== null),
        B1_MODEL_STATUSES,
      ),
      modelFinishReasons: distribution(
        calls
          .map((call) => call.finishReason)
          .filter((value): value is B1ModelFinishReason => value !== null && value !== undefined),
        B1_MODEL_FINISH_REASONS,
      ),
      errorClassifications: distribution(errorClassifications, B1_ERROR_CLASSIFICATIONS),
      callOutcomes: distribution(
        calls.map((call) => call.outcome),
        B1_CALL_OUTCOMES,
      ),
      requestLatencyMs: {
        mean: calls.length
          ? Math.round(calls.reduce((sum, call) => sum + call.durationMs, 0) / calls.length)
          : null,
        p50: percentile(calls.map((call) => call.durationMs), 50),
        p95: percentile(calls.map((call) => call.durationMs), 95),
      },
      routes: routeLatency,
    },
    runtimeLogs: {
      statuses: distribution(
        persistedCalls.map((call) => call.runtimeLogStatus),
        B1_RUNTIME_LOG_STATUSES,
      ),
      collectorState,
    },
    validationTelemetry: {
      observations: validationCalls.length,
      issueCount: validationCalls.reduce(
        (sum, call) => sum + call.validationIssueCount,
        0,
      ),
      routes: validationRoutes,
    },
    diagnose: {
      goldLabelItems: stageOneRecords.length * 3,
      questionTypeDistribution: distribution(questionTypes, B1_QUESTION_TYPES),
      humanReview: "pending",
    },
    evidence: {
      literalChecks: records.reduce(
        (sum, record) => sum + record.evidenceLiteralChecks,
        0,
      ),
      literalPasses: records.reduce(
        (sum, record) => sum + record.evidenceLiteralPasses,
        0,
      ),
      semanticReview: "pending",
    },
    contentDraft: {
      evaluated: completedDrafts.length,
      factualPreservationRate: completedDrafts.length
        ? Number((factPasses / completedDrafts.length).toFixed(4))
        : null,
      structurePreservationRate: completedDrafts.length
        ? Number((structurePasses / completedDrafts.length).toFixed(4))
        : null,
      humanReview: "pending",
    },
    stage2: {
      defaultRounds: B1_DEFAULT_STAGE_2_ROUNDS,
      thirdRound,
    },
    gateStatus: "pending-technical-and-human-review",
  };
}

function operationRecord(
  operation: B1PipelineOperation,
  result: RequestResult,
): B1CallRecord {
  return { operation, ...result.record };
}

function skippedCall(
  operation: B1PipelineOperation,
  route: string,
): B1CallRecord {
  return {
    operation,
    route,
    outcome: "skipped",
    status: null,
    source: null,
    modelStatus: null,
    modelLatencyMs: null,
    durationMs: 0,
    requestId: null,
  };
}

async function requestJson(params: {
  baseUrl: string;
  bypassSecret: string;
  route: string;
  method: "GET" | "POST";
  body?: unknown;
  clientId?: string;
  token?: string;
  expectModelSource: boolean;
}): Promise<RequestResult> {
  const startedAt = performance.now();
  const headers = new Headers();
  if (params.body !== undefined) headers.set("Content-Type", "application/json");
  if (params.clientId) headers.set("X-GEO-Client-ID", params.clientId);
  if (params.token) headers.set("X-GEO-Analysis-Token", params.token);

  try {
    const response = await fetch(
      `${params.baseUrl}${params.route}`,
      withAutomationBypassRequestInit(
        {
          method: params.method,
          headers,
          redirect: "manual",
          ...(params.body === undefined ? {} : { body: JSON.stringify(params.body) }),
          signal: AbortSignal.timeout(45_000),
        },
        params.bypassSecret,
      ),
    );
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    const requestId = normalizeRequestId(response.headers.get("x-request-id"));
    const location = response.headers.get("location");
    if (isVercelDeploymentProtectionRedirect(response.status, location)) {
      return {
        record: {
          route: params.route,
          outcome: "protection-blocked",
          status: response.status,
          source: null,
          modelStatus: null,
          modelLatencyMs: null,
          durationMs,
          requestId,
        },
        payload: null,
      };
    }

    const payload = await response.json().catch(() => null);
    if (response.status === 429) {
      return {
        record: {
          route: params.route,
          outcome: "rate-limited",
          status: response.status,
          source: null,
          modelStatus: null,
          modelLatencyMs: null,
          durationMs,
          requestId,
        },
        payload,
      };
    }
    if (!response.ok) {
      return {
        record: {
          route: params.route,
          outcome: "http-error",
          status: response.status,
          source: null,
          modelStatus: null,
          modelLatencyMs: null,
          durationMs,
          requestId,
        },
        payload,
      };
    }
    if (!isRecord(payload)) {
      return {
        record: {
          route: params.route,
          outcome: "invalid-response",
          status: response.status,
          source: null,
          modelStatus: null,
          modelLatencyMs: null,
          durationMs,
          requestId,
        },
        payload,
      };
    }

    if (!params.expectModelSource) {
      return {
        record: {
          route: params.route,
          outcome: "success",
          status: response.status,
          source: null,
          modelStatus: null,
          modelLatencyMs: null,
          durationMs,
          requestId,
        },
        payload,
      };
    }

    const source = normalizeSource(payload.source);
    return {
      record: {
        route: params.route,
        outcome: source === "model" ? "model" : source === "fallback" ? "fallback" : "invalid-source",
        status: response.status,
        source,
        modelStatus: null,
        modelLatencyMs: null,
        durationMs,
        requestId,
      },
      payload,
    };
  } catch (error) {
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    return {
      record: {
        route: params.route,
        outcome:
          error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
            ? "timeout"
            : "network-error",
        status: null,
        source: null,
        modelStatus: null,
        modelLatencyMs: null,
        durationMs,
        requestId: null,
      },
      payload: null,
    };
  }
}

function parseB1RuntimeLogValue(value: unknown): B1RuntimeLogRecord | null {
  if (!isRecord(value) || value.event !== "geo_api_request") return null;

  const requestId = normalizeRequestId(value.requestId);
  const status = normalizeHttpStatus(value.status);
  const durationMs = normalizeDuration(value.durationMs);
  const modelLatencyMs =
    value.modelLatencyMs === undefined ? null : normalizeDuration(value.modelLatencyMs);
  const providerRequestStartAt =
    value.providerRequestStartAt === undefined
      ? null
      : normalizeDuration(value.providerRequestStartAt);
  const providerHttpStatus =
    value.providerHttpStatus === undefined
      ? null
      : normalizeHttpStatus(value.providerHttpStatus);
  const modelErrorCategory =
    value.modelErrorCategory === undefined
      ? null
      : normalizeModelErrorCategory(value.modelErrorCategory);
  const fallbackReason =
    value.fallbackReason === undefined
      ? null
      : normalizeFallbackReason(value.fallbackReason);
  const firstByteAt =
    value.firstByteAt === undefined ? null : normalizeDuration(value.firstByteAt);
  const firstTokenAt =
    value.firstTokenAt === undefined ? null : normalizeDuration(value.firstTokenAt);
  const responseCompletedAt =
    value.responseCompletedAt === undefined
      ? null
      : normalizeDuration(value.responseCompletedAt);
  const abortedAt =
    value.abortedAt === undefined ? null : normalizeDuration(value.abortedAt);
  const streamDurationMs =
    value.streamDurationMs === undefined
      ? null
      : normalizeDuration(value.streamDurationMs);
  const contentPresent =
    value.contentPresent === undefined ? null : normalizeTelemetryBoolean(value.contentPresent);
  const contentLength =
    value.contentLength === undefined ? null : normalizeTokenCount(value.contentLength);
  const finishReason =
    value.finishReason === undefined ? null : normalizeModelFinishReason(value.finishReason);
  const promptTokens =
    value.promptTokens === undefined ? null : normalizeTokenCount(value.promptTokens);
  const completionTokens =
    value.completionTokens === undefined ? null : normalizeTokenCount(value.completionTokens);
  const reasoningTokens =
    value.reasoningTokens === undefined ? null : normalizeTokenCount(value.reasoningTokens);
  const totalTokens =
    value.totalTokens === undefined ? null : normalizeTokenCount(value.totalTokens);
  const responseLength =
    value.responseLength === undefined ? null : normalizeTokenCount(value.responseLength);
  const trimmedLength =
    value.trimmedLength === undefined ? null : normalizeTokenCount(value.trimmedLength);
  const firstCharType =
    value.firstCharType === undefined
      ? null
      : normalizeJsonBoundaryCharacterType(value.firstCharType);
  const lastCharType =
    value.lastCharType === undefined
      ? null
      : normalizeJsonBoundaryCharacterType(value.lastCharType);
  const startsWithCodeFence =
    value.startsWithCodeFence === undefined
      ? null
      : normalizeTelemetryBoolean(value.startsWithCodeFence);
  const endsWithCodeFence =
    value.endsWithCodeFence === undefined
      ? null
      : normalizeTelemetryBoolean(value.endsWithCodeFence);
  const parserErrorName =
    value.parserErrorName === undefined
      ? null
      : normalizeJsonParserErrorName(value.parserErrorName);
  const parserErrorPosition =
    value.parserErrorPosition === undefined || value.parserErrorPosition === null
      ? null
      : normalizeTokenCount(value.parserErrorPosition);
  const jsonErrorCategory =
    value.jsonErrorCategory === undefined
      ? null
      : normalizeJsonErrorCategory(value.jsonErrorCategory);
  const parserErrorCategory =
    value.parserErrorCategory === undefined
      ? null
      : normalizeJsonErrorCategory(value.parserErrorCategory);
  const lastCharacterCategory =
    value.lastCharacterCategory === undefined
      ? null
      : normalizeJsonLastCharacterCategory(value.lastCharacterCategory);
  const validationReceivedType =
    value.validationReceivedType === undefined
      ? null
      : normalizeValidationReceivedType(value.validationReceivedType);
  const validationExpectedType =
    value.validationExpectedType === undefined
      ? null
      : normalizeValidationExpectedType(value.validationExpectedType);
  const validationIssueCode =
    value.validationIssueCode === undefined
      ? null
      : normalizeValidationIssueCode(value.validationIssueCode);
  const containsMultipleTopLevelValues =
    value.containsMultipleTopLevelValues === undefined
      ? null
      : normalizeTelemetryBoolean(value.containsMultipleTopLevelValues);
  const hasLeadingNonWhitespaceText =
    value.hasLeadingNonWhitespaceText === undefined
      ? null
      : normalizeTelemetryBoolean(value.hasLeadingNonWhitespaceText);
  const hasTrailingNonWhitespaceText =
    value.hasTrailingNonWhitespaceText === undefined
      ? null
      : normalizeTelemetryBoolean(value.hasTrailingNonWhitespaceText);
  if (
    requestId === null ||
    typeof value.route !== "string" ||
    !Object.values(B1_OPERATION_ROUTES).includes(value.route) ||
    status === null ||
    durationMs === null ||
    !isOneOf(value.source, B1_RESPONSE_SOURCES) ||
    !isOneOf(value.modelStatus, B1_MODEL_STATUSES) ||
    (value.modelLatencyMs !== undefined && modelLatencyMs === null) ||
    (value.providerRequestStartAt !== undefined && providerRequestStartAt === null) ||
    (value.providerHttpStatus !== undefined && providerHttpStatus === null) ||
    (value.modelErrorCategory !== undefined && modelErrorCategory === null) ||
    (value.fallbackReason !== undefined && fallbackReason === null) ||
    (value.firstByteAt !== undefined && firstByteAt === null) ||
    (value.firstTokenAt !== undefined && firstTokenAt === null) ||
    (value.responseCompletedAt !== undefined && responseCompletedAt === null) ||
    (value.abortedAt !== undefined && abortedAt === null) ||
    (value.streamDurationMs !== undefined && streamDurationMs === null) ||
    (value.contentPresent !== undefined && contentPresent === null) ||
    (value.contentLength !== undefined && contentLength === null) ||
    (value.finishReason !== undefined && finishReason === null) ||
    (value.promptTokens !== undefined && promptTokens === null) ||
    (value.completionTokens !== undefined && completionTokens === null) ||
    (value.reasoningTokens !== undefined && reasoningTokens === null) ||
    (value.totalTokens !== undefined && totalTokens === null) ||
    (value.responseLength !== undefined && responseLength === null) ||
    (value.trimmedLength !== undefined && trimmedLength === null) ||
    (value.firstCharType !== undefined && firstCharType === null) ||
    (value.lastCharType !== undefined && lastCharType === null) ||
    (value.startsWithCodeFence !== undefined && startsWithCodeFence === null) ||
    (value.endsWithCodeFence !== undefined && endsWithCodeFence === null) ||
    (value.parserErrorName !== undefined && parserErrorName === null) ||
    (value.parserErrorPosition !== undefined &&
      value.parserErrorPosition !== null &&
      parserErrorPosition === null) ||
    (value.jsonErrorCategory !== undefined && jsonErrorCategory === null) ||
    (value.parserErrorCategory !== undefined && parserErrorCategory === null) ||
    (value.lastCharacterCategory !== undefined && lastCharacterCategory === null) ||
    (value.validationReceivedType !== undefined && validationReceivedType === null) ||
    (value.validationExpectedType !== undefined && validationExpectedType === null) ||
    (value.validationIssueCode !== undefined && validationIssueCode === null) ||
    (value.containsMultipleTopLevelValues !== undefined &&
      containsMultipleTopLevelValues === null) ||
    (value.hasLeadingNonWhitespaceText !== undefined &&
      hasLeadingNonWhitespaceText === null) ||
    (value.hasTrailingNonWhitespaceText !== undefined &&
      hasTrailingNonWhitespaceText === null)
  ) {
    return null;
  }

  const validationStage =
    value.validationStage === undefined
      ? null
      : normalizeValidationStage(value.validationStage);
  const validationIssueCount =
    value.validationStage === undefined
      ? null
      : normalizeValidationIssueCount(value.validationIssueCount);
  const validationFailureClassification =
    value.validationFailureClassification === undefined
      ? null
      : normalizeValidationFailureClassification(value.validationFailureClassification);
  const validationFieldPaths =
    value.validationStage === undefined
      ? []
      : normalizeValidationFieldPaths(value.validationFieldPaths);
  const validationActionTypes =
    value.validationStage === undefined
      ? []
      : normalizeValidationActionTypes(value.validationActionTypes);
  const hasValidValidationTelemetry =
    validationStage !== null &&
    validationIssueCount !== null &&
    (value.validationFailureClassification === undefined ||
      validationFailureClassification !== null) &&
    validationFieldPaths !== null &&
    validationActionTypes !== null;

  return {
    requestId,
    route: value.route,
    status,
    source: value.source,
    modelStatus: value.modelStatus,
    modelLatencyMs,
    providerRequestStartAt,
    providerHttpStatus,
    modelErrorCategory,
    ...(fallbackReason === null ? {} : { fallbackReason }),
    firstByteAt,
    firstTokenAt,
    responseCompletedAt,
    abortedAt,
    streamDurationMs,
    contentPresent,
    contentLength,
    finishReason,
    promptTokens,
    completionTokens,
    reasoningTokens,
    totalTokens,
    durationMs,
    validationStage: hasValidValidationTelemetry ? validationStage : null,
    validationIssueCount: hasValidValidationTelemetry ? validationIssueCount : null,
    validationFailureClassification: hasValidValidationTelemetry
      ? validationFailureClassification
      : null,
    validationFieldPaths: hasValidValidationTelemetry ? validationFieldPaths : [],
    validationActionTypes: hasValidValidationTelemetry ? validationActionTypes : [],
    validationReceivedType: hasValidValidationTelemetry
      ? validationReceivedType
      : null,
    validationExpectedType: hasValidValidationTelemetry
      ? validationExpectedType
      : null,
    validationIssueCode: hasValidValidationTelemetry ? validationIssueCode : null,
    responseLength: hasValidValidationTelemetry ? responseLength : null,
    trimmedLength: hasValidValidationTelemetry ? trimmedLength : null,
    firstCharType: hasValidValidationTelemetry ? firstCharType : null,
    lastCharType: hasValidValidationTelemetry ? lastCharType : null,
    startsWithCodeFence: hasValidValidationTelemetry
      ? startsWithCodeFence
      : null,
    endsWithCodeFence: hasValidValidationTelemetry ? endsWithCodeFence : null,
    parserErrorName: hasValidValidationTelemetry ? parserErrorName : null,
    parserErrorPosition: hasValidValidationTelemetry
      ? parserErrorPosition
      : null,
    jsonErrorCategory: hasValidValidationTelemetry ? jsonErrorCategory : null,
    parserErrorCategory: hasValidValidationTelemetry ? parserErrorCategory : null,
    lastCharacterCategory: hasValidValidationTelemetry
      ? lastCharacterCategory
      : null,
    containsMultipleTopLevelValues: hasValidValidationTelemetry
      ? containsMultipleTopLevelValues
      : null,
    hasLeadingNonWhitespaceText: hasValidValidationTelemetry
      ? hasLeadingNonWhitespaceText
      : null,
    hasTrailingNonWhitespaceText: hasValidValidationTelemetry
      ? hasTrailingNonWhitespaceText
      : null,
  };
}

export function parseB1RuntimeLogMessage(message: unknown): B1RuntimeLogRecord | null {
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  let objectStart = trimmed.indexOf("{");
  while (objectStart >= 0 && candidates.length < 16) {
    if (objectStart > 0) candidates.push(trimmed.slice(objectStart));
    objectStart = trimmed.indexOf("{", objectStart + 1);
  }

  for (const candidate of candidates) {
    try {
      const record = parseB1RuntimeLogValue(JSON.parse(candidate));
      if (record) return record;
    } catch {
      continue;
    }
  }
  return null;
}

function parseB1RuntimeStageLogValue(value: unknown): B1RuntimeStageRecord | null {
  if (!isRecord(value) || value.event !== "geo_api_stage") return null;
  const requestId = normalizeRequestId(value.requestId);
  const timestamp = normalizeDuration(value.timestamp);
  const latency = normalizeDuration(value.latency);
  if (
    requestId === null ||
    typeof value.route !== "string" ||
    !Object.values(B1_OPERATION_ROUTES).includes(value.route) ||
    !isOneOf(value.stage, B1_REQUEST_STAGES) ||
    timestamp === null ||
    latency === null
  ) {
    return null;
  }
  return {
    requestId,
    route: value.route,
    stage: value.stage,
    timestamp,
    latency,
  };
}

export function parseB1RuntimeStageLogMessage(
  message: unknown,
): B1RuntimeStageRecord | null {
  if (typeof message !== "string") return null;
  const trimmed = message.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  let objectStart = trimmed.indexOf("{");
  while (objectStart >= 0 && candidates.length < 16) {
    if (objectStart > 0) candidates.push(trimmed.slice(objectStart));
    objectStart = trimmed.indexOf("{", objectStart + 1);
  }

  for (const candidate of candidates) {
    try {
      const record = parseB1RuntimeStageLogValue(JSON.parse(candidate));
      if (record) return record;
    } catch {
      continue;
    }
  }
  return null;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for B.1 Runtime Log correlation.`);
  return value;
}

async function resolveRuntimeLogConfig(baseUrl: string): Promise<B1RuntimeLogConfig> {
  const projectId = requiredEnvironment("VERCEL_PROJECT_ID");
  const teamId = requiredEnvironment("VERCEL_ORG_ID");
  const token = requiredEnvironment("VERCEL_TOKEN");
  const expectedSha = requiredEnvironment("EXPECTED_SHA").toLowerCase();
  const expectedBranch = requiredEnvironment("EXPECTED_BRANCH");
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) {
    throw new Error("EXPECTED_SHA must be a full 40-character Git commit SHA.");
  }

  const hostname = new URL(baseUrl).hostname;
  const endpoint = new URL(
    `https://api.vercel.com/v13/deployments/${encodeURIComponent(hostname)}`,
  );
  endpoint.searchParams.set("teamId", teamId);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "geo-content-checker-b1-validation",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Vercel deployment metadata lookup failed.");
  }
  if (!response.ok) {
    throw new Error(`Vercel deployment metadata lookup failed with HTTP ${response.status}.`);
  }

  let metadata: unknown;
  try {
    metadata = await response.json();
  } catch {
    throw new Error("Vercel deployment metadata lookup returned invalid JSON.");
  }
  if (!isRecord(metadata)) {
    throw new Error("Vercel deployment metadata lookup returned invalid JSON.");
  }
  const summary = validatePreviewDeploymentMetadata(metadata, {
    previewUrl: baseUrl,
    expectedSha,
    expectedBranch,
    expectedProjectId: projectId,
  });
  return {
    deploymentId: summary.deploymentId,
    projectId,
    teamId,
    token,
  };
}

function runtimeLogKey(requestId: string, route: string): string {
  return `${requestId}\n${route}`;
}

function collectRuntimeLogRecords(
  value: unknown,
  records: Map<string, B1RuntimeLogRecord>,
  depth = 0,
): void {
  if (depth > 12) return;
  if (typeof value === "string") {
    const record = parseB1RuntimeLogMessage(value);
    if (record) records.set(runtimeLogKey(record.requestId, record.route), record);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectRuntimeLogRecords(item, records, depth + 1);
    return;
  }
  if (!isRecord(value)) return;

  const directRecord = parseB1RuntimeLogValue(value);
  if (directRecord) {
    records.set(runtimeLogKey(directRecord.requestId, directRecord.route), directRecord);
  }
  for (const nested of Object.values(value)) {
    collectRuntimeLogRecords(nested, records, depth + 1);
  }
}

class B1RuntimeLogStreamFailure extends Error {
  readonly reason: B1RuntimeLogDisconnectReason;

  constructor(reason: B1RuntimeLogDisconnectReason) {
    super(reason);
    this.name = "B1RuntimeLogStreamFailure";
    this.reason = reason;
  }
}

function runtimeLogDisconnectReason(
  error: unknown,
): B1RuntimeLogDisconnectReason {
  if (error instanceof B1RuntimeLogStreamFailure) return error.reason;
  if (error instanceof TypeError) return "network-error";
  return "stream-error";
}

export function buildB1RuntimeLogStreamUrl(
  config: Pick<B1RuntimeLogConfig, "deploymentId" | "projectId" | "teamId">,
): URL {
  const endpoint = new URL(
    `https://api.vercel.com/v1/projects/${encodeURIComponent(config.projectId)}/deployments/${encodeURIComponent(config.deploymentId)}/runtime-logs`,
  );
  endpoint.searchParams.set("format", "lines");
  endpoint.searchParams.set("teamId", config.teamId);
  return endpoint;
}

export function buildB1RuntimeLogPollUrl(
  config: Pick<B1RuntimeLogConfig, "deploymentId" | "projectId" | "teamId">,
  query: B1RuntimeLogPollQuery,
): URL {
  const endpoint = new URL("https://vercel.com/api/logs/request-logs");
  endpoint.searchParams.set("projectId", config.projectId);
  endpoint.searchParams.set("ownerId", config.teamId);
  endpoint.searchParams.set("teamId", config.teamId);
  endpoint.searchParams.set("deploymentId", config.deploymentId);
  endpoint.searchParams.set("page", "0");
  endpoint.searchParams.set("startDate", String(Math.max(0, query.sinceMs)));
  endpoint.searchParams.set("endDate", String(Math.max(query.sinceMs, query.untilMs)));
  endpoint.searchParams.set("search", query.requestId);
  return endpoint;
}

function runtimeLogGeneratedAtMs(value: unknown): number | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.timestampInMs === "number" &&
    Number.isFinite(value.timestampInMs) &&
    value.timestampInMs >= 0
  ) {
    return Math.round(value.timestampInMs);
  }
  if (typeof value.timestamp === "string") {
    const parsed = Date.parse(value.timestamp);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

async function pollRuntimeLogs(
  config: B1RuntimeLogConfig,
  query: B1RuntimeLogPollQuery,
  signal: AbortSignal,
): Promise<B1RuntimeLogPollRecord[]> {
  const endpoint = buildB1RuntimeLogPollUrl(config, query);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        "User-Agent": "geo-content-checker-b1-validation",
      },
      redirect: "manual",
      signal,
    });
  } catch {
    if (signal.aborted) return [];
    throw new B1RuntimeLogStreamFailure("network-error");
  }
  if (!response.ok) {
    throw new B1RuntimeLogStreamFailure("http-error");
  }
  const payload: unknown = await response.json().catch(() => null);
  const matches = parseB1RuntimeLogPollPayload(payload, query);
  if (matches === null) {
    throw new B1RuntimeLogStreamFailure("invalid-response");
  }
  return matches;
}

export function parseB1RuntimeLogPollPayload(
  payload: unknown,
  query: Pick<B1RuntimeLogPollQuery, "requestId" | "route">,
): B1RuntimeLogPollRecord[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.rows)) return null;
  const matches: B1RuntimeLogPollRecord[] = [];
  for (const row of payload.rows) {
    const records = new Map<string, B1RuntimeLogRecord>();
    collectRuntimeLogRecords(row, records);
    const generatedAtMs = runtimeLogGeneratedAtMs(row);
    for (const record of records.values()) {
      if (record.requestId !== query.requestId || record.route !== query.route) continue;
      matches.push({ record, generatedAtMs });
    }
  }
  return matches;
}

async function consumeRuntimeLogStream(
  config: B1RuntimeLogConfig,
  signal: AbortSignal,
  handlers: {
    connected: () => void;
    record: (record: B1RuntimeLogRecord, generatedAtMs?: number | null) => void;
  },
): Promise<void> {
  const endpoint = buildB1RuntimeLogStreamUrl(config);

  const consumeLine = (rawLine: string) => {
    const line = rawLine.trim().replace(/^data:\s*/, "");
    if (!line) return;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      return;
    }
    const records = new Map<string, B1RuntimeLogRecord>();
    collectRuntimeLogRecords(event, records);
    const generatedAtMs = runtimeLogGeneratedAtMs(event);
    for (const record of records.values()) handlers.record(record, generatedAtMs);
  };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        "User-Agent": "geo-content-checker-b1-validation",
      },
      redirect: "manual",
      signal,
    });
  } catch {
    if (signal.aborted) return;
    throw new B1RuntimeLogStreamFailure("network-error");
  }
  if (!response.ok) {
    throw new B1RuntimeLogStreamFailure("http-error");
  }
  if (!response.body) {
    throw new B1RuntimeLogStreamFailure("invalid-response");
  }

  handlers.connected();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) consumeLine(line);
    }
    buffer += decoder.decode();
    if (buffer) consumeLine(buffer);
  } catch {
    if (signal.aborted) return;
    throw new B1RuntimeLogStreamFailure("stream-error");
  }
  if (!signal.aborted) {
    throw new B1RuntimeLogStreamFailure("stream-ended");
  }
}

export function parseB1RuntimeLogHistoryBody(raw: string): B1RuntimeLogRecord[] {
  const records = new Map<string, B1RuntimeLogRecord>();
  try {
    collectRuntimeLogRecords(JSON.parse(raw), records);
  } catch {
    for (const rawLine of raw.split("\n")) {
      const line = rawLine.trim().replace(/^data:\s*/, "");
      if (!line) continue;
      try {
        collectRuntimeLogRecords(JSON.parse(line), records);
      } catch {
        continue;
      }
    }
  }
  return [...records.values()];
}

export function startB1RuntimeLogCollector(
  configPromise: Promise<B1RuntimeLogConfig | null>,
  options: B1RuntimeLogCollectorOptions = {},
): B1RuntimeLogCollector {
  const maxDrainMs = Math.max(0, options.maxDrainMs ?? 60_000);
  const reconnectDelayMs = Math.max(0, options.reconnectDelayMs ?? 250);
  const readinessStabilityMs = Math.max(
    0,
    options.readinessStabilityMs ?? 2_000,
  );
  const recordPollIntervalMs = Math.max(
    1,
    options.recordPollIntervalMs ?? 500,
  );
  const recordPollRequestTimeoutMs = Math.max(
    1,
    options.recordPollRequestTimeoutMs ?? 5_000,
  );
  const recordPollStartDelayMs = Math.max(
    0,
    options.recordPollStartDelayMs ?? 500,
  );
  const historyTimeoutMs = Math.max(0, options.historyTimeoutMs ?? 60_000);
  const historyPollIntervalMs = Math.max(0, options.historyPollIntervalMs ?? 5_000);
  const historyPollWindowMs = Math.max(1, options.historyPollWindowMs ?? 10_000);
  const historyStablePollCount = Math.max(
    2,
    Math.floor(options.historyStablePollCount ?? 3),
  );
  const historyStabilityMs = Math.max(
    0,
    options.historyStabilityMs ?? historyTimeoutMs,
  );
  const stream = options.stream ?? consumeRuntimeLogStream;
  const recordPoll =
    options.recordPoll ?? (options.stream === undefined ? pollRuntimeLogs : undefined);
  const history = options.history;
  const wait = options.wait ?? ((milliseconds: number) =>
    new Promise<void>((resolvePromise) => setTimeout(resolvePromise, milliseconds)));
  const now = options.now ?? Date.now;
  const collectorStartedAt = now();
  const expected = new Map<
    string,
    {
      registeredAt: number;
      requestStartedAt: number;
      liveConnectionGeneration: number | null;
      lastSuccessfulPollAt: number | null;
      pollCoverageComplete: boolean;
      waitTimedOutAt: number | null;
    }
  >();
  const observations = new Map<
    string,
    {
      record: B1RuntimeLogRecord;
      generatedAtMs: number | null;
      observedAt: number;
      origin: "live" | "poll" | "history";
    }
  >();
  const timings = new Map<string, B1RuntimeLogTiming>();
  let terminalUnavailable = false;
  let degradedMode = false;
  let stopped = false;
  let resolvedConfig: B1RuntimeLogConfig | null = null;
  let activeController: AbortController | null = null;
  let finishedResult: B1RuntimeLogCollectionResult | null = null;
  let liveConnectionAttempts = 0;
  let liveSuccessfulConnections = 0;
  let liveInterruptions = 0;
  let boundedPollAttempts = 0;
  let boundedPollFailures = 0;
  let boundedPollMatches = 0;
  let liveConnectionGeneration = 0;
  let liveConnectionStartedAt: number | null = null;
  let liveConnected = false;
  let liveStable = false;
  let readinessTimer: ReturnType<typeof setTimeout> | null = null;
  let collectorReadyAt: number | null = null;
  let collectorDisconnectedAt: number | null = null;
  let disconnectReason: B1RuntimeLogDisconnectReason | null = null;
  const liveConnectionWaiters = new Set<
    (readiness: "connected" | "unavailable") => void
  >();

  const settleLiveConnectionWaiters = (
    readiness: "connected" | "unavailable",
  ) => {
    for (const resolveWaiter of liveConnectionWaiters) resolveWaiter(readiness);
    liveConnectionWaiters.clear();
  };

  const clearReadinessTimer = () => {
    if (readinessTimer === null) return;
    clearTimeout(readinessTimer);
    readinessTimer = null;
  };

  const markCollectorUnavailable = (
    reason: B1RuntimeLogDisconnectReason,
    disconnectedAt: number | null = null,
  ) => {
    clearReadinessTimer();
    terminalUnavailable = true;
    degradedMode = false;
    liveConnected = false;
    liveStable = false;
    disconnectReason = reason;
    if (disconnectedAt !== null) collectorDisconnectedAt = disconnectedAt;
    settleLiveConnectionWaiters("unavailable");
  };

  const pollingFallbackAvailable = () =>
    recordPoll !== undefined && resolvedConfig !== null;

  const collectorOperational = () =>
    !terminalUnavailable &&
    !stopped &&
    (
      (liveConnected && liveStable) ||
      (degradedMode && pollingFallbackAvailable())
    );

  const markRealtimeDegraded = (
    reason: B1RuntimeLogDisconnectReason,
    disconnectedAt: number,
  ) => {
    clearReadinessTimer();
    degradedMode = true;
    liveConnected = false;
    liveStable = false;
    disconnectReason = reason;
    collectorDisconnectedAt = disconnectedAt;
    settleLiveConnectionWaiters("connected");
  };

  const observeRecord = (
    record: B1RuntimeLogRecord,
    origin: "live" | "poll" | "history",
    generatedAtMs: number | null = null,
  ): boolean => {
    const key = runtimeLogKey(record.requestId, record.route);
    if (observations.has(key)) return false;
    observations.set(key, {
      record,
      generatedAtMs,
      observedAt: now(),
      origin,
    });
    if (observations.size > 1_024) {
      const oldestKey = observations.keys().next().value;
      if (typeof oldestKey === "string") observations.delete(oldestKey);
    }
    return true;
  };

  const recordTiming = (key: string, matchedAtMs: number) => {
    if (timings.has(key)) return;
    const expectation = expected.get(key);
    const observation = observations.get(key);
    if (!expectation || !observation) return;
    timings.set(key, {
      requestCompletedAtMs: expectation.registeredAt,
      runtimeLogGeneratedAtMs: observation.generatedAtMs,
      collectorReceivedAtMs: observation.observedAt,
      requestIdMatchedAtMs: matchedAtMs,
      generationLatencyMs:
        observation.generatedAtMs === null
          ? null
          : Math.max(0, observation.generatedAtMs - expectation.registeredAt),
      deliveryLatencyMs:
        observation.generatedAtMs === null
          ? null
          : Math.max(0, observation.observedAt - observation.generatedAtMs),
      matchLatencyMs: Math.max(0, matchedAtMs - expectation.registeredAt),
    });
  };

  const registerCall = (call: B1CallRecord): string | null => {
    if (stopped) return null;
    const requestId = normalizeRequestId(call.requestId);
    if (!requestId || !Object.values(B1_OPERATION_ROUTES).includes(call.route)) return null;
    const key = runtimeLogKey(requestId, call.route);
    if (expected.has(key)) return key;
    const registeredAt = now();
    const durationMs = normalizeDuration(call.durationMs) ?? 0;
    const requestStartedAt = Math.max(collectorStartedAt, registeredAt - durationMs);
    expected.set(key, {
      registeredAt,
      requestStartedAt,
      liveConnectionGeneration:
        liveConnected &&
        liveStable &&
        liveConnectionStartedAt !== null &&
        liveConnectionStartedAt <= requestStartedAt
          ? liveConnectionGeneration
          : null,
      lastSuccessfulPollAt: null,
      pollCoverageComplete: false,
      waitTimedOutAt: null,
    });
    return key;
  };

  const streamRunner = (async () => {
    let config: B1RuntimeLogConfig | null;
    try {
      config = await configPromise;
    } catch {
      markCollectorUnavailable("config-unavailable");
      return;
    }
    if (!config) {
      markCollectorUnavailable("config-unavailable");
      return;
    }
    resolvedConfig = config;

    while (!stopped && !terminalUnavailable) {
      liveConnectionAttempts += 1;
      const controller = new AbortController();
      activeController = controller;
      let connectionEstablished = false;
      let attemptDisconnectReason: B1RuntimeLogDisconnectReason = "unknown";
      try {
        await stream(config, controller.signal, {
          connected: () => {
            if (connectionEstablished) return;
            liveSuccessfulConnections += 1;
            connectionEstablished = true;
            liveConnectionStartedAt = now();
            liveConnected = true;
            liveStable = false;
            degradedMode = false;
            const markStable = () => {
              readinessTimer = null;
              if (
                stopped ||
                terminalUnavailable ||
                !liveConnected ||
                activeController !== controller
              ) {
                return;
              }
              liveStable = true;
              if (collectorReadyAt === null) collectorReadyAt = now();
              settleLiveConnectionWaiters("connected");
            };
            if (readinessStabilityMs === 0) {
              markStable();
            } else {
              readinessTimer = setTimeout(markStable, readinessStabilityMs);
            }
          },
          record: (record, generatedAtMs) => {
            observeRecord(record, "live", generatedAtMs ?? null);
          },
        });
        attemptDisconnectReason = "stream-ended";
      } catch (error) {
        if (!controller.signal.aborted) {
          attemptDisconnectReason = runtimeLogDisconnectReason(error);
        }
      } finally {
        if (activeController === controller) activeController = null;
      }

      if (stopped || controller.signal.aborted) break;
      if (connectionEstablished) {
        const wasStable = liveStable;
        liveInterruptions += 1;
        liveConnectionGeneration += 1;
        liveConnectionStartedAt = null;
        if (wasStable && pollingFallbackAvailable()) {
          markRealtimeDegraded(attemptDisconnectReason, now());
          break;
        }
        markCollectorUnavailable(attemptDisconnectReason, now());
        break;
      }

      if (!terminalUnavailable) {
        try {
          await wait(reconnectDelayMs);
        } catch {
          markCollectorUnavailable("wait-failed");
          return;
        }
      }
    }
  })().catch(() => {
    markCollectorUnavailable("unknown");
  });

  return {
    register(call) {
      try {
        registerCall(call);
      } catch {
        markCollectorUnavailable("unknown");
      }
    },
    async waitForLiveConnection(timeoutMs = 15_000) {
      if (terminalUnavailable || stopped) return "unavailable";
      if (collectorOperational()) return "connected";
      const boundedTimeoutMs = Math.max(0, Math.floor(timeoutMs));
      return new Promise<"connected" | "unavailable" | "timeout">((resolvePromise) => {
        const resolveReadiness = (readiness: "connected" | "unavailable") => {
          clearTimeout(timeout);
          resolvePromise(readiness);
        };
        const timeout = setTimeout(() => {
          liveConnectionWaiters.delete(resolveReadiness);
          resolvePromise("timeout");
        }, boundedTimeoutMs);
        liveConnectionWaiters.add(resolveReadiness);
      });
    },
    async waitForRecord(call, timeoutMs = 30_000) {
      let key: string | null;
      try {
        key = registerCall(call);
      } catch {
        markCollectorUnavailable("unknown");
        return "collector-unavailable";
      }
      if (!key) return "not-applicable";
      if (observations.has(key)) {
        recordTiming(key, now());
        return "matched";
      }
      if (!collectorOperational()) {
        return "collector-unavailable";
      }

      const boundedTimeoutMs = Math.max(0, Math.floor(timeoutMs));
      const deadline = now() + boundedTimeoutMs;
      let nextPollAt = now() + recordPollStartDelayMs;
      while (true) {
        if (observations.has(key)) {
          recordTiming(key, now());
          return "matched";
        }
        if (!collectorOperational()) {
          return "collector-unavailable";
        }
        const currentTime = now();
        if (currentTime >= deadline) {
          const expectation = expected.get(key);
          if (expectation) {
            expectation.waitTimedOutAt = currentTime;
            expectation.pollCoverageComplete =
              expectation.lastSuccessfulPollAt !== null &&
              currentTime - expectation.lastSuccessfulPollAt <=
                Math.max(1_000, recordPollIntervalMs * 2);
          }
          return "timeout";
        }

        if (recordPoll && resolvedConfig && currentTime >= nextPollAt) {
          boundedPollAttempts += 1;
          const pollController = new AbortController();
          const pollTimeout = setTimeout(
            () => pollController.abort(),
            recordPollRequestTimeoutMs,
          );
          try {
            const expectation = expected.get(key);
            if (expectation) {
              expectation.pollCoverageComplete = false;
            }
            const polled = await recordPoll(
              resolvedConfig,
              {
                requestId: normalizeRequestId(call.requestId) as string,
                route: call.route,
                sinceMs: Math.max(
                  0,
                  (expectation?.requestStartedAt ?? currentTime) - 20_000,
                ),
                untilMs: Math.max(currentTime, now()),
              },
              pollController.signal,
            );
            if (pollController.signal.aborted) {
              boundedPollFailures += 1;
            } else {
              if (expectation) expectation.lastSuccessfulPollAt = now();
              for (const item of polled) {
                if (
                  item.record.requestId !== normalizeRequestId(call.requestId) ||
                  item.record.route !== call.route
                ) {
                  continue;
                }
                if (observeRecord(item.record, "poll", item.generatedAtMs)) {
                  boundedPollMatches += 1;
                }
              }
            }
          } catch {
            boundedPollFailures += 1;
          } finally {
            clearTimeout(pollTimeout);
          }
          if (observations.has(key)) {
            recordTiming(key, now());
            return "matched";
          }
          nextPollAt = now() + recordPollIntervalMs;
          continue;
        }

        const untilNextPoll = recordPoll
          ? Math.max(1, nextPollAt - currentTime)
          : 100;
        const waitMs = Math.max(
          1,
          Math.min(100, deadline - currentTime, untilNextPoll),
        );
        try {
          await wait(waitMs);
        } catch {
          markCollectorUnavailable("wait-failed");
          return "collector-unavailable";
        }
      }
    },
    async finish(batchCompletedAt = now()) {
      if (finishedResult) return finishedResult;
      const closedBeforeFinish = stopped;

      try {
        const deadline = now() + maxDrainMs;
        const allMatched = () =>
          [...expected.entries()].every(
            ([key, expectation]) =>
              observations.has(key) || expectation.waitTimedOutAt !== null,
          );
        while (
          expected.size > 0 &&
          !allMatched() &&
          !terminalUnavailable &&
          !stopped &&
          now() < deadline
        ) {
          const remainingMs = Math.max(0, deadline - now());
          await wait(Math.min(250, remainingMs));
        }
      } catch {
        markCollectorUnavailable("wait-failed");
      }

      const missingKeys = [...expected.keys()].filter((key) => !observations.has(key));
      let historicalBackfill: B1RuntimeLogCollectorState["historicalBackfill"] =
        missingKeys.length ? "unavailable" : "not-needed";
      let historyStable = false;
      if (missingKeys.length && !stopped && resolvedConfig && history) {
        const historyController = new AbortController();
        const historyTimeout = setTimeout(
          () => historyController.abort(),
          Math.max(1, historyTimeoutMs),
        );
        const historyStartedAt = now();
        const historyDeadline = historyStartedAt + historyTimeoutMs;
        const maxHistoryPolls = Math.max(
          historyStablePollCount,
          Math.ceil(historyTimeoutMs / Math.max(1, historyPollIntervalMs)) + 1,
        );
        let historyPolls = 0;
        let stablePolls = 0;
        let stableSince = historyStartedAt;
        let previousSignature: string | null = null;
        try {
          while (!historyController.signal.aborted && historyPolls < maxHistoryPolls) {
            historyPolls += 1;
            try {
              const remainingMs = Math.max(0, historyDeadline - now());
              const historyPollController = new AbortController();
              const abortHistoryPoll = () => historyPollController.abort();
              historyController.signal.addEventListener("abort", abortHistoryPoll, {
                once: true,
              });
              const historyPollTimeout = setTimeout(
                () => historyPollController.abort(),
                Math.max(1, Math.min(historyPollWindowMs, remainingMs)),
              );
              let historicalRecords: B1RuntimeLogRecord[];
              try {
                historicalRecords = await history(
                  resolvedConfig,
                  {
                    sinceMs: Math.max(0, collectorStartedAt - 20_000),
                    untilMs: Math.max(batchCompletedAt, now()),
                  },
                  historyPollController.signal,
                );
              } finally {
                clearTimeout(historyPollTimeout);
                historyController.signal.removeEventListener("abort", abortHistoryPoll);
              }
              for (const record of historicalRecords) {
                const key = runtimeLogKey(record.requestId, record.route);
                if (!expected.has(key)) continue;
                observeRecord(record, "history");
              }

              const matchedKeys = [...expected.keys()]
                .filter((key) => observations.has(key))
                .sort();
              if (matchedKeys.length === expected.size) {
                historyStable = true;
                break;
              }
              const signature = matchedKeys.join("\u0000");
              if (signature === previousSignature) {
                stablePolls += 1;
              } else {
                previousSignature = signature;
                stablePolls = 1;
                stableSince = now();
              }
              if (
                stablePolls >= historyStablePollCount &&
                now() - stableSince >= historyStabilityMs
              ) {
                historyStable = true;
                break;
              }
            } catch {
              if (historyController.signal.aborted) break;
              previousSignature = null;
              stablePolls = 0;
              stableSince = now();
            }

            const remainingMs = Math.max(0, historyDeadline - now());
            if (remainingMs === 0) break;
            await wait(Math.min(historyPollIntervalMs, remainingMs));
          }
          historicalBackfill = historyStable ? "complete" : "unavailable";
        } catch {
          historicalBackfill = "unavailable";
        } finally {
          clearTimeout(historyTimeout);
        }
      }

      const collectorMode: B1RuntimeLogCollectorMode =
        terminalUnavailable || closedBeforeFinish
          ? "unavailable"
          : degradedMode && pollingFallbackAvailable()
            ? "degraded"
            : liveConnected && liveStable
              ? "live"
              : "unavailable";
      stopped = true;
      clearReadinessTimer();
      activeController?.abort();
      liveConnected = false;
      liveStable = false;
      await streamRunner;

      const records = new Map<string, B1RuntimeLogRecord>();
      const statuses = new Map<string, B1RuntimeLogStatus>();
      for (const [key, expectation] of expected) {
        const observation = observations.get(key);
        if (observation) {
          recordTiming(key, now());
          records.set(key, observation.record);
          statuses.set(
            key,
            observation.origin === "history" || observation.observedAt > batchCompletedAt
              ? "delayed-ingestion"
              : "matched",
          );
        } else {
          const hasContinuousLiveCoverage =
            expectation.liveConnectionGeneration !== null &&
            expectation.liveConnectionGeneration === liveConnectionGeneration &&
            liveConnectionStartedAt !== null &&
            liveConnectionStartedAt <= expectation.requestStartedAt &&
            expectation.registeredAt <= batchCompletedAt;
          statuses.set(
            key,
            (
              expectation.pollCoverageComplete ||
              (hasContinuousLiveCoverage && !terminalUnavailable && !closedBeforeFinish)
            )
              ? "true-missing"
              : "collector-unavailable",
          );
        }
      }

      const matchedCount = records.size;
      const result: B1RuntimeLogCollectionResult = {
        records,
        statuses,
        timings,
        collectorState: {
          collectorMode,
          liveConnectionAttempts,
          liveSuccessfulConnections,
          liveInterruptions,
          boundedPollAttempts,
          boundedPollFailures,
          boundedPollMatches,
          historicalBackfill,
          collectorReadyAt,
          collectorDisconnectedAt,
          disconnectReason,
          matchedCount,
          unmatchedCount: Math.max(0, expected.size - matchedCount),
        },
      };
      finishedResult = result;
      return result;
    },
    close() {
      stopped = true;
      clearReadinessTimer();
      activeController?.abort();
      liveConnected = false;
      liveStable = false;
      settleLiveConnectionWaiters("unavailable");
      void streamRunner;
    },
  };
}

function applyRuntimeLogRecords(
  calls: B1CallRecord[],
  collection: B1RuntimeLogCollectionResult,
): B1CallRecord[] {
  return calls.map((call) => {
    const requestId = normalizeRequestId(call.requestId);
    if (!requestId) {
      return {
        ...call,
        runtimeLogStatus: call.runtimeLogStatus ?? "not-applicable",
      };
    }
    const key = runtimeLogKey(requestId, call.route);
    const runtime = collection.records.get(key);
    const runtimeLogStatus =
      collection.statuses.get(key) ??
      normalizeRuntimeLogStatus(call.runtimeLogStatus) ??
      "collector-unavailable";
    if (!runtime || runtime.route !== call.route) {
      return { ...call, runtimeLogStatus };
    }
    return {
      ...call,
      status: runtime.status,
      source: runtime.source === "none" ? call.source : runtime.source,
      modelStatus: runtime.modelStatus,
      modelLatencyMs: runtime.modelLatencyMs,
      providerRequestStartAt: runtime.providerRequestStartAt ?? null,
      firstByteAt: runtime.firstByteAt ?? null,
      firstTokenAt: runtime.firstTokenAt ?? null,
      responseCompletedAt: runtime.responseCompletedAt ?? null,
      abortedAt: runtime.abortedAt ?? null,
      streamDurationMs: runtime.streamDurationMs ?? null,
      contentPresent: runtime.contentPresent ?? null,
      contentLength: runtime.contentLength ?? null,
      finishReason: runtime.finishReason,
      promptTokens: runtime.promptTokens ?? null,
      completionTokens: runtime.completionTokens,
      reasoningTokens: runtime.reasoningTokens ?? null,
      totalTokens: runtime.totalTokens ?? null,
      durationMs: runtime.durationMs,
      requestId,
      runtimeLogStatus,
      validationStage: runtime.validationStage,
      validationIssueCount: runtime.validationIssueCount,
      validationFailureClassification: runtime.validationFailureClassification,
      validationFieldPaths: runtime.validationFieldPaths,
      validationActionTypes: runtime.validationActionTypes,
      validationReceivedType: runtime.validationReceivedType ?? null,
      validationExpectedType: runtime.validationExpectedType ?? null,
      validationIssueCode: runtime.validationIssueCode ?? null,
      responseLength: runtime.responseLength ?? null,
      trimmedLength: runtime.trimmedLength ?? null,
      firstCharType: runtime.firstCharType ?? null,
      lastCharType: runtime.lastCharType ?? null,
      startsWithCodeFence: runtime.startsWithCodeFence ?? null,
      endsWithCodeFence: runtime.endsWithCodeFence ?? null,
      parserErrorName: runtime.parserErrorName ?? null,
      parserErrorPosition: runtime.parserErrorPosition ?? null,
      jsonErrorCategory: runtime.jsonErrorCategory ?? null,
      parserErrorCategory: runtime.parserErrorCategory ?? null,
      lastCharacterCategory: runtime.lastCharacterCategory ?? null,
      containsMultipleTopLevelValues:
        runtime.containsMultipleTopLevelValues ?? null,
      hasLeadingNonWhitespaceText:
        runtime.hasLeadingNonWhitespaceText ?? null,
      hasTrailingNonWhitespaceText:
        runtime.hasTrailingNonWhitespaceText ?? null,
    };
  });
}

async function verifyHealth(baseUrl: string, bypassSecret: string): Promise<JsonRecord> {
  const result = await requestJson({
    baseUrl,
    bypassSecret,
    route: "/api/health",
    method: "GET",
    expectModelSource: false,
  });
  if (result.record.outcome !== "success" || !isRecord(result.payload)) {
    throw new Error(`Preview Health preflight failed with ${result.record.outcome}.`);
  }
  if (result.payload.status !== "ok" || !isRecord(result.payload.checks)) {
    throw new Error("Preview Health preflight did not return status=ok.");
  }
  for (const key of HEALTH_CHECK_KEYS) {
    if (result.payload.checks[key] !== true) {
      throw new Error(`Preview Health preflight failed check: ${key}.`);
    }
  }
  return {
    status: "ok",
    checks: Object.fromEntries(HEALTH_CHECK_KEYS.map((key) => [key, true])),
    durationMs: result.record.durationMs,
    requestId: result.record.requestId,
  };
}

function isModelResult(
  result: RequestResult,
): result is RequestResult & { payload: JsonRecord } {
  return result.record.outcome === "model" && isRecord(result.payload);
}

async function runPipeline(params: {
  article: B1CorpusArticle;
  stage: B1Stage;
  round: B1Round;
  baseUrl: string;
  bypassSecret: string;
  callDelayMs: number;
  runtimeLogCollector: B1RuntimeLogCollector;
  contentDraftArtifactDirectory?: string;
}): Promise<B1PipelineRecord> {
  const paragraphs = createNumberedParagraphs(params.article.content);
  const clientId = randomUUID();
  const sleep = (milliseconds: number) =>
    milliseconds > 0 ? new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)) : null;
  const call = async (
    operation: B1PipelineOperation,
    route: string,
    body: unknown,
    token: string,
  ) => {
    await sleep(params.callDelayMs);
    const result = await requestJson({
      baseUrl: params.baseUrl,
      bypassSecret: params.bypassSecret,
      route,
      method: "POST",
      body,
      clientId,
      token,
      expectModelSource: true,
    });
    const record = operationRecord(operation, result);
    params.runtimeLogCollector.register(record);
    return { result, record };
  };

  const session = await requestJson({
    baseUrl: params.baseUrl,
    bypassSecret: params.bypassSecret,
    route: "/api/analysis-session",
    method: "POST",
    body: {},
    clientId,
    expectModelSource: false,
  });
  if (
    session.record.outcome !== "success" ||
    !isRecord(session.payload) ||
    typeof session.payload.token !== "string"
  ) {
    throw new Error(`Analysis session failed with ${session.record.outcome}.`);
  }
  const token = session.payload.token;
  const calls: B1CallRecord[] = [];

  const scoringCall = await call(
    "scoring",
    "/api/evaluate-scoring",
    {
      title: params.article.title,
      content: params.article.content,
      publishedAt: params.article.publishedAt,
    },
    token,
  );
  calls.push(scoringCall.record);

  const predictionCall = await call(
    "question_prediction",
    "/api/predict-questions",
    { title: params.article.title, numbered_paragraphs: paragraphs },
    token,
  );
  calls.push(predictionCall.record);

  let canonicalQuestions: B1DiagnosticQuestion[] | undefined;
  if (isModelResult(predictionCall.result)) {
    canonicalQuestions = selectDiagnosticQuestions(
      predictionCall.result.payload.questions,
      params.article.sourceIndex,
    );
  }

  const diagnostics: unknown[] = [];
  if (canonicalQuestions?.length === 3) {
    for (let index = 0; index < canonicalQuestions.length; index += 1) {
      const diagnosticCall = await call(
        `diagnose_${index + 1}` as B1PipelineOperation,
        "/api/qa-diagnostic",
        {
          title: params.article.title,
          numbered_paragraphs: paragraphs,
          question: canonicalQuestions[index].question,
        },
        token,
      );
      calls.push(diagnosticCall.record);
      if (isModelResult(diagnosticCall.result)) diagnostics.push(diagnosticCall.result.payload);
    }
  } else {
    for (let index = 0; index < 3; index += 1) {
      calls.push(
        skippedCall(
          `diagnose_${index + 1}` as B1PipelineOperation,
          "/api/qa-diagnostic",
        ),
      );
    }
  }

  let contentDraft: unknown;
  if (diagnostics.length === 3) {
    const adviceCall = await call(
      "advice",
      "/api/generate-patches",
      {
        title: params.article.title,
        numbered_paragraphs: paragraphs,
        diagnostics,
        mode: "advice",
      },
      token,
    );
    calls.push(adviceCall.record);

    const contentDraftCall = await call(
      "content_draft",
      "/api/generate-patches",
      {
        title: params.article.title,
        numbered_paragraphs: paragraphs,
        diagnostics,
        mode: "content_draft",
      },
      token,
    );
    calls.push(contentDraftCall.record);
    if (isModelResult(contentDraftCall.result)) {
      const contentDraftPayload = contentDraftCall.result.payload;
      contentDraft = contentDraftPayload;
      if (params.contentDraftArtifactDirectory) {
        const markdown = contentDraftPayload.markdown;
        const requestId = contentDraftCall.record.requestId;
        if (typeof markdown !== "string" || !markdown.trim() || !requestId) {
          throw new Error("B.2 Content Draft artifact source is incomplete.");
        }
        const artifact = buildB2ContentDraftArtifact({
          articleId: params.article.id,
          stage: params.stage,
          sourceRequestId: requestId,
          generatedAt: new Date().toISOString(),
          title: params.article.title,
          content: params.article.content,
          markdown,
        });
        assertB2ContentDraftArtifactInput(artifact, {
          title: params.article.title,
          content: params.article.content,
        });
        await writeB2ContentDraftArtifactAtomic(
          params.contentDraftArtifactDirectory,
          artifact,
          b2ContentDraftArtifactFilename(
            params.article.id,
            params.stage,
            params.round,
          ),
        );
      }
    }
  } else {
    calls.push(
      skippedCall("advice", "/api/generate-patches"),
      skippedCall("content_draft", "/api/generate-patches"),
    );
  }

  if (
    calls.length !== B1_MODEL_CALLS_PER_PIPELINE ||
    calls.some((callRecord, index) => callRecord.operation !== B1_PIPELINE_OPERATIONS[index])
  ) {
    throw new Error("B.1 pipeline call order does not match the fixed seven-call contract.");
  }

  const evidenceSummary = literalEvidenceSummary(diagnostics, contentDraft, paragraphs);
  const scoringSummary = isModelResult(scoringCall.result)
    ? normalizedScoring(scoringCall.result.payload)
    : {};
  const diagnosticAnswerability = diagnostics
    .map((diagnostic) =>
      isRecord(diagnostic) ? normalizeAnswerability(diagnostic.answerability) : null,
    )
    .filter((value): value is B1Answerability => value !== null);
  return {
    articleId: params.article.id,
    stage: params.stage,
    round: params.round,
    questionTypes: canonicalQuestions?.map((question) => question.type) ?? [],
    calls,
    ...scoringSummary,
    diagnosticAnswerability,
    evidenceLiteralChecks: evidenceSummary.checks,
    evidenceLiteralPasses: evidenceSummary.passes,
    evidenceLiteralValid:
      diagnostics.length === 3 && evidenceSummary.checks === evidenceSummary.passes,
    contentDraftFactsPreserved:
      contentDraft === undefined ? null : contentDraftFactsArePreserved(contentDraft, paragraphs),
    contentDraftStructurePreserved:
      contentDraft === undefined ? null : contentDraftStructureIsPreserved(contentDraft, paragraphs),
  };
}

function outputRoot(cwd: string): string {
  return resolve(cwd, "outputs", "b1");
}

function assertOutputPath(cwd: string, path: string): void {
  const root = outputRoot(cwd);
  const pathFromRoot = relative(root, resolve(path));
  if (!pathFromRoot || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
    throw new Error("B.1 artifacts must remain inside outputs/b1.");
  }
}

async function writeTextAtomic(cwd: string, path: string, value: string): Promise<void> {
  assertOutputPath(cwd, path);
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, value, "utf8");
  await rename(temporaryPath, path);
}

async function writeJsonAtomic(cwd: string, path: string, value: unknown): Promise<void> {
  await writeTextAtomic(cwd, path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeCheckpointAtomic(
  cwd: string,
  path: string,
  checkpoint: B1Checkpoint,
): Promise<void> {
  await writeTextAtomic(cwd, path, serializeB1CheckpointArtifact(checkpoint));
}

async function readJsonIfPresent(path: string): Promise<unknown | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

function checkpointPath(campaignDirectory: string, stage: B1Stage, round: B1Round): string {
  return join(campaignDirectory, `stage-${stage}-round-${round}.json`);
}

function persistedOutcome(record: B1PersistedCallRecord): B1CallOutcome {
  if (record.source === "model") return "model";
  if (record.source === "fallback" || record.errorClassification === "fallback") {
    return "fallback";
  }
  switch (record.errorClassification) {
    case null:
      return "success";
    case "timeout":
      return "timeout";
    case "429":
      return "rate-limited";
    case "network-error":
      return "network-error";
    case "invalid-response":
    case "invalid-output":
    case "runtime-log-missing":
    case "runtime-log-incomplete":
      return "invalid-response";
    case "invalid-source":
      return "invalid-source";
    case "protection-blocked":
      return "protection-blocked";
    case "skipped":
      return "skipped";
    case "http-error":
    case "model-failed":
      return "http-error";
  }
}

function parsePersistedCall(value: unknown, operation: B1PipelineOperation): B1CallRecord {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "requestId",
      "route",
      "httpStatus",
      "source",
      "modelStatus",
      "modelLatencyMs",
      "providerRequestStartAt",
      "firstByteAt",
      "firstTokenAt",
      "responseCompletedAt",
      "abortedAt",
      "streamDurationMs",
      "contentPresent",
      "contentLength",
      "finishReason",
      "promptTokens",
      "completionTokens",
      "reasoningTokens",
      "totalTokens",
      "durationMs",
      "errorClassification",
      "runtimeLogStatus",
      "validationStage",
      "validationIssueCount",
      "validationFailureClassification",
      "validationFieldPaths",
      "validationActionTypes",
      "validationReceivedType",
      "validationExpectedType",
      "validationIssueCode",
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
    ]) ||
    value.route !== B1_OPERATION_ROUTES[operation]
  ) {
    throw new Error("Existing B.1 checkpoint request metadata is invalid.");
  }

  const requestId = value.requestId === null ? null : normalizeRequestId(value.requestId);
  const status = value.httpStatus === null ? null : normalizeHttpStatus(value.httpStatus);
  const source = value.source === null ? null : normalizeSource(value.source);
  const modelStatus =
    value.modelStatus === null ? null : normalizeModelStatus(value.modelStatus);
  const modelLatencyMs =
    value.modelLatencyMs === null ? null : normalizeDuration(value.modelLatencyMs);
  const providerRequestStartAt =
    value.providerRequestStartAt === null
      ? null
      : normalizeDuration(value.providerRequestStartAt);
  const firstByteAt =
    value.firstByteAt === null ? null : normalizeDuration(value.firstByteAt);
  const firstTokenAt =
    value.firstTokenAt === null ? null : normalizeDuration(value.firstTokenAt);
  const responseCompletedAt =
    value.responseCompletedAt === null
      ? null
      : normalizeDuration(value.responseCompletedAt);
  const abortedAt =
    value.abortedAt === null ? null : normalizeDuration(value.abortedAt);
  const streamDurationMs =
    value.streamDurationMs === null
      ? null
      : normalizeDuration(value.streamDurationMs);
  const contentPresent =
    value.contentPresent === null ? null : normalizeTelemetryBoolean(value.contentPresent);
  const contentLength =
    value.contentLength === null ? null : normalizeTokenCount(value.contentLength);
  const finishReason =
    value.finishReason === null ? null : normalizeModelFinishReason(value.finishReason);
  const promptTokens =
    value.promptTokens === null ? null : normalizeTokenCount(value.promptTokens);
  const completionTokens =
    value.completionTokens === null ? null : normalizeTokenCount(value.completionTokens);
  const reasoningTokens =
    value.reasoningTokens === null ? null : normalizeTokenCount(value.reasoningTokens);
  const totalTokens =
    value.totalTokens === null ? null : normalizeTokenCount(value.totalTokens);
  const durationMs = normalizeDuration(value.durationMs);
  const runtimeLogStatus = normalizeRuntimeLogStatus(value.runtimeLogStatus);
  const validationStage =
    value.validationStage === null ? null : normalizeValidationStage(value.validationStage);
  const validationIssueCount =
    value.validationIssueCount === null
      ? null
      : normalizeValidationIssueCount(value.validationIssueCount);
  const validationFailureClassification =
    value.validationFailureClassification === null
      ? null
      : normalizeValidationFailureClassification(value.validationFailureClassification);
  const validationFieldPaths = normalizeValidationFieldPaths(value.validationFieldPaths);
  const validationActionTypes = normalizeValidationActionTypes(value.validationActionTypes);
  const validationReceivedType =
    value.validationReceivedType === null
      ? null
      : normalizeValidationReceivedType(value.validationReceivedType);
  const validationExpectedType =
    value.validationExpectedType === null
      ? null
      : normalizeValidationExpectedType(value.validationExpectedType);
  const validationIssueCode =
    value.validationIssueCode === null
      ? null
      : normalizeValidationIssueCode(value.validationIssueCode);
  const responseLength =
    value.responseLength === null ? null : normalizeTokenCount(value.responseLength);
  const trimmedLength =
    value.trimmedLength === null ? null : normalizeTokenCount(value.trimmedLength);
  const firstCharType =
    value.firstCharType === null
      ? null
      : normalizeJsonBoundaryCharacterType(value.firstCharType);
  const lastCharType =
    value.lastCharType === null
      ? null
      : normalizeJsonBoundaryCharacterType(value.lastCharType);
  const startsWithCodeFence =
    value.startsWithCodeFence === null
      ? null
      : normalizeTelemetryBoolean(value.startsWithCodeFence);
  const endsWithCodeFence =
    value.endsWithCodeFence === null
      ? null
      : normalizeTelemetryBoolean(value.endsWithCodeFence);
  const parserErrorName =
    value.parserErrorName === null
      ? null
      : normalizeJsonParserErrorName(value.parserErrorName);
  const parserErrorPosition =
    value.parserErrorPosition === null
      ? null
      : normalizeTokenCount(value.parserErrorPosition);
  const jsonErrorCategory =
    value.jsonErrorCategory === null
      ? null
      : normalizeJsonErrorCategory(value.jsonErrorCategory);
  const parserErrorCategory =
    value.parserErrorCategory === null
      ? null
      : normalizeJsonErrorCategory(value.parserErrorCategory);
  const lastCharacterCategory =
    value.lastCharacterCategory === null
      ? null
      : normalizeJsonLastCharacterCategory(value.lastCharacterCategory);
  const containsMultipleTopLevelValues =
    value.containsMultipleTopLevelValues === null
      ? null
      : normalizeTelemetryBoolean(value.containsMultipleTopLevelValues);
  const hasLeadingNonWhitespaceText =
    value.hasLeadingNonWhitespaceText === null
      ? null
      : normalizeTelemetryBoolean(value.hasLeadingNonWhitespaceText);
  const hasTrailingNonWhitespaceText =
    value.hasTrailingNonWhitespaceText === null
      ? null
      : normalizeTelemetryBoolean(value.hasTrailingNonWhitespaceText);
  const errorClassification =
    value.errorClassification === null
      ? null
      : isOneOf(value.errorClassification, B1_ERROR_CLASSIFICATIONS)
        ? value.errorClassification
        : undefined;
  if (
    (value.requestId !== null && requestId === null) ||
    (value.httpStatus !== null && status === null) ||
    (value.source !== null && source === null) ||
    (value.modelStatus !== null && modelStatus === null) ||
    (value.modelLatencyMs !== null && modelLatencyMs === null) ||
    (value.providerRequestStartAt !== null && providerRequestStartAt === null) ||
    (value.firstByteAt !== null && firstByteAt === null) ||
    (value.firstTokenAt !== null && firstTokenAt === null) ||
    (value.responseCompletedAt !== null && responseCompletedAt === null) ||
    (value.abortedAt !== null && abortedAt === null) ||
    (value.streamDurationMs !== null && streamDurationMs === null) ||
    (value.contentPresent !== null && contentPresent === null) ||
    (value.contentLength !== null && contentLength === null) ||
    (value.finishReason !== null && finishReason === null) ||
    (value.promptTokens !== null && promptTokens === null) ||
    (value.completionTokens !== null && completionTokens === null) ||
    (value.reasoningTokens !== null && reasoningTokens === null) ||
    (value.totalTokens !== null && totalTokens === null) ||
    (value.responseLength !== null && responseLength === null) ||
    (value.trimmedLength !== null && trimmedLength === null) ||
    (value.firstCharType !== null && firstCharType === null) ||
    (value.lastCharType !== null && lastCharType === null) ||
    (value.startsWithCodeFence !== null && startsWithCodeFence === null) ||
    (value.endsWithCodeFence !== null && endsWithCodeFence === null) ||
    (value.parserErrorName !== null && parserErrorName === null) ||
    (value.parserErrorPosition !== null && parserErrorPosition === null) ||
    (value.jsonErrorCategory !== null && jsonErrorCategory === null) ||
    (value.parserErrorCategory !== null && parserErrorCategory === null) ||
    (value.lastCharacterCategory !== null && lastCharacterCategory === null) ||
    (value.validationReceivedType !== null && validationReceivedType === null) ||
    (value.validationExpectedType !== null && validationExpectedType === null) ||
    (value.validationIssueCode !== null && validationIssueCode === null) ||
    (value.containsMultipleTopLevelValues !== null &&
      containsMultipleTopLevelValues === null) ||
    (value.hasLeadingNonWhitespaceText !== null &&
      hasLeadingNonWhitespaceText === null) ||
    (value.hasTrailingNonWhitespaceText !== null &&
      hasTrailingNonWhitespaceText === null) ||
    durationMs === null ||
    runtimeLogStatus === null ||
    validationFieldPaths === null ||
    validationActionTypes === null ||
    ((validationStage === null) !== (validationIssueCount === null)) ||
    (validationStage === null &&
      (validationFailureClassification !== null ||
        validationFieldPaths.length > 0 ||
        validationActionTypes.length > 0)) ||
    errorClassification === undefined
  ) {
    throw new Error("Existing B.1 checkpoint request metadata is invalid.");
  }

  const persisted: B1PersistedCallRecord = {
    requestId,
    route: value.route,
    httpStatus: status,
    source,
    modelStatus,
    modelLatencyMs,
    providerRequestStartAt,
    firstByteAt,
    firstTokenAt,
    responseCompletedAt,
    abortedAt,
    streamDurationMs,
    contentPresent,
    contentLength,
    finishReason,
    promptTokens,
    completionTokens,
    reasoningTokens,
    totalTokens,
    durationMs,
    errorClassification,
    runtimeLogStatus,
    validationStage,
    validationIssueCount,
    validationFailureClassification,
    validationFieldPaths,
    validationActionTypes,
    validationReceivedType,
    validationExpectedType,
    validationIssueCode,
    responseLength,
    trimmedLength,
    firstCharType,
    lastCharType,
    startsWithCodeFence,
    endsWithCodeFence,
    parserErrorName,
    parserErrorPosition,
    jsonErrorCategory,
    parserErrorCategory,
    lastCharacterCategory,
    containsMultipleTopLevelValues,
    hasLeadingNonWhitespaceText,
    hasTrailingNonWhitespaceText,
  };
  return {
    operation,
    route: persisted.route,
    outcome: persistedOutcome(persisted),
    status: persisted.httpStatus,
    source: persisted.source,
    modelStatus: persisted.modelStatus,
    modelLatencyMs: persisted.modelLatencyMs,
    providerRequestStartAt: persisted.providerRequestStartAt,
    firstByteAt: persisted.firstByteAt,
    firstTokenAt: persisted.firstTokenAt,
    responseCompletedAt: persisted.responseCompletedAt,
    abortedAt: persisted.abortedAt,
    streamDurationMs: persisted.streamDurationMs,
    contentPresent: persisted.contentPresent,
    contentLength: persisted.contentLength,
    finishReason: persisted.finishReason,
    promptTokens: persisted.promptTokens,
    completionTokens: persisted.completionTokens,
    reasoningTokens: persisted.reasoningTokens,
    totalTokens: persisted.totalTokens,
    durationMs: persisted.durationMs,
    requestId: persisted.requestId,
    runtimeLogStatus: persisted.runtimeLogStatus,
    validationStage: persisted.validationStage,
    validationIssueCount: persisted.validationIssueCount,
    validationFailureClassification: persisted.validationFailureClassification,
    validationFieldPaths: persisted.validationFieldPaths,
    validationActionTypes: persisted.validationActionTypes,
    validationReceivedType: persisted.validationReceivedType,
    validationExpectedType: persisted.validationExpectedType,
    validationIssueCode: persisted.validationIssueCode,
    responseLength: persisted.responseLength,
    trimmedLength: persisted.trimmedLength,
    firstCharType: persisted.firstCharType,
    lastCharType: persisted.lastCharType,
    startsWithCodeFence: persisted.startsWithCodeFence,
    endsWithCodeFence: persisted.endsWithCodeFence,
    parserErrorName: persisted.parserErrorName,
    parserErrorPosition: persisted.parserErrorPosition,
    jsonErrorCategory: persisted.jsonErrorCategory,
    parserErrorCategory: persisted.parserErrorCategory,
    lastCharacterCategory: persisted.lastCharacterCategory,
    containsMultipleTopLevelValues:
      persisted.containsMultipleTopLevelValues,
    hasLeadingNonWhitespaceText:
      persisted.hasLeadingNonWhitespaceText,
    hasTrailingNonWhitespaceText:
      persisted.hasTrailingNonWhitespaceText,
  };
}

function parsePersistedPipelineRecord(
  value: unknown,
  stage: B1Stage,
  round: B1Round,
): B1PipelineRecord {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["sampleId", "requests", "aggregate"]) ||
    typeof value.sampleId !== "string" ||
    !/^B1-A(?:0[1-9]|10)$/.test(value.sampleId) ||
    !Array.isArray(value.requests) ||
    value.requests.length !== B1_MODEL_CALLS_PER_PIPELINE ||
    !isRecord(value.aggregate) ||
    !exactKeys(value.aggregate, [
      "questionTypes",
      "totalScore",
      "normalizedDimensions",
      "diagnosticAnswerability",
      "evidenceLiteralChecks",
      "evidenceLiteralPasses",
      "evidenceLiteralValid",
      "contentDraftFactsPreserved",
      "contentDraftStructurePreserved",
    ])
  ) {
    throw new Error(`Existing Stage ${stage} Round ${round} checkpoint is invalid.`);
  }

  const aggregate = value.aggregate;
  const totalScore: number | null | undefined =
    aggregate.totalScore === null ||
    (typeof aggregate.totalScore === "number" && Number.isFinite(aggregate.totalScore))
      ? aggregate.totalScore
      : undefined;
  const normalizedDimensions = isRecord(aggregate.normalizedDimensions)
    ? aggregate.normalizedDimensions
    : undefined;
  const evidenceLiteralChecks =
    typeof aggregate.evidenceLiteralChecks === "number"
      ? aggregate.evidenceLiteralChecks
      : undefined;
  const evidenceLiteralPasses =
    typeof aggregate.evidenceLiteralPasses === "number"
      ? aggregate.evidenceLiteralPasses
      : undefined;
  if (
    !Array.isArray(aggregate.questionTypes) ||
    !aggregate.questionTypes.every((item) => isOneOf(item, B1_QUESTION_TYPES)) ||
    !Array.isArray(aggregate.diagnosticAnswerability) ||
    !aggregate.diagnosticAnswerability.every((item) =>
      isOneOf(item, B1_ANSWERABILITY_VALUES),
    ) ||
    normalizedDimensions === undefined ||
    Object.keys(normalizedDimensions).some(
      (key) =>
        !isOneOf(key, DIMENSION_KEYS) ||
        typeof normalizedDimensions[key] !== "number" ||
        !Number.isFinite(normalizedDimensions[key]),
    ) ||
    totalScore === undefined ||
    evidenceLiteralChecks === undefined ||
    !Number.isInteger(evidenceLiteralChecks) ||
    evidenceLiteralChecks < 0 ||
    evidenceLiteralPasses === undefined ||
    !Number.isInteger(evidenceLiteralPasses) ||
    evidenceLiteralPasses < 0 ||
    typeof aggregate.evidenceLiteralValid !== "boolean" ||
    (aggregate.contentDraftFactsPreserved !== null &&
      typeof aggregate.contentDraftFactsPreserved !== "boolean") ||
    (aggregate.contentDraftStructurePreserved !== null &&
      typeof aggregate.contentDraftStructurePreserved !== "boolean")
  ) {
    throw new Error(`Existing Stage ${stage} Round ${round} aggregate is invalid.`);
  }

  return {
    articleId: value.sampleId,
    stage,
    round,
    questionTypes: aggregate.questionTypes,
    calls: value.requests.map((request, index) =>
      parsePersistedCall(request, B1_PIPELINE_OPERATIONS[index]),
    ),
    ...(totalScore === null ? {} : { totalScore }),
    normalizedDimensions,
    diagnosticAnswerability: aggregate.diagnosticAnswerability,
    evidenceLiteralChecks,
    evidenceLiteralPasses,
    evidenceLiteralValid: aggregate.evidenceLiteralValid,
    contentDraftFactsPreserved: aggregate.contentDraftFactsPreserved,
    contentDraftStructurePreserved: aggregate.contentDraftStructurePreserved,
  };
}

export function parseB1CheckpointArtifact(
  value: unknown,
  stage: B1Stage,
  round: B1Round,
): B1Checkpoint {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "telemetrySchemaVersion",
      "stage",
      "round",
      "complete",
      "records",
    ]) ||
    value.telemetrySchemaVersion !== B1_TELEMETRY_SCHEMA_VERSION ||
    value.stage !== stage ||
    value.round !== round ||
    typeof value.complete !== "boolean" ||
    !Array.isArray(value.records)
  ) {
    throw new Error(
      `Existing Stage ${stage} Round ${round} checkpoint does not use ${B1_TELEMETRY_SCHEMA_VERSION}.`,
    );
  }
  const expectedRecordCount =
    stage === 1 ? B1_STAGE_1_ARTICLE_COUNT : B1_STAGE_2_ARTICLE_COUNT;
  if (
    value.records.length > expectedRecordCount ||
    (value.complete && value.records.length !== expectedRecordCount)
  ) {
    throw new Error(`Existing Stage ${stage} Round ${round} checkpoint is invalid.`);
  }

  const records = value.records.map((record) =>
    parsePersistedPipelineRecord(record, stage, round),
  );
  if (new Set(records.map((record) => record.articleId)).size !== records.length) {
    throw new Error(`Existing Stage ${stage} Round ${round} checkpoint has duplicate samples.`);
  }
  return {
    stage,
    round,
    complete: value.complete,
    records,
  };
}

async function loadCheckpoint(
  campaignDirectory: string,
  stage: B1Stage,
  round: B1Round,
): Promise<B1Checkpoint | undefined> {
  const value = await readJsonIfPresent(checkpointPath(campaignDirectory, stage, round));
  return value === undefined
    ? undefined
    : parseB1CheckpointArtifact(value, stage, round);
}

async function loadAllRecords(
  cwd: string,
  corpusSha256: string,
  baseUrl: string,
): Promise<B1PipelineRecord[]> {
  const records: B1PipelineRecord[] = [];
  for (const stage of [1, 2] as const) {
    const campaignDirectory = resolveB1CampaignDirectory(cwd, corpusSha256, baseUrl, stage);
    for (const round of [1, 2, 3] as const) {
      if (stage === 1 && round !== 1) continue;
      const checkpoint = await loadCheckpoint(campaignDirectory, stage, round);
      if (checkpoint) records.push(...checkpoint.records);
    }
  }
  return records;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run b1:validate -- --corpus=/absolute/path/corpus.json --stage=1",
    "  npm run b1:validate -- --corpus=/absolute/path/corpus.json --stage=2 --round=1",
    "  npm run b1:validate -- --corpus=/absolute/path/corpus.json --stage=2 --round=2",
    "  npm run b1:validate -- --corpus=/absolute/path/corpus.json --stage=2 --round=3",
    "  Add --save-content-draft-artifacts to persist verified Content Draft Markdown.",
    "",
    "Add --resume only to continue an incomplete matching checkpoint.",
  ].join("\n");
}

async function main(): Promise<void> {
  const args = parseB1Arguments(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const baseUrlValue = process.env.GEO_BASE_URL?.trim();
  if (!baseUrlValue) throw new Error("GEO_BASE_URL is required.");
  const baseUrl = normalizePreviewUrl(baseUrlValue);
  const bypassSecret = resolveAutomationBypassSecret(baseUrl, process.env);
  if (!bypassSecret) {
    throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is required for B.1 Preview validation.");
  }

  const corpusPath = resolve(args.corpusPath as string);
  const corpusRaw = await readFile(corpusPath, "utf8");
  const articles = validateB1Corpus(JSON.parse(corpusRaw));
  const corpusSha256 = sha256(corpusRaw);
  const cwd = process.cwd();
  const stage = args.stage as B1Stage;
  const round = args.round as B1Round;
  const campaignDirectory = resolveB1CampaignDirectory(cwd, corpusSha256, baseUrl, stage);
  await mkdir(campaignDirectory, { recursive: true });
  const contentDraftArtifactDirectory = args.saveContentDraftArtifacts
    ? join(campaignDirectory, "content-draft-artifacts")
    : undefined;
  await verifyHealth(baseUrl, bypassSecret);

  const existing = await loadCheckpoint(campaignDirectory, stage, round);
  if (existing && !args.resume) {
    throw new Error(
      `Stage ${stage} Round ${round} checkpoint already exists; use --resume only if it is incomplete.`,
    );
  }
  if (existing?.complete) {
    throw new Error(`Stage ${stage} Round ${round} is already complete.`);
  }

  const stageOneCampaignDirectory = resolveB1CampaignDirectory(
    cwd,
    corpusSha256,
    baseUrl,
    1,
  );
  const stageOneCheckpoint = await loadCheckpoint(stageOneCampaignDirectory, 1, 1);
  if (stage === 2 && !stageOneCheckpoint?.complete) {
    throw new Error("Stage 2 requires a complete Stage 1 checkpoint.");
  }
  if (stage === 2 && round >= 2) {
    const previousRound = await loadCheckpoint(campaignDirectory, 2, (round - 1) as B1Round);
    if (!previousRound?.complete) {
      throw new Error(`Stage 2 Round ${round} requires completed Round ${round - 1}.`);
    }
  }
  if (stage === 2 && round === 3) {
    const roundOne = await loadCheckpoint(campaignDirectory, 2, 1);
    const roundTwo = await loadCheckpoint(campaignDirectory, 2, 2);
    if (!roundOne?.complete || !roundTwo?.complete) {
      throw new Error("Stage 2 Round 3 requires completed rounds 1 and 2.");
    }
    const decision = evaluateThirdRoundRequirement(
      [...roundOne.records, ...roundTwo.records].map(pipelineRecordToStabilityObservation),
    );
    if (!decision.required) {
      throw new Error("Stage 2 Round 3 is not allowed because no stability anomaly was detected.");
    }
  }

  const stageArticles =
    stage === 1
      ? articles
      : selectStage2Articles(articles);
  const checkpoint: B1Checkpoint = existing ?? {
    stage,
    round,
    complete: false,
    records: [],
  };
  const completedIds = new Set(checkpoint.records.map((record) => record.articleId));
  const configuredCallDelay = Number(process.env.B1_CALL_DELAY_MS || 1_500);
  const configuredPipelineDelay = Number(process.env.B1_PIPELINE_DELAY_MS || 2_500);
  if (!Number.isFinite(configuredCallDelay) || !Number.isFinite(configuredPipelineDelay)) {
    throw new Error("B1_CALL_DELAY_MS and B1_PIPELINE_DELAY_MS must be finite numbers.");
  }
  const callDelayMs = Math.max(0, configuredCallDelay);
  const pipelineDelayMs = Math.max(0, configuredPipelineDelay);
  const runtimeLogCollector = startB1RuntimeLogCollector(
    resolveRuntimeLogConfig(baseUrl).catch(() => null),
  );

  console.log(
    `B.1 technical target: Stage ${stage} Round ${round}; Preview automation bypass enabled.`,
  );
  try {
    await requireB1RuntimeLogCollectorReady(runtimeLogCollector);
    for (const article of stageArticles) {
      if (completedIds.has(article.id)) continue;
      console.log(`RUN ${article.id}`);
      const record = await runPipeline({
        article,
        stage,
        round,
        baseUrl,
        bypassSecret,
        callDelayMs,
        runtimeLogCollector,
        contentDraftArtifactDirectory,
      });
      checkpoint.records.push(record);
      await writeCheckpointAtomic(
        cwd,
        checkpointPath(campaignDirectory, stage, round),
        checkpoint,
      );
      console.log(
        `DONE ${article.id}: ${record.calls.filter((call) => call.outcome === "model").length}/${B1_MODEL_CALLS_PER_PIPELINE} source=model`,
      );
      if (pipelineDelayMs) {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, pipelineDelayMs));
      }
    }
  } catch (error) {
    runtimeLogCollector.close();
    throw error;
  }

  const runtimeLogCollection = await runtimeLogCollector.finish(Date.now());
  checkpoint.records = checkpoint.records.map((record) => ({
    ...record,
    calls: applyRuntimeLogRecords(record.calls, runtimeLogCollection),
  }));
  checkpoint.complete = checkpoint.records.length === stageArticles.length;
  await writeCheckpointAtomic(
    cwd,
    checkpointPath(campaignDirectory, stage, round),
    checkpoint,
  );
  const allRecords = await loadAllRecords(cwd, corpusSha256, baseUrl);
  const report = buildAnonymousB1Report(
    articles,
    allRecords,
    runtimeLogCollection.collectorState,
  );
  await writeJsonAtomic(cwd, join(campaignDirectory, "anonymous-report.json"), report);

  if (!checkpoint.complete) {
    throw new Error(`Stage ${stage} Round ${round} checkpoint is incomplete.`);
  }
  console.log(
    `PASS Stage ${stage} Round ${round}; artifacts isolated under ${relative(cwd, campaignDirectory)}.`,
  );
}

const isDirectExecution =
  typeof process.argv[1] === "string" && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "B.1 technical validation failed.");
    process.exitCode = 1;
  });
}
